#!/usr/bin/env node
// Verifies the deliverables against their sources and the brief's rules.
//
//   1. Citations   every [[key]] in the briefing resolves; every source is cited.
//   2. Links       every source URL answers with HTTP 2xx (after redirects).
//   3. Evidence    every recorded supporting passage is present on the live page.
//   4. Quotes      every quotation in the briefing and the thread appears verbatim
//                  (sentence by sentence) in at least one source.
//   5. Thread      5 to 8 posts, each within X's 280-character limit, and every
//                  link in the thread is a listed source.
//   6. Guardrails  no personal credit, handles, price talk or private-life terms
//                  in any deliverable.
//
// Writes verification/verification-report.md and exits non-zero on any failure.
// Usage: node scripts/verify.mjs [--offline]   (--offline skips checks 2-4)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  ROOT, SOURCE_DIR, DELIVERABLES_DIR, VERIFICATION_DIR,
  loadJson, loadSources, citationOrder, citationTokens, normalise, htmlToText, fetchUrl, pdfToText, xLength,
} from './lib.mjs';

const offline = process.argv.includes('--offline');
const sources = loadSources();
const thread = loadJson('data/x-thread.json');
const template = readFileSync(path.join(SOURCE_DIR, 'briefing.html'), 'utf8');
const results = [];
const record = (check, ok, detail) => results.push({ check, ok, detail });

// 1. Citations ---------------------------------------------------------------
const order = citationOrder(template);
const unknown = order.filter((k) => !sources.byKey.has(k));
record('Citations resolve', unknown.length === 0, unknown.length ? `Unknown keys: ${unknown.join(', ')}` : `${citationTokens(template).length} citation markers, ${order.length} distinct sources`);
const uncited = sources.sources.filter((s) => !order.includes(s.key)).map((s) => s.key);
record('Every listed source is cited', uncited.length === 0, uncited.length ? `Uncited: ${uncited.join(', ')}` : `${sources.sources.length} of ${sources.sources.length}`);
const evidenceCount = sources.sources.reduce((n, s) => n + s.evidence.length, 0);

// 2-4. Live checks -------------------------------------------------------------
const pageText = new Map();
const linkRows = [];
if (!offline) {
  for (const s of sources.sources) {
    let status = 0, text = '', error = '';
    try {
      const res = fetchUrl(s.url);
      status = res.status;
      // Some pages (e.g. the Federal Register of Legislation) load their text in a frame;
      // verifyUrl points at that embedded document.
      const textRes = s.verifyUrl ? fetchUrl(s.verifyUrl) : res;
      if (s.verifyUrl && !(textRes.status >= 200 && textRes.status < 300)) status = textRes.status;
      const isPdf = /pdf/i.test(textRes.contentType) || (s.verifyUrl ?? s.url).endsWith('.pdf');
      text = isPdf ? pdfToText(textRes.body) : htmlToText(textRes.body.toString('utf8'));
    } catch (e) {
      error = e.message.split('\n')[0];
    }
    const norm = normalise(text);
    pageText.set(s.key, norm);
    const missing = s.evidence.filter((e) => !norm.includes(normalise(e.excerpt)));
    const ok = status >= 200 && status < 300 && missing.length === 0;
    linkRows.push({ n: order.indexOf(s.key) + 1, s, status, found: s.evidence.length - missing.length, missing, error, ok });
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} [${status}] ${s.key} (${s.evidence.length - missing.length}/${s.evidence.length} passages)\n`);
  }
  linkRows.sort((a, b) => a.n - b.n);
  const deadLinks = linkRows.filter((r) => !(r.status >= 200 && r.status < 300));
  record('Source links answer HTTP 2xx', deadLinks.length === 0, deadLinks.length ? deadLinks.map((r) => `${r.s.key} (${r.status || r.error})`).join('; ') : `${linkRows.length} of ${linkRows.length}`);
  const missingEvidence = linkRows.flatMap((r) => r.missing.map((m) => `${r.s.key}: "${m.excerpt.slice(0, 60)}…"`));
  record('Supporting passages found on live pages', missingEvidence.length === 0, missingEvidence.length ? missingEvidence.join('; ') : `${evidenceCount} of ${evidenceCount}`);

  // 4. Quotes: block quotes plus every “…” fragment of three or more words.
  const allText = [...pageText.values()].join(' | ');
  const quoteSentences = [];
  for (const m of template.matchAll(/<div class="quote">\s*<p>([\s\S]*?)<\/p>/g)) {
    for (const sentence of htmlToText(m[1]).split(/(?<=[.!?])\s+/)) if (sentence.trim()) quoteSentences.push(sentence.trim());
  }
  const inline = [...template.matchAll(/“([^”]+)”/g), ...thread.posts.flatMap((p) => [...p.text.matchAll(/“([^”]+)”/g)])]
    .map((m) => htmlToText(m[1].replace(/\[\[[^\]]+\]\]/g, '')).trim())
    .filter((q) => q.split(/\s+/).length >= 3);
  const quotes = [...new Set([...quoteSentences, ...inline])];
  const unmatched = quotes.filter((q) => !allText.includes(normalise(q)));
  record('Quotations match a source verbatim', unmatched.length === 0, unmatched.length ? unmatched.map((q) => `"${q}"`).join('; ') : `${quotes.length} quotations and quoted phrases`);
}

// 5. Thread ---------------------------------------------------------------------
const lengths = thread.posts.map((p) => xLength(p.text.replaceAll('{BRIEFING_LINK}', 'https://example.org/x')));
const tooLong = lengths.map((n, i) => ({ n, i })).filter((x) => x.n > 280);
record('Thread has 5 to 8 posts', thread.posts.length >= 5 && thread.posts.length <= 8, `${thread.posts.length} posts`);
record('Thread posts within 280 characters', tooLong.length === 0, tooLong.length ? tooLong.map((x) => `post ${x.i + 1}: ${x.n}`).join('; ') : `longest ${Math.max(...lengths)} / 280`);
const sourceUrls = new Set(sources.sources.map((s) => s.url));
const strayLinks = thread.posts.flatMap((p) => p.text.match(/https?:\/\/\S+/g) ?? []).filter((u) => !sourceUrls.has(u));
record('Thread links are listed sources', strayLinks.length === 0, strayLinks.length ? strayLinks.join('; ') : 'all links appear in the source list');
const badKeys = thread.posts.flatMap((p) => p.sources).filter((k) => !sources.byKey.has(k));
record('Thread source keys resolve', badKeys.length === 0, badKeys.length ? badKeys.join(', ') : 'ok');

// 6. Guardrails -------------------------------------------------------------------
const GUARDS = [
  ['personal credit', /\b(made|created|prepared|written|authored|compiled|designed) by\b/i],
  ['social handle', /(^|[\s(])@[A-Za-z0-9_]{2,}/],
  ['price talk', /\b(price target|to the moon|moon(ing)?|pump|bullish|bearish|undervalued|guaranteed|100x|10x|buy the dip|all[- ]time high)\b/i],
  ['investment call', /\b(you should (buy|sell|hold)|buy now|sell now|accumulate|hodl)\b/i],
  ['private life', /\b(wife|husband|spouse|married|daughter|son|children|kids|born in|years old|hometown|religion|military service)\b/i],
];
const texts = [];
for (const f of readdirSync(DELIVERABLES_DIR)) {
  const p = path.join(DELIVERABLES_DIR, f);
  if (f.endsWith('.md')) texts.push([f, readFileSync(p, 'utf8')]);
  if (f.endsWith('.pdf')) texts.push([f, execFileSync('pdftotext', ['-q', p, '-']).toString('utf8')]);
}
const hits = [];
for (const [f, t] of texts) {
  const plain = t.replace(/https?:\/\/\S+/g, ' ');
  for (const [label, re] of GUARDS) {
    const m = plain.match(re);
    if (m) hits.push(`${f}: ${label} ("${m[0].trim()}")`);
  }
}
record('No personal credit, price talk or private-life content', hits.length === 0, hits.length ? hits.join('; ') : `${texts.length} deliverable files scanned`);

// Report ---------------------------------------------------------------------------
const now = new Date();
const stamp = now.toLocaleString('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'short' }) + ' (Europe/Berlin)';
const lines = [
  '# Verification report',
  '',
  `Generated by \`npm run verify\` on ${stamp}${offline ? ' in offline mode (live checks skipped)' : ''}.`,
  '',
  '## Summary',
  '',
  '| Check | Result | Detail |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.check} | ${r.ok ? 'Pass' : '**Fail**'} | ${r.detail.replace(/\|/g, '\\|')} |`),
  '',
];
if (linkRows.length) {
  lines.push('## Sources', '', 'Each source was fetched live. "Passages" counts the recorded supporting passages found verbatim on the page (punctuation and capitalisation ignored).', '', '| # | Source | HTTP | Passages |', '|---|---|---|---|');
  for (const r of linkRows) lines.push(`| ${r.n} | [${r.s.publisher}: ${r.s.title.replace(/\|/g, '\\|')}](${r.s.url}) | ${r.status || 'error'} | ${r.found} / ${r.s.evidence.length} |`);
  lines.push('');
}
lines.push('## Thread character counts', '', '| Post | Characters (X weighting) |', '|---|---|', ...lengths.map((n, i) => `| ${i + 1} | ${n} / 280 |`), '');
mkdirSync(VERIFICATION_DIR, { recursive: true });
writeFileSync(path.join(VERIFICATION_DIR, 'verification-report.md'), lines.join('\n'));

const failed = results.filter((r) => !r.ok);
console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}: ${r.detail}`);
console.log(`\nReport written to ${path.relative(ROOT, path.join(VERIFICATION_DIR, 'verification-report.md'))}`);
process.exit(failed.length ? 1 : 0);
