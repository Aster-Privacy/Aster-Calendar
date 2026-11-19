//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::Url;

pub const FEED_MAX_BYTES: usize = 2 * 1024 * 1024;
const FEED_MAX_URL_LEN: usize = 2048;
const FEED_MAX_REDIRECTS: usize = 5;
const FEED_TIMEOUT: Duration = Duration::from_secs(15);
const FEED_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const FEED_USER_AGENT: &str = "AsterCalendar/1.0";
const BLOCKED_HOST_SUFFIXES: [&str; 6] = [
    ".localhost",
    ".local",
    ".internal",
    ".home.arpa",
    ".onion",
    ".lan",
];

const LOAD_FAILED: &str = "feed could not be loaded";

fn is_local_v4(v4: Ipv4Addr) -> bool {
    let [a, b, c, _] = v4.octets();
    a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (b & 0xc0) == 64)
        || (a == 169 && b == 254)
        || (a == 172 && (b & 0xf0) == 16)
        || (a == 192 && b == 0 && (c == 0 || c == 2))
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (b & 0xfe) == 18)
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
}

fn embedded_v4(high: u16, low: u16) -> Ipv4Addr {
    let [a, b] = high.to_be_bytes();
    let [c, d] = low.to_be_bytes();
    Ipv4Addr::new(a, b, c, d)
}

fn is_local_v6(v6: Ipv6Addr) -> bool {
    let s = v6.segments();
    if s[..6] == [0, 0, 0, 0, 0, 0xffff]
        || s[..6] == [0, 0, 0, 0, 0xffff, 0]
        || s[..6] == [0x64, 0xff9b, 0, 0, 0, 0]
    {
        return is_local_v4(embedded_v4(s[6], s[7]));
    }
    if s[0] == 0x2002 {
        return is_local_v4(embedded_v4(s[1], s[2]));
    }
    (s[0] & 0xe000) != 0x2000
        || (s[0] == 0x2001 && s[1] < 0x0200)
        || (s[0] == 0x2001 && s[1] == 0x0db8)
        || (s[0] == 0x3fff && s[1] < 0x1000)
}

fn is_local_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_local_v4(v4),
        IpAddr::V6(v6) => is_local_v6(v6),
    }
}

pub fn check_feed_url(raw: &str) -> Result<Url, String> {
    if raw.len() > FEED_MAX_URL_LEN {
        return Err("feed url is too long".to_string());
    }
    if raw.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("feed url contains invalid characters".to_string());
    }
    let url = Url::parse(raw).map_err(|_| "invalid feed url".to_string())?;
    if url.scheme() != "https" {
        return Err("feed url must use https".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "feed url has no host".to_string())?;
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare.parse::<IpAddr>() {
        if is_local_address(ip) {
            return Err("feed host is not allowed".to_string());
        }
    } else {
        let domain = bare.trim_end_matches('.').to_ascii_lowercase();
        if domain.is_empty()
            || domain == "localhost"
            || BLOCKED_HOST_SUFFIXES.iter().any(|s| domain.ends_with(s))
        {
            return Err("feed host is not allowed".to_string());
        }
    }
    Ok(url)
}

pub fn is_ics_document(text: &str) -> bool {
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    trimmed
        .get(..15)
        .is_some_and(|head| head.eq_ignore_ascii_case("BEGIN:VCALENDAR"))
}

type LookupFuture = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<SocketAddr>, String>> + Send>>;
type HostLookup = Arc<dyn Fn(String) -> LookupFuture + Send + Sync>;

fn system_lookup() -> HostLookup {
    Arc::new(|host: String| -> LookupFuture {
        Box::pin(async move {
            tokio::net::lookup_host((host.as_str(), 0))
                .await
                .map(|found| found.collect())
                .map_err(|_| LOAD_FAILED.to_string())
        })
    })
}

async fn checked_addresses(lookup: &HostLookup, host: &str) -> Result<Vec<SocketAddr>, String> {
    let addrs = lookup(host.to_string()).await?;
    if addrs.is_empty() || addrs.iter().any(|addr| is_local_address(addr.ip())) {
        return Err("feed host is not allowed".to_string());
    }
    Ok(addrs)
}

#[cfg(test)]
async fn resolve_feed_host(host: &str) -> Result<Vec<SocketAddr>, String> {
    checked_addresses(&system_lookup(), host).await
}

struct FeedResolver {
    lookup: HostLookup,
}

impl Resolve for FeedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        let lookup = self.lookup.clone();
        Box::pin(async move {
            let addrs = checked_addresses(&lookup, &host).await?;
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= FEED_MAX_REDIRECTS {
            return attempt.error("too many redirects");
        }
        match check_feed_url(attempt.url().as_str()) {
            Ok(_) => attempt.follow(),
            Err(reason) => attempt.error(reason),
        }
    })
}

async fn read_capped(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > FEED_MAX_BYTES as u64)
    {
        return Err("feed is too large".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| LOAD_FAILED.to_string())? {
        if body.len() + chunk.len() > FEED_MAX_BYTES {
            return Err("feed is too large".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn build_feed_client(lookup: HostLookup) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(redirect_policy())
        .dns_resolver(Arc::new(FeedResolver { lookup }))
        .no_proxy()
        .https_only(true)
        .connect_timeout(FEED_CONNECT_TIMEOUT)
        .timeout(FEED_TIMEOUT)
        .user_agent(FEED_USER_AGENT)
        .build()
        .map_err(|_| LOAD_FAILED.to_string())
}

pub async fn fetch_feed(raw: &str) -> Result<String, String> {
    fetch_feed_with(raw, system_lookup()).await
}

async fn fetch_feed_with(raw: &str, lookup: HostLookup) -> Result<String, String> {
    let url = check_feed_url(raw)?;
    let client = build_feed_client(lookup)?;
    let response = client
        .get(url)
        .header("accept", "text/calendar, text/plain, */*")
        .send()
        .await
        .map_err(|_| LOAD_FAILED.to_string())?;
    if !response.status().is_success() {
        return Err(LOAD_FAILED.to_string());
    }
    let body = read_capped(response).await?;
    let text = String::from_utf8_lossy(&body).into_owned();
    if !is_ics_document(&text) {
        return Err("response is not a calendar feed".to_string());
    }
    Ok(text)
}

#[tauri::command]
pub async fn fetch_calendar_feed(
    window: tauri::WebviewWindow,
    url: String,
) -> Result<String, String> {
    crate::device::crypto::require_primary_webview(&window)?;
    fetch_feed(&url).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_public_https_feed() {
        assert!(check_feed_url("https://feeds.example.com/team.ics?token=a").is_ok());
        assert!(check_feed_url("https://8.8.8.8/cal.ics").is_ok());
    }

    #[test]
    fn refuses_plain_http_and_other_schemes() {
        for rejected in [
            "http://feeds.example.com/team.ics",
            "webcal://feeds.example.com/team.ics",
            "file:///etc/passwd",
            "ftp://feeds.example.com/team.ics",
        ] {
            assert!(check_feed_url(rejected).is_err(), "{rejected}");
        }
    }

    #[test]
    fn refuses_local_network_hosts() {
        for rejected in [
            "https://localhost/cal.ics",
            "https://router.local/cal.ics",
            "https://nas.home.arpa/cal.ics",
            "https://127.0.0.1/cal.ics",
            "https://10.0.0.2/cal.ics",
            "https://192.168.1.1/cal.ics",
            "https://169.254.169.254/latest",
            "https://100.64.0.1/cal.ics",
            "https://[::1]/cal.ics",
            "https://[fd00::1]/cal.ics",
            "https://[::ffff:127.0.0.1]/cal.ics",
            "https://example.onion/cal.ics",
        ] {
            assert!(check_feed_url(rejected).is_err(), "{rejected}");
        }
    }

    #[test]
    fn refuses_urls_with_whitespace_or_too_long() {
        assert!(check_feed_url("https://feeds.example.com/a b.ics").is_err());
        let long = format!("https://feeds.example.com/{}", "a".repeat(FEED_MAX_URL_LEN));
        assert!(check_feed_url(&long).is_err());
    }

    #[test]
    fn recognizes_calendar_documents() {
        assert!(is_ics_document("\u{feff}  BEGIN:VCALENDAR\r\nEND:VCALENDAR"));
        assert!(is_ics_document("begin:vcalendar"));
        assert!(!is_ics_document("<html>"));
        assert!(!is_ics_document(""));
    }

    #[test]
    fn treats_every_reserved_range_as_local() {
        for local in [
            "0.0.0.0",
            "0.1.2.3",
            "10.1.2.3",
            "100.64.0.1",
            "100.127.255.254",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.88.99.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.19.255.255",
            "198.51.100.7",
            "203.0.113.9",
            "224.0.0.1",
            "240.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "::127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:0:a00:1",
            "64:ff9b::7f00:1",
            "64:ff9b::a9fe:a9fe",
            "64:ff9b:1::1",
            "100::1",
            "2001::1",
            "2001:2::1",
            "2001:db8::1",
            "2002:7f00:1::1",
            "2002:a00:1::1",
            "3fff::1",
            "5f00::1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "febf::1",
            "fec0::1",
            "ff02::1",
        ] {
            let ip: IpAddr = local.parse().unwrap();
            assert!(is_local_address(ip), "{local}");
        }
    }

    #[test]
    fn treats_public_addresses_as_reachable() {
        for public in [
            "1.1.1.1",
            "8.8.8.8",
            "100.128.0.1",
            "172.32.0.1",
            "192.0.1.1",
            "198.20.0.1",
            "2606:4700:4700::1111",
            "2a00:1450:4001::200e",
            "::ffff:8.8.8.8",
            "64:ff9b::808:808",
            "2002:808:808::1",
        ] {
            let ip: IpAddr = public.parse().unwrap();
            assert!(!is_local_address(ip), "{public}");
        }
    }

    #[test]
    fn refuses_reserved_literal_hosts_in_links_and_redirects() {
        for rejected in [
            "https://198.18.0.1/cal.ics",
            "https://192.0.0.8/cal.ics",
            "https://240.0.0.1/cal.ics",
            "https://[64:ff9b::7f00:1]/cal.ics",
            "https://[2002:7f00:1::1]/cal.ics",
            "https://[::127.0.0.1]/cal.ics",
            "https://[fec0::1]/cal.ics",
            "https://[2001:db8::1]/cal.ics",
        ] {
            assert!(check_feed_url(rejected).is_err(), "{rejected}");
        }
    }

    #[tokio::test]
    async fn resolver_refuses_names_that_reach_local_addresses() {
        for host in ["localhost", "127.0.0.1", "::1", "10.0.0.2", "198.18.0.1"] {
            assert!(resolve_feed_host(host).await.is_err(), "{host}");
        }
    }

    #[tokio::test]
    async fn resolver_returns_the_checked_public_address() {
        let addrs = resolve_feed_host("8.8.8.8").await.unwrap();
        assert_eq!(addrs, vec!["8.8.8.8:0".parse::<SocketAddr>().unwrap()]);
    }

    #[tokio::test]
    async fn feed_client_refuses_a_stubbed_name_that_resolves_locally() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = calls.clone();
        let lookup: HostLookup = Arc::new(move |_host: String| -> LookupFuture {
            counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Box::pin(async move { Ok(vec!["127.0.0.1:0".parse::<SocketAddr>().unwrap()]) })
        });
        let url = format!("https://feed.example.test:{port}/cal.ics");
        let (result, accepted) = tokio::join!(
            fetch_feed_with(&url, lookup),
            tokio::time::timeout(Duration::from_secs(2), listener.accept())
        );
        assert!(result.is_err());
        assert!(calls.load(std::sync::atomic::Ordering::SeqCst) >= 1, "the stub resolver was never consulted");
        assert!(accepted.is_err(), "the feed client connected to a local address");
    }

    #[tokio::test]
    #[ignore = "needs public dns"]
    async fn feed_fetch_never_connects_to_a_name_that_resolves_locally() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let host = "127.0.0.1.nip.io";
        let resolved: Vec<SocketAddr> = tokio::net::lookup_host((host, 0)).await.unwrap().collect();
        assert!(resolved.iter().any(|addr| addr.ip().is_loopback()), "{resolved:?}");
        let url = format!("https://{host}:{port}/cal.ics");
        let (result, accepted) = tokio::join!(
            fetch_feed(&url),
            tokio::time::timeout(Duration::from_secs(3), listener.accept())
        );
        assert!(result.is_err());
        assert!(accepted.is_err(), "the feed fetch connected to a local address");
    }
}
