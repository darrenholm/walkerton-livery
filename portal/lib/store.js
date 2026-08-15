'use strict';

// Flat-file JSON store.
//
// The Livery has a handful of staff and a few hundred codes a year, so a
// database would be more operational weight than the data justifies. Writes go
// through a temp file + rename so a crash mid-write cannot truncate the real
// one, and they are serialised so concurrent requests cannot interleave.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EMPTY = { staff: [], activity: [] };

// Keeps the file bounded without anyone having to prune it. At the Livery's
// volume this is several years of history.
const MAX_ACTIVITY = 5000;

class Store {
    constructor(file) {
        this.file = file;
        this.data = this.read();
        this.writing = Promise.resolve();
    }

    read() {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            return { ...structuredClone(EMPTY), ...parsed };
        } catch (err) {
            if (err.code !== 'ENOENT') {
                // A corrupt file is worth shouting about rather than silently
                // starting fresh and appearing to lose every staff account.
                throw new Error(`Cannot read ${this.file}: ${err.message}`);
            }
            return structuredClone(EMPTY);
        }
    }

    // Chained so overlapping saves apply in call order.
    save() {
        this.writing = this.writing.then(() => this.writeNow()).catch(err => {
            console.error('Store write failed:', err);
        });
        return this.writing;
    }

    async writeNow() {
        const tmp = `${this.file}.${process.pid}.tmp`;
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
        await fs.promises.writeFile(tmp, JSON.stringify(this.data, null, 2));
        await fs.promises.rename(tmp, this.file);
    }

    // ------------------------------------------------------------- staff ---

    get staff() { return this.data.staff; }

    findStaff(id) { return this.data.staff.find(s => s.id === id) || null; }

    findStaffByEmail(email) {
        const wanted = String(email || '').trim().toLowerCase();
        return this.data.staff.find(s => s.email === wanted) || null;
    }

    addStaff(fields) {
        const member = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            lastLoginAt: null,
            active: true,
            // Bumped whenever credentials change or the account is disabled, so
            // sessions issued before that stop validating.
            sessionEpoch: 1,
            ...fields,
        };
        this.data.staff.push(member);
        this.save();
        return member;
    }

    updateStaff(id, patch) {
        const member = this.findStaff(id);
        if (!member) return null;
        Object.assign(member, patch);
        this.save();
        return member;
    }

    removeStaff(id) {
        const i = this.data.staff.findIndex(s => s.id === id);
        if (i === -1) return false;
        this.data.staff.splice(i, 1);
        this.save();
        return true;
    }

    activeAdminCount(excludeId = null) {
        return this.data.staff.filter(s =>
            s.role === 'admin' && s.active && s.id !== excludeId).length;
    }

    // ---------------------------------------------------------- activity ---

    log(entry) {
        this.data.activity.unshift({ id: crypto.randomUUID(), at: Date.now(), ...entry });
        if (this.data.activity.length > MAX_ACTIVITY) {
            this.data.activity.length = MAX_ACTIVITY;
        }
        this.save();
    }

    activity({ limit = 200, staffId = null, lockId = null } = {}) {
        return this.data.activity
            .filter(a => (!staffId || a.staffId === staffId)
                      && (!lockId || a.lockId === lockId))
            .slice(0, limit);
    }
}

module.exports = { Store, MAX_ACTIVITY };
