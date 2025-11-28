require('dotenv').config();
const axios = require("axios");

// Stable DeepSeek model through OpenRouter
const MODEL = "deepseek/deepseek-chat";

async function callLLM(messages) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: MODEL,
        messages,
        max_tokens: 2000,
        temperature: 0.1
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("OpenRouter LLM error:", err.response?.data || err.message);
    throw err;
  }
}

async function analyzeQuiz(quizContent) {
  const raw = await callLLM([
    {
      role: "system",
      content: `Return JSON only with fields:
      - taskType
      - dataSource
      - operation
      - answerFormat
      - details`
    },
    {
      role: "user",
      content: quizContent
    }
  ]);

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      taskType: "unknown",
      dataSource: null,
      operation: "unknown",
      answerFormat: "unknown",
      details: raw
    };
  }
}

async function computeAnswer(analysis, data) {
  const resp = await callLLM([
    {
      role: "system",
      content: "Return ONLY the final answer. No explanation."
    },
    {
      role: "user",
      content: `Analysis: ${JSON.stringify(analysis)}\nData: ${JSON.stringify(data)}`
    }
  ]);

  // Try JSON
  try {
    if (resp.startsWith("{") || resp.startsWith("[")) return JSON.parse(resp);
  } catch {}

  // Try number
  if (!isNaN(Number(resp))) return Number(resp);

  // Try boolean
  if (resp.toLowerCase() === "true") return true;
  if (resp.toLowerCase() === "false") return false;

  return resp.trim();
}

module.exports = { analyzeQuiz, computeAnswer, callLLM };
