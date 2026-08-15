'use strict';

// Walkerton Livery staff portal.
//
// Holds the TTLock credentials server-side, gives each staff member their own
// login, and records who issued or revoked every door code.
//
//   node portal/server.js        (reads portal/.env if present)
//
// No dependencies -- Node 18+ built-ins only.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { TTLockClient, TTLockError, UNUSED_GRACE_MS } = require('./lib/ttlock');
const { Store } = require('./lib/store');
const { hashPassword, verifyPassword, passwordProblem, Sessions, Throttle } = require('./lib/auth');
const { send, readJson, serveStatic } = require('./lib/http');

// ---------------------------------------------------------------- config ---

function loadEnvFile(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
        if (!m || process.env[m[1]] !== undefined) continue;
        process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
}
loadEnvFile(path.join(__dirname, '.env'));

function required(name) {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing required env var ${name}. See portal/.env.example`);
        process.exit(1);
    }
    return v;
}

const PORT = Number(process.env.PORT || 8080);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'portal.json');
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const CHECKIN_HOUR = Number(process.env.CHECKIN_HOUR || 15);
const CHECKOUT_HOUR = Number(process.env.CHECKOUT_HOUR || 11);

// Wording for the message staff send guests. Kept in config rather than in the
// page so it can be reworded without touching code.
const PROPERTY = {
    name: process.env.PROPERTY_NAME || 'the Walkerton Livery',
    address: process.env.PROPERTY_ADDRESS || '11 Victoria St S, Walkerton',
    parking: process.env.PARKING_NOTE
        || 'Park in the lot behind the building or on the street — both are free.',
};

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    console.error('SESSION_SECRET is not set — every restart would sign all staff out.');
    console.error('Generate one:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

const store = new Store(DATA_FILE);
const sessions = new Sessions(SESSION_SECRET, SESSION_HOURS);
const throttle = new Throttle();
setInterval(() => throttle.sweep(), 5 * 60 * 1000).unref();

const ttlock = new TTLockClient({
    baseUrl: process.env.TTLOCK_BASE_URL,
    clientId: required('TTLOCK_CLIENT_ID'),
    clientSecret: required('TTLOCK_CLIENT_SECRET'),
    username: required('TTLOCK_USERNAME'),
    password: required('TTLOCK_PASSWORD'),
});

// ------------------------------------------------------------- bootstrap ---

// First run needs one account to log in with, otherwise the portal is a locked
// door with the key inside.
function bootstrapAdmin() {
    if (store.staff.length) return;

    const email = (process.env.PORTAL_ADMIN_EMAIL || 'frontdesk@walkertonlivery.ca').toLowerCase();
    const supplied = process.env.PORTAL_ADMIN_PASSWORD;
    const password = supplied || crypto.randomBytes(9).toString('base64url');
    const { salt, hash } = hashPassword(password);

    store.addStaff({
        name: process.env.PORTAL_ADMIN_NAME || 'Owner',
        email, role: 'admin', salt, passwordHash: hash,
        mustChangePassword: !supplied,
    });

    console.log('\n  No staff accounts found — created the first admin:');
    console.log(`    email:    ${email}`);
    console.log(`    password: ${supplied ? '(from PORTAL_ADMIN_PASSWORD)' : password}`);
    if (!supplied) console.log('    You will be asked to change it at first login.\n');
}
bootstrapAdmin();

// ----------------------------------------------------------------- dates ---

// TTLock only honours whole hours in a passcode window; minutes and seconds
// are ignored by the lock, so drop them here rather than showing staff a
// window the hardware will not enforce.
function floorToHour(ms) {
    const d = new Date(ms);
    d.setMinutes(0, 0, 0);
    return d.getTime();
}

// ----------------------------------------------------------------- rooms ---

let lockCache = { at: 0, rooms: [] };
const LOCK_CACHE_MS = 5 * 60 * 1000;

async function getRooms({ force = false } = {}) {
    if (!force && Date.now() - lockCache.at < LOCK_CACHE_MS) return lockCache.rooms;

    const { list } = await ttlock.listLocks({ pageSize: 200 });
    const rooms = list.map(l => ({
        lockId: l.lockId,
        name: l.lockAlias || l.lockName || `Lock ${l.lockId}`,
        keyboardPwdVersion: l.keyboardPwdVersion,
        battery: l.electricQuantity,
        hasGateway: l.hasGateway === 1,
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    lockCache = { at: Date.now(), rooms };
    return rooms;
}

// ---------------------------------------------------------------- routes ---

const publicView = (s) => ({
    id: s.id, name: s.name, email: s.email, role: s.role, active: s.active,
    createdAt: s.createdAt, lastLoginAt: s.lastLoginAt,
    mustChangePassword: !!s.mustChangePassword,
});

const routes = {

// ---- session ----

'POST /api/login': async (req, res, ctx) => {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();

    if (!throttle.check(`email:${email}`) || !throttle.check(`ip:${ctx.ip}`)) {
        return send(res, 429, { error: 'Too many attempts. Wait 15 minutes.' });
    }

    const member = store.findStaffByEmail(email);
    // Hash regardless of whether the account exists so a missing email and a
    // wrong password take the same time to answer.
    const ok = verifyPassword(body.password ?? '', member?.salt ?? 'x'.repeat(32),
        member?.passwordHash ?? crypto.randomBytes(64).toString('hex'));

    if (!member || !ok || !member.active) {
        return send(res, 401, { error: 'Wrong email or password' });
    }

    throttle.clear(`email:${email}`);
    store.updateStaff(member.id, { lastLoginAt: Date.now() });
    store.log({ staffId: member.id, staffName: member.name, action: 'login' });

    send(res, 200, {
        token: sessions.issue(member),
        me: publicView(member),
        defaults: { checkinHour: CHECKIN_HOUR, checkoutHour: CHECKOUT_HOUR, property: PROPERTY },
    });
},

'GET /api/me': async (req, res, ctx) => {
    send(res, 200, {
        me: publicView(ctx.me),
        defaults: { checkinHour: CHECKIN_HOUR, checkoutHour: CHECKOUT_HOUR, property: PROPERTY },
    });
},

'POST /api/me/password': async (req, res, ctx) => {
    const body = await readJson(req);
    if (!verifyPassword(body.current ?? '', ctx.me.salt, ctx.me.passwordHash)) {
        return send(res, 400, { error: 'Current password is wrong' });
    }
    const problem = passwordProblem(body.next);
    if (problem) return send(res, 400, { error: problem });

    const { salt, hash } = hashPassword(body.next);
    // Bumping the epoch signs out this account's other devices, which is the
    // point of changing a password you think someone else has seen.
    store.updateStaff(ctx.me.id, {
        salt, passwordHash: hash,
        mustChangePassword: false,
        sessionEpoch: ctx.me.sessionEpoch + 1,
    });
    store.log({ staffId: ctx.me.id, staffName: ctx.me.name, action: 'password-change' });

    send(res, 200, { token: sessions.issue(store.findStaff(ctx.me.id)) });
},

// ---- rooms and codes ----

'GET /api/rooms': async (req, res, ctx) => {
    const force = ctx.url.searchParams.get('refresh') === '1';
    send(res, 200, { rooms: await getRooms({ force }) });
},

'GET /api/passcodes': async (req, res, ctx) => {
    const lockId = Number(ctx.url.searchParams.get('lockId'));
    if (!lockId) return send(res, 400, { error: 'lockId is required' });

    const { list } = await ttlock.listPasscodes(lockId, { pageSize: 100 });
    const now = Date.now();

    // Match TTLock's records against our own log so the table can show who
    // issued each code. Codes made in the phone app simply have no issuer.
    const issuedBy = new Map(
        store.activity({ limit: 2000, lockId })
            .filter(a => a.action === 'issue' && a.keyboardPwdId)
            .map(a => [a.keyboardPwdId, a.staffName]));

    const codes = list
        // Only the dated codes this portal issues. Permanent and one-time
        // codes set in the app are hidden so nobody revokes the owner's own.
        .filter(p => p.keyboardPwdType === 3)
        .map(p => ({
            keyboardPwdId: p.keyboardPwdId,
            passcode: p.keyboardPwd,
            name: p.keyboardPwdName || '',
            startDate: p.startDate,
            endDate: p.endDate,
            issuedBy: issuedBy.get(p.keyboardPwdId) || null,
            expired: p.endDate > 0 && p.endDate < now,
            active: p.startDate <= now && (p.endDate === 0 || p.endDate > now),
        }))
        .sort((a, b) => b.startDate - a.startDate);

    send(res, 200, { codes });
},

'POST /api/passcode': async (req, res, ctx) => {
    const body = await readJson(req);
    const lockId = Number(body.lockId);
    const guest = String(body.guest || '').trim();
    let startDate = Number(body.startDate);
    let endDate = Number(body.endDate);

    if (!lockId) return send(res, 400, { error: 'Pick a room' });
    if (!guest) return send(res, 400, { error: 'Enter a guest name' });
    if (guest.length > 60) return send(res, 400, { error: 'Guest name is too long' });
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
        return send(res, 400, { error: 'Check-in and check-out dates are required' });
    }

    startDate = floorToHour(startDate);
    endDate = floorToHour(endDate);
    if (endDate <= startDate) {
        return send(res, 400, { error: 'Check-out must be after check-in' });
    }

    const room = (await getRooms()).find(r => r.lockId === lockId);
    if (!room) return send(res, 404, { error: 'That room is no longer in the TTLock account' });

    const { keyboardPwd, keyboardPwdId } = await ttlock.generatePeriodPasscode({
        lockId, keyboardPwdVersion: room.keyboardPwdVersion,
        name: guest, startDate, endDate,
    });

    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name, action: 'issue',
        lockId, room: room.name, guest, keyboardPwdId, startDate, endDate,
    });

    send(res, 200, {
        passcode: keyboardPwd, keyboardPwdId,
        room: room.name, guest, startDate, endDate,
        // A period code the lock never sees used is dropped 24h after it starts.
        useByDate: startDate + UNUSED_GRACE_MS,
    });
},

'POST /api/passcode/delete': async (req, res, ctx) => {
    const body = await readJson(req);
    const lockId = Number(body.lockId);
    const keyboardPwdId = Number(body.keyboardPwdId);
    if (!lockId || !keyboardPwdId) {
        return send(res, 400, { error: 'lockId and keyboardPwdId are required' });
    }

    const room = (await getRooms()).find(r => r.lockId === lockId);
    // Without a gateway TTLock cannot reach the lock over the internet, so ask
    // for a Bluetooth delete and tell the caller what that means.
    const deleteType = room && room.hasGateway ? 2 : 1;

    await ttlock.deletePasscode({ lockId, keyboardPwdId, deleteType });

    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name, action: 'revoke',
        lockId, room: room ? room.name : `Lock ${lockId}`,
        guest: String(body.guest || ''), keyboardPwdId,
    });

    send(res, 200, { ok: true, needsBluetooth: deleteType === 1 });
},

// ---- activity ----

'GET /api/activity': async (req, res, ctx) => {
    const limit = Math.min(Number(ctx.url.searchParams.get('limit')) || 200, 500);
    const staffId = ctx.url.searchParams.get('staffId') || null;
    const lockId = Number(ctx.url.searchParams.get('lockId')) || null;
    send(res, 200, { activity: store.activity({ limit, staffId, lockId }) });
},

// ---- staff administration ----

'GET /api/staff': async (req, res) => {
    send(res, 200, { staff: store.staff.map(publicView) });
},

'POST /api/staff': async (req, res, ctx) => {
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role === 'admin' ? 'admin' : 'staff';

    if (!name) return send(res, 400, { error: 'Name is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return send(res, 400, { error: 'Enter a valid email address' });
    }
    if (store.findStaffByEmail(email)) {
        return send(res, 409, { error: 'That email already has an account' });
    }
    const problem = passwordProblem(body.password);
    if (problem) return send(res, 400, { error: problem });

    const { salt, hash } = hashPassword(body.password);
    const member = store.addStaff({
        name, email, role, salt, passwordHash: hash, mustChangePassword: true,
    });
    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name,
        action: 'staff-add', detail: `${name} <${email}> as ${role}`,
    });

    send(res, 200, { member: publicView(member) });
},

'POST /api/staff/update': async (req, res, ctx) => {
    const body = await readJson(req);
    const member = store.findStaff(String(body.id || ''));
    if (!member) return send(res, 404, { error: 'No such staff member' });

    const patch = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (body.role === 'admin' || body.role === 'staff') patch.role = body.role;
    if (typeof body.active === 'boolean') patch.active = body.active;

    // Losing the last admin would leave nobody able to manage staff at all.
    const losingAdmin = (patch.role === 'staff' && member.role === 'admin')
        || (patch.active === false && member.role === 'admin');
    if (losingAdmin && store.activeAdminCount(member.id) === 0) {
        return send(res, 400, { error: 'This is the only admin — promote someone else first.' });
    }
    if (patch.active === false && member.id === ctx.me.id) {
        return send(res, 400, { error: 'You cannot deactivate your own account.' });
    }

    // Any change that removes access must invalidate live sessions too.
    if (patch.active === false || patch.role) patch.sessionEpoch = member.sessionEpoch + 1;

    store.updateStaff(member.id, patch);
    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name, action: 'staff-update',
        detail: `${member.name}: ${Object.entries(patch)
            .filter(([k]) => k !== 'sessionEpoch').map(([k, v]) => `${k}=${v}`).join(', ')}`,
    });

    send(res, 200, { member: publicView(store.findStaff(member.id)) });
},

'POST /api/staff/password': async (req, res, ctx) => {
    const body = await readJson(req);
    const member = store.findStaff(String(body.id || ''));
    if (!member) return send(res, 404, { error: 'No such staff member' });

    const problem = passwordProblem(body.password);
    if (problem) return send(res, 400, { error: problem });

    const { salt, hash } = hashPassword(body.password);
    store.updateStaff(member.id, {
        salt, passwordHash: hash, mustChangePassword: true,
        sessionEpoch: member.sessionEpoch + 1,
    });
    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name,
        action: 'staff-reset-password', detail: member.name,
    });

    send(res, 200, { ok: true });
},

'POST /api/staff/remove': async (req, res, ctx) => {
    const body = await readJson(req);
    const member = store.findStaff(String(body.id || ''));
    if (!member) return send(res, 404, { error: 'No such staff member' });
    if (member.id === ctx.me.id) {
        return send(res, 400, { error: 'You cannot remove your own account.' });
    }
    if (member.role === 'admin' && store.activeAdminCount(member.id) === 0) {
        return send(res, 400, { error: 'This is the only admin — promote someone else first.' });
    }

    store.removeStaff(member.id);
    store.log({
        staffId: ctx.me.id, staffName: ctx.me.name,
        action: 'staff-remove', detail: `${member.name} <${member.email}>`,
    });

    send(res, 200, { ok: true });
},

};

const PUBLIC_ROUTES = new Set(['POST /api/login']);
const ADMIN_ROUTES = new Set([
    'GET /api/staff', 'POST /api/staff', 'POST /api/staff/update',
    'POST /api/staff/password', 'POST /api/staff/remove',
]);
// Everything else is blocked until a forced password change is done, so a
// handed-out temporary password cannot be used to work indefinitely.
const ALLOWED_WHILE_PASSWORD_STALE = new Set(['GET /api/me', 'POST /api/me/password']);

// ---------------------------------------------------------------- server ---

const STATIC_DIR = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const ip = req.socket.remoteAddress || 'unknown';
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];

    if (!handler) {
        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
            return serveStatic(res, STATIC_DIR, url.pathname);
        }
        return send(res, 404, { error: 'Not found' });
    }

    let me = null;
    if (!PUBLIC_ROUTES.has(key)) {
        const header = req.headers.authorization || '';
        me = sessions.verify(header.startsWith('Bearer ') ? header.slice(7) : null, store);
        if (!me) return send(res, 401, { error: 'Session expired' });

        if (ADMIN_ROUTES.has(key) && me.role !== 'admin') {
            return send(res, 403, { error: 'Admins only' });
        }
        if (me.mustChangePassword && !ALLOWED_WHILE_PASSWORD_STALE.has(key)) {
            return send(res, 403, { error: 'Set a new password first', mustChangePassword: true });
        }
    }

    try {
        await handler(req, res, { url, ip, me });
    } catch (err) {
        if (err instanceof TTLockError) {
            console.error(`TTLock ${err.errcode}: ${err.message}`);
            return send(res, 502, { error: `TTLock: ${err.message}`, errcode: err.errcode });
        }
        console.error(err);
        send(res, 500, { error: err.message || 'Server error' });
    }
});

server.listen(PORT, () => {
    console.log(`Livery staff portal on http://localhost:${PORT}`);
    console.log(`TTLock: ${ttlock.baseUrl} as ${ttlock.username}`);
    console.log(`Data:   ${DATA_FILE} (${store.staff.length} staff)`);
});

module.exports = { server, store };
