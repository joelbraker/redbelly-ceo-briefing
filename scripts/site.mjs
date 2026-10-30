#!/usr/bin/env node
// Assembles the static web page that hosts the deliverables (used by Vercel).
// Needs no browser and no dependencies: it publishes the committed files in
// /deliverables as they are, plus an index page generated from /data.
//
// Usage: node scripts/site.mjs   ->   public/
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, SOURCE_DIR, DELIVERABLES_DIR, VERIFICATION_DIR,
  loadJson, loadSources, citationOrder, escapeHtml, escapeAttr, xLength,
} from './lib.mjs';

const OUT = path.join(ROOT, 'public');
const REQUIRED = ['01-ceo-briefing.pdf', '02-x-thread.md', '02-x-thread.pdf', '02-x-thread-card.png', '03-source-list.md', '03-source-list.pdf'];
const missing = REQUIRED.filter((f) => !existsSync(path.join(DELIVERABLES_DIR, f)));
if (missing.length) throw new Error(`Missing deliverables (run "npm run build" locally and commit them): ${missing.join(', ')}`);

const sources = loadSources();
const thread = loadJson('data/x-thread.json');
const order = citationOrder(readFileSync(path.join(SOURCE_DIR, 'briefing.html'), 'utf8'));
const numbering = new Map(order.map((key, i) => [key, i + 1]));
const ordered = order.map((key) => sources.byKey.get(key));
const evidenceCount = sources.sources.reduce((n, s) => n + s.evidence.length, 0);

// Summary rows from the committed verification report.
const report = readFileSync(path.join(VERIFICATION_DIR, 'verification-report.md'), 'utf8');
const checks = [...report.matchAll(/^\| ([^|]+) \| (Pass|\*\*Fail\*\*) \| ([^|]+) \|$/gm)].map((m) => ({ check: m[1], ok: m[2] === 'Pass', detail: m[3] }));
const checkedOn = (report.match(/on (\d{1,2} \w+ \d{4})/) ?? [])[1] ?? sources.accessed;

// Absolute URLs for link previews: SITE_URL if set, else Vercel's production domain.
const SITE = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
const abs = (p) => (SITE ? `${SITE}/${p}` : p);
const PREVIEW = existsSync(path.join(ROOT, 'docs', 'briefing-preview.jpg')) ? 'briefing-preview.jpg' : 'briefing-preview.png';

const cite = (key) => `<sup class="cite"><a href="${escapeAttr(sources.byKey.get(key).url)}" title="${escapeAttr(sources.byKey.get(key).publisher)}">${numbering.get(key)}</a></sup>`;
const linkify = (text) => escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${escapeAttr(u)}">${u}</a>`);
const postLength = (text) => xLength(text.replaceAll('{BRIEFING_LINK}', 'https://example.org/x'));

const posts = thread.posts.map((p, i) => `
      <article class="post">
        <header><span class="av"><img src="assets/logos/redbelly-isotype-white.svg" alt=""></span>
          <span><b>Redbelly DAO</b><small>Post ${i + 1} of ${thread.posts.length} · ${postLength(p.text)} / 280</small></span>
          <button type="button" class="copy" data-i="${i}">Copy</button></header>
        <p>${linkify(p.text)}</p>
        ${p.image ? `<img class="card" src="deliverables/${escapeAttr(p.image.file)}" alt="${escapeAttr(p.image.alt)}" width="1600" height="900" loading="lazy" decoding="async">` : ''}
      </article>`).join('');

const refs = ordered.map((s) => `
        <li><span class="n">${numbering.get(s.key)}</span><span>
          <a href="${escapeAttr(s.url)}">${escapeHtml(s.title)}</a>
          <small>${escapeHtml(s.publisher)} · ${escapeHtml(s.date)} · ${escapeHtml(s.kind)}</small></span></li>`).join('');

const checkRows = checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}"><b>${c.ok ? 'Pass' : 'Fail'}</b><span>${escapeHtml(c.check)}<small>${escapeHtml(c.detail)}</small></span></li>`).join('');

const html = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New CEO Briefing</title>
<meta name="description" content="A sourced community briefing for the Redbelly DAO on Redbelly Network's incoming CEO, Christian Westerlind Wigstrom, and what his track record could mean for Tokeniser.">
${SITE ? `<link rel="canonical" href="${SITE}/">\n<meta property="og:url" content="${SITE}/">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="New CEO Briefing: Christian Westerlind Wigstrom">
<meta property="og:description" content="Who Redbelly Network's incoming CEO is, what Redbelly said, and what his track record could mean for Tokeniser. Every fact sourced.">
<meta property="og:image" content="${abs('deliverables/02-x-thread-card.png')}">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="900">
<meta property="og:image:alt" content="Redbelly DAO community briefing card: New CEO Christian Westerlind Wigstrom">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="New CEO Briefing: Christian Westerlind Wigstrom">
<meta name="twitter:description" content="Who Redbelly Network's incoming CEO is, what Redbelly said, and what his track record could mean for Tokeniser. Every fact sourced.">
<meta name="twitter:image" content="${abs('deliverables/02-x-thread-card.png')}">
<meta name="theme-color" content="#142530">
<link rel="icon" href="assets/logos/redbelly-isotype-red.svg" type="image/svg+xml">
<style>
@font-face { font-family: "Readex Pro"; font-weight: 300; src: url("assets/fonts/readex-pro-latin-300-normal.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Readex Pro"; font-weight: 400; src: url("assets/fonts/readex-pro-latin-400-normal.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Readex Pro"; font-weight: 500; src: url("assets/fonts/readex-pro-latin-500-normal.woff2") format("woff2"); font-display: swap; }
:root { --red:#FF5050; --red-deep:#FA423C; --red-text:#CC2E2E; --red-button:#D63031; --red-on-dark:#FF7A7A; --slate-text:#656D74; --grey:#283A46; --navy:#142530; --slate:#848B91; --silver:#D9D9D9; --mist:#ECEBEC; --tint:#F6F6F7; --paper:#FFFFFF; --ink:#283A46; --muted:#5b6872; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 16px/1.6 "Readex Pro", system-ui, sans-serif; }
a { color: var(--red-text); text-decoration: none; }
a:focus-visible, button:focus-visible { outline: 3px solid var(--red); outline-offset: 2px; border-radius: 4px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 10; background: #fff; color: var(--grey); padding: 10px 16px; border-radius: 6px; font-weight: 500; }
.skip:focus { top: 12px; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 16px; }
@media (min-width: 720px) { .wrap { padding: 0 32px; } }
.hero { position: relative; overflow: hidden; color: #fff; background: linear-gradient(135deg, var(--navy) 0%, var(--grey) 78%); }
.hero::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: var(--red); }
.hero .mark { position: absolute; right: -80px; top: 10px; width: min(520px, 70vw); opacity: .07; pointer-events: none; }
.hero .wrap { position: relative; padding-top: 28px; padding-bottom: 40px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.top img { height: 30px; display: block; }
.tag { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.75); border: 1px solid rgba(255,255,255,.3); padding: 6px 12px; border-radius: 6px; font-weight: 500; }
.eyebrow { margin-top: 56px; display: flex; align-items: center; gap: 12px; color: var(--red-on-dark); font-size: 13px; letter-spacing: .22em; text-transform: uppercase; font-weight: 500; }
.eyebrow::before { content: ""; width: 32px; height: 2px; background: var(--red); }
h1 { margin: 10px 0 0; font-size: clamp(34px, 6vw, 60px); line-height: 1.05; font-weight: 500; letter-spacing: -.01em; }
h1 span { color: var(--red); }
.dek { margin: 16px 0 0; max-width: 640px; font-size: clamp(16px, 2.2vw, 19px); font-weight: 300; color: rgba(255,255,255,.86); }
.meta { margin-top: 36px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.18); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (min-width: 720px) { .meta { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.meta small { display: block; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); font-weight: 500; }
.meta div { font-size: 15px; }
.cta { margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; font-weight: 500; font-size: 15px; }
.btn.primary { background: var(--red-button); color: #fff; }
.btn.ghost { border: 1px solid rgba(255,255,255,.4); color: #fff; }
.btn:hover { text-decoration: none; filter: brightness(1.06); }
sup.cite { font-size: 10px; margin-left: 2px; }
sup.cite a { color: var(--red-text); font-weight: 500; }
.hero sup.cite a { color: var(--red-on-dark); }
section.block { padding: 56px 0 8px; }
.label { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.label .no { color: var(--red-text); font-size: 13px; font-weight: 500; letter-spacing: .12em; }
.label h2 { margin: 0; font-size: clamp(22px, 3vw, 28px); font-weight: 500; }
.label .rule { flex: 1; height: 1px; background: var(--mist); }
.intro { max-width: 760px; color: var(--muted); margin: -6px 0 24px; }
.cards { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 800px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.dcard { border: 1px solid var(--silver); border-top: 4px solid var(--red); border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.dcard .k { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--slate-text); font-weight: 500; }
.dcard h3 { margin: 0; font-size: 20px; font-weight: 500; }
.dcard p { margin: 0; color: var(--muted); font-size: 15px; }
.dcard .links { margin-top: auto; display: flex; gap: 14px; flex-wrap: wrap; font-weight: 500; font-size: 15px; }
.preview { display: block; margin-top: 24px; border-radius: 8px; overflow: hidden; background: var(--mist); }
.preview img { display: block; width: 100%; height: auto; }
.posts { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
@media (min-width: 900px) { .posts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.post { border: 1px solid var(--silver); border-radius: 14px; padding: 16px 18px; background: #fff; min-width: 0; }
.post header { display: flex; align-items: center; gap: 10px; }
.post .av { width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--grey); display: grid; place-items: center; }
.post .av img { width: 22px; }
.post header span:nth-child(2) { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.post header small { color: var(--slate-text); font-size: 12px; }
.copy { margin-left: auto; font: 500 13px "Readex Pro", sans-serif; color: var(--grey); background: var(--tint); border: 1px solid var(--silver); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.copy.done { background: var(--grey); color: #fff; border-color: var(--grey); }
.post p { margin: 12px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; color: #1f2d36; }
.post p a { color: #1d6fb8; }
.post .card { display: block; width: 100%; height: auto; margin-top: 12px; border-radius: 10px; border: 1px solid var(--silver); }
.note { margin-top: 16px; padding: 14px 16px; background: var(--tint); border-left: 4px solid var(--red); border-radius: 4px; font-size: 14px; color: var(--muted); }
.note code { background: #fff; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--mist); color: var(--grey); }
.checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 800px) { .checks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.checks li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--mist); border-radius: 8px; }
.checks b { flex: none; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: var(--grey); color: #fff; font-weight: 500; }
.checks li.bad b { background: var(--red-button); }
.checks span { display: flex; flex-direction: column; font-size: 15px; min-width: 0; }
.checks small { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.refs { list-style: none; margin: 0; padding: 0; columns: 1; column-gap: 32px; }
@media (min-width: 860px) { .refs { columns: 2; } }
.refs li { break-inside: avoid; display: grid; grid-template-columns: 30px 1fr; gap: 4px; margin: 0 0 14px; font-size: 15px; }
.refs .n { color: var(--red-text); font-weight: 500; }
.refs a { color: var(--ink); font-weight: 500; overflow-wrap: anywhere; }
.refs small { display: block; color: var(--muted); font-size: 13px; }
footer.site { margin-top: 64px; background: var(--grey); color: rgba(255,255,255,.78); font-size: 14px; }
footer.site .wrap { padding-top: 32px; padding-bottom: 32px; display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 800px) { footer.site .wrap { grid-template-columns: auto 1fr 1fr; align-items: start; gap: 40px; } }
footer.site img { height: 26px; }
footer.site strong { color: #fff; font-weight: 500; }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hero">
  <img class="mark" src="assets/logos/redbelly-isotype-white.svg" alt="">
  <div class="wrap">
    <div class="top"><img src="assets/logos/redbelly-horizontal-negative.svg" alt="Redbelly"><span class="tag">Redbelly DAO · Community Briefing</span></div>
    <div class="eyebrow">New CEO Briefing</div>
    <h1>Christian Westerlind <span>Wigstrom</span></h1>
    <p class="dek">Who Redbelly Network's incoming Chief Executive is, what Redbelly said when it appointed him, and what his track record could mean for Tokeniser. Every fact is sourced.</p>
    <div class="meta">
      <div><small>Announced</small>16 September 2026${cite('redbelly-announcement')}</div>
      <div><small>Start date</small>2 November 2026${cite('bankingday')}</div>
      <div><small>Previously</small>Co-founder &amp; CEO, Monoova${cite('monoova-ceo-transition')}</div>
      <div><small>Sources checked</small>${escapeHtml(sources.accessed)}</div>
    </div>
    <div class="cta">
      <a class="btn primary" href="deliverables/01-ceo-briefing.pdf">Read the briefing (PDF)</a>
      <a class="btn ghost" href="#thread">X thread</a>
      <a class="btn ghost" href="#sources">Sources</a>
    </div>
  </div>
</header>

<main class="wrap" id="main">
  <section class="block" id="deliverables">
    <div class="label"><span class="no">01</span><h2>Deliverables</h2><span class="rule"></span></div>
    <div class="cards">
      <div class="dcard"><span class="k">Briefing</span><h3>New CEO Briefing</h3>
        <p>Background, what Redbelly said, and a clearly labelled analysis of what his record could mean for Tokeniser. Three pages plus a source appendix, A4.</p>
        <div class="links"><a href="deliverables/01-ceo-briefing.pdf">Open PDF</a><a href="deliverables/01-ceo-briefing.pdf" download>Download</a></div></div>
      <div class="dcard"><span class="k">X thread</span><h3>${thread.posts.length}-post thread</h3>
        <p>Ready to post, each within 280 characters, with a header card for the first post.</p>
        <div class="links"><a href="#thread">View below</a><a href="deliverables/02-x-thread.md">Markdown</a><a href="deliverables/02-x-thread.pdf">PDF</a><a href="deliverables/02-x-thread-card.png" download>Card</a></div></div>
      <div class="dcard"><span class="k">Source list</span><h3>${ordered.length} sources</h3>
        <p>Each source with the statements it supports and the verbatim passage behind them.</p>
        <div class="links"><a href="deliverables/03-source-list.pdf">PDF</a><a href="deliverables/03-source-list.md">Markdown</a></div></div>
    </div>
    <a class="preview" href="deliverables/01-ceo-briefing.pdf"><img src="assets/${PREVIEW}" alt="The four pages of the briefing PDF" width="1720" height="634" loading="lazy" decoding="async"></a>
  </section>

  <section class="block" id="thread">
    <div class="label"><span class="no">02</span><h2>X thread</h2><span class="rule"></span></div>
    <p class="intro">Copy each post in order. Character counts follow X's rules, where every link counts as 23 characters.</p>
    <div class="posts">${posts}
    </div>
    <p class="note">Before posting, replace <code>{BRIEFING_LINK}</code> in the last post with the link to the briefing PDF on this page, and attach the card image to the first post.</p>
  </section>

  <section class="block" id="verification">
    <div class="label"><span class="no">03</span><h2>Verification</h2><span class="rule"></span></div>
    <p class="intro">Each source was fetched live on ${escapeHtml(checkedOn)}, and each of the ${evidenceCount} supporting passages was matched against the page it is cited from.</p>
    <ul class="checks">${checkRows}</ul>
  </section>

  <section class="block" id="sources">
    <div class="label"><span class="no">04</span><h2>Sources</h2><span class="rule"></span></div>
    <p class="intro">Numbered as in the briefing. Accessed ${escapeHtml(sources.accessed)}. The full list with supporting passages is in the <a href="deliverables/03-source-list.pdf">source list PDF</a>.</p>
    <ol class="refs">${refs}
    </ol>
  </section>
</main>

<footer class="site">
  <div class="wrap">
    <img src="assets/logos/redbelly-horizontal-negative.svg" alt="Redbelly">
    <div><strong>About this briefing.</strong> An independent community briefing prepared for the Redbelly DAO. It is not an official statement of Redbelly Network Pty Ltd or Tokeniser Pty Ltd.</div>
    <div><strong>Not financial advice.</strong> General information about a public appointment. No price analysis, investment advice or forecast of returns. The Redbelly name and logos are used under the Redbelly brand guidelines.</div>
  </div>
</footer>

<script>
  const POSTS = ${JSON.stringify(thread.posts.map((p) => p.text)).replace(/</g, '\\u003c')};
  document.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(POSTS[Number(btn.dataset.i)]);
        btn.textContent = 'Copied';
        btn.classList.add('done');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
      } catch {
        btn.textContent = 'Select text';
      }
    });
  });
</script>
</body>
</html>
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
cpSync(DELIVERABLES_DIR, path.join(OUT, 'deliverables'), { recursive: true });
cpSync(path.join(SOURCE_DIR, 'assets', 'logos'), path.join(OUT, 'assets', 'logos'), { recursive: true });
cpSync(path.join(SOURCE_DIR, 'assets', 'fonts'), path.join(OUT, 'assets', 'fonts'), { recursive: true });
cpSync(path.join(ROOT, 'docs', PREVIEW), path.join(OUT, 'assets', PREVIEW));
writeFileSync(path.join(OUT, 'index.html'), html);
writeFileSync(path.join(OUT, '404.html'), notFoundHtml());
writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n`);

function notFoundHtml() {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title><link rel="icon" href="/assets/logos/redbelly-isotype-red.svg" type="image/svg+xml"><meta name="robots" content="noindex">
<style>@font-face{font-family:"Readex Pro";font-weight:400;src:url("/assets/fonts/readex-pro-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"Readex Pro";font-weight:500;src:url("/assets/fonts/readex-pro-latin-500-normal.woff2") format("woff2")}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;color:#fff;font:400 16px/1.6 "Readex Pro",system-ui,sans-serif;background:linear-gradient(135deg,#142530 0%,#283A46 78%);border-left:8px solid #FF5050}
main{max-width:520px}img{height:28px}h1{margin:28px 0 8px;font-weight:500;font-size:32px}p{margin:0 0 24px;color:rgba(255,255,255,.82)}
a.btn{display:inline-block;background:#D63031;color:#fff;padding:12px 20px;border-radius:8px;font-weight:500;text-decoration:none}a:focus-visible{outline:3px solid #FF5050;outline-offset:2px}</style></head>
<body><main><img src="/assets/logos/redbelly-horizontal-negative.svg" alt="Redbelly"><h1>Page not found</h1>
<p>This address does not exist. The briefing, the X thread and the source list are all on the main page.</p>
<a class="btn" href="/">Go to the New CEO Briefing</a></main></body></html>`;
}

console.log(`Site assembled in ${path.relative(ROOT, OUT)}/ (${ordered.length} sources, ${thread.posts.length} posts, ${checks.length} checks).`);
