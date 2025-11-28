// dataProcessor.js
const axios = require('axios');
const puppeteer = require('puppeteer');

async function processTask(analysis, htmlOrContent) {
  console.log('processTask: taskType=', analysis?.taskType);

  // Extract URLs from input (simple heuristic)
  const urls = extractUrls(String(htmlOrContent || ''));

  // If the analysis explicitly gave a dataSource, prefer it
  const primary = analysis?.dataSource || (urls.length ? urls[0] : null);

  // Download / parse files when asked
  const type = (analysis?.taskType || '').toLowerCase();

  if (type.includes('download') || type.includes('file')) {
    return await downloadAndProcess(primary);
  }

  if (type.includes('scrape') || type.includes('website')) {
    return await scrapeWebsite(primary || urls[0]);
  }

  if (type.includes('api')) {
    return await callAPI(primary || urls[0]);
  }

  // Default: return a compact snapshot for the LLM to reason on
  return {
    urls,
    snippet: String(htmlOrContent || '').slice(0, 4000),
    analysis
  };
}

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlRegex) || [];
  return matches.filter(u => !u.endsWith('.js') && !u.endsWith('.css'));
}

async function downloadAndProcess(url) {
  if (!url) return { error: 'No download URL provided' };
  console.log('downloadAndProcess:', url);
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    const ct = resp.headers['content-type'] || '';
    if (ct.includes('pdf')) {
      // lightweight PDF metadata fallback
      return { type: 'pdf', size: resp.data.length };
    }
    if (ct.includes('json')) {
      return JSON.parse(resp.data.toString('utf8'));
    }
    if (ct.includes('csv') || ct.includes('text')) {
      return processCSV(resp.data.toString('utf8'));
    }
    if (ct.includes('html')) {
      return { html: resp.data.toString('utf8').slice(0, 8000) };
    }
    return { base64: resp.data.toString('base64'), contentType: ct, size: resp.data.length };
  } catch (err) {
    console.error('downloadAndProcess error:', err.message || err);
    return { error: String(err.message || err) };
  }
}

function processCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], data: [], rowCount: 0 };
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
  return { headers, data, rowCount: data.length };
}

async function scrapeWebsite(url) {
  if (!url) return { error: 'No URL for scraping' };
  console.log('Scraping:', url);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));


    const result = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const title = document.title || '';
      const tables = Array.from(document.querySelectorAll('table')).map(t => {
        return Array.from(t.rows).map(r => Array.from(r.cells).map(c => c.innerText));
      });
      return { title, text, tables };
    });

    return result;
  } catch (err) {
    console.error('scrapeWebsite error:', err.message || err);
    return { error: String(err && err.message ? err.message : err) };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

async function callAPI(url, headers = {}) {
  if (!url) return { error: 'No API URL provided' };
  console.log('callAPI:', url);
  try {
    const resp = await axios.get(url, { headers, timeout: 30000 });
    return resp.data;
  } catch (err) {
    console.error('callAPI error:', err.message || err);
    return { error: String(err.message || err) };
  }
}

module.exports = {
  processTask,
  downloadAndProcess,
  scrapeWebsite,
  callAPI
};
