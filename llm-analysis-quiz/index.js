// index.js
const express = require('express');
const bodyParser = require('body-parser');
const solver = require('./solver');


const app = express();
app.use(bodyParser.json({ limit: '1mb' }));


// Get secret and email from env for safety
const MY_SECRET = process.env.QUIZ_SECRET || process.env.MY_SECRET || 'replace-with-your-secret';
const MY_EMAIL = process.env.QUIZ_EMAIL || process.env.MY_EMAIL || 'you@example.com';


app.post('/api/quiz', async (req, res) => {
if (!req.is('application/json')) {
return res.status(400).json({ error: 'Expected application/json' });
}


const payload = req.body;
if (!payload || typeof payload !== 'object') {
return res.status(400).json({ error: 'Invalid JSON payload' });
}


const { email, secret, url } = payload;
if (!email || !secret || !url) {
return res.status(400).json({ error: 'Missing fields: email, secret, and url are required' });
}


if (secret !== MY_SECRET) {
console.warn('Invalid secret attempt for:', email);
return res.status(403).json({ error: 'Invalid secret' });
}


// Quick ack so the caller doesn't time out while we solve (we still keep processing)
res.status(200).json({ status: 'accepted' });


// Solve in process — note: must complete submissions within 3 minutes per the spec
try {
console.log('Starting solver for:', url);
await solver.solve({ email: email, secret: secret, startUrl: url, myEmail: MY_EMAIL });
console.log('Solver finished for:', url);
} catch (err) {
console.error('Solver error:', err);
}
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
console.log(`LLM Analysis Quiz server listening on port ${port}`);
console.log('Ensure PLAYWRIGHT browsers are installed: npx playwright install');
});