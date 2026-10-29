import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const scrypt = promisify(scryptCallback);
const dataDir = process.env.LEAGENT_DATA_DIR || fileURLToPath(new URL('.data/', import.meta.url));
const userFile = join(dataDir, 'users.json');
const sessionFile = join(dataDir, 'sessions.json');
const googleClient = new OAuth2Client();
const sessionMs = 7 * 24 * 60 * 60 * 1000;
let users = [];
let sessions = [];
let saveQueue = Promise.resolve();

async function loadJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
export async function initAuth() { await mkdir(dataDir, { recursive: true }); users = await loadJson(userFile); sessions = (await loadJson(sessionFile)).filter(s => s.expires > Date.now()); }
async function save(file, value) {
  saveQueue = saveQueue.catch(() => {}).then(async () => { const temp = `${file}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2)); await rename(temp, file); });
  await saveQueue;
}
function safeUser(user) { return { id: user.id, name: user.name, email: user.email, provider: user.provider }; }
function digest(token) { return createHash('sha256').update(token).digest('hex'); }
function cookieValue(req, key) { const match = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`)); return match?.slice(key.length + 1); }
export function currentUser(req) { const token = cookieValue(req, 'leagent_session'); if (!token) return null; const session = sessions.find(s => s.tokenHash === digest(token) && s.expires > Date.now()); return session ? users.find(u => u.id === session.userId) || null : null; }
function issueSession(res, user) { const token = randomBytes(32).toString('base64url'); sessions.push({ tokenHash: digest(token), userId: user.id, expires: Date.now() + sessionMs }); res.setHeader('Set-Cookie', `leagent_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMs / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); return save(sessionFile, sessions); }
export async function clearSession(req, res) { const token = cookieValue(req, 'leagent_session'); if (token) { sessions = sessions.filter(s => s.tokenHash !== digest(token)); await save(sessionFile, sessions); } res.setHeader('Set-Cookie', 'leagent_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); }
async function hashPassword(password, salt = randomBytes(16).toString('hex')) { const hash = await scrypt(password, salt, 64); return `${salt}:${hash.toString('hex')}`; }
async function checkPassword(password, stored) { if (!stored) return false; const [salt, hex] = stored.split(':'); if (!salt || !hex) return false; const actual = await scrypt(password, salt, 64); const expected = Buffer.from(hex, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function register(res, input) {
  const name = String(input.name || '').trim().slice(0, 80); const email = String(input.email || '').trim().toLowerCase(); const password = input.password;
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 10 || password.length > 200) throw Object.assign(new Error('Enter a name, valid email, and password of at least 10 characters.'), { status: 400 });
  if (users.some(u => u.email === email)) throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
  const user = { id: randomUUID(), name, email, provider: 'password', passwordHash: await hashPassword(password) };
  users.push(user); await save(userFile, users); await issueSession(res, user); return safeUser(user);
}
export async function login(res, input) {
  const email = String(input.email || '').trim().toLowerCase(); const user = users.find(u => u.email === email && u.provider === 'password');
  if (!user || !await checkPassword(String(input.password || ''), user.passwordHash)) throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
  await issueSession(res, user); return safeUser(user);
}
export async function googleLogin(res, credential) {
  if (!process.env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('Google sign-in is not configured.'), { status: 503 });
  if (typeof credential !== 'string' || credential.length > 10000) throw Object.assign(new Error('Invalid Google credential.'), { status: 400 });
  let payload;
  try { payload = (await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })).getPayload(); }
  catch { throw Object.assign(new Error('Google sign-in could not be verified.'), { status: 401 }); }
  if (!payload?.sub || !payload.email_verified) throw Object.assign(new Error('A verified Google email is required.'), { status: 401 });
  let user = users.find(u => u.provider === 'google' && u.googleSub === payload.sub);
  if (!user) {
    if (users.some(u => u.email === payload.email.toLowerCase())) throw Object.assign(new Error('This email already has a password account. Sign in with your password.'), { status: 409 });
    user = { id: randomUUID(), name: String(payload.name || payload.email.split('@')[0]).slice(0, 80), email: payload.email.toLowerCase(), provider: 'google', googleSub: payload.sub };
    users.push(user); await save(userFile, users);
  }
  await issueSession(res, user); return safeUser(user);
}
export function publicUser(user) { return user ? safeUser(user) : null; }
