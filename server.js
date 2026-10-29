import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeOffline } from './analyzer.js';
import { initAuth, currentUser, publicUser, register, login, googleLogin, clearSession } from './auth.js';

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
async function bodyJson(req, max = 12000) { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > max) throw Object.assign(new Error('Request too large.'), { status: 413 }); } try { return JSON.parse(body); } catch { throw Object.assign(new Error('Invalid request.'), { status: 400 }); } }
function redirect(res, path) { res.writeHead(302, { Location: path, 'Cache-Control': 'no-store' }); res.end(); }
function checkOrigin(req) { const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) throw Object.assign(new Error('Invalid request origin.'), { status: 403 }); }

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST') checkOrigin(req);
    if (req.method === 'GET' && req.url === '/api/me') { json(res, 200, { user: publicUser(currentUser(req)), googleClientId: process.env.GOOGLE_CLIENT_ID || null }); return; }
    if (req.method === 'POST' && ['/api/register', '/api/login', '/api/google', '/api/logout'].includes(req.url)) {
      if (req.url === '/api/logout') { await clearSession(req, res); json(res, 200, { ok: true }); return; }
      const input = await bodyJson(req);
      const user = req.url === '/api/register' ? await register(res, input) : req.url === '/api/login' ? await login(res, input) : await googleLogin(res, input.credential);
      json(res, 200, { user }); return;
    }
    if (req.method === 'POST' && req.url === '/api/analyze') {
      if (!currentUser(req)) { json(res, 401, { error: 'Please sign in first.' }); return; }
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
    const protectedPages = ['/lease', '/board', '/social', '/calendar'];
    if (protectedPages.includes(pathname) && !currentUser(req)) { redirect(res, `/login?next=${encodeURIComponent(pathname)}`); return; }
    if (['/login', '/signup'].includes(pathname) && currentUser(req)) { redirect(res, '/lease'); return; }
    const allowed = { '/': 'index.html', '/index.html': 'index.html', '/login': 'login.html', '/signup': 'signup.html', '/lease': 'lease.html', '/board': 'board.html', '/social': 'social.html', '/calendar': 'calendar.html', '/style.css': 'style.css', '/extra.css': 'extra.css', '/app.js': 'app.js', '/auth-client.js': 'auth-client.js', '/nav.js': 'nav.js', '/sample-lease.txt': 'sample-lease.txt' };
    const name = allowed[pathname];
    if (!name) { json(res, 404, { error: 'Not found.' }); return; }
    const file = await readFile(join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[extname(name)]}; charset=utf-8` }); res.end(file);
  } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Server error.' }); }
});

await initAuth();
server.listen(port, () => console.log(`Leagent running at http://localhost:${port}`));
