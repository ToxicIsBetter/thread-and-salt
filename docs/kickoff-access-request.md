# Access request — draft email to Jonah

The first launch action. Everything else waits on this. Written to be answerable by a
non-technical founder in one sitting, and deliberately short: seven things, most of them a
copy-and-paste.

---

**Subject:** Kickoff — the three logins we need (about 30 minutes, one call)

Hi Jonah,

Ahead of Monday, here's everything we need from you to get your management accounts running
automatically. It's genuinely short, and I'd suggest we do most of it together on a 30–45
minute call rather than you wrestling with it alone — the two technical bits are fiddly
one-offs and much faster screen-shared.

**1. Xero — read-only access**

We'll create what Xero calls a "Custom Connection" against your account. It gives us
**read-only** access: we can pull the figures for the reports, and we can't change anything
in your books, move money, or touch bank feeds. On the call this takes about ten minutes.

**2. Microsoft 365 — permission to send the reports and file them**

The reports get emailed to you and saved in your shared drive automatically. To do that
without a human pressing a button, we register a small app in your Microsoft account with
two narrow permissions: send email from one specific mailbox, and save files into one
folder. It can't read your inbox, and it can't send as anyone except that one mailbox.

Two things to decide before the call:

- **Which mailbox should the reports come *from*?** I'd recommend creating a dedicated one
  like `reports@threadandsalt.co.uk` rather than using yours or Mara's — cleaner, and safer.
- **Which drive/folder should hold the archive?** We'll create a tidy dated structure inside
  whatever you choose.

**3. Who should receive the reports?**

Just confirm the two addresses — I'm assuming yours and Mara's. This is easy to change later
at any time (add your accountant, swap an address, whatever), so don't overthink it.

**4. A Claude subscription in your name**

The automation runs on Anthropic's cloud under your own account, which is what lets the
reports arrive whether or not either of your laptops is open. **Claude Pro, about £20 a
month** — that's the only ongoing cost, and there's no monthly fee to us. Please turn on
two-factor authentication and don't share the login; that account will hold the connections
above, so it's worth protecting properly.

**5. One question only you can answer**

Your Xero chart of accounts — I need to confirm which account codes map onto each line of
the report: revenue, cost of goods, marketing, fulfilment & shipping, platform/payment fees,
your and Mara's drawings, and software/overhead. I'll come to the call with my best guess
from the history you sent; it should just be a case of you saying yes or correcting me.

Getting this right up front is the difference between numbers you trust immediately and a
round of corrections — and the system cross-checks every figure against Xero anyway, so
mistakes here get caught rather than shipped.

**6. Somewhere to keep the code**

The reporting setup becomes yours outright at handover, so it should live in an account you
own (GitHub is the usual choice). If you don't have one, we'll create it in your name.

**7. Time**

About 30–45 minutes on the kickoff call, then another 30 minutes later that week to look at
your first report and tell me it's right before anything starts running on its own.

---

One thing worth saying plainly: the system is built so that if any figure fails its checks,
**you get nothing** rather than a report that might be wrong — and I get an alert instead.
You should never have to wonder whether a number in there is trustworthy.

Anything above you'd rather I just handled, say so and I will.

Best,
Shyam

---

## Internal notes (not for sending)

- Items 1 and 2 produce the credentials that unblock everything: Xero tenant ID + client
  ID/secret; Entra tenant ID + client ID/secret. Nothing starts without them.
- Item 5 is the real risk to the first report being right. Come to the call with the
  `accountMap` in `src/config.json` pre-filled as a best guess from the workbook so Jonah is
  only confirming, not deriving.
- Don't raise the plaintext-credential storage trade-off in this email — it needs a
  conversation, not a footnote. Cover it verbally on the call and record his decision
  (see [`CLIENT-SETUP.md §2.2`](./CLIENT-SETUP.md)).
- Suggest the dedicated `reports@` mailbox firmly. It meaningfully reduces the blast radius
  of the one genuinely sensitive credential.
