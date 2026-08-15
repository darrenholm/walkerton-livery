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
const BOOKING = 'https://app.littlehotelier.com/properties/thelivery';
const PHONE = '226-840-6727';
const EMAIL = 'frontdesk@walkertonlivery.ca';
const ADDRESS = '11 Victoria St. S, Walkerton, Ontario';
const MAPS = 'https://maps.google.com/?q=11+Victoria+St+S,+Walkerton,+Ontario';

// slug '' is the home page; children render in the Local Services dropdown.
const NAV = [
    { slug: '', label: 'Home' },
    { slug: 'about-us', label: 'About Us' },
    { slug: 'rooms', label: 'Rooms' },
    { slug: 'rates', label: 'Rates' },
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

const ROOMS = [
    { unit: 'Unit 20', shots: ['unit20-room', 'unit20-bed', 'unit20-desk'] },
    // unit21-bath-2 is a near-duplicate crop of unit21-bath; one is enough.
    { unit: 'Unit 21', shots: ['unit21-bed', 'unit21-bath'] },
    { unit: 'Unit 22', shots: ['unit22-room', 'unit22-bed', 'unit22-desk', 'unit22-bath'] },
];

const AMENITIES = [
    ['Individually air-conditioned', 'M3 5h18v8H3zM7 16c0 1.6-1 2.1-1 3.6M12 16c0 1.6-1 2.1-1 3.6M17 16c0 1.6-1 2.1-1 3.6'],
    ['Free fibre optic Wi-Fi', 'M4 10a12 12 0 0116 0M7.5 13.5a7 7 0 019 0M12 18h.01'],
    ['Internet television', 'M3 5h18v11H3zM8 20h8'],
    ['Coffee makers', 'M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM17 9h2a2 2 0 010 4h-2'],
    ['USB & network connections', 'M9 3v5M15 3v5M6.5 8h11v3.4a5.5 5.5 0 01-11 0zM12 16.9V21'],
    ['Free parking', 'M4 3h16v18H4zM9 17V8h3.4a2.8 2.8 0 010 5.6H9'],
];

function gallery(shots, alt) {
    return `<div class="gallery">${shots.map((s, i) => `
        <a class="shot" href="${'{{UP}}'}images/${s}.jpg" target="_blank" rel="noopener">
          <img src="${'{{UP}}'}images/${s}.jpg" alt="${alt} — photo ${i + 1}"
               width="1000" height="753" loading="lazy" decoding="async">
        </a>`).join('')}</div>`;
}

function linkList(title, items) {
    return `<ul class="tick">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
}

const bookCta = (heading, sub) => `
<section class="cta">
  <h2>${heading}</h2>
  <p>${sub}</p>
  <a class="btn btn-lg" href="${BOOKING}" target="_blank" rel="noopener">Check availability &amp; book</a>
</section>`;

// ---------------------------------------------------------------- pages ---

const pages = [
{
    slug: '', title: 'The Walkerton Livery — Rooms in Walkerton, Ontario',
    description: 'Clean, freshly remodeled rooms a half block off main street in Walkerton, Ontario. Trades people welcome. About 30 minutes from Bruce Power.',
    body: `
<section class="hero">
  <img class="hero-img" src="{{UP}}images/front.jpg" alt="The Walkerton Livery at 11 Victoria St. S" width="1900" height="1211" fetchpriority="high" decoding="async">
  <div class="hero-inner">
    <p class="eyebrow">Walkerton, Ontario</p>
    <h1>When work brings you to town<br>and you need a place to hang your hat…</h1>
    <a class="btn btn-lg" href="${BOOKING}" target="_blank" rel="noopener">Check availability &amp; book</a>
  </div>
</section>

<section class="band">
  <div class="prose center">
    <h2>Welcome to The Walkerton Livery</h2>
    <p>We offer a clean, freshly remodeled place to stay with affordable rates. The Livery
    is located a half block off of main street in Walkerton, Ontario. Email us at
    <a href="mailto:${EMAIL}">${EMAIL}</a> with any questions.</p>
  </div>
</section>

<section class="band alt">
  <div class="split">
    <img src="{{UP}}images/tradesman.jpg" alt="Trades people welcome at The Walkerton Livery" width="1000" height="543" loading="lazy" decoding="async">
    <div class="prose">
      <h2>Trades people welcome</h2>
      <p>With so much construction activity in the region, we are geared to serve those
      working on short term contracts or projects who need a place to stay while in the
      area. The Livery is about a 30 minute drive from Bruce Power.</p>
      <a class="btn btn-quiet" href="{{UP}}rooms/">See the rooms</a>
    </div>
  </div>
</section>

<section class="band">
  <div class="prose center"><h2>In every room</h2></div>
  <ul class="amenities">${AMENITIES.map(([label, d]) => `
    <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${label}</span></li>`).join('')}
  </ul>
</section>

${bookCta('Ready when you are', 'Rates and availability are live in our booking system.')}`,
},
{
    slug: 'about-us', title: 'About Us — The Walkerton Livery',
    description: 'The Walkerton Livery is the original Kilmer Livery Stable, built in 1873 and one of the few downtown properties to survive the Big Fire of 1877.',
    body: `
<section class="page-head"><h1>About Us</h1></section>
<section class="band">
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
</section>
${bookCta('Stay in a piece of Walkerton history', 'Clean, remodeled rooms with modern comforts.')}`,
},
{
    slug: 'rooms', title: 'Rooms — The Walkerton Livery',
    description: 'Three comfortable rooms, individually air-conditioned, with coffee makers, free fibre optic Wi-Fi, internet television, USB and network connections and free parking.',
    body: `
<section class="page-head"><h1>Rooms</h1></section>
<section class="band">
  <div class="prose">
    <p>The Walkerton Livery has 3 comfortable rooms, all individually air-conditioned,
    with coffee makers, free fibre optic Wi-Fi, internet television, USB and network
    connections and free parking. We are a half block off Walkerton's main street, with a
    thriving mix of restaurants and retail stores. The Livery is conveniently located
    about a 30 minute drive from Bruce Power.</p>
  </div>
  <ul class="amenities">${AMENITIES.map(([label, d]) => `
    <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${label}</span></li>`).join('')}
  </ul>
</section>
${ROOMS.map((r, i) => `
<section class="band${i % 2 ? ' alt' : ''}">
  <div class="wrap-head"><h2>${r.unit}</h2></div>
  ${gallery(r.shots, r.unit)}
</section>`).join('')}
${bookCta('Pick your dates', 'Availability for all three rooms is live in our booking system.')}`,
},
{
    slug: 'rates', title: 'Rates — The Walkerton Livery',
    description: 'Current rates and availability for The Walkerton Livery are shown in our online booking system.',
    body: `
<section class="page-head"><h1>Rates</h1></section>
<section class="band">
  <div class="prose center">
    <p>Rates change with the season and the length of your stay, so we keep them in one
    place: our online booking system. Choose your dates there to see the current rate for
    each room and book instantly.</p>
    <p>Staying a while? For long term or contract bookings, call us at
    <a href="tel:+1${PHONE.replace(/-/g, '')}">${PHONE}</a> and we will work something out.</p>
  </div>
</section>
${bookCta('See rates &amp; availability', 'Pick your dates to see live pricing for every room.')}`,
},
{
    slug: 'local-services', title: 'Local Services — The Walkerton Livery',
    description: 'Restaurants, grocery stores and other services near The Walkerton Livery in Walkerton, Ontario.',
    body: `
<section class="page-head">
  <h1>Local Services</h1>
  <p class="lede">Almost everything you need is within a block or two of the front door.</p>
</section>
<section class="band">
  <div class="cards">
    <a class="card" href="{{UP}}local-services/restaurants/"><h3>Restaurants</h3><p>Fourteen places to eat, many within a block.</p></a>
    <a class="card" href="{{UP}}local-services/grocery-stores/"><h3>Grocery Stores</h3><p>Two full grocery stores in town.</p></a>
    <a class="card" href="{{UP}}local-services/other-services/"><h3>Other Services</h3><p>Coming soon.</p></a>
    <a class="card" href="{{UP}}local-services/things-to-do/"><h3>Things to do</h3><p>Coming soon.</p></a>
  </div>
</section>`,
},
{
    slug: 'local-services/restaurants', title: 'Restaurants — The Walkerton Livery',
    description: 'Walkerton offers a good variety of great places to eat, many within a block of The Livery.',
    body: `
<section class="page-head"><h1>Restaurants</h1></section>
<section class="band">
  <div class="prose">
    <p>Walkerton offers a good variety of great places to eat, many within a block of
    The Livery:</p>
    ${linkList('Restaurants', [
        'Simply Delicious', 'Ti Amo Italian Restaurant', 'Walkers Landing Pub and Eatery',
        'Old Joes Cabin', 'Godfathers Pizza', 'Old Garage Woodfired Pizza', 'Pizza Pizza',
        '519 Table and Pour', 'Subway', 'Pizza Hut', 'Fat Bastard Burritos',
        'Pizza Delight', 'Green Bean Restaurant', "Mel's Diner",
    ])}
  </div>
</section>`,
},
{
    slug: 'local-services/grocery-stores', title: 'Grocery Stores — The Walkerton Livery',
    description: 'Two grocery stores in Walkerton, Ontario: Foodland and Kaufman’s Independent.',
    body: `
<section class="page-head"><h1>Grocery Stores</h1></section>
<section class="band">
  <div class="prose">
    <p>We have two grocery stores in town:</p>
    ${linkList('Grocery', ['Foodland', "Kaufman's Independent"])}
  </div>
</section>`,
},
{
    slug: 'local-services/other-services', title: 'Other Services — The Walkerton Livery',
    description: 'Other local services near The Walkerton Livery — coming soon.',
    body: `
<section class="page-head"><h1>Other Services</h1></section>
<section class="band">
  <div class="prose center soon">
    <p>Coming soon.</p>
    <p>In the meantime, give us a call at
    <a href="tel:+1${PHONE.replace(/-/g, '')}">${PHONE}</a> — we know the town well and
    are happy to point you in the right direction.</p>
  </div>
</section>`,
},
{
    slug: 'local-services/things-to-do', title: 'Things to do — The Walkerton Livery',
    description: 'Things to do around Walkerton, Ontario — coming soon.',
    body: `
<section class="page-head"><h1>Things to do</h1></section>
<section class="band">
  <div class="prose center soon">
    <p>Coming soon.</p>
    <p>In the meantime, give us a call at
    <a href="tel:+1${PHONE.replace(/-/g, '')}">${PHONE}</a> — we know the town well and
    are happy to point you in the right direction.</p>
  </div>
</section>`,
},
{
    slug: 'contact-us', title: 'Contact Us — The Walkerton Livery',
    description: 'Contact The Walkerton Livery at 11 Victoria St. S, Walkerton, Ontario. Phone 226-840-6727 or email frontdesk@walkertonlivery.ca.',
    body: `
<section class="page-head">
  <h1>Contact Us</h1>
  <p class="lede">Contact us for more information.</p>
</section>
<section class="band">
  <div class="contact">
    <a class="contact-item" href="${MAPS}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>
      <span class="k">Address</span><span class="v">11 Victoria St. S<br>Walkerton, Ontario</span>
    </a>
    <a class="contact-item" href="tel:+1${PHONE.replace(/-/g, '')}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/></svg>
      <span class="k">Telephone</span><span class="v">${PHONE}</span>
    </a>
    <a class="contact-item" href="mailto:${EMAIL}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>
      <span class="k">E-mail</span><span class="v">${EMAIL}</span>
    </a>
  </div>
</section>
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
<meta property="og:image" content="https://walkertonlivery.ca/images/front.jpg">
<link rel="icon" href="${prefix}images/logo.png">
<link rel="stylesheet" href="${prefix}css/site.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LodgingBusiness",
"name":"The Walkerton Livery","url":"https://walkertonlivery.ca/",
"telephone":"+1-226-840-6727","email":"${EMAIL}",
"image":"https://walkertonlivery.ca/images/front.jpg",
"address":{"@type":"PostalAddress","streetAddress":"11 Victoria St. S",
"addressLocality":"Walkerton","addressRegion":"ON","addressCountry":"CA"},
"amenityFeature":[${AMENITIES.map(([a]) => `{"@type":"LocationFeatureSpecification","name":"${a}"}`).join(',')}]}
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
      <p class="foot-tag">Clean, remodeled rooms a half block off main street.</p>
    </div>
    <div>
      <h3>Find us</h3>
      <p><a href="${MAPS}" target="_blank" rel="noopener">${ADDRESS}</a></p>
      <p><a href="tel:+1${PHONE.replace(/-/g, '')}">${PHONE}</a></p>
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
