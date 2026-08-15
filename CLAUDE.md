# Walkerton Livery

Two things live here, unrelated to each other except that they serve the same
small lodging business (three rooms, 11 Victoria St S, Walkerton, Ontario).

- **The public website** — `build.js` + `css/` + `images/` generate `dist/`.
- **The staff portal** (`portal/`) — a Node service for issuing guest door
  codes on the property's TTLock smart locks.

Owner: Darren Holm. Bookings come through Little Hotelier; the site links out
to it rather than embedding it.

## State

**Website: done, not yet deployed.** `dist/` is committed and is what gets
uploaded. Hosting is Web Hosting Canada, cPanel/LiteSpeed, files served from
`/home/walkerto/public_html`. SFTP is host `15.235.14.237`, user `walkerto`,
**port 27** (not 22). The old Plesk-builder site is still live there; leftover
folders (`fb`, `gallery`, `modules`, `js`, `includes`, `img`, `font-awesome`,
`home`, `data`, `components`, `attachments`, `COPYRIGHT`) are unused by the new
site and can be removed once a backup exists. Do not remove `.well-known`,
`.htaccess`, or `cgi-bin`.

**Portal: built and tested, cannot run yet.** It needs TTLock Open Platform
credentials that do not exist. See below.

**Staff accounts: created**, on Darren's Windows machine at
`portal/data/portal.json` (gitignored, so it exists nowhere else). Darren
(`darren@holmgraphics.ca`) and Brady (`brady@walkertonlivery.ca`), both admin.
That file must be copied to wherever the portal is eventually hosted, or the
accounts recreated there with `bin/staff.js`.

## The blocker

The portal talks to TTLock's cloud API, which needs a `clientId` and
`clientSecret` from <https://euopen.ttlock.com> (`open.ttlock.com` redirects
there — there is only one platform despite the name). That is a **developer
registration, separate from the TTLock phone app account**, and TTLock reviews
both the account and the application by hand. Registration was started
2026-08-15 under `darren@holmgraphics.ca`, the same account that owns the
locks — it must match, or the credentials see no locks.

Until those arrive, `portal/server.js` exits at startup. Everything else in the
portal — staff accounts, the CLI, the tests — works without them.

Unresolved: TTLock's docs give the API host as `api.sciener.com`, while
`lib/ttlock.js` defaults to `api.ttlock.com`. Both are live TTLock endpoints.
Try the default first and switch `TTLOCK_BASE_URL` if the lock list comes back
empty.

## Three TTLock behaviours that shaped the code

These are lock firmware rules, not choices:

1. **An unused code dies 24h after its start time.** Normal bookings never
   notice; a guest arriving a day late needs a re-issue. The UI prints the
   use-by moment under every code.
2. **Passcode windows only honour whole hours.** Minutes and seconds are
   floored off both ends before the request goes out, so the screen matches
   what the lock enforces.
3. **Revoking only works remotely if the lock has a gateway.** Without one the
   code leaves the TTLock cloud but keeps working on the keypad until someone
   opens the phone app nearby. The UI says so when it applies.

Codes come from `/v3/keyboardPwd/get` (period type), TTLock's *offline*
algorithm — they work on the keypad immediately with no gateway and no
Bluetooth proximity, which is the whole reason this replaces the phone app.
Do not switch to `/v3/keyboardPwd/add`; that needs a gateway or physical
proximity.

The door codes on these locks are **4 digits followed by #**. Nothing in the
code assumes a length — it uses whatever the lock returns.

## Conventions

No dependencies anywhere. Node built-ins only, no framework, no build step for
the portal, no database. Keep it that way — it is deployed by copying files to
whatever box is available, and every dependency is something Darren has to
maintain.

The website generator and the portal share nothing. `portal/` can be lifted out
whole.

Run `npm test` in `portal/` before pushing anything there — 95 checks across
`test/smoke.js` (drives the real server against a fake TTLock) and
`test/cli.js`. Neither needs credentials or network.

## Security notes that are easy to undo by accident

- TTLock credentials must never reach the browser. That client secret controls
  every lock on the account.
- `portal/data/portal.json` holds staff accounts and the full activity log.
  Gitignored. Nothing else knows that data — back it up wherever it runs.
- Permanent and one-time codes made in the TTLock phone app are deliberately
  hidden from the portal so nobody revokes the owner's own code. Do not
  "fix" this by showing all passcode types.
- Both staff accounts currently share one password, which is also the TTLock
  account password. Darren was told; it was his call.
