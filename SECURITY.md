<img width="200" alt="aster_horizontalv2" src="https://github.com/user-attachments/assets/a337e975-996d-4672-a92b-b809591f389a" />

# Aster Security Policy

## Properly Reporting a Vulnerability


**Don't open a public GitHub issue for a security vulnerability.**


Send your report to security@astermail.org.

You can also submit a report through our vulnerability disclosure program on [Bugcrowd](https://bugcrowd.com/engagements/aster-privacy-vdpc).


We read every report within 48 hours and resolve critical vulnerabilities within seven days. We keep you updated until the issue is resolved.


## Scope

This security policy covers all of our Aster products and infrastructure:

- Aster Mail (astermail.org)
- Aster Calendar (calendar.astermail.org, cal.astermail.org, calendar.aster.cx, and cal.aster.cx)
- All repositories under github.com/Aster-Privacy


## Safe Harbor


We will never pursue legal action against researchers who:


- Report vulnerabilities in good faith 
- Do not access, modify, or exfiltrate user data
- Do not disrupt service availability or degrade user experience
- Allow us a reasonable timeframe to respond before public disclosure


## Encryption Architecture


All event encryption and decryption is performed client-side. Event titles, descriptions, locations, attendees, reminders, recurrence rules, and start and end times are sealed on your device with AES-256-GCM, and each sealed event is bound to its own ID, its calendar, and its encryption format, so a sealed event can't be moved to another event or calendar without your device detecting it. A revision number inside the sealed data lets your device reject an older copy of an event after it has seen a newer one.

To sync your devices, our servers store IDs, versions, sizes, calendar visibility and default flags, and the times each item was created, changed, or deleted without encryption. Our servers fetch the calendar feeds you subscribe to, so they see each feed address and its contents during the fetch. Invites to people outside Aster are sent as standard email with an `.ics` file, so the recipient and their email provider can read them. Booking pages are public by design: a published page's title, meeting length, available hours, and time zone, and the start and end time of each booking, are stored without encryption. The name and email address a guest enters are encrypted before they're stored.


## Coordinated Disclosure

We follow coordinated disclosure. Give us enough time to fix the vulnerability before you publish it. To be credited publicly, say so in your report.


## Acknowledgements

We thank the researchers who help keep Aster secure. Researchers who report a vulnerability in Aster Calendar are listed here with their permission.
