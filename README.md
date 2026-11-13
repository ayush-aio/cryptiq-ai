# CryptIQ — AI Crypto Analysis Agent

A polished React chatbot interface for your existing LangGraph cryptocurrency analysis agent.

## Stack

- **Frontend:** React, Vite, Lucide icons, React Markdown
- **Backend:** FastAPI + Uvicorn
- **Agent:** Your supplied `app.py` (LangGraph ReAct workflow)
- **Model:** OpenAI `gpt-4o-mini`
- **Tools:** FreeCryptoAPI and NewsAPI

## Project structure

```text
cryptiq-ai/
├── app.py                  # Your original LangGraph agent
├── backend/
│   ├── __init__.py
│   └── main.py             # FastAPI endpoint
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── .env.example
├── .gitignore
├── requirements.txt
└── render.yaml
```

## Requirements

- Python 3.10 or newer (Python 3.11 recommended)
- Node.js 20 or newer
- API keys for OpenAI, FreeCryptoAPI and NewsAPI

## Run locally

### 1. Configure API keys

From the project root, create your local environment file:

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in:
```env
OPENAI_API_KEY=...
FREECRYPTO_TOKEN=...
NEWSAPI_KEY=...
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Never commit `.env` or paste API keys into frontend code. The `.gitignore` excludes it.

### 2. Start the Python API

From the project root:

**Windows**
```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

If PowerShell blocks activation, use:
```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

API health: http://127.0.0.1:8000/health  
Interactive API docs: http://127.0.0.1:8000/docs

### 3. Start the React app

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Deploy free-tier demo

This project uses a split deployment:

- **Frontend:** Vercel (static Vite site)
- **Backend:** Render (Python web service)

Free-tier availability, limits, sleep behaviour and usage policies can change. A sleeping free backend may take a little while to wake up after inactivity. The AI/API providers may have their own charges and quotas.

### A. Push to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Build CryptIQ AI crypto assistant"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/cryptiq-ai.git
git push -u origin main
```

Confirm `.env` is not in the commit. Only `.env.example` should be public.

### B. Deploy the backend on Render

1. Create a new **Web Service** in Render and connect this GitHub repository.
2. Set the root directory to the repository root.
3. Runtime: Python.
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Add these environment variables in Render:
   - `OPENAI_API_KEY`
   - `FREECRYPTO_TOKEN`
   - `NEWSAPI_KEY`
   - `FRONTEND_ORIGINS` (initially you can use `http://localhost:5173`; update it after deploying Vercel)
7. Deploy and wait for the service to become healthy.
8. Test `https://YOUR-SERVICE.onrender.com/health`.

You can also use the included `render.yaml` as a Blueprint, then fill in the secret environment variables in Render.

### C. Deploy the frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add environment variable:
   - Name: `VITE_API_URL`
   - Value: `https://YOUR-SERVICE.onrender.com` (no trailing slash)
7. Deploy.

### D. Allow your Vercel domain in the backend

After Vercel gives you a domain, update Render's `FRONTEND_ORIGINS` variable to the exact origin, for example:

```text
https://your-project.vercel.app
```

For a custom domain, include both origins separated by commas:

```text
https://your-project.vercel.app,https://www.yourdomain.com
```

Redeploy/restart the Render service after changing the variable. Then reload the Vercel website and test a chat.

## Important deployment notes

### Memory

Your original agent uses LangGraph `MemorySaver`. This stores conversation state in the running Python process. It is suitable for a demo, but it is **not durable storage**:
- restarting or redeploying the backend clears agent memory;
- a free service that sleeps/restarts can lose in-process memory;
- frontend chat transcripts are stored in the browser's local storage, but that does not restore LangGraph's server-side context.

For reliable production memory, replace `MemorySaver` with a persistent LangGraph checkpointer (for example, PostgreSQL) and add authentication/user ownership before exposing private conversations.

### API keys and costs

- Keep all API keys in backend environment variables.
- Never put provider keys in `VITE_*` variables or React source.
- Free hosting does not mean OpenAI, FreeCryptoAPI or NewsAPI usage is free. Check each provider's current pricing and rate limits.
- Do not expose the API publicly for high-volume use without authentication, rate limiting and abuse protection.

### Financial disclaimer

CryptIQ provides AI-generated research and educational information, not investment advice. Market data can be delayed, incomplete or unavailable. Verify important information independently.

## Troubleshooting

- **Frontend says service unavailable:** check `VITE_API_URL`, Render logs, and `/health`.
- **CORS error:** ensure `FRONTEND_ORIGINS` exactly matches the deployed Vercel origin (scheme included, no path).
- **Backend fails during startup:** verify all three API keys are configured in Render. Your original `app.py` validates them when imported.
- **Render cold start:** wait for the free service to wake, then retry.
- **No market data/news:** check provider credentials, quotas and API response status in backend logs.

## License

Add a license file if you intend to publish this repository as an open-source project.
