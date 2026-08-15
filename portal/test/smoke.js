'use strict';

// End-to-end test. Stands up a fake TTLock cloud API, runs the real server
// against a throwaway data file, and drives the same calls the browser makes.
//
//   node portal/test/smoke.js

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert');

let passed = 0;
function check(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok   ${name}`);
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        process.exitCode = 1;
    }
}

// ----------------------------------------------------------- fake TTLock ---

const calls = [];
let expireNextCall = false;

const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        const params = Object.fromEntries(new URLSearchParams(body));
        calls.push({ path: req.url, params });
        const reply = (o) => {
            const s = JSON.stringify(o);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
            res.end(s);
        };

        if (req.url === '/oauth2/token') {
            return reply({ access_token: 'tok', refresh_token: 'ref', expires_in: 7776000 });
        }
        if (expireNextCall) {
            expireNextCall = false;
            return reply({ errcode: 10003, errmsg: 'invalid token', description: 'expired' });
        }
        if (req.url === '/v3/lock/list') {
            return reply({ list: [
                { lockId: 22, lockAlias: 'Unit 22', keyboardPwdVersion: 4, electricQuantity: 88, hasGateway: 0 },
                { lockId: 20, lockAlias: 'Unit 20', keyboardPwdVersion: 4, electricQuantity: 19, hasGateway: 1 },
            ], total: 2, pages: 1 });
        }
        if (req.url === '/v3/keyboardPwd/get') return reply({ keyboardPwd: '739104', keyboardPwdId: 5551 });
        if (req.url === '/v3/lock/listKeyboardPwd') {
            const now = Date.now();
            return reply({ list: [
                { keyboardPwdId: 5551, keyboardPwd: '739104', keyboardPwdName: 'Dave Miller', keyboardPwdType: 3, startDate: now - 3600e3, endDate: now + 864e5 },
                { keyboardPwdId: 77, keyboardPwd: '222222', keyboardPwdName: 'Walk-in', keyboardPwdType: 3, startDate: now - 3e8, endDate: now - 2e8 },
                { keyboardPwdId: 99, keyboardPwd: '999999', keyboardPwdName: 'Owner', keyboardPwdType: 2, startDate: 0, endDate: 0 },
            ], total: 3, pages: 1 });
        }
        if (req.url === '/v3/keyboardPwd/delete') return reply({ errcode: 0, errmsg: 'none' });
        reply({ errcode: 404, errmsg: 'unknown', description: req.url });
    });
});

// ---------------------------------------------------------------- driver ---

const listen = (s) => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));

function waitFor(url, tries = 80) {
    return new Promise((resolve, reject) => {
        const go = (n) => fetch(url).then(resolve).catch(() => {
            if (n <= 0) return reject(new Error('server never came up'));
            setTimeout(() => go(n - 1), 100);
        });
        go(tries);
    });
}

(async () => {
    const fakePort = await listen(fake);
    const appPort = 8095;
    const base = `http://127.0.0.1:${appPort}`;
    const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'livery-')), 'portal.json');

    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: {
            ...process.env,
            PORT: String(appPort),
            DATA_FILE: dataFile,
            SESSION_SECRET: 'test-secret',
            PORTAL_ADMIN_EMAIL: 'owner@walkertonlivery.ca',
            PORTAL_ADMIN_PASSWORD: 'correct-horse-battery',
            PORTAL_ADMIN_NAME: 'Darren',
            CHECKIN_HOUR: '15', CHECKOUT_HOUR: '11',
            TTLOCK_BASE_URL: `http://127.0.0.1:${fakePort}`,
            TTLOCK_CLIENT_ID: 'cid', TTLOCK_CLIENT_SECRET: 'csecret',
            TTLOCK_USERNAME: 'front@desk', TTLOCK_PASSWORD: 'hunter2',
        },
        stdio: ['ignore', 'pipe', 'inherit'],
    });

    const cleanup = () => { child.kill(); fake.close(); };
    process.on('exit', cleanup);

    const call = (token, path, opts = {}) => fetch(base + path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
    });
    const login = async (email, password) => {
        const r = await call(null, '/api/login', {
            method: 'POST', body: JSON.stringify({ email, password }),
        });
        return { status: r.status, body: await r.json() };
    };

    try {
        await waitFor(base + '/login.html');

        console.log('\nbootstrap + sign in');
        let r = await login('owner@walkertonlivery.ca', 'nope');
        check('wrong password rejected', () => assert.strictEqual(r.status, 401));

        r = await login('nobody@example.com', 'correct-horse-battery');
        check('unknown email rejected', () => assert.strictEqual(r.status, 401));

        r = await login('owner@walkertonlivery.ca', 'correct-horse-battery');
        check('bootstrap admin can sign in', () => assert.strictEqual(r.status, 200));
        check('admin role is set', () => assert.strictEqual(r.body.me.role, 'admin'));
        check('supplied password is not flagged as temporary', () =>
            assert.strictEqual(r.body.me.mustChangePassword, false));
        check('password hash never leaves the server', () =>
            assert.ok(!JSON.stringify(r.body).match(/passwordHash|salt/)));
        const admin = r.body.token;

        r = await login('OWNER@WalkertonLivery.CA', 'correct-horse-battery');
        check('email match is case-insensitive', () => assert.strictEqual(r.status, 200));

        const anon = await call(null, '/api/rooms');
        check('unauthenticated request rejected', () => assert.strictEqual(anon.status, 401));
        const forged = await call('bm9wZQ.forged', '/api/rooms');
        check('forged token rejected', () => assert.strictEqual(forged.status, 401));

        console.log('\nrooms + codes');
        const { rooms } = await (await call(admin, '/api/rooms')).json();
        check('locks are listed and sorted', () =>
            assert.deepStrictEqual(rooms.map(x => x.name), ['Unit 20', 'Unit 22']));

        const start = new Date(2026, 8, 3, 14, 37, 12).getTime();
        const end = new Date(2026, 8, 6, 11, 45, 0).getTime();
        r = await call(admin, '/api/passcode', {
            method: 'POST',
            body: JSON.stringify({ lockId: 22, guest: 'Dave Miller', startDate: start, endDate: end }),
        });
        const issued = await r.json();
        check('passcode generated', () => assert.strictEqual(issued.passcode, '739104'));

        const gen = calls.filter(c => c.path === '/v3/keyboardPwd/get').pop();
        check('minutes/seconds floored off both ends', () => {
            assert.strictEqual(new Date(Number(gen.params.startDate)).getMinutes(), 0);
            assert.strictEqual(new Date(Number(gen.params.endDate)).getMinutes(), 0);
        });
        check('period type (3) used', () => assert.strictEqual(gen.params.keyboardPwdType, '3'));
        check('24h use-by returned', () =>
            assert.strictEqual(issued.useByDate - Number(gen.params.startDate), 86400000));

        const bad = async (body) => (await call(admin, '/api/passcode', {
            method: 'POST', body: JSON.stringify(body),
        })).status;
        const s1 = await bad({ lockId: 22, startDate: start, endDate: end });
        const s2 = await bad({ guest: 'X', startDate: start, endDate: end });
        const s3 = await bad({ lockId: 22, guest: 'X', startDate: end, endDate: start });
        const s4 = await bad({ lockId: 999, guest: 'X', startDate: start, endDate: end });
        check('no guest name -> 400', () => assert.strictEqual(s1, 400));
        check('no room -> 400', () => assert.strictEqual(s2, 400));
        check('backwards dates -> 400', () => assert.strictEqual(s3, 400));
        check('unknown room -> 404', () => assert.strictEqual(s4, 404));

        const { codes } = await (await call(admin, '/api/passcodes?lockId=22')).json();
        check('app-made permanent codes hidden', () => assert.strictEqual(codes.length, 2));
        check('issuer is attributed from the log', () =>
            assert.strictEqual(codes.find(c => c.keyboardPwdId === 5551).issuedBy, 'Darren'));
        check('codes not issued here have no issuer', () =>
            assert.strictEqual(codes.find(c => c.keyboardPwdId === 77).issuedBy, null));

        console.log('\nrevoke');
        let del = await (await call(admin, '/api/passcode/delete', {
            method: 'POST', body: JSON.stringify({ lockId: 22, keyboardPwdId: 5551 }),
        })).json();
        check('gateway-less room needs a Bluetooth finish', () =>
            assert.strictEqual(del.needsBluetooth, true));
        del = await (await call(admin, '/api/passcode/delete', {
            method: 'POST', body: JSON.stringify({ lockId: 20, keyboardPwdId: 5551 }),
        })).json();
        check('gateway room revokes remotely', () => assert.strictEqual(del.needsBluetooth, false));

        console.log('\nstaff administration');
        r = await call(admin, '/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name: 'Front Desk', email: 'desk@walkertonlivery.ca', role: 'staff', password: 'victoria-2026' }),
        });
        const created = await r.json();
        check('staff member created', () => assert.strictEqual(r.status, 200));
        check('new staff must change password', () =>
            assert.strictEqual(created.member.mustChangePassword, true));

        r = await call(admin, '/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name: 'Dup', email: 'DESK@walkertonlivery.ca', role: 'staff', password: 'victoria-2026' }),
        });
        check('duplicate email rejected', () => assert.strictEqual(r.status, 409));

        r = await call(admin, '/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name: 'Weak', email: 'weak@walkertonlivery.ca', role: 'staff', password: '12345678901' }),
        });
        check('all-digit password rejected', () => assert.strictEqual(r.status, 400));

        r = await call(admin, '/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name: 'Short', email: 'short@walkertonlivery.ca', role: 'staff', password: 'abc' }),
        });
        check('short password rejected', () => assert.strictEqual(r.status, 400));

        console.log('\nforced password change');
        r = await login('desk@walkertonlivery.ca', 'victoria-2026');
        const deskToken = r.body.token;
        check('new staff can sign in', () => assert.strictEqual(r.status, 200));

        r = await call(deskToken, '/api/rooms');
        check('work is blocked until the password is changed', () => assert.strictEqual(r.status, 403));
        r = await call(deskToken, '/api/me');
        check('/api/me still reachable while blocked', () => assert.strictEqual(r.status, 200));

        r = await call(deskToken, '/api/me/password', {
            method: 'POST', body: JSON.stringify({ current: 'wrong', next: 'saugeen-river-9' }),
        });
        check('wrong current password rejected', () => assert.strictEqual(r.status, 400));

        r = await call(deskToken, '/api/me/password', {
            method: 'POST', body: JSON.stringify({ current: 'victoria-2026', next: 'saugeen-river-9' }),
        });
        const changed = await r.json();
        check('password change succeeds', () => assert.strictEqual(r.status, 200));

        r = await call(deskToken, '/api/rooms');
        check('the pre-change token is now invalid', () => assert.strictEqual(r.status, 401));
        r = await call(changed.token, '/api/rooms');
        check('the fresh token works', () => assert.strictEqual(r.status, 200));

        console.log('\nrole boundaries');
        r = await call(changed.token, '/api/staff');
        check('front desk cannot read the roster', () => assert.strictEqual(r.status, 403));
        r = await call(changed.token, '/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name: 'Sneak', email: 's@x.ca', role: 'admin', password: 'bruce-county-1' }),
        });
        check('front desk cannot create staff', () => assert.strictEqual(r.status, 403));
        r = await call(changed.token, '/api/activity');
        check('front desk can read activity', () => assert.strictEqual(r.status, 200));
        r = await call(changed.token, '/api/passcode', {
            method: 'POST',
            body: JSON.stringify({ lockId: 22, guest: 'Walk-in', startDate: start, endDate: end }),
        });
        check('front desk can issue codes', () => assert.strictEqual(r.status, 200));

        console.log('\nlast-admin and self guards');
        const me = (await (await call(admin, '/api/me')).json()).me;
        r = await call(admin, '/api/staff/update', {
            method: 'POST', body: JSON.stringify({ id: me.id, active: false }),
        });
        check('cannot deactivate yourself', () => assert.strictEqual(r.status, 400));
        r = await call(admin, '/api/staff/update', {
            method: 'POST', body: JSON.stringify({ id: me.id, role: 'staff' }),
        });
        check('cannot demote the only admin', () => assert.strictEqual(r.status, 400));
        r = await call(admin, '/api/staff/remove', {
            method: 'POST', body: JSON.stringify({ id: me.id }),
        });
        check('cannot remove yourself', () => assert.strictEqual(r.status, 400));

        console.log('\ndisabling cuts access immediately');
        r = await call(admin, '/api/staff/update', {
            method: 'POST', body: JSON.stringify({ id: created.member.id, active: false }),
        });
        check('front desk account disabled', () => assert.strictEqual(r.status, 200));
        r = await call(changed.token, '/api/rooms');
        check('their live session stops working', () => assert.strictEqual(r.status, 401));
        r = await login('desk@walkertonlivery.ca', 'saugeen-river-9');
        check('and they cannot sign back in', () => assert.strictEqual(r.status, 401));

        console.log('\nactivity log');
        const { activity } = await (await call(admin, '/api/activity?limit=500')).json();
        const kinds = activity.map(a => a.action);
        check('issues are logged', () => assert.ok(kinds.includes('issue')));
        check('revokes are logged', () => assert.ok(kinds.includes('revoke')));
        check('sign-ins are logged', () => assert.ok(kinds.includes('login')));
        check('staff changes are logged', () => assert.ok(kinds.includes('staff-add')));
        check('password changes are logged', () => assert.ok(kinds.includes('password-change')));
        check('newest entry first', () => assert.ok(activity[0].at >= activity[1].at));
        check('issue entries name the guest and room', () => {
            const e = activity.find(a => a.action === 'issue');
            assert.strictEqual(e.room, 'Unit 22');
            assert.ok(e.guest);
            assert.ok(e.staffName);
        });

        const filtered = await (await call(admin, `/api/activity?staffId=${me.id}`)).json();
        check('activity filters by staff member', () =>
            assert.ok(filtered.activity.every(a => a.staffId === me.id)));

        console.log('\npersistence + token refresh');
        const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        check('data is written to disk', () => assert.ok(saved.staff.length >= 2));
        check('passwords are stored hashed, never in the clear', () => {
            const raw = fs.readFileSync(dataFile, 'utf8');
            assert.ok(!raw.includes('correct-horse-battery'));
            assert.ok(!raw.includes('saugeen-river-9'));
            assert.ok(saved.staff[0].passwordHash.length === 128);
        });

        expireNextCall = true;
        r = await call(admin, '/api/rooms?refresh=1');
        check('an expired TTLock token is refreshed and retried', () =>
            assert.strictEqual(r.status, 200));

        console.log('\nstatic');
        r = await fetch(base + '/codes.html');
        check('portal pages are served', () => assert.strictEqual(r.status, 200));
        r = await fetch(base + '/../server.js');
        check('path traversal blocked', () => assert.ok(r.status === 403 || r.status === 404));

        console.log(`\n${passed} checks passed`);
    } finally {
        cleanup();
    }
})().catch(err => { console.error(err); process.exit(1); });
