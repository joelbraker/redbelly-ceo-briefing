#!/usr/bin/env node
// Builds every deliverable from the sources in /source and /data:
//   deliverables/01-ceo-briefing.pdf
//   deliverables/02-x-thread.md, 02-x-thread.pdf, 02-x-thread-card.png
//   deliverables/03-source-list.md, 03-source-list.pdf
//
// Usage: node scripts/build.mjs
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  ROOT, SOURCE_DIR, DELIVERABLES_DIR,
  loadJson, loadSources, citationOrder, renderCitations, escapeHtml, escapeAttr, xLength,
} from './lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const sources = loadSources();
const thread = loadJson('data/x-thread.json');
mkdirSync(DELIVERABLES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Numbering: sources are numbered in order of first citation in the briefing.
// ---------------------------------------------------------------------------
const briefingTemplate = readFileSync(path.join(SOURCE_DIR, 'briefing.html'), 'utf8');
const order = citationOrder(briefingTemplate);
const uncited = sources.sources.filter((s) => !order.includes(s.key)).map((s) => s.key);
if (uncited.length) throw new Error(`Sources never cited in the briefing: ${uncited.join(', ')}`);
const numbering = new Map(order.map((key, i) => [key, i + 1]));
const ordered = order.map((key) => sources.byKey.get(key));

// ---------------------------------------------------------------------------
// HTML fragments
// ---------------------------------------------------------------------------
function referencesHtml() {
  const items = ordered.map((s) => `
    <li><span class="n">${numbering.get(s.key)}</span><span>
      <span class="t">${escapeHtml(s.title)}</span><br>
      <span class="p">${escapeHtml(s.publisher)} · ${escapeHtml(s.date)}</span><br>
      <a class="u" href="${escapeAttr(s.url)}">${escapeHtml(s.url.replace(/^https?:\/\//, ''))}</a>
    </span></li>`).join('');
  return `<ol class="refs">${items}</ol>`;
}

const DOC_CSS = `
  @page { size: A4; margin: 16mm 15mm 18mm; }
  @page :first { margin-top: 0; }
  body { font-size: 8.6pt; }
  .doc-hero { margin: 0 -15mm 7mm; padding: 13mm 15mm 9mm 18mm; position: relative; color: #fff;
    background: linear-gradient(135deg, var(--rb-navy) 0%, var(--rb-grey) 78%); overflow: hidden; }
  .doc-hero::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5mm; background: var(--rb-red); }
  .doc-hero .mark { position: absolute; right: -10mm; top: -8mm; width: 70mm; opacity: 0.07; }
  .doc-hero .top { display: flex; justify-content: space-between; align-items: center; }
  .doc-hero .top img { height: 8mm; }
  .doc-hero .top .tag { font-size: 6.6pt; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.72);
    border: .3mm solid rgba(255,255,255,.28); padding: 1.2mm 2.6mm; border-radius: 1mm; font-weight: 500; }
  .doc-hero .eyebrow { margin-top: 9mm; font-size: 7.2pt; letter-spacing: .22em; text-transform: uppercase; color: var(--rb-red); font-weight: 500; }
  .doc-hero h1 { margin: 2mm 0 0; font-size: 23pt; font-weight: 500; line-height: 1.1; }
  .doc-hero h1 span { color: var(--rb-red); }
  .doc-hero p { margin: 2.6mm 0 0; font-size: 9.6pt; font-weight: 300; color: rgba(255,255,255,.85); max-width: 160mm; }
  .intro { font-size: 8.6pt; margin: 0 0 5mm; color: #3c4b55; }
  .intro strong { font-weight: 500; }
  .src { break-inside: auto; margin: 0 0 5mm; border-top: .5mm solid var(--rb-grey); padding-top: 2.4mm; }
  .src-head { display: grid; grid-template-columns: 9mm 1fr; gap: 0 2.4mm; break-inside: avoid; break-after: avoid; }
  .src-head .n { font-size: 15pt; font-weight: 500; color: var(--rb-red); line-height: 1; }
  .src-head .t { font-size: 10pt; font-weight: 500; color: var(--rb-grey); line-height: 1.3; }
  .src-head .p { font-size: 7.6pt; color: #5b6872; margin-top: .6mm; }
  .src-head .p .k { display: inline-block; font-size: 5.8pt; letter-spacing: .12em; text-transform: uppercase; color: #fff;
    background: var(--rb-grey); border-radius: .6mm; padding: .3mm 1.4mm; margin-left: 1.4mm; vertical-align: 1px; }
  .src-head a { color: var(--rb-red-deep); font-size: 7.2pt; word-break: break-all; }
  table.ev { width: 100%; border-collapse: collapse; margin-top: 2.2mm; font-size: 7.6pt; }
  table.ev th { text-align: left; font-size: 5.9pt; letter-spacing: .14em; text-transform: uppercase; color: var(--rb-slate);
    font-weight: 500; padding: 0 2mm 1mm 0; border-bottom: .3mm solid var(--rb-silver); }
  table.ev td { vertical-align: top; padding: 1.3mm 2.4mm 1.3mm 0; border-bottom: .25mm solid var(--rb-mist); line-height: 1.4; }
  table.ev tr { break-inside: avoid; }
  table.ev td.c { width: 46%; color: var(--rb-grey); }
  table.ev td.x { color: #4d5c66; font-weight: 300; }
  table.ev td.x q { quotes: "\\201C" "\\201D"; }
  .consulted { margin-top: 7mm; background: var(--rb-tint); padding: 3.4mm 4mm 1.6mm; border-left: 1mm solid var(--rb-silver); }
  .consulted h3 { font-size: 7pt; letter-spacing: .18em; text-transform: uppercase; color: var(--rb-slate); }
  .consulted p { font-size: 7.6pt; }
  .consulted a { color: var(--rb-red-deep); word-break: break-all; }
  .foot-note { margin-top: 6mm; font-size: 7pt; color: var(--rb-slate); border-top: .3mm solid var(--rb-mist); padding-top: 2.6mm; }
  /* thread */
  .post { break-inside: avoid; border: .3mm solid var(--rb-silver); border-radius: 3mm; padding: 4mm 4.6mm 3.4mm; margin: 0 0 4mm; position: relative; }
  .post .who { display: flex; align-items: center; gap: 2.6mm; margin-bottom: 2.4mm; }
  .post .av { width: 9mm; height: 9mm; border-radius: 50%; background: var(--rb-grey); display: flex; align-items: center; justify-content: center; }
  .post .av img { width: 5.6mm; }
  .post .name { font-weight: 500; font-size: 9pt; color: var(--rb-grey); line-height: 1.2; }
  .post .sub { font-size: 7pt; color: var(--rb-slate); }
  .post .count { position: absolute; right: 4.6mm; top: 4.4mm; font-size: 6.6pt; letter-spacing: .08em; color: var(--rb-slate); }
  .post .count b { color: var(--rb-red); font-weight: 500; }
  .post .body { font-size: 9.6pt; line-height: 1.48; color: #1f2d36; white-space: pre-wrap; }
  .post .body a { color: #1d6fb8; word-break: break-all; }
  .post .card { margin-top: 3mm; border-radius: 2mm; overflow: hidden; border: .3mm solid var(--rb-silver); }
  .post .card img { display: block; width: 100%; }
  .post .alt { font-size: 6.8pt; color: var(--rb-slate); margin-top: 1.4mm; }
`;

function docShell(title, inner) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="styles/brand.css"><style>${DOC_CSS}</style></head><body>${inner}</body></html>`;
}

function docHero(eyebrow, titleHtml, dek) {
  return `<header class="doc-hero">
    <img class="mark" src="assets/logos/redbelly-isotype-white.svg" alt="">
    <div class="top"><img src="assets/logos/redbelly-horizontal-negative.svg" alt="Redbelly"><span class="tag">Redbelly DAO · Community Briefing</span></div>
    <div class="eyebrow">${eyebrow}</div>
    <h1>${titleHtml}</h1>
    <p>${dek}</p>
  </header>`;
}

function sourceListHtml() {
  const blocks = ordered.map((s) => `
    <section class="src">
      <div class="src-head"><div class="n">${numbering.get(s.key)}</div><div>
        <div class="t">${escapeHtml(s.title)}</div>
        <div class="p">${escapeHtml(s.publisher)} · ${escapeHtml(s.date)}<span class="k">${escapeHtml(s.kind)}</span></div>
        <a href="${escapeAttr(s.url)}">${escapeHtml(s.url)}</a>
      </div></div>
      <table class="ev"><thead><tr><th>Statement in the briefing</th><th>Supporting passage (verbatim)</th></tr></thead><tbody>
      ${s.evidence.map((e) => `<tr><td class="c">${escapeHtml(e.claim)}</td><td class="x"><q>${escapeHtml(e.excerpt)}</q></td></tr>`).join('')}
      </tbody></table>
    </section>`).join('');
  const consulted = sources.consulted.map((c) => `<p><strong>${escapeHtml(c.publisher)}: ${escapeHtml(c.title)}</strong><br>
    <a href="${escapeAttr(c.url)}">${escapeHtml(c.url)}</a><br>${escapeHtml(c.note)}</p>`).join('');
  return docShell('Source List: New CEO Briefing', `
    ${docHero('New CEO Briefing · Source list', 'Every claim, <span>sourced</span>', `The ${ordered.length} sources behind the briefing on Christian Westerlind Wigstrom, numbered as in the briefing. Each entry lists the statements it supports and the exact passage that supports them. All links were opened on ${escapeHtml(sources.accessed)}.`)}
    <p class="intro"><strong>How to read this list.</strong> Numbers match the superscript links in the briefing PDF. “Primary” means the organisation's own publication (Redbelly, Monoova, Tokeniser, the RBA, the Federal Register of Legislation, industry bodies). “Secondary” means independent media or a published biography. Company figures marked “self-reported” have not been independently audited. Passages are quoted exactly as published; spelling follows the original.</p>
    ${blocks}
    <div class="consulted"><h3>Also consulted (no claim relies on these)</h3>${consulted}</div>
    <p class="foot-note">Independent community reference prepared for the Redbelly DAO. Not an official statement of Redbelly Network Pty Ltd or Tokeniser Pty Ltd. Not financial advice.</p>`);
}

function linkify(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+|\{BRIEFING_LINK\})/g, (u) =>
    u.startsWith('{') ? `<a>${u}</a>` : `<a href="${escapeAttr(u)}">${u}</a>`);
}

function threadPostLength(text) {
  return xLength(text.replaceAll('{BRIEFING_LINK}', 'https://example.org/x'));
}

function threadHtml() {
  const total = thread.posts.length;
  const posts = thread.posts.map((p, i) => `
    <article class="post">
      <div class="who"><div class="av"><img src="assets/logos/redbelly-isotype-white.svg" alt=""></div>
        <div><div class="name">Redbelly DAO</div><div class="sub">Post ${i + 1} of ${total}</div></div></div>
      <div class="count"><b>${threadPostLength(p.text)}</b> / 280</div>
      <div class="body">${linkify(p.text)}</div>
      ${p.image ? `<div class="card"><img src="${escapeAttr(p.image.preview)}" alt=""></div><div class="alt">Alt text: ${escapeHtml(p.image.alt)}</div>` : ''}
    </article>`).join('');
  return docShell('X Thread: New CEO Briefing', `
    ${docHero('New CEO Briefing · X thread', 'Ready-to-post <span>thread</span>', `${total} posts summarising the briefing for X. Each post is within the 280-character limit (links count as 23). Replace {BRIEFING_LINK} with the address where the DAO publishes the briefing PDF.`)}
    ${posts}
    <p class="foot-note">Character counts follow X's weighting rules. Every factual statement in the thread is covered by the briefing's source list.</p>`);
}

function threadMarkdown() {
  const total = thread.posts.length;
  const lines = [
    '# X thread: New CEO Briefing',
    '',
    `${total} posts summarising the briefing on Redbelly Network's incoming CEO, Christian Westerlind Wigstrom. Ready to copy and paste.`,
    '',
    '**Before posting**',
    '',
    '- Replace `{BRIEFING_LINK}` in the last post with the address where the DAO publishes `01-ceo-briefing.pdf`.',
    `- Attach \`02-x-thread-card.png\` to post 1 (alt text is given below the post).`,
    '- Character counts use X\'s rules: every link counts as 23 characters.',
    '',
    '---',
    '',
  ];
  thread.posts.forEach((p, i) => {
    lines.push(`### Post ${i + 1} of ${total} · ${threadPostLength(p.text)}/280`, '', '```text', p.text, '```', '');
    if (p.image) lines.push(`Image: \`${p.image.file}\`  `, `Alt text: ${p.image.alt}`, '');
    for (const k of p.sources) if (!numbering.has(k)) throw new Error(`Thread cites unknown source ${k}`);
    const nums = [...p.sources].sort((x, y) => numbering.get(x) - numbering.get(y))
      .map((k) => `[${numbering.get(k)}](${sources.byKey.get(k).url})`);
    if (nums.length) lines.push(`Sources (numbered as in the briefing): ${nums.join(', ')}`, '');
  });
  lines.push('---', '', 'Not financial advice. The thread makes no statement about the price or value of any token or asset.', '');
  return lines.join('\n');
}

function sourceListMarkdown() {
  const lines = [
    '# Source list: New CEO Briefing',
    '',
    `Sources for the briefing on Christian Westerlind Wigstrom, numbered in order of first use in \`01-ceo-briefing.pdf\`. Every link was opened on ${sources.accessed}. Each entry lists the statements it supports and the exact passage that supports them.`,
    '',
    '“Primary” means the organisation\'s own publication. “Secondary” means independent media or a published biography. Figures marked “self-reported” have not been independently audited. Passages are quoted exactly as published.',
    '',
    '## Quick index',
    '',
    '| # | Source | Publisher | Date | Type |',
    '|---|--------|-----------|------|------|',
    ...ordered.map((s) => `| ${numbering.get(s.key)} | [${s.title.replace(/\|/g, '\\|')}](${s.url}) | ${s.publisher} | ${s.date} | ${s.kind} |`),
    '',
    '## Statements and supporting passages',
    '',
  ];
  for (const s of ordered) {
    lines.push(`### ${numbering.get(s.key)}. ${s.title}`, '', `${s.publisher} · ${s.date} · ${s.kind}  `, `<${s.url}>`, '', '| Statement in the briefing | Supporting passage (verbatim) |', '|---|---|');
    for (const e of s.evidence) lines.push(`| ${e.claim.replace(/\|/g, '\\|')} | “${e.excerpt.replace(/\|/g, '\\|')}” |`);
    lines.push('');
  }
  lines.push('## Also consulted (no claim relies on these)', '');
  for (const c of sources.consulted) lines.push(`- **${c.publisher}: ${c.title}** <${c.url}>  `, `  ${c.note}`);
  lines.push('');
  return lines.join('\n');
}

function shareCardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles/brand.css"><style>
  html,body{margin:0;width:1600px;height:900px;overflow:hidden}
  .c{position:relative;width:1600px;height:900px;color:#fff;background:linear-gradient(135deg,#142530 0%,#283A46 78%);overflow:hidden}
  .c:before{content:"";position:absolute;left:0;top:0;bottom:0;width:22px;background:#FF5050}
  .mark{position:absolute;right:-120px;top:40px;width:760px;opacity:.08}
  .logo{position:absolute;left:96px;top:78px;height:66px}
  .tag{position:absolute;right:90px;top:92px;font-size:20px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.75);border:2px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:8px;font-weight:500}
  .eb{position:absolute;left:96px;top:270px;font-size:26px;letter-spacing:.24em;text-transform:uppercase;color:#FF5050;font-weight:500;display:flex;align-items:center;gap:18px}
  .eb:before{content:"";width:56px;height:4px;background:#FF5050}
  h1{position:absolute;left:96px;top:318px;margin:0;font-size:104px;line-height:1.02;font-weight:500;letter-spacing:-.01em;max-width:1300px}
  h1 span{color:#FF5050}
  .meta{position:absolute;left:96px;right:90px;bottom:84px;display:flex;border-top:2px solid rgba(255,255,255,.18);padding-top:26px}
  .meta div{flex:1;font-size:30px;font-weight:400}
  .meta small{display:block;font-size:17px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:500;margin-bottom:8px}
  </style></head><body><div class="c">
  <img class="mark" src="assets/logos/redbelly-isotype-white.svg" alt="">
  <img class="logo" src="assets/logos/redbelly-horizontal-negative.svg" alt="Redbelly">
  <div class="tag">Redbelly DAO · Community Briefing</div>
  <div class="eb">New CEO Briefing</div>
  <h1>Christian Westerlind <span>Wigstrom</span></h1>
  <div class="meta"><div><small>Role</small>Chief Executive Officer</div><div><small>Starts</small>November 2026</div><div><small>Previously</small>Co-founder &amp; CEO, Monoova</div></div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const tmpFiles = [];
function writeTmp(name, html) {
  const p = path.join(SOURCE_DIR, name);
  writeFileSync(p, html);
  tmpFiles.push(p);
  return p;
}

async function render(browser, htmlPath, opts) {
  const page = await browser.newPage(opts.viewport ? { viewport: opts.viewport, deviceScaleFactor: opts.scale ?? 1 } : {});
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (!opts.skipFontCheck) {
    const fontsOk = await page.evaluate(() => document.fonts.check('500 12px "Readex Pro"') && document.fonts.check('400 12px "Readex Pro"'));
    if (!fontsOk) throw new Error(`Readex Pro failed to load for ${htmlPath}`);
  }
  if (opts.checkFixedPages) {
    const report = await page.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
      const body = pg.querySelector('.page-body');
      const foot = pg.querySelector('.run-foot');
      const limit = foot ? foot.getBoundingClientRect().top : pg.getBoundingClientRect().bottom;
      let bottom = 0;
      body.querySelectorAll('*').forEach((el) => { bottom = Math.max(bottom, el.getBoundingClientRect().bottom); });
      return { page: i + 1, overflowPx: Math.round(bottom - limit + 4), clipped: body.scrollHeight > body.clientHeight + 1 };
    }));
    const bad = report.filter((r) => r.overflowPx > 0 || r.clipped);
    for (const r of report) console.log(`  page ${r.page}: ${r.overflowPx > 0 ? 'OVERFLOW ' + r.overflowPx + 'px' : 'fits (' + -r.overflowPx + 'px spare)'}`);
    if (bad.length && !process.env.ALLOW_OVERFLOW) throw new Error(`Content overflows on page(s): ${bad.map((r) => r.page).join(', ')}`);
  }
  if (opts.pdf) {
    await page.pdf({ path: opts.pdf, printBackground: true, preferCSSPageSize: true, ...(opts.pdfOptions ?? {}) });
  }
  if (opts.png) {
    await page.screenshot({ path: opts.png, clip: { x: 0, y: 0, width: opts.viewport.width, height: opts.viewport.height } });
  }
  if (opts.pageShots) {
    const pages = await page.$$('.page');
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: opts.pageShots(i + 1) });
  }
  await page.close();
}

const FOOTER = `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:6.4pt;color:#848B91;padding:0 15mm;display:flex;justify-content:space-between;">
  <span>Redbelly DAO · New CEO Briefing</span><span><span style="color:#FF5050" class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

const browser = await chromium.launch();
try {
  console.log('Briefing');
  const totalPages = (briefingTemplate.match(/<section class="page">/g) ?? []).length;
  const briefingHtml = renderCitations(briefingTemplate, numbering, sources.byKey)
    .replace('{{SOURCES}}', referencesHtml())
    .replaceAll('{{TOTAL}}', String(totalPages).padStart(2, '0'));
  await render(browser, writeTmp('.build-briefing.html', briefingHtml), {
    checkFixedPages: true,
    pdf: path.join(DELIVERABLES_DIR, '01-ceo-briefing.pdf'),
  });

  console.log('README preview');
  const shotDir = path.join(ROOT, 'docs');
  mkdirSync(shotDir, { recursive: true });
  const shot = (n) => path.join(SOURCE_DIR, `.build-page-${n}.png`);
  await render(browser, path.join(SOURCE_DIR, '.build-briefing.html'), { viewport: { width: 794, height: 1123 }, pageShots: shot });
  for (let n = 1; n <= totalPages; n++) tmpFiles.push(shot(n));
  const strip = `<!doctype html><html><body style="margin:0;background:#ECEBEC;width:${totalPages * 420 + 40}px;height:634px;display:flex;gap:20px;padding:20px;box-sizing:border-box">
    ${Array.from({ length: totalPages }, (_, i) => `<img src=".build-page-${i + 1}.png" style="width:400px;height:594px;box-shadow:0 6px 18px rgba(20,37,48,.18)">`).join('')}</body></html>`;
  await render(browser, writeTmp('.build-strip.html', strip), {
    viewport: { width: totalPages * 420 + 40, height: 634 },
    png: path.join(shotDir, 'briefing-preview.png'),
    scale: 2,
    skipFontCheck: true,
  });

  console.log('Share card');
  await render(browser, writeTmp('.build-card.html', shareCardHtml()), {
    viewport: { width: 1600, height: 900 },
    png: path.join(DELIVERABLES_DIR, '02-x-thread-card.png'),
  });

  console.log('X thread');
  writeFileSync(path.join(DELIVERABLES_DIR, '02-x-thread.md'), threadMarkdown());
  await render(browser, writeTmp('.build-thread.html', threadHtml()), {
    pdf: path.join(DELIVERABLES_DIR, '02-x-thread.pdf'),
    pdfOptions: { displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: FOOTER },
  });

  console.log('Source list');
  writeFileSync(path.join(DELIVERABLES_DIR, '03-source-list.md'), sourceListMarkdown());
  await render(browser, writeTmp('.build-sources.html', sourceListHtml()), {
    pdf: path.join(DELIVERABLES_DIR, '03-source-list.pdf'),
    pdfOptions: { displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: FOOTER },
  });
} finally {
  await browser.close();
  for (const f of tmpFiles) rmSync(f, { force: true });
}

console.log(`Done. ${ordered.length} sources, ${thread.posts.length} thread posts. Output in ${path.relative(ROOT, DELIVERABLES_DIR)}/`);
