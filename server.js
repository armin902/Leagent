import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeOffline } from './analyzer.js';
import { analyzeWithAi } from './lease-ai-analysis.js';
import { initAuth, currentUser, publicUser, register, login, googleLogin, clearSession } from './auth.js';
import { extractLeaseText } from './pdf-lease-text.js';
import { maxLeaseCharacters, maxPdfBytes } from './lease-limits.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' };

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
    if (req.method === 'POST' && req.url === '/api/extract-pdf') {
      if (!currentUser(req)) { json(res, 401, { error: 'Please sign in first.' }); return; }
      if (req.headers['content-type']?.split(';')[0] !== 'application/pdf') { json(res, 415, { error: 'Upload a PDF file.' }); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxPdfBytes) { json(res, 413, { error: 'PDFs are limited to 15 MB.' }); return; }
        chunks.push(chunk);
      }
      const pdf = Buffer.concat(chunks);
      if (pdf.subarray(0, 5).toString() !== '%PDF-') { json(res, 400, { error: 'This is not a valid PDF file.' }); return; }
      try { json(res, 200, { text: await extractLeaseText(pdf) }); }
      catch (error) { json(res, error.status || 400, { error: error.status ? error.message : 'Could not read this PDF. Try exporting it again or paste the lease text.' }); }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/analyze') {
      if (!currentUser(req)) { json(res, 401, { error: 'Please sign in first.' }); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxLeaseCharacters * 4 + 10000) { json(res, 413, { error: `Lease is too long (${maxLeaseCharacters.toLocaleString()} characters max).` }); return; }
        chunks.push(chunk);
      }
      let text;
      try { text = JSON.parse(Buffer.concat(chunks).toString('utf8')).text; } catch { json(res, 400, { error: 'Invalid request.' }); return; }
      if (typeof text !== 'string' || text.trim().length < 80 || text.length > maxLeaseCharacters) { json(res, 400, { error: `Paste at least 80 and at most ${maxLeaseCharacters.toLocaleString()} characters of lease text.` }); return; }
      if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
        try { json(res, 200, await analyzeWithAi(text, process.env)); }
        catch (error) { json(res, 200, { ...analyzeOffline(text), notice: `Live AI unavailable: ${error.message}. Showing a limited local scan.` }); }
      } else json(res, 200, analyzeOffline(text));
      return;
    }
    if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed.' }); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const protectedPages = ['/lease', '/board', '/social', '/calendar'];
    if (protectedPages.includes(pathname) && !currentUser(req)) { redirect(res, `/login?next=${encodeURIComponent(pathname)}`); return; }
    if (['/login', '/signup'].includes(pathname) && currentUser(req)) { redirect(res, '/lease'); return; }
    const allowed = { '/': 'index.html', '/index.html': 'index.html', '/login': 'login.html', '/signup': 'signup.html', '/lease': 'lease.html', '/board': 'board.html', '/social': 'social.html', '/calendar': 'calendar.html', '/style.css': 'style.css', '/extra.css': 'extra.css', '/app.js': 'app.js', '/auth-client.js': 'auth-client.js', '/nav.js': 'nav.js', '/lease-limits.js': 'lease-limits.js', '/sample-lease.txt': 'sample-lease.txt' };
    const name = allowed[pathname];
    if (!name) { json(res, 404, { error: 'Not found.' }); return; }
    const file = await readFile(join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[extname(name)]}; charset=utf-8` }); res.end(file);
  } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Server error.' }); }
});

await initAuth();
server.listen(port, () => console.log(`Leagent running at http://localhost:${port}`));
