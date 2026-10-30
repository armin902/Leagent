import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithAi } from './lease-ai-analysis.js';

test('Gemini is selected and receives the full lease with a structured response schema', async () => {
  const lease = 'A long lease with rent and repair terms.';
  const analysis = { summary: 'Rent and repair terms need review.', risk_score: 34, clauses: [], missing_clauses: [], sublease_allowed: 'not stated', key_dates_and_fees: [], confidence: 'Based on extracted text.' };
  let called = false;
  const request = async (url, options) => {
    called = true;
    assert.match(url, /models\/gemini-3\.8-flash:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'gemini-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].text, lease);
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    assert.ok(body.generationConfig.responseFormat.text.schema.properties.summary);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }), { status: 200 });
  };
  const result = await analyzeWithAi(lease, { GEMINI_API_KEY: 'gemini-test-key', OPENAI_API_KEY: 'openai-test-key' }, request);
  assert.ok(called);
  assert.equal(result.summary, analysis.summary);
  assert.equal(result.mode, 'ai');
  assert.equal(result.provider, 'Gemini');
});

test('temporary Gemini failures retry and switch to the backup model', async () => {
  const models = [];
  const analysis = { summary: 'Lease summary', risk_score: 12, clauses: [], missing_clauses: [], sublease_allowed: 'not stated', key_dates_and_fees: [], confidence: 'Based on extracted text.' };
  const request = async url => {
    models.push(url.includes('gemini-3.6-flash') ? '3.6' : '3.8');
    if (models.length < 3) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }), { status: 200 });
  };
  const result = await analyzeWithAi('Lease terms', { GEMINI_API_KEY: 'gemini-test-key' }, request, async () => {});
  assert.deepEqual(models, ['3.8', '3.8', '3.6']);
  assert.equal(result.model, 'gemini-3.6-flash');
  assert.match(result.notice, /primary model was unavailable/);
});

test('permanent Gemini errors are not retried', async () => {
  let calls = 0;
  const request = async () => { calls++; return new Response('', { status: 400 }); };
  await assert.rejects(analyzeWithAi('Lease terms', { GEMINI_API_KEY: 'gemini-test-key' }, request, async () => {}), /Gemini request failed \(400\)/);
  assert.equal(calls, 1);
});
