#!/usr/bin/env node
'use strict';

// Staff accounts from the command line, for when the portal is not running or
// you are setting it up for the first time.
//
//   node bin/staff.js list
//   node bin/staff.js add "Darren Holm" darren@walkertonlivery.ca admin 'secret'
//   node bin/staff.js password brady@walkertonlivery.ca 'newsecret'
//   node bin/staff.js disable brady@walkertonlivery.ca
//   node bin/staff.js enable  brady@walkertonlivery.ca
//   node bin/staff.js remove  brady@walkertonlivery.ca
//
// Omit the password on `add` and one is generated for you. Pass --force-change
// to make them pick their own at first sign-in (the default for accounts made
// through the Staff page, where a temporary password gets handed over).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { Store } = require('../lib/store');
const { hashPassword, passwordProblem } = require('../lib/auth');

// Same .env handling as the server, so DATA_FILE lands in the same place.
function loadEnvFile(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
        if (!m || process.env[m[1]] !== undefined) continue;
        process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
}
loadEnvFile(path.join(__dirname, '..', '.env'));

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'portal.json');
const store = new Store(DATA_FILE);

const argv = process.argv.slice(2);
const forceChange = argv.includes('--force-change');
const args = argv.filter(a => a !== '--force-change');
const [command, ...rest] = args;

function die(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}

function usage() {
    console.log(`
  Staff accounts — ${DATA_FILE}

    list
    add <name> <email> <role: admin|staff> [password]   [--force-change]
    password <email> <password>                         [--force-change]
    disable <email>
    enable <email>
    remove <email>
`);
}

function findOrDie(email) {
    const member = store.findStaffByEmail(email);
    if (!member) die(`No account for ${email}. Try: node bin/staff.js list`);
    return member;
}

const commands = {

    list() {
        if (!store.staff.length) {
            console.log('\n  No staff accounts yet.\n');
            return;
        }
        console.log('');
        for (const s of store.staff) {
            const flags = [
                s.role,
                s.active ? null : 'DISABLED',
                s.mustChangePassword ? 'must change password' : null,
            ].filter(Boolean).join(', ');
            const seen = s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('en-CA') : 'never signed in';
            console.log(`  ${s.name.padEnd(18)} ${s.email.padEnd(34)} ${flags}`);
            console.log(`  ${''.padEnd(18)} last sign-in: ${seen}`);
        }
        console.log('');
    },

    async add(name, email, role, password) {
        if (!name || !email || !role) die('Usage: add <name> <email> <role> [password]');
        if (role !== 'admin' && role !== 'staff') die("Role must be 'admin' or 'staff'.");

        email = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die(`"${email}" is not a valid email address.`);
        if (store.findStaffByEmail(email)) die(`${email} already has an account.`);

        const generated = !password;
        if (generated) password = crypto.randomBytes(9).toString('base64url');

        const problem = passwordProblem(password);
        if (problem) die(problem);

        const { salt, hash } = hashPassword(password);
        store.addStaff({
            name: name.trim(), email, role, salt, passwordHash: hash,
            // A password typed here was chosen deliberately, so it is not
            // treated as temporary unless the caller says so.
            mustChangePassword: forceChange || generated,
        });
        await store.save();

        console.log(`\n  Added ${name} <${email}> as ${role}`);
        if (generated) console.log(`  Password: ${password}   (they must change it at first sign-in)`);
        else if (forceChange) console.log('  They must change this password at first sign-in.');
        console.log('');
    },

    async password(email, password) {
        if (!email || !password) die('Usage: password <email> <password>');
        const member = findOrDie(email);

        const problem = passwordProblem(password);
        if (problem) die(problem);

        const { salt, hash } = hashPassword(password);
        // Bumping the epoch signs the account out everywhere it is logged in.
        store.updateStaff(member.id, {
            salt, passwordHash: hash,
            mustChangePassword: forceChange,
            sessionEpoch: member.sessionEpoch + 1,
        });
        await store.save();
        console.log(`\n  Password set for ${member.name}. Any open sessions were signed out.\n`);
    },

    async disable(email) {
        const member = findOrDie(email);
        if (member.role === 'admin' && store.activeAdminCount(member.id) === 0) {
            die('That is the only admin — promote someone else first.');
        }
        store.updateStaff(member.id, { active: false, sessionEpoch: member.sessionEpoch + 1 });
        await store.save();
        console.log(`\n  ${member.name} disabled and signed out.\n`);
    },

    async enable(email) {
        const member = findOrDie(email);
        store.updateStaff(member.id, { active: true });
        await store.save();
        console.log(`\n  ${member.name} enabled.\n`);
    },

    async remove(email) {
        const member = findOrDie(email);
        if (member.role === 'admin' && store.activeAdminCount(member.id) === 0) {
            die('That is the only admin — promote someone else first.');
        }
        store.removeStaff(member.id);
        await store.save();
        console.log(`\n  Removed ${member.name}. Their past activity stays in the log.\n`);
    },
};

(async () => {
    if (!command || command === 'help' || command === '--help') return usage();
    if (!commands[command]) die(`Unknown command "${command}". Try: node bin/staff.js help`);
    await commands[command](...rest);
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});
