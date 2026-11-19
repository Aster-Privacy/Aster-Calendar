#!/bin/sh
set -eu

target="${EDGE_AUTH_CONF:-/etc/nginx/conf.d/edge_auth.conf}"
secret="$(printf '%s' "${EDGE_FORWARD_SECRET:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
mode="$(printf '%s' "${EDGE_AUTH_MODE:-}" | tr '[:upper:]' '[:lower:]')"

write_digest() {
    printf 'map "" $edge_auth_secret_sha256 {\n    default "%s";\n}\n' "$1" > "$target"
}

if [ -z "$secret" ]; then
    if [ "$mode" = "required" ]; then
        echo "edge_auth: EDGE_FORWARD_SECRET is required" >&2
        exit 1
    fi
    write_digest ""
    exit 0
fi

if command -v sha256sum >/dev/null 2>&1; then
    digest="$(printf '%s' "$secret" | sha256sum | cut -d ' ' -f 1)"
else
    digest="$(printf '%s' "$secret" | shasum -a 256 | cut -d ' ' -f 1)"
fi

case "$digest" in
    *[!0-9a-f]* | "")
        echo "edge_auth: could not hash EDGE_FORWARD_SECRET" >&2
        exit 1
        ;;
esac

if [ "${#digest}" -ne 64 ]; then
    echo "edge_auth: could not hash EDGE_FORWARD_SECRET" >&2
    exit 1
fi

umask 077
write_digest "$digest"
