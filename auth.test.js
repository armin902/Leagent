import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('account flow and separate protected service pages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'leagent-auth-'));
  const port = 35000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), LEAGENT_DATA_DIR: dir }, stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) { try { const r = await fetch(base); if (r.ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(ready, 'server started');
    const protectedResponse = await fetch(`${base}/lease`, { redirect: 'manual' });
    assert.equal(protectedResponse.status, 302);
    assert.match(protectedResponse.headers.get('location'), /\/login/);
    const email = 'test@example.com';
    const register = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Student', email, password: 'strong-test-password' }) });
    assert.equal(register.status, 200);
    const cookie = register.headers.get('set-cookie').split(';')[0];
    assert.match(cookie, /^leagent_session=/);
    const me = await fetch(`${base}/api/me`, { headers: { cookie } });
    assert.equal((await me.json()).user.email, email);
    for (const [route, marker] of [['/lease', 'leaseText'], ['/board', 'boardColumns'], ['/social', 'Social hub'], ['/calendar', 'Shared calendar']]) {
      const response = await fetch(`${base}${route}`, { headers: { cookie } });
      assert.equal(response.status, 200, route);
      assert.match((await response.text()).toLowerCase(), new RegExp(marker.toLowerCase()));
    }
    const sample = await readFile('sample-lease.txt', 'utf8');
    const analysis = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ text: sample }) });
    assert.equal(analysis.status, 200);
    assert.ok((await analysis.json()).clauses.length > 0);
    const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie } });
    assert.equal(logout.status, 200);
    const signedOut = await fetch(`${base}/api/me`, { headers: { cookie } });
    assert.equal((await signedOut.json()).user, null);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'strong-test-password' }) });
    assert.equal(login.status, 200);
  } finally { child.kill(); await rm(dir, { recursive: true, force: true }); }
});
