// quizSolver.js
const puppeteer = require('puppeteer');
const axios = require('axios');
const llmHelper = require('./llmHelper');
const dataProcessor = require('./dataProcessor');

// Track 3-minute limit
let quizStartTime = null;

/* -------------------------------------------------------------
   FETCH QUIZ PAGE
------------------------------------------------------------- */
async function fetchQuizContent(url) {
  console.log(`Fetching quiz from: ${url}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Let JS render
    await new Promise(r => setTimeout(r, 2000));

    const content = await page.evaluate(() =>
      document.body ? document.body.innerText : ''
    );
    const html = await page.content();

    console.log(
      `Quiz content extracted (text length: ${content.length} html length: ${html.length})`
    );

    return { content, html };
  } catch (err) {
    console.error('fetchQuizContent error:', err.message || err);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/* -------------------------------------------------------------
   BASE64 DECODER (sample demo pages)
------------------------------------------------------------- */
function tryDecodeBase64InText(text) {
  try {
    const atobMatches = [...text.matchAll(/atob\(`([^`]+)`\)/g)].map(
      m => m[1]
    );

    for (const b of atobMatches) {
      try {
        const decoded = Buffer.from(b, 'base64').toString('utf8');
        if (decoded.trim().length) return decoded;
      } catch {}
    }

    // Fallback: long base64 chunks
    const raw = text.match(/[A-Za-z0-9+/]{30,}={0,2}/);
    if (raw) {
      try {
        const decoded = Buffer.from(raw[0], 'base64').toString('utf8');
        if (decoded.trim().length) return decoded;
      } catch {}
    }
  } catch {}

  return null;
}

/* -------------------------------------------------------------
   YOUR UPDATED extractSubmitUrl() (FULLY FIXED)
------------------------------------------------------------- */
function extractSubmitUrl(content, html, pageUrl) {
  const text = (content || "") + "\n" + (html || "");

  // 1. Absolute submit URLs
  const abs = text.match(/https?:\/\/[^\s"'<>]+\/submit[^\s"'<>]*/i);
  if (abs) return abs[0];

  // 2. Relative forms: action="/submit"
  const formMatch = text.match(/action=["']([^"']*submit[^"']*)["']/i);
  if (formMatch) {
    const rel = formMatch[1];
    return new URL(rel, pageUrl).href;
  }

  // 3. Anchor tags: <a href="/submit">
  const linkMatch = text.match(/href=["']([^"']*submit[^"']*)["']/i);
  if (linkMatch) {
    const rel = linkMatch[1];
    return new URL(rel, pageUrl).href;
  }

  // 4. Bare relative "/submit"
  const relPath = text.match(/\/submit[^\s"'<>]*/i);
  if (relPath) {
    return new URL(relPath[0], pageUrl).href;
  }

  // 5. Base64 decoding fallback
  const decoded = tryDecodeBase64InText(text);
  if (decoded) {
    const abs2 = decoded.match(/https?:\/\/[^\s"'<>]+\/submit[^\s"'<>]*/i);
    if (abs2) return abs2[0];

    const rel2 = decoded.match(/\/submit[^\s"'<>]*/i);
    if (rel2) return new URL(rel2[0], pageUrl).href;
  }

  return null;
}

/* -------------------------------------------------------------
   SUBMIT ANSWER
------------------------------------------------------------- */
async function submitAnswer(submitUrl, email, secret, quizUrl, answer) {
  console.log("Submitting answer to:", submitUrl);

  const payload = { email, secret, url: quizUrl, answer };

  try {
    const response = await axios.post(submitUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    console.log("Submission response:", response.data);
    return response.data;
  } catch (err) {
    console.error("submitAnswer error:", err.response?.data || err.message);
    return err.response?.data || null;
  }
}

/* -------------------------------------------------------------
   SOLVE SINGLE QUIZ PAGE
------------------------------------------------------------- */
async function solveQuiz(url, email, secret) {
  console.log("\n=== Solving Quiz ===");
  console.log("URL:", url);

  if (quizStartTime) {
    const elapsed = (Date.now() - quizStartTime) / 1000;
    console.log(`Time elapsed: ${elapsed.toFixed(1)}s / 180s`);
    if (elapsed > 180) return null;
  }

  const { content, html } = await fetchQuizContent(url);

  const decoded = tryDecodeBase64InText(html + "\n" + content);
  const quizText = decoded || content;

  const analysis = await llmHelper.analyzeQuiz(quizText);
  console.log("Quiz Analysis:", analysis);

  const data = await dataProcessor.processTask(analysis, html);
  console.log("Data processing result:", data);

  const answer = await llmHelper.computeAnswer(analysis, data);
  console.log("Computed answer:", answer);

  const submitUrl = extractSubmitUrl(content, html, url);

  if (!submitUrl) throw new Error("Submit URL not found on page");

  const result = await submitAnswer(submitUrl, email, secret, url, answer);
  return result;
}

async function solveQuizChain(initialUrl, email, secret) {
  quizStartTime = Date.now();
  let currentUrl = initialUrl;
  let count = 0;

  while (currentUrl) {
    count++;

    console.log(`\n### Quiz ${count} ###`);

    if ((Date.now() - quizStartTime) / 1000 > 180) {
      console.log("Time exceeded, stopping.");
      break;
    }

    try {
      const result = await solveQuiz(currentUrl, email, secret);

      if (!result) break;

      if (result.correct) {
        console.log("✓ Correct");
        currentUrl = result.url || null;
      } else {
        console.log("✗ Incorrect");
        currentUrl = result.url || null;
      }
    } catch (err) {
      console.error("solveQuizChain error:", err.message || err);
      break;
    }
  }

  console.log(`\n=== Quiz chain ended. Solved ${count} quizzes ===`);
}

module.exports = { solveQuiz, solveQuizChain };
