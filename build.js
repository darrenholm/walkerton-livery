'use strict';

// Static site generator for walkertonlivery.ca.
//
// Page content lives in `pages` below; the shared chrome lives in `shell()`.
// Running this writes plain HTML into dist/, which is what gets uploaded --
// the host needs no Node, no build step, nothing but a file copy.
//
//   node build.js

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'dist');
const BOOKING = 'https://book.walkertonlivery.ca';
const PHONE = '226-840-6727';
const TEL = 'tel:+1' + PHONE.replace(/-/g, '');
const EMAIL = 'frontdesk@walkertonlivery.ca';
const ADDRESS = '11 Victoria St. S, Walkerton, Ontario';
const MAPS = 'https://maps.google.com/?q=11+Victoria+St+S,+Walkerton,+Ontario';
const CHECK_IN = '2:00 pm';
const CHECK_OUT = '11:00 am';

// slug '' is the home page; children render in the Local Services dropdown.
const NAV = [
    { slug: '', label: 'Home' },
    { slug: 'about-us', label: 'About Us' },
    { slug: 'rooms', label: 'Rooms' },
    { slug: 'rates', label: 'Rates' },
    { slug: 'check-in', label: 'Check-in' },
    {
        slug: 'local-services', label: 'Local Services', children: [
            { slug: 'local-services/restaurants', label: 'Restaurants' },
            { slug: 'local-services/grocery-stores', label: 'Grocery Stores' },
            { slug: 'local-services/other-services', label: 'Other Services' },
            { slug: 'local-services/things-to-do', label: 'Things to do' },
        ],
    },
    { slug: 'contact-us', label: 'Contact Us' },
];

// Depth-aware so the generated HTML works from a file:// open as well as a
// web root -- handy when someone drags dist/ around before uploading.
const up = (slug) => (slug === '' ? './' : '../'.repeat(slug.split('/').length));

// Line icons, 24x24, stroked by css (svg.i).
const ICONS = {
    ac: 'M3 5h18v8H3zM7 16c0 1.6-1 2.1-1 3.6M12 16c0 1.6-1 2.1-1 3.6M17 16c0 1.6-1 2.1-1 3.6',
    wifi: 'M4 10a12 12 0 0116 0M7.5 13.5a7 7 0 019 0M12 18h.01',
    tv: 'M3 5h18v11H3zM8 20h8',
    coffee: 'M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM17 9h2a2 2 0 010 4h-2',
    plug: 'M9 3v5M15 3v5M6.5 8h11v3.4a5.5 5.5 0 01-11 0zM12 16.9V21',
    parking: 'M4 3h16v18H4zM9 17V8h3.4a2.8 2.8 0 010 5.6H9',
    fridge: 'M6 2h12v20H6zM6 10h12M9 5v2M9 13v3',
    shower: 'M4 20V8a4 4 0 018 0M10 8h6M12 12v1M15 12v1M18 12v1M12 16v1M15 16v1M18 16v1',
    key: 'M8 11a4 4 0 100 8 4 4 0 000-8zM11 12l9-9M17 6l3 3M15 8l2 2',
    hat: 'M3 15c3 2 15 2 18 0M6 15c0-5 2-9 6-9s6 4 6 9',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 7.4a2.6 2.6 0 110 5.2 2.6 2.6 0 010-5.2z',
    clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

const AMENITIES = [
    ['ac', 'Individually air-conditioned'],
    ['wifi', 'Free fibre optic Wi-Fi'],
    ['tv', 'Internet television'],
    ['coffee', 'Coffee maker'],
    ['fridge', 'Mini fridge &amp; microwave'],
    ['shower', 'Private bathroom'],
    ['plug', 'USB &amp; network connections'],
    ['parking', 'Free parking'],
];
const amenities = () => `<ul class="amen">${AMENITIES.map(([i, label]) => `
    <li>${icon(i)}<span>${label}</span></li>`).join('')}
  </ul>`;

// The two Wi-Fi info signs visible in room-main and room-tv are blurred in the
// image files themselves -- keep it that way if those photos are ever redone.
const PHOTOS = [
    ['room-main', 'Queen bed with teal accent wall, desk, microwave and coffee station'],
    ['room-bed-door', 'Queen bed, desk and barn door to the bathroom'],
    ['room-bed-teal', 'Bright room with queen bed and two nightstands'],
    ['bath-shower-2', 'Private bathroom with glass shower'],
    ['room-desk', 'Work desk, mini fridge, microwave and wall-mounted TV'],
    ['room-tv', 'Room with TV, desk and split A/C unit'],
    ['bath-vanity', 'Bathroom vanity and shower'],
    ['room-bed-art', 'View from the desk toward the bathroom'],
    ['bath-shower-1', 'Bathroom with shower and modern fixtures'],
    ['room-entry', 'Entry with coat rack'],
    ['bath-window', 'Bathroom with window and towel bar'],
    ['bath-toilet', 'Clean, modern bathroom'],
];
const gallery = (photos) => `<div class="gallery">${photos.map(([f, alt]) => `
    <a href="{{UP}}images/${f}.jpg"><img src="{{UP}}images/${f}.jpg" alt="${alt}" width="900" height="1200" loading="lazy" decoding="async"></a>`).join('')}
  </div>`;

const times = () => `<div class="times"><div><strong>Check-in</strong><span>${CHECK_IN}</span></div><div><strong>Check-out</strong><span>${CHECK_OUT}</span></div></div>`;

// Vortex PMS issues the TTLock door codes; the site only describes it.
const steps = () => `<ol class="steps">
    <li><h3>Book online</h3><p>Pick your dates and room at <a href="${BOOKING}" target="_blank" rel="noopener">book.walkertonlivery.ca</a>. Rates are live and booking is instant.</p></li>
    <li><h3>Get your door code</h3><p>Our booking system sends your personal door code automatically before you arrive. No key pickup, no front desk to wait for.</p></li>
    <li><h3>Let yourself in</h3><p>Enter your code at the smart lock and you're in. Your code works for your stay only.</p></li>
  </ol>`;

const pageHero = (eyebrow, h1, lede) => `
<section class="page-hero"><div class="wrap">
  <p class="eyebrow">${eyebrow}</p>
  <h1>${h1}</h1>
  ${lede ? `<p>${lede}</p>` : ''}
</div></section>`;

const bookCta = (heading, sub) => `
<section class="cta">
  <h2>${heading}</h2>
  <p>${sub}</p>
  <div class="actions" style="justify-content:center">
    <a class="btn" href="${BOOKING}" target="_blank" rel="noopener">Check availability &amp; book</a>
    <a class="btn ghost" href="${TEL}">Call ${PHONE}</a>
  </div>
</section>`;

const comingSoon = `
<section><div class="wrap">
  <div class="note"><strong>Coming soon.</strong> In the meantime, give us a call at
  <a href="${TEL}">${PHONE}</a> — we know the town well and are happy to point you in the right direction.</div>
  <p><a href="{{UP}}local-services/">&larr; All local services</a></p>
</div></section>`;

const bizList = (items) => `
<section><div class="wrap">
  <ul class="biz">${items.map(i => `<li>${i}</li>`).join('')}</ul>
  <p style="margin-top:28px"><a href="{{UP}}local-services/">&larr; All local services</a></p>
</div></section>`;

const RESTAURANTS = [
    'Simply Delicious', 'Ti Amo Italian Restaurant', 'Walkers Landing Pub and Eatery',
    'Old Joes Cabin', 'Godfathers Pizza', 'Old Garage Woodfired Pizza', 'Pizza Pizza',
    '519 Table and Pour', 'Subway', 'Pizza Hut', 'Fat Bastard Burritos',
    'Pizza Delight', 'Green Bean Restaurant', "Mel's Diner",
];

// ---------------------------------------------------------------- pages ---

const pages = [
{
    slug: '', title: 'The Walkerton Livery — Rooms in Walkerton, Ontario',
    description: 'Clean, freshly remodeled rooms a half block off main street in Walkerton, Ontario. Trades people welcome. About 30 minutes from Bruce Power. Keyless check-in.',
    body: `
<section class="hero" style="background-image:url({{UP}}images/room-main.jpg)"><div class="wrap">
  <p class="eyebrow">Walkerton, Ontario</p>
  <h1>When work brings you to town and you need a place to hang your hat…</h1>
  <p class="lead">Clean, freshly remodeled rooms with affordable rates, a half block off main street.</p>
  <div class="actions">
    <a class="btn" href="${BOOKING}" target="_blank" rel="noopener">Check availability &amp; book</a>
    <a class="btn ghost" href="{{UP}}rooms/">See the rooms</a>
  </div>
</div></section>

<section><div class="wrap split">
  <div>
    <p class="eyebrow">Welcome</p>
    <h2>Welcome to The Walkerton Livery</h2>
    <p>We offer a clean, freshly remodeled place to stay with affordable rates. The Livery
    is located a half block off of main street in Walkerton, Ontario. Email us at
    <a href="mailto:${EMAIL}">${EMAIL}</a> with any questions.</p>
    <p><a href="{{UP}}about-us/">Our story &rarr;</a></p>
  </div>
  <img class="wide" src="{{UP}}images/front.jpg" alt="The Walkerton Livery at 11 Victoria St. S" width="1900" height="1211" loading="lazy" decoding="async">
</div></section>

<section class="alt"><div class="wrap grid3">
  <div class="card"><div class="icon">${icon('hat')}</div><h3>Trades people welcome</h3>
    <p>With so much construction activity in the region, we are geared to serve those working on short term contracts or projects who need a place to stay while in the area.</p></div>
  <div class="card"><div class="icon">${icon('bolt')}</div><h3>30 minutes to Bruce Power</h3>
    <p>The Livery is about a 30 minute drive from Bruce Power, with free parking at the building.</p></div>
  <div class="card"><div class="icon">${icon('key')}</div><h3>Keyless check-in</h3>
    <p>Your door code arrives automatically after you book. Check-in from ${CHECK_IN}, check-out by ${CHECK_OUT}.</p></div>
</div></section>

<section><div class="wrap">
  <p class="eyebrow">In every room</p>
  <h2>Everything you need, nothing you don't.</h2>
  ${amenities()}
</div></section>

<section class="teal"><div class="wrap">
  <p class="eyebrow">How check-in works</p>
  <h2>Book, get your code, walk in.</h2>
  ${times()}
  ${steps()}
</div></section>

<section><div class="wrap">
  <p class="eyebrow">Take a look</p>
  <h2>The rooms</h2>
  ${gallery(PHOTOS.slice(0, 8))}
  <p style="margin-top:24px"><a href="{{UP}}rooms/">More about the rooms &rarr;</a></p>
</div></section>
${bookCta('Ready when you are', 'Rates and availability are live in our booking system.')}`,
},
{
    slug: 'about-us', title: 'About Us — The Walkerton Livery',
    description: 'The Walkerton Livery is the original Kilmer Livery Stable, built in 1873 and one of the few downtown properties to survive the Big Fire of 1877.',
    body: `${pageHero('About us', 'A Walkerton landmark since 1873.', 'The original Kilmer Livery Stable, now remodeled rooms a half block off main street.')}
<section><div class="wrap split">
  <div class="prose">
    <p>The Walkerton Livery is the original Kilmer Livery Stable, built in 1873. This was
    one of the only downtown properties to survive the “Big Fire” in Walkerton of 1877
    unscathed.</p>
    <p>Earl Sternall and his family lived in the building and operated their plumbing
    business out of it for two generations. Glenn, his son, added several residential
    rental units in addition to warehouse and shop space, replacing the actual livery
    barn.</p>
    <p>The building currently has a combination of short and long term rental units in
    addition to warehouse space.</p>
  </div>
  <img class="wide" src="{{UP}}images/front.jpg" alt="The Walkerton Livery building today" width="1900" height="1211" loading="lazy" decoding="async">
</div></section>
${bookCta('Stay in a piece of Walkerton history', 'Clean, remodeled rooms with modern comforts.')}`,
},
{
    slug: 'rooms', title: 'Rooms — The Walkerton Livery',
    description: 'Comfortable remodeled rooms, individually air-conditioned, with private bathrooms, coffee makers, mini fridge and microwave, free fibre optic Wi-Fi, internet television and free parking.',
    body: `${pageHero('Rooms', 'Remodeled, private and ready for you.', 'Every room has a queen bed, a private bathroom and its own climate control.')}
<section><div class="wrap">
  <div class="prose">
    <p>The Walkerton Livery has comfortable rooms, all individually air-conditioned, with
    coffee makers, free fibre optic Wi-Fi, internet television, USB and network connections
    and free parking. We are a half block off Walkerton's main street, with a thriving mix
    of restaurants and retail stores. The Livery is conveniently located about a 30 minute
    drive from Bruce Power.</p>
  </div>
  ${amenities()}
  <div class="note"><strong>Two more rooms are on the way.</strong> Check the booking page for the latest availability.</div>
</div></section>
<section class="alt"><div class="wrap">
  <p class="eyebrow">Photos</p>
  <h2>Inside the rooms</h2>
  <p>Tap any photo to see it larger.</p>
  ${gallery(PHOTOS)}
</div></section>
${bookCta('Pick your dates', 'Availability for every room is live in our booking system.')}`,
},
{
    slug: 'rates', title: 'Rates — The Walkerton Livery',
    description: 'Current rates and availability for The Walkerton Livery are shown in our online booking system. Long term and contract stays by phone.',
    body: `${pageHero('Rates', 'Live rates, instant booking.', 'Rates change with the season and the length of your stay, so we keep them in one place: our online booking system.')}
<section><div class="wrap grid3">
  <div class="card"><div class="icon">${icon('bolt')}</div><h3>Nightly &amp; weekly</h3>
    <p>Choose your dates in the booking system to see the current rate for each room and book instantly.</p>
    <p class="more"><a class="btn" href="${BOOKING}" target="_blank" rel="noopener">See rates</a></p></div>
  <div class="card"><div class="icon">${icon('hat')}</div><h3>Long term &amp; contract</h3>
    <p>Staying a while? For long term or contract bookings, call us and we will work something out.</p>
    <p class="more"><a class="btn ghost dark" href="${TEL}">Call ${PHONE}</a></p></div>
  <div class="card"><div class="icon">${icon('key')}</div><h3>Keyless arrival</h3>
    <p>Every booking includes a personal door code, sent automatically before you arrive. Check-in ${CHECK_IN}, check-out ${CHECK_OUT}.</p>
    <p class="more"><a href="{{UP}}check-in/">How check-in works &rarr;</a></p></div>
</div></section>
${bookCta('See rates &amp; availability', 'Pick your dates to see live pricing for every room.')}`,
},
{
    slug: 'check-in', title: 'Keyless Check-in — The Walkerton Livery',
    description: `Keyless check-in at The Walkerton Livery. Your door code is sent automatically after you book. Check-in ${CHECK_IN}, check-out ${CHECK_OUT}.`,
    body: `${pageHero('Check-in', 'Keyless check-in. Arrive any time after 2 pm.', 'Every room has a smart lock. Your door code comes to you automatically, so there is no key to pick up and no desk to wait for.')}
<section><div class="wrap">
  <p class="eyebrow">How it works</p>
  <h2>Three steps</h2>
  ${times()}
  ${steps()}
</div></section>
<section class="alt"><div class="wrap faq">
  <p class="eyebrow">Questions</p>
  <h2>Good to know</h2>
  <details><summary>What are check-in and check-out times?</summary><p>Check-in is from ${CHECK_IN}. Check-out is by ${CHECK_OUT}.</p></details>
  <details><summary>When do I get my door code?</summary><p>Our booking system sends it to you automatically before your arrival, using the contact details you book with. Make sure your email and phone number are correct when you book.</p></details>
  <details><summary>I didn't get my code. What do I do?</summary><p>Check your spam or junk folder first. If it's not there, call or text <a href="${TEL}">${PHONE}</a> and we'll sort it out.</p></details>
  <details><summary>Does my code work after check-out?</summary><p>No. Your code is set for your stay only.</p></details>
  <details><summary>Where do I park?</summary><p>Parking is free. Call <a href="${TEL}">${PHONE}</a> if you are not sure where to park.</p></details>
</div></section>
${bookCta('Ready when you are', 'Rates and availability are live in our booking system.')}`,
},
{
    slug: 'local-services', title: 'Local Services — The Walkerton Livery',
    description: 'Restaurants, grocery stores and other services near The Walkerton Livery in Walkerton, Ontario.',
    body: `${pageHero('Local services', 'Around town', 'Almost everything you need is within a block or two of the front door.')}
<section><div class="wrap grid2">
  <a class="card" href="{{UP}}local-services/restaurants/"><h3>Restaurants &rarr;</h3><p>Fourteen places to eat, many within a block.</p></a>
  <a class="card" href="{{UP}}local-services/grocery-stores/"><h3>Grocery Stores &rarr;</h3><p>Two full grocery stores in town.</p></a>
  <a class="card" href="{{UP}}local-services/other-services/"><h3>Other Services &rarr;</h3><p>Coming soon.</p></a>
  <a class="card" href="{{UP}}local-services/things-to-do/"><h3>Things to do &rarr;</h3><p>Coming soon.</p></a>
</div></section>`,
},
{
    slug: 'local-services/restaurants', title: 'Restaurants — The Walkerton Livery',
    description: 'Walkerton offers a good variety of great places to eat, many within a block of The Livery.',
    body: `${pageHero('Local services', 'Restaurants', 'Walkerton offers a good variety of great places to eat, many within a block of The Livery.')}${bizList(RESTAURANTS)}`,
},
{
    slug: 'local-services/grocery-stores', title: 'Grocery Stores — The Walkerton Livery',
    description: 'Two grocery stores in Walkerton, Ontario: Foodland and Kaufman’s Independent.',
    body: `${pageHero('Local services', 'Grocery Stores', 'We have two grocery stores in town.')}${bizList(['Foodland', "Kaufman's Independent"])}`,
},
{
    slug: 'local-services/other-services', title: 'Other Services — The Walkerton Livery',
    description: 'Other local services near The Walkerton Livery — coming soon.',
    body: `${pageHero('Local services', 'Other Services', '')}${comingSoon}`,
},
{
    slug: 'local-services/things-to-do', title: 'Things to do — The Walkerton Livery',
    description: 'Things to do around Walkerton, Ontario — coming soon.',
    body: `${pageHero('Local services', 'Things to do', '')}${comingSoon}`,
},
{
    slug: 'contact-us', title: 'Contact Us — The Walkerton Livery',
    description: 'Contact The Walkerton Livery at 11 Victoria St. S, Walkerton, Ontario. Phone 226-840-6727 or email frontdesk@walkertonlivery.ca.',
    body: `${pageHero('Contact us', 'Contact Us', 'Contact us for more information.')}
<section><div class="wrap split" style="align-items:start">
  <ul class="contact-list">
    <li><strong>Telephone</strong><a href="${TEL}">${PHONE}</a></li>
    <li><strong>E-mail</strong><a href="mailto:${EMAIL}">${EMAIL}</a></li>
    <li><strong>Address</strong><a href="${MAPS}" target="_blank" rel="noopener">${ADDRESS}</a></li>
    <li><strong>Booking</strong><a href="${BOOKING}" target="_blank" rel="noopener">book.walkertonlivery.ca</a></li>
  </ul>
  <div class="note" style="margin-top:0">Already booked? Your door code is sent automatically.
  Check-in ${CHECK_IN}, check-out ${CHECK_OUT}. See <a href="{{UP}}check-in/">how check-in works</a>.</div>
</div></section>
${bookCta('Booking online is fastest', 'See live availability and confirm in a couple of minutes.')}`,
},
];

// ---------------------------------------------------------------- shell ---

function navHtml(current, prefix) {
    return NAV.map(item => {
        const href = prefix + (item.slug ? item.slug + '/' : '');
        const active = item.slug === current
            || (item.children && item.children.some(c => c.slug === current));
        const cls = active ? ' class="active"' : '';
        if (!item.children) return `<li><a${cls} href="${href}">${item.label}</a></li>`;
        return `<li class="has-sub">
            <a${cls} href="${href}">${item.label}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></a>
            <ul class="sub">${item.children.map(c =>
                `<li><a${c.slug === current ? ' class="active"' : ''} href="${prefix + c.slug}/">${c.label}</a></li>`
            ).join('')}</ul>
        </li>`;
    }).join('');
}

function shell(page) {
    const prefix = up(page.slug);
    const canonical = 'https://walkertonlivery.ca/' + (page.slug ? page.slug + '/' : '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${page.description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://walkertonlivery.ca/images/room-main.jpg">
<link rel="icon" href="${prefix}images/logo.png">
<link rel="stylesheet" href="${prefix}css/site.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LodgingBusiness",
"name":"The Walkerton Livery","url":"https://walkertonlivery.ca/",
"telephone":"+1-226-840-6727","email":"${EMAIL}",
"image":["https://walkertonlivery.ca/images/front.jpg","https://walkertonlivery.ca/images/room-main.jpg"],
"checkinTime":"14:00","checkoutTime":"11:00",
"address":{"@type":"PostalAddress","streetAddress":"11 Victoria St. S",
"addressLocality":"Walkerton","addressRegion":"ON","addressCountry":"CA"},
"amenityFeature":[${AMENITIES.map(([, a]) => `{"@type":"LocationFeatureSpecification","name":"${a.replace('&amp;', '&')}"}`).join(',')}]}
</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="site-head">
  <div class="head-inner">
    <a class="brand" href="${prefix}">
      <img src="${prefix}images/logo.png" alt="The Walkerton Livery" width="624" height="374">
    </a>
    <button class="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav">
      <span></span><span></span><span></span>
    </button>
    <nav id="nav" class="site-nav">
      <ul>${navHtml(page.slug, prefix)}</ul>
      <a class="btn btn-book" href="${BOOKING}" target="_blank" rel="noopener">Book now</a>
    </nav>
  </div>
</header>

<main id="main">${page.body.replace(/\{\{UP\}\}/g, prefix)}</main>

<footer class="site-foot">
  <div class="foot-inner">
    <div>
      <img class="foot-logo" src="${prefix}images/logo.png" alt="" width="624" height="374">
      <p>Clean, remodeled rooms a half block off main street.</p>
      <p>Check-in ${CHECK_IN} &middot; Check-out ${CHECK_OUT}</p>
    </div>
    <div>
      <h3>Find us</h3>
      <p><a href="${MAPS}" target="_blank" rel="noopener">${ADDRESS}</a></p>
      <p><a href="${TEL}">${PHONE}</a></p>
      <p><a href="mailto:${EMAIL}">${EMAIL}</a></p>
    </div>
    <div>
      <h3>Pages</h3>
      <ul class="foot-nav">${NAV.map(i =>
        `<li><a href="${prefix + (i.slug ? i.slug + '/' : '')}">${i.label}</a></li>`).join('')}</ul>
    </div>
  </div>
  <p class="copy">© ${new Date().getFullYear()} The Walkerton Livery. All rights reserved.</p>
</footer>

<div class="lightbox" id="lb"><button aria-label="Close">&times;</button><img alt=""></div>
<script>
(function(){
  var b=document.querySelector('.burger'), n=document.getElementById('nav');
  b.addEventListener('click',function(){
    var open=document.body.classList.toggle('nav-open');
    b.setAttribute('aria-expanded', open?'true':'false');
  });
  // On touch, the first tap on a parent opens its submenu instead of navigating.
  n.querySelectorAll('.has-sub > a').forEach(function(a){
    a.addEventListener('click',function(e){
      if(window.matchMedia('(max-width:900px)').matches && !a.parentNode.classList.contains('open')){
        e.preventDefault(); a.parentNode.classList.add('open');
      }
    });
  });
  // Gallery lightbox.
  var lb=document.getElementById('lb'), li=lb.querySelector('img');
  document.querySelectorAll('.gallery a').forEach(function(a){
    a.addEventListener('click',function(e){
      e.preventDefault(); li.src=a.href; li.alt=a.querySelector('img').alt; lb.classList.add('open');
    });
  });
  lb.addEventListener('click',function(e){ if(e.target!==li) lb.classList.remove('open'); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') lb.classList.remove('open'); });
})();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- write ---

function writeFile(rel, content) {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

fs.rmSync(OUT, { recursive: true, force: true });

for (const page of pages) {
    writeFile(path.join(page.slug, 'index.html'), shell(page));
}

fs.cpSync(path.join(__dirname, 'css'), path.join(OUT, 'css'), { recursive: true });
fs.cpSync(path.join(__dirname, 'images'), path.join(OUT, 'images'), { recursive: true });

writeFile('robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://walkertonlivery.ca/sitemap.xml\n');
writeFile('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map(p => `  <url><loc>https://walkertonlivery.ca/${p.slug ? p.slug + '/' : ''}</loc></url>`).join('\n') +
    `\n</urlset>\n`);

console.log(`Built ${pages.length} pages into dist/`);
