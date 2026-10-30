# Leagent

A Penn State student housing copilot prototype with accounts and separate pages for the lease reader, move-in board, social hub, and calendar.

Here is the link for our product: https://leagent.onrender.com/calendar

## Run

Requires Node.js 20 or newer. Install packages once:

```powershell
npm install
```

```powershell
npm start
```

Open <http://localhost:3000>. Create an account, then use the hamburger menu to switch services. The lease reader has a **Use sample lease** button. The social hub and calendar are clearly marked previews.

## Accounts and Google sign-in

Email and password accounts work locally. Passwords are salted and hashed; account and session records are saved under `.data/`, which is ignored by Git. Sessions last seven days. Email addresses are not verified in this prototype.

To enable **Continue with Google**, create a Google OAuth Web application client ID, add `http://localhost:3000` as an authorized JavaScript origin, then start the server with `GOOGLE_CLIENT_ID` set. The server verifies Google ID tokens with Google's Node library. [Google setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) · [Token verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

```powershell
$env:GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com'
npm start
```

The Google button is disabled until a client ID is configured. This prototype stores accounts on the local server; it is not a deployed multi-user service.

On Render, the local `.data/` account and session files need a persistent disk or external database to survive restarts and redeploys.

## Live AI analysis

Set `GEMINI_API_KEY` in the server environment. On Render, add it to the web service's **Environment** settings; do not put it in the browser or commit it to Git. The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` to another model available to your API key if needed. Temporary Gemini errors are retried, then the app tries `gemini-3.6-flash` if the default model is still unavailable. Set `GEMINI_FALLBACK_MODEL` to choose a different backup model. The app uses the [Gemini generateContent API with structured JSON output](https://ai.google.dev/api/generate-content). If both Gemini and OpenAI keys are present, Gemini is used. `OPENAI_API_KEY` and optional `OPENAI_MODEL` remain supported when no Gemini key is set. Without either key, or if the API call fails, the app shows a limited local keyword scan and labels it accordingly.

```powershell
$env:GEMINI_API_KEY = 'your-key'
npm start
```

The prototype accepts up to 500,000 characters of pasted lease text and PDF, `.txt`, or `.md` files. PDF uploads are limited to 15 MB and 200 pages; selectable text is extracted on the server and shown in the lease editor before analysis. Scanned PDFs need OCR first. Lease text sent for live analysis goes to the configured AI provider. This is not legal advice; the score is a review priority, not a legal conclusion.

## Demo flow

1. Explain the problem: students often sign leases without understanding key terms.
2. Load the fictional sample lease and analyze it. Point to a red clause and discuss its suggested landlord question.
3. Open the hamburger menu and visit Move-in board. Generate a starter list and drag an item to another roommate.
4. Open Social hub and Calendar to show the planned features.
