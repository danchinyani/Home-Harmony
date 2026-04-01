# Home Harmony – AI Cleaning Assistant


Home Harmony is a knowledge-based intelligent web application designed to provide safe, structured, and context-aware domestic cleaning advice. The system combines a rule-based knowledge base with a local AI model to improve reliability and user interaction.

---

## Overview

This project addresses limitations in general AI systems when applied to practical domestic tasks. Instead of relying purely on generative AI, Home Harmony uses a hybrid approach:

- Structured JSON knowledge base
- Safety rules for risk reduction
- Controlled domain responses (cleaning only)
- Local AI support via Ollama

This ensures responses are both **accurate and safe**.

---

## Key Features

- Knowledge-based cleaning recommendations
- Domain-restricted responses (cleaning only)
- Safety-aware output filtering
- AI-assisted responses via Ollama
- Image-based query support
- Room-based navigation (UI)
- Common cleaning problems shortcuts
- Response feedback (helpful / not helpful)
- Text-to-speech output

---

## Tech Stack

### Backend
- Node.js
- Express

### Frontend
- HTML
- CSS
- JavaScript

### AI & Data
- Ollama (local LLM)
- qwen2.5:1.5b model
- JSON knowledge base
- JSON safety rules

---

## Installation and Setup

```bash
1. Clone the repository
git clone https://github.com/danchinyani/Home-Harmony.git
cd Home-Harmony

2. Install dependencies
npm install

3. Ollama Setup (Required)
Download Ollama:
https://ollama.com/download

4. Run the model:
ollama run qwen2.5:1.5b

5. Start the server
npm start

6. Development mode (optional)
npm run dev

7. Open in browser
http://localhost:3000
```

How the System Works:
-User enters a cleaning-related query
-System validates the query domain
-Knowledge base is searched for relevant results
-Safety rules are applied
-Ollama enhances the response (if required)
-Final answer is displayed to the user

Important Notes:
-This system is limited to domestic cleaning queries only
-Non-cleaning queries are intentionally rejected
-AI functionality depends on Ollama
-Best used in Chrome or Edge (for voice prompt)
