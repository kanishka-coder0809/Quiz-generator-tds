# LLM Analysis Quiz - Solver Endpoint


Simple Node.js Express server that accepts POST requests from the course evaluators and solves the quizzes automatically using Playwright.


## What this repo provides
- `/api/quiz` POST endpoint that validates secret and runs the solver
- A generic solver that uses a headless browser to render JS pages, extract data, solve common tasks (tables/CSV/JSON sums, simple CSV/JSON parsing, basic PDF text extraction), and POST the answer to the provided submit URL


## Requirements
- Node 18+
- npm


## Install
```bash
git clone <your-repo-url>
cd llm-analysis-quiz
npm install
# Playwright browsers (required for Playwright to function)
npx playwright install