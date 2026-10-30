// Shared helpers for the build and verification scripts.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = path.join(ROOT, 'source');
export const DELIVERABLES_DIR = path.join(ROOT, 'deliverables');
export const VERIFICATION_DIR = path.join(ROOT, 'verification');

const CITE_TOKEN = /\[\[([a-z0-9,\s-]+)\]\]/g;

export function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function loadSources() {
  const data = loadJson('data/sources.json');
  const byKey = new Map();
  for (const s of data.sources) {
    if (byKey.has(s.key)) throw new Error(`Duplicate source key: ${s.key}`);
    byKey.set(s.key, s);
  }
  return { ...data, byKey };
}

/** Citation keys in order of first appearance in a template. */
export function citationOrder(template) {
  const order = [];
  for (const m of template.matchAll(CITE_TOKEN)) {
    for (const key of m[1].split(',').map((k) => k.trim()).filter(Boolean)) {
      if (!order.includes(key)) order.push(key);
    }
  }
  return order;
}

/** Every citation token in a template, as arrays of keys. */
export function citationTokens(template) {
  return [...template.matchAll(CITE_TOKEN)].map((m) => m[1].split(',').map((k) => k.trim()));
}

/** Replace [[key,key]] tokens with numbered, linked superscripts. */
export function renderCitations(template, numbering, byKey) {
  return template.replace(CITE_TOKEN, (_, keys) => {
    const links = keys.split(',').map((k) => k.trim()).map((key) => {
      const src = byKey.get(key);
      if (!src) throw new Error(`Unknown source key in template: ${key}`);
      return `<a href="${escapeAttr(src.url)}" title="${escapeAttr(src.publisher + ': ' + src.title)}">${numbering.get(key)}</a>`;
    });
    return `<sup class="cite">${links.join('')}</sup>`;
  });
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** Lower-case, unify quotes and strip punctuation so excerpts match regardless of typography. */
export function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[^a-z0-9$%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', reg: '®' };

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Fetch a URL with curl (honours HTTPS_PROXY and system CA settings).
 * Returns { status, finalUrl, body: Buffer, contentType }.
 */
export function fetchUrl(url) {
  const marker = '\n__META__';
  const out = execFileSync('curl', [
    '-sSL', '--compressed', '--max-time', '60', '-A', UA,
    '-w', `${marker}%{http_code} %{url_effective} %{content_type}`,
    url,
  ], { maxBuffer: 64 * 1024 * 1024 });
  const idx = out.lastIndexOf(Buffer.from(marker));
  const meta = out.subarray(idx + marker.length).toString('utf8').split(' ');
  return {
    status: Number(meta[0]),
    finalUrl: meta[1],
    contentType: meta.slice(2).join(' '),
    body: out.subarray(0, idx),
  };
}

export function pdfToText(buffer) {
  return execFileSync('pdftotext', ['-q', '-', '-'], { input: buffer, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}

// Code-point ranges X counts as one character (twitter-text v3 config); all others count as two.
const X_LIGHT_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];

/** Weighted length as X counts it: each URL = 23, light ranges = 1, everything else (e.g. emoji) = 2. */
export function xLength(text) {
  const urlRe = /https?:\/\/\S+/g;
  const urls = text.match(urlRe) ?? [];
  const rest = text.replace(urlRe, '');
  let n = urls.length * 23;
  for (const ch of rest) {
    const cp = ch.codePointAt(0);
    n += X_LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return n;
}
