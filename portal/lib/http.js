'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
};

function send(res, status, body, extra = {}) {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': payload.length,
        'Cache-Control': 'no-store',
        ...extra,
    });
    res.end(payload);
}

function readJson(req, limit = 64 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > limit) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function serveStatic(res, root, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
        return;
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            'Content-Length': data.length,
            // The portal shows live lock state; a stale cached page would be
            // worse than a re-fetch on a front-desk LAN.
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
        });
        res.end(data);
    });
}

module.exports = { send, readJson, serveStatic, MIME };
