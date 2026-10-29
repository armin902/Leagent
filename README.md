# Leagent

A Penn State student housing copilot prototype: read a lease, review clauses and questions, then assign move-in essentials to roommates.

## Run

Requires Node.js 20 or newer. No packages to install.

```powershell
npm start
```

Open <http://localhost:3000>. Click **Use sample lease**, then **Analyze lease**. The move-in board is below the lease reader.

## Live AI analysis

Set `OPENAI_API_KEY` in the server environment before starting. The key stays on the server. You can optionally set `OPENAI_MODEL` (default `gpt-4o-mini`). The app uses the [OpenAI Responses API with structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Without a key, or if the API call fails, it uses a limited local keyword scan and labels the result accordingly. This makes the sample demo work offline, but the local scan can miss or misread clauses.

```powershell
$env:OPENAI_API_KEY = 'your-key'
npm start
```

The prototype accepts pasted lease text and `.txt` or `.md` files. Convert PDFs to text before using it. Lease text sent for live analysis goes to the configured OpenAI API. This is not legal advice; the score is a review priority, not a legal conclusion.

## Demo flow

1. Explain the problem: students often sign leases without understanding key terms.
2. Load the fictional sample lease and analyze it. Point to a red clause and discuss its suggested landlord question.
3. Generate a move-in starter list and drag an item to another roommate.
4. Scroll to the roadmap cards for matching, sublets, and verification.
