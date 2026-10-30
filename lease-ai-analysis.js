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

const instructions = 'You are a cautious lease reading assistant for students. Analyze the entire provided lease text. Summarize the main obligations and costs, and quote or closely paraphrase actual clauses. Risk score is a rough review priority from 0 to 100, not a legal determination. Be conservative. Say not stated when information is absent. Do not cite law or claim a clause is illegal. Provide short practical questions. The confidence field must mention limitations of reviewing only extracted text.';

export async function analyzeWithAi(text, config, request = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    let response;
    let content;
    if (config.GEMINI_API_KEY) {
      const model = config.GEMINI_MODEL || 'gemini-3.8-flash';
      response = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'x-goog-api-key': config.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } }, maxOutputTokens: 8192 }
        })
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = await response.json();
      content = data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
    } else {
      response = await request('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OPENAI_MODEL || 'gpt-4o-mini', instructions, input: text,
          text: { format: { type: 'json_schema', name: 'lease_analysis', strict: true, schema } }
        })
      });
      if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
      const data = await response.json();
      content = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    }
    if (!content) throw new Error('AI returned no analysis.');
    const result = JSON.parse(content);
    return { ...result, risk_score: Math.max(0, Math.min(100, result.risk_score)), mode: 'ai', provider: config.GEMINI_API_KEY ? 'Gemini' : 'OpenAI' };
  } finally { clearTimeout(timer); }
}
