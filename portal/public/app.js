'use strict';

// Shared front-end helpers: session handling, the page chrome every screen
// draws, and the small formatting bits used across pages.

const Portal = (() => {

const TOKEN_KEY = 'livery_portal_token';

let me = null;
let defaults = { checkinHour: 15, checkoutHour: 11 };

const el = (id) => document.getElementById(id);

function token() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }

function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    location.href = 'login.html';
}

async function api(path, opts = {}) {
    const res = await fetch(path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(token() ? { Authorization: 'Bearer ' + token() } : {}),
            ...(opts.headers || {}),
        },
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) { signOut(); throw new Error('Session expired'); }
    if (res.status === 403 && data.mustChangePassword) {
        location.href = 'password.html';
        throw new Error(data.error);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------- chrome ----

const NAV = [
    { href: 'index.html', label: 'Home' },
    { href: 'codes.html', label: 'Room codes' },
    { href: 'activity.html', label: 'Activity' },
    { href: 'staff.html', label: 'Staff', admin: true },
];

function renderHead(current) {
    const links = NAV
        .filter(n => !n.admin || me.role === 'admin')
        .map(n => `<a href="${n.href}"${n.href === current ? ' class="on"' : ''}>${n.label}</a>`)
        .join('');

    document.body.insertAdjacentHTML('afterbegin', `
      <header class="head">
        <div class="head-in">
          <a class="head-brand" href="index.html">The <span>Livery</span></a>
          <nav class="head-nav">${links}</nav>
          <div class="head-who">
            <b>${escapeHtml(me.name)}</b>
            ${me.role === 'admin' ? '<span class="pill-role">Admin</span>' : ''}
            <a href="password.html" title="Change password">Password</a>
            <button class="btn btn-quiet btn-sm" id="signOutBtn">Sign out</button>
          </div>
        </div>
      </header>`);

    el('signOutBtn').onclick = signOut;
}

// Every authenticated page calls this first. Redirects out if the session is
// gone, so no page has to guard its own rendering.
async function start(current) {
    if (!token()) { location.href = 'login.html'; return null; }
    try {
        const data = await api('/api/me');
        me = data.me;
        defaults = data.defaults || defaults;
    } catch {
        return null;
    }
    if (me.mustChangePassword && current !== 'password.html') {
        location.href = 'password.html';
        return null;
    }
    if (current) renderHead(current);
    return me;
}

// ------------------------------------------------------------ feedback ----

function toast(text) {
    let t = el('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.style.display = 'none'; }, 2400);
}

function showError(node, message) {
    node.textContent = message;
    node.classList.remove('hide');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function copy(text, message) {
    try {
        await navigator.clipboard.writeText(text);
        toast(message);
    } catch {
        toast('Copy failed — select the text manually');
    }
}

// --------------------------------------------------------------- dates ----

const pad = (n) => String(n).padStart(2, '0');

function toDateInput(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A date input gives "YYYY-MM-DD"; pin it to the house hour in local time so
// the window staff pick is the window the lock enforces.
function atHour(dateStr, hour) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, hour, 0, 0, 0).getTime();
}

const fmtFull = (ms) => new Date(ms).toLocaleString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

const fmtStamp = (ms) => new Date(ms).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

return {
    el, api, token, setToken, signOut, start, toast, showError, copy,
    escapeHtml, toDateInput, atHour, fmtFull, fmtDay, fmtStamp,
    get me() { return me; },
    get defaults() { return defaults; },
};
})();
