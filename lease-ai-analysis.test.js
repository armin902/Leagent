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
