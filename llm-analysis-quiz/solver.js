// solver.js
// Generic quiz solver using Playwright

const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryParseNumber(s) {
  if (s === null || s === undefined) return NaN;
  s = String(s).trim();
  s = s.replace(/[,₹$€£]/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function sumArray(arr) {
  return arr.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);
}

async function downloadBuffer(url, headers = {}) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', headers });
  return resp.data;
}

async function parseCSVBuffer(buffer, columnName) {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { rows: [], sum: 0 };

  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const colIndex = header.findIndex(h => h.toLowerCase() === columnName.toLowerCase());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = parts[j] ? parts[j].trim().replace(/^"|"$/g, '') : '';
    }
    rows.push(obj);
  }

  let sum = 0;
  if (colIndex >= 0) {
    for (const r of rows) {
      const v = tryParseNumber(r[header[colIndex]]);
      if (!isNaN(v)) sum += v;
    }
  }

  return { rows, sum };
}

async function extractTextFromPDFBuffer(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch {
    return '';
  }
}

async function findLinksFromPage(page) {
  return await page.$$eval('a', anchors =>
    anchors.map(a => ({ href: a.href, text: a.innerText }))
  );
}

async function tryExtractBase64FromScripts(page) {
  const scripts = await page.$$eval('script', n => n.map(s => s.innerText));
  for (const s of scripts) {
    if (!s) continue;

    const atobMatch = s.match(/atob\((`|'|")([A-Za-z0-9+/=\n\r]+)(`|'|")\)/);
    if (atobMatch) {
      return Buffer.from(atobMatch[2].replace(/\s+/g, ''), 'base64').toString('utf8');
    }

    // Try to pull raw JSON
    const jsonMatch = s.match(/\{[\s\S]{20,}\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
  }
  return null;
}

async function parseHtmlTableSum(page, columnName) {
  const tables = await page.$$eval('table', t => t.map(x => x.outerHTML));

  for (const tHtml of tables) {
    const rows = [];
    const rowMatches = [...tHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)];

    for (const rm of rowMatches) {
      const cells = [...rm[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim());

      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) continue;

    const header = rows[0];
    const colIndex = header.findIndex(h =>
      h && h.toLowerCase().includes(columnName.toLowerCase())
    );

    if (colIndex >= 0) {
      const dataRows = rows.slice(1);
      const vals = dataRows.map(r => tryParseNumber(r[colIndex]));
      return sumArray(vals);
    }
  }
  return null;
}

async function submitAnswer(submitUrl, payload) {
  const resp = await axios.post(submitUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 60000
  });
  return resp.data;
}

async function solveOnePage(page, url, context) {
  console.log('Visiting', url);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(300);

  const scriptData = await tryExtractBase64FromScripts(page);
  if (scriptData) {
    if (typeof scriptData === 'object') {
      return { found: true, data: scriptData };
    }
    if (typeof scriptData === 'string') {
      try {
        return { found: true, data: JSON.parse(scriptData) };
      } catch {
        return { found: true, data: scriptData };
      }
    }
  }

  const visibleText = await page.$eval('body', el => el.innerText).catch(() => '');
  const lower = visibleText.toLowerCase();

  if (lower.includes('sum') && lower.includes('value')) {
    const sumFromTable = await parseHtmlTableSum(page, 'value');
    if (sumFromTable !== null) {
      return { found: true, answer: sumFromTable };
    }

    const links = await findLinksFromPage(page);

    for (const l of links) {
      if (!l.href) continue;

      if (l.href.endsWith('.csv')) {
        const buf = await downloadBuffer(l.href);
        const { sum } = await parseCSVBuffer(buf, 'value');
        return { found: true, answer: sum };
      }

      if (l.href.endsWith('.json')) {
        const resp = await axios.get(l.href);
        const data = resp.data;
        if (Array.isArray(data)) {
          let s = 0;
          for (const r of data) {
            const v = tryParseNumber(r.value || r.Value || r.amount || r.Amount);
            if (!isNaN(v)) s += v;
          }
          return { found: true, answer: s };
        }
      }

      if (l.href.endsWith('.pdf')) {
        const buf = await downloadBuffer(l.href);
        const text = await extractTextFromPDFBuffer(buf);
        const matches = [...text.matchAll(/value[^0-9-]*(-?[0-9.,]+)/gi)]
          .map(m => tryParseNumber(m[1]));
        const s = sumArray(matches);
        return { found: true, answer: s };
      }
    }
  }

  const formAction = await page.$eval('form', f => f.action).catch(() => null);
  if (formAction) return { found: true, formAction };

  return { found: false, text: visibleText };
}

async function solve({ email, secret, startUrl, myEmail }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let currentUrl = startUrl;
  const startTime = Date.now();
  const TIMEOUT_MS = 180000;

  while (currentUrl && (Date.now() - startTime) < TIMEOUT_MS) {
    const result = await solveOnePage(page, currentUrl, { email, secret });

    if (!result) break;

    if (result.data && typeof result.data === 'object') {
      if (result.data.answer !== undefined && result.data.submit) {
        const payload = { email, secret, url: currentUrl, answer: result.data.answer };
        const resp = await submitAnswer(result.data.submit, payload);
        currentUrl = resp?.url || null;
        continue;
      }
    }

    if (result.answer !== undefined) {
      let submitUrl = await page.$$eval('a', as =>
        as.map(a => a.href).find(h => /submit/i.test(h)) || null
      ).catch(() => null);

      if (!submitUrl) {
        const scripts = await page.$$eval('script', s => s.map(x => x.innerText).join('\n'));
        const m = scripts.match(/https?:\/\/[^\s"'<>]+\/submit[^\s"'<>]*/i);
        if (m) submitUrl = m[0];
      }

      if (!submitUrl) {
        console.log('ANSWER:', result.answer);
        break;
      }

      const payload = { email, secret, url: currentUrl, answer: result.answer };
      const resp = await submitAnswer(submitUrl, payload);
      currentUrl = resp?.url || null;
      continue;
    }

    if (result.formAction) {
      const payload = { email, secret, url: currentUrl, answer: '' };
      const resp = await submitAnswer(result.formAction, payload);
      currentUrl = resp?.url || null;
      continue;
    }

    console.log('Could not solve page automatically.');
    break;
  }

  await browser.close();
}

module.exports = { solve };
