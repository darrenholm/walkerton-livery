'use strict';

// Passwords and sessions.
//
// Passwords are scrypt-hashed with a per-user salt. Sessions are stateless
// HMAC tokens carrying the staff id plus that account's sessionEpoch, so
// bumping the epoch (password change, deactivation) invalidates every token
// already out there without keeping a server-side session table.

const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, expected) {
    if (!salt || !expected) return false;
    const { hash } = hashPassword(password, salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Rejects the passwords that actually show up on shared front-desk accounts.
// Eight is NIST's floor for a human-chosen password and is what the Livery's
// own accounts use; the other rules catch the genuinely weak cases.
function passwordProblem(password) {
    const p = String(password ?? '');
    if (p.length < 8) return 'Password must be at least 8 characters.';
    if (/^\d+$/.test(p)) return 'Password cannot be only numbers.';
    if (/^(password|letmein|welcome|walkerton|livery|qwerty|abc123)/i.test(p)) {
        return 'Password is too easy to guess.';
    }
    return null;
}

class Sessions {
    constructor(secret, hours = 12) {
        this.secret = secret;
        this.ttl = hours * 3600 * 1000;
    }

    sign(payload) {
        return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    }

    issue(member) {
        const payload = `${member.id}.${member.sessionEpoch}.${Date.now() + this.ttl}`;
        return `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    }

    // Returns the staff record, or null for anything expired, forged, stale
    // (epoch bumped) or belonging to a disabled account.
    verify(token, store) {
        if (typeof token !== 'string') return null;
        const dot = token.lastIndexOf('.');
        if (dot < 1) return null;

        const payload = Buffer.from(token.slice(0, dot), 'base64url').toString();
        const given = Buffer.from(token.slice(dot + 1));
        const want = Buffer.from(this.sign(payload));
        if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

        const [id, epoch, exp] = payload.split('.');
        if (!(Number(exp) > Date.now())) return null;

        const member = store.findStaff(id);
        if (!member || !member.active) return null;
        if (Number(epoch) !== member.sessionEpoch) return null;
        return member;
    }
}

// Per-identifier attempt brake. Keyed by email so one attacker cannot lock the
// whole front desk out by hammering from a shared IP, and vice versa.
class Throttle {
    constructor({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
        this.max = max;
        this.windowMs = windowMs;
        this.hits = new Map();
    }

    check(key) {
        const now = Date.now();
        const rec = this.hits.get(key);
        if (!rec || now > rec.resetAt) {
            this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
            return true;
        }
        rec.count += 1;
        return rec.count <= this.max;
    }

    clear(key) { this.hits.delete(key); }

    // Called on a timer so the map cannot grow without bound.
    sweep() {
        const now = Date.now();
        for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k);
    }
}

module.exports = { hashPassword, verifyPassword, passwordProblem, Sessions, Throttle };
