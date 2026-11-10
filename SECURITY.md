<img width="200" alt="Aster" src="https://github.com/user-attachments/assets/a337e975-996d-4672-a92b-b809591f389a" />

# Aster security policy

## Reporting a vulnerability

**Don't open a public GitHub issue for a security vulnerability.**

Send your report to security@astermail.org. You can also submit a report through the Aster vulnerability disclosure program on [Bugcrowd](https://bugcrowd.com/engagements/aster-privacy-vdpc).

We read every report within 48 hours and resolve critical vulnerabilities within seven days. We keep you updated until the issue is resolved.

## Scope

This policy covers all Aster products and infrastructure:

- Aster Mail (astermail.org)
- Aster Calendar (calendar.astermail.org, cal.astermail.org, calendar.aster.cx, and cal.aster.cx)
- All repositories under github.com/Aster-Privacy

## Safe harbor

We will never pursue legal action against researchers who:

- Report vulnerabilities in good faith.
- Don't access, modify, or exfiltrate user data.
- Don't disrupt service availability or degrade the user experience.
- Give us a reasonable amount of time to respond before public disclosure.

## Encryption architecture

All event encryption and decryption happens on your device. Event titles, descriptions, locations, attendees, reminders, recurrence rules, and start and end times are encrypted with AES-256-GCM. Each encrypted event is bound to its own ID, its calendar, and its encryption format, so the server can't move an event to another event or calendar without your device detecting it. A revision number inside the encrypted data lets your device reject an older copy of an event after it has seen a newer one.

To sync your devices, the servers store IDs, versions, sizes, calendar visibility and default flags, and the times each item was created, changed, or deleted without encryption. The servers fetch the calendar feeds you subscribe to, so they see each feed address and its contents during the fetch. Invites to people outside Aster are sent as standard email with an `.ics` file, so the recipient and their email provider can read them.

Booking pages are public by design. When you publish a booking page, its title, link, meeting length, available hours, time zone, and whether it accepts bookings are stored without encryption, and so are the start, end, and creation time of each booking. When a guest books, the servers receive their name, email address, and note, encrypt them with your public key, and store only the encrypted copy. The servers also keep a keyed fingerprint of the guest's email address to limit repeat bookings.

## Coordinated disclosure

We follow coordinated disclosure. Give us enough time to fix the vulnerability before you publish it. To be credited publicly, say so in your report.
