import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeOffline } from './analyzer.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' };

const schema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'risk_score', 'clauses', 'missing_clauses', 'sublease_allowed', 'key_dates_and_fees', 'confidence'],
  properties: {
    summary: { type: 'string' }, risk_score: { type: 'integer' }, confidence: { type: 'string' },
    clauses: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'rating', 'label', 'explanation', 'question_for_landlord'], properties: { text: { type: 'string' }, rating: { type: 'string', enum: ['red', 'yellow', 'green'] }, label: { type: 'string' }, explanation: { type: 'string' }, question_for_landlord: { type: 'string' } } } },
    missing_clauses: { type: 'array', items: { type: 'string' } },
    sublease_allowed: { type: 'string', enum: ['yes', 'no', 'with approval', 'not stated', 'unclear'] },
    key_dates_and_fees: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'amount_or_date'], properties: { item: { type: 'string' }, amount_or_date: { type: 'string' } } } }
  }
};

async function analyzeWithAi(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        instructions: 'You are a cautious lease reading assistant for students. Analyze only the provided lease text. Quote or closely paraphrase actual clauses. Risk score is a rough review priority from 0 to 100, not a legal determination. Be conservative. Say not stated when information is absent. Do not cite law or claim a clause is illegal. Provide short practical questions. The confidence field must mention limitations of reviewing only extracted text.',
        input: text,
        text: { format: { type: 'json_schema', name: 'lease_analysis', strict: true, schema } }
      })
    });
    if (!response.ok) throw new Error(`AI request failed (${response.status})`);
    const data = await response.json();
    const content = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    if (!content) throw new Error('AI returned no analysis.');
    const result = JSON.parse(content);
    return { ...result, risk_score: Math.max(0, Math.min(100, result.risk_score)), mode: 'ai' };
  } finally { clearTimeout(timer); }
}

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/analyze') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 85000) { json(res, 413, { error: 'Lease is too long (80,000 characters max).' }); return; } }
      let text;
      try { text = JSON.parse(body).text; } catch { json(res, 400, { error: 'Invalid request.' }); return; }
      if (typeof text !== 'string' || text.trim().length < 80 || text.length > 80000) { json(res, 400, { error: 'Paste at least 80 and at most 80,000 characters of lease text.' }); return; }
      if (process.env.OPENAI_API_KEY) {
        try { json(res, 200, await analyzeWithAi(text)); }
        catch (error) { json(res, 200, { ...analyzeOffline(text), notice: `Live AI unavailable: ${error.message}. Showing a limited local scan.` }); }
      } else json(res, 200, analyzeOffline(text));
      return;
    }
    if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed.' }); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const allowed = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/sample-lease.txt': 'sample-lease.txt' };
    const name = allowed[pathname];
    if (!name) { json(res, 404, { error: 'Not found.' }); return; }
    const file = await readFile(join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[extname(name)]}; charset=utf-8` }); res.end(file);
  } catch (error) { json(res, 500, { error: error.message || 'Server error.' }); }
});

server.listen(port, () => console.log(`Leagent running at http://localhost:${port}`));
