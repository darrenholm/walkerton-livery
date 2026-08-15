'use strict';

// Tests bin/staff.js against a throwaway data file.
//
//   node portal/test/cli.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');

const { verifyPassword } = require('../lib/auth');

const CLI = path.join(__dirname, '..', 'bin', 'staff.js');
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'livery-cli-')), 'portal.json');

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

// Returns { ok, out } instead of throwing, so failure cases are easy to assert.
function run(...args) {
    try {
        return {
            ok: true,
            out: execFileSync(process.execPath, [CLI, ...args], {
                env: { ...process.env, DATA_FILE: dataFile },
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            }),
        };
    } catch (err) {
        return { ok: false, out: (err.stdout || '') + (err.stderr || '') };
    }
}

const read = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const find = (email) => read().staff.find(s => s.email === email);

console.log('\nadding accounts');

let r = run('add', 'Darren Holm', 'darren@walkertonlivery.ca', 'admin', 'Kilmer@73');
check('admin created with an 8-character password', () => {
    assert.ok(r.ok, r.out);
    assert.ok(r.out.includes('as admin'));
});

r = run('add', 'Brady', 'brady@walkertonlivery.ca', 'staff', 'Kilmer@73');
check('front desk account created', () => assert.ok(r.ok, r.out));

check('both accounts are on disk', () => assert.strictEqual(read().staff.length, 2));
check('roles are as given', () => {
    assert.strictEqual(find('darren@walkertonlivery.ca').role, 'admin');
    assert.strictEqual(find('brady@walkertonlivery.ca').role, 'staff');
});
check('a password typed by an admin is not treated as temporary', () =>
    assert.strictEqual(find('brady@walkertonlivery.ca').mustChangePassword, false));
check('passwords verify against the stored hash', () => {
    const m = find('darren@walkertonlivery.ca');
    assert.ok(verifyPassword('Kilmer@73', m.salt, m.passwordHash));
    assert.ok(!verifyPassword('Kilmer@74', m.salt, m.passwordHash));
});
check('the plaintext password is never written to disk', () =>
    assert.ok(!fs.readFileSync(dataFile, 'utf8').includes('Kilmer@73')));
check('each account gets its own salt', () =>
    assert.notStrictEqual(find('darren@walkertonlivery.ca').salt,
                          find('brady@walkertonlivery.ca').salt));

console.log('\nvalidation');

r = run('add', 'Dup', 'DARREN@walkertonlivery.ca', 'staff', 'Kilmer@73');
check('duplicate email refused, case-insensitively', () => {
    assert.ok(!r.ok);
    assert.match(r.out, /already has an account/);
});

r = run('add', 'Bad', 'not-an-email', 'staff', 'Kilmer@73');
check('invalid email refused', () => assert.ok(!r.ok));

r = run('add', 'Bad', 'bad@walkertonlivery.ca', 'wizard', 'Kilmer@73');
check('unknown role refused', () => assert.ok(!r.ok));

r = run('add', 'Short', 'short@walkertonlivery.ca', 'staff', 'Mim@1');
check('password under 8 characters refused', () => {
    assert.ok(!r.ok);
    assert.match(r.out, /at least 8/);
});

r = run('add', 'Digits', 'digits@walkertonlivery.ca', 'staff', '12345678');
check('all-digit password refused', () => assert.ok(!r.ok));

check('nothing invalid was written', () => assert.strictEqual(read().staff.length, 2));

console.log('\ngenerated passwords');

r = run('add', 'Casual', 'casual@walkertonlivery.ca', 'staff');
check('password generated when none is given', () => {
    assert.ok(r.ok, r.out);
    assert.match(r.out, /Password: \S+/);
});
check('a generated password must be changed at first sign-in', () =>
    assert.strictEqual(find('casual@walkertonlivery.ca').mustChangePassword, true));

console.log('\nchanging accounts');

const before = find('brady@walkertonlivery.ca');
r = run('password', 'brady@walkertonlivery.ca', 'Saugeen@2026');
check('password can be reset', () => assert.ok(r.ok, r.out));
check('resetting signs open sessions out', () =>
    assert.ok(find('brady@walkertonlivery.ca').sessionEpoch > before.sessionEpoch));
check('the new password is the one stored', () => {
    const m = find('brady@walkertonlivery.ca');
    assert.ok(verifyPassword('Saugeen@2026', m.salt, m.passwordHash));
    assert.ok(!verifyPassword('Kilmer@73', m.salt, m.passwordHash));
});

r = run('password', 'brady@walkertonlivery.ca', 'Kilmer@73', '--force-change');
check('--force-change marks the password temporary', () => {
    assert.ok(r.ok, r.out);
    assert.strictEqual(find('brady@walkertonlivery.ca').mustChangePassword, true);
});

r = run('disable', 'brady@walkertonlivery.ca');
check('account can be disabled', () => {
    assert.ok(r.ok, r.out);
    assert.strictEqual(find('brady@walkertonlivery.ca').active, false);
});
r = run('enable', 'brady@walkertonlivery.ca');
check('account can be re-enabled', () =>
    assert.strictEqual(find('brady@walkertonlivery.ca').active, true));

console.log('\nlast-admin guard');

r = run('disable', 'darren@walkertonlivery.ca');
check('the only admin cannot be disabled', () => {
    assert.ok(!r.ok);
    assert.match(r.out, /only admin/);
});
r = run('remove', 'darren@walkertonlivery.ca');
check('the only admin cannot be removed', () => assert.ok(!r.ok));
check('the admin survived both attempts', () =>
    assert.strictEqual(find('darren@walkertonlivery.ca').active, true));

r = run('remove', 'casual@walkertonlivery.ca');
check('a non-admin can be removed', () => {
    assert.ok(r.ok, r.out);
    assert.strictEqual(find('casual@walkertonlivery.ca'), undefined);
});

r = run('password', 'ghost@walkertonlivery.ca', 'Kilmer@73');
check('unknown email reported clearly', () => {
    assert.ok(!r.ok);
    assert.match(r.out, /No account for/);
});

console.log('\nlisting');
r = run('list');
check('list shows both remaining accounts', () => {
    assert.ok(r.out.includes('Darren Holm'));
    assert.ok(r.out.includes('Brady'));
});
check('list never prints a hash or salt', () =>
    assert.ok(!/passwordHash|[a-f0-9]{64}/.test(r.out)));

console.log(`\n${passed} checks passed`);
