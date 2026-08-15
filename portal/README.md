# Livery Staff Portal

Front-desk portal for the Walkerton Livery. Issue guest door codes, see who is
staying, and keep a record of who did what — without opening the TTLock app.

```
portal/
  server.js          HTTP service: routes, roles, validation
  lib/ttlock.js      TTLock cloud client (token cache, refresh-on-401)
  lib/store.js       flat-file store for staff + activity
  lib/auth.js        scrypt passwords, signed sessions, login throttle
  lib/http.js        request/response plumbing
  bin/staff.js       manage staff accounts from the command line
  public/            the portal pages
  test/              end-to-end tests against a fake TTLock
```

No dependencies — Node 18+ built-ins only. No database.

## What it does

**Room codes.** Pick a room, type the guest's name, pick check-in and
check-out, get a code. Tap more than one room for a guest taking several units
and you get a code per room plus one message listing them all.

Codes come from TTLock's offline passcode algorithm, so they work on the keypad
immediately — no gateway, no standing next to the lock with Bluetooth. A code
for next Tuesday can be issued today from anywhere.

**Who's staying.** The home page walks every lock and shows which rooms have a
live code right now, with the guest name and checkout date.

**Activity.** Every code issued or revoked, every sign-in, every staff change —
who did it and when. Filterable by person and action.

**Staff.** Each person gets their own login, so the activity log names a real
person rather than "whoever had the shared password". Two roles: *front desk*
(issue and revoke codes, read activity) and *admin* (also manages staff).

## Setup

You need a TTLock **Open Platform** account at <https://open.ttlock.com> —
separate from the phone app, and it needs approval. Create an application there
for the `clientId` / `clientSecret`; the username and password are the ordinary
TTLock account that owns the locks.

```bash
cd portal
cp .env.example .env      # fill in credentials and SESSION_SECRET
node server.js            # http://localhost:8080
```

On first boot, with no staff accounts yet, it creates one admin and prints the
password. Sign in, change it, then add the rest of the staff from the Staff
page.

## Staff accounts from the command line

Useful before the portal is running, or if nobody can get in:

```bash
node bin/staff.js list
node bin/staff.js add "Darren Holm" darren@walkertonlivery.ca admin 'Kilmer@73'
node bin/staff.js add "Brady" brady@walkertonlivery.ca staff 'Kilmer@73'
node bin/staff.js password brady@walkertonlivery.ca 'new-password'
node bin/staff.js disable brady@walkertonlivery.ca
node bin/staff.js remove brady@walkertonlivery.ca
```

Leave the password off `add` and one is generated and printed. A password you
type here is treated as deliberate, so the account can use it straight away;
pass `--force-change` to make them pick their own at first sign-in instead.
Accounts created through the Staff page always force a change, because there
the password is a temporary one being handed over.

Passwords must be at least 8 characters and cannot be all digits or start with
an obvious word. Resetting a password or disabling an account signs that person
out everywhere immediately.

The email is the login name. It does not have to receive mail — nothing is sent
to it — so `brady@walkertonlivery.ca` works whether or not that mailbox exists.

## Deploying

One process, no database, no build step. Point a subdomain at it
(`portal.walkertonlivery.ca`), terminate HTTPS in front of it, set the env
vars. Railway, Fly, or a small VPS all work.

Two things to get right:

- **Put it behind HTTPS.** Passwords and door codes cross this connection.
- **Back up `data/portal.json`.** It holds the staff accounts and the whole
  activity log. Nothing else in the system knows them.

## Three TTLock behaviours worth knowing

**A new code must be used within 24 hours of its start time.** Lock firmware
rule, not ours. Issue a Tuesday-3pm code and if nobody punches it in by
Wednesday 3pm the lock drops it. Normal bookings never notice; a guest arriving
a day late needs a re-issue. The exact use-by moment prints under every code.

**Codes only cover whole hours.** Minutes and seconds are floored off both ends
before the request goes out, so what the screen says is what the lock enforces.
Set the house hours with `CHECKIN_HOUR` / `CHECKOUT_HOUR`.

**Revoking needs a gateway to work remotely.** Locks without one drop the code
from the TTLock cloud straight away but keep honouring it on the keypad until
someone opens the TTLock app near the lock. The portal says so when it applies.

## Security notes

- TTLock credentials never reach the browser. That client secret controls every
  lock on the account.
- Passwords are scrypt-hashed with a per-user salt; the store never holds a
  plaintext password.
- Changing a password, disabling an account or changing a role invalidates that
  person's existing sessions immediately.
- Login attempts are throttled per email and per IP.
- A new or reset account must set its own password before it can do anything
  else, so the handed-over temporary password has a short life.
- The last remaining admin cannot be demoted, disabled or removed.

Permanent and one-time codes created in the TTLock phone app are deliberately
hidden from the portal, so nobody revokes the owner's own code by accident.

## Tests

```bash
npm test          # or: node test/smoke.js && node test/cli.js
```

`smoke.js` stands up a fake TTLock cloud API and drives the real server against
a throwaway data file: sign-in, role boundaries, forced password change,
session invalidation, last-admin guards, hour flooring, token
refresh-and-retry, the activity log, and path traversal.

`cli.js` covers `bin/staff.js`: account creation, password rules, hashing,
resets, disable/enable, and the last-admin guard.

No credentials or network needed for either.
