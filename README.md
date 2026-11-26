<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/aster_calendar_logo_31_dark.png">
    <img alt="Aster Calendar" src="public/aster_calendar_logo_31_light.png" width="320">
  </picture>
</p>

Aster Calendar is a free, open-source calendar with end-to-end encryption. Your events are encrypted on your device before they sync, so we have no way to see what you have planned, who you are meeting, or where you are going.

Aster Calendar is in public beta at [calendar.astermail.org](https://calendar.astermail.org), and it uses the same account as Aster Mail. If you already have an Aster Mail account, you can sign in right away. A phone number is not required, and a recovery email is optional, although some new accounts are asked to verify one before they continue.

## How it works

Every event is encrypted with AES-256-GCM, including its title, description, location, attendees, reminders, recurrence rule, and start and end times. The key is derived on your device from your account keys and your post-quantum identity key, and it never reaches our servers in readable form. Each event is also tied to its own ID, its calendar, and a revision number, so your device notices if an event is moved, swapped, or replaced with an older copy.

Our servers keep only what they need to sync your calendars. That covers IDs, which calendar each event belongs to, versions, sizes, your storage totals, the times items were created, changed, or deleted, and whether a calendar is shown or set as your default. The times inside an event are part of the encrypted data, so we can't see when your meetings start.

Aster runs on servers located in Germany. If we were ever compelled to hand over data, we could provide only your account details, your encrypted events, the sync information above, and the booking details described below.

## Sharing outside Aster

A few features have to work for people who don't use Aster, so they handle data differently:

- **Booking pages:** Your guests need to read a booking page, so its title, link, meeting length, available hours, time zone, and whether it accepts bookings are stored without encryption. The start, end, and creation time of each booking are stored the same way. A guest's name, email address, and note are encrypted with your public key when they arrive, and we keep a keyed fingerprint of the email address to limit repeat bookings.
- **Calendar feeds:** When you subscribe to a feed, our servers fetch it for you, so the feed's host never sees your IP address. We see the feed address and its contents while fetching it, but we don't store or log them, and the address is saved only in your encrypted settings.
- **Invites:** Invites use the iCalendar standard, so they work with any calendar app. An invite to someone outside Aster is sent as a regular email with an `.ics` file attached, which means that person and their email provider can read it. You can import and export `.ics` files at any time.

## Getting started

Go to [calendar.astermail.org](https://calendar.astermail.org) to sign in or create a free account. You can also open Aster Calendar at [cal.astermail.org](https://cal.astermail.org), [calendar.aster.cx](https://calendar.aster.cx), or [cal.aster.cx](https://cal.aster.cx). If you would like to contribute code to Aster, see [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) for instructions.

## Building from source

You can build Aster Calendar yourself from this repository. It builds into a web bundle, and there is no account or API key involved, so you do not need to write a `.env` file.

You will need [Node.js](https://nodejs.org) 20 or later and the npm version that comes with it. To install the dependencies and build the web app:

```bash
git clone https://github.com/Aster-Privacy/Aster-Calendar.git
cd Aster-Calendar
npm install
npm run build
```

The build is written to `dist/`. To use it, serve it from a web server that forwards `/api` and `/ws` requests to an Aster backend.

## Community

Join our [Discord](https://discord.gg/R4XqRUfgWZ) to share feedback, ask questions, and contribute to the privacy community. You can also find us on [X](https://x.com/AsterPrivacy) and [Reddit](https://www.reddit.com/r/AsterPrivacy).

If you have any questions or security disclosures, email us at [hello@astermail.org](mailto:hello@astermail.org) or [security@astermail.org](mailto:security@astermail.org). **Do not open a public issue for security vulnerabilities.** Read [SECURITY.md](SECURITY.md) for the full security vulnerability disclosure process.

## Contributing

We welcome contributions of all kinds. Read [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) before opening a pull request.

By contributing to any Aster repository, you agree that your contributions will be licensed under [AGPL v3](https://www.gnu.org/licenses/agpl-3.0.en.html).
