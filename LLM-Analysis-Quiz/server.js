require('dotenv').config();   // FIXED: loads .env from same folder

console.log("Loaded ENV:", {
  EMAIL: process.env.EMAIL,
  SECRET: process.env.SECRET,
  GROQ: process.env.GROQ_API_KEY ? "YES" : "NO"
});

const express = require('express');
const quizSolver = require('./quizSolver');

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET;
const EMAIL = process.env.EMAIL;

app.post('/solve', async (req, res) => {
  console.log('Received request:', req.body);

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const { email, secret, url } = req.body;

  if (secret !== SECRET) {
    console.log('Invalid secret provided');
    return res.status(403).json({ error: 'Invalid secret' });
  }

  if (email !== EMAIL) {
    console.log('Email mismatch');
    return res.status(403).json({ error: 'Email does not match' });
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing URL' });
  }

  res.json({
    status: 'received',
    message: 'Quiz solving in progress'
  });

  quizSolver.solveQuizChain(url, email, secret)
    .then(() => console.log('Quiz chain completed'))
    .catch(err => console.error('Quiz chain error:', err));
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`POST endpoint → http://localhost:${PORT}/solve`);
});
