<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/aster_calendar_logo_31_dark.png">
    <img alt="Aster Calendar" src="public/aster_calendar_logo_31_light.png" width="320">
  </picture>
</p>

Aster Calendar is a free, open-source, end-to-end encrypted calendar. Every event title, description, location, attendee list, reminder, recurrence rule, and start and end time is encrypted on your device before it syncs, so we have no way to read the events you store with us.

Aster Calendar is in public beta at [calendar.astermail.org](https://calendar.astermail.org). You can also reach it at [cal.astermail.org](https://cal.astermail.org), [calendar.aster.cx](https://calendar.aster.cx), and [cal.aster.cx](https://cal.aster.cx). It uses the same account as Aster Mail, so if you already have one, you can sign in right away. You don't need a phone number. A recovery email is optional, although some new accounts are asked to verify one before they continue.

## How it works

Each event and calendar is encrypted with AES-256-GCM. The key is derived on your device from your account keys and your post-quantum identity key, which are unlocked with your password and never reach our servers in readable form. Each encrypted event is also bound to its own ID, its calendar, and its encryption format, so the server can't move an event into another calendar or swap it with a different one without your device noticing. A revision number inside the encrypted data lets your device reject an older copy of an event after it has seen a newer one.

Our servers store the encrypted data and the information needed to sync it: IDs, including which calendar each event belongs to, versions, sizes, your total number of events and storage used, the times each item was created, changed, or deleted, and whether a calendar is shown or set as your default. Times inside an event, such as when a meeting starts, are part of the encrypted data and aren't visible to us.

Booking pages work differently, because people without an Aster account need to read them. When you publish a booking page, its title, link, meeting length, available hours, time zone, and whether it accepts bookings are stored without encryption, and so are the start, end, and creation time of each booking. When a guest books, our servers receive their name, email address, and note, encrypt them with your public key, and store only the encrypted copy. They also keep a keyed fingerprint of the guest's email address so they can limit repeat bookings.

When you subscribe to a calendar feed, our servers fetch the feed for you so the feed host never sees your IP address. This means our servers see the feed address and its contents while they fetch it. Feed addresses are saved only in your encrypted settings, and our servers don't store or log them.

Invites work with any calendar app that supports iCalendar. When you invite someone outside Aster, the invite is sent as standard email with the event details and an `.ics` file attached, so that person and their email provider can read it. You can import and export `.ics` files at any time, so your data is never locked in.

Aster runs on a zero-access architecture located in Germany. This means that even if we were compelled to hand over data, we could provide only your account details, your encrypted events, the sync information described above, and the booking page details, booking times, and encrypted guest details described above.

## Getting started

To sign in or create a free account, go to [calendar.astermail.org](https://calendar.astermail.org). To contribute code to Aster, see [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) for instructions.

## Building from source

You can build Aster Calendar yourself from this repository. It builds into a web bundle, and the build works without a `.env` file or an API key. To use the bundle, serve it from a web server that forwards `/api` and `/ws` requests to an Aster backend.

You need [Node.js](https://nodejs.org) 20 or later and the npm version that comes with it. To install the dependencies and build the web app:

```bash
git clone https://github.com/Aster-Privacy/Aster-Calendar.git
cd Aster-Calendar
npm install
npm run build
```

The build is written to `dist/`.

## Community

Join our [Discord](https://discord.gg/R4XqRUfgWZ) to share feedback, ask questions, and contribute to the privacy community. You can also find us on [X](https://x.com/AsterPrivacy) and [Reddit](https://www.reddit.com/r/AsterPrivacy).

If you have any questions or security disclosures, email us at [hello@astermail.org](mailto:hello@astermail.org) or [security@astermail.org](mailto:security@astermail.org). **Do not open a public issue for security vulnerabilities.** Read [SECURITY.md](SECURITY.md) for the full security vulnerability disclosure process.

## Contributing

We welcome contributions of all kinds. Read [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) before opening a pull request.

By contributing to any Aster repository, you agree that your contributions will be licensed under [AGPL v3](https://www.gnu.org/licenses/agpl-3.0.en.html).
