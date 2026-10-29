const rules = [
  { re: /does not specify.{0,70}security deposit.{0,70}return/i, rating: 'yellow', label: 'Deposit return details', explanation: 'The lease does not tell you when the deposit will be returned.', question: 'When will the deposit be returned, and what deductions are possible?' },
  { re: /automat(?:ic|ically).*renew|renew.*automat/i, rating: 'red', label: 'Automatic renewal', explanation: 'The lease may extend unless you give notice before the deadline.', question: 'What is the exact deadline and method for opting out of renewal?' },
  { re: /(?:all|any) repairs|repairs.*regardless of cause/i, rating: 'red', label: 'Repair costs', explanation: 'This wording may put unusually broad repair costs on you.', question: 'Which repairs are the landlord’s responsibility?' },
  { re: /enter.*(?:at any time|without notice)/i, rating: 'red', label: 'Entry without notice', explanation: 'The landlord claims broad access to the unit.', question: 'How much notice will you give before nonemergency entry?' },
  { re: /late fee|penalt(?:y|ies)/i, rating: 'yellow', label: 'Late payment', explanation: 'A missed payment could add fees. Confirm the amount and grace period.', question: 'Is there a grace period, and can the fee increase?' },
  { re: /subleas|sublet/i, rating: 'yellow', label: 'Sublease', explanation: 'Subleasing depends on the precise conditions in this clause.', question: 'What steps and criteria apply to sublease approval?' },
  { re: /nonrefundable|administration fee/i, rating: 'yellow', label: 'Upfront fee', explanation: 'This payment may not be returned at move-out.', question: 'What does this fee cover, and is any part refundable?' },
  { re: /\b(?:60|90|120) days.{0,35}notice/i, rating: 'yellow', label: 'Notice deadline', explanation: 'You may need to act well before the lease ends.', question: 'What date must notice be received, and how should I send it?' },
  { re: /monthly rent|rent is|rent of/i, rating: 'green', label: 'Rent', explanation: 'The lease states a rent amount and payment timing.', question: 'What payment methods are accepted?' },
  { re: /security deposit/i, rating: 'green', label: 'Security deposit', explanation: 'The lease mentions a deposit; confirm any return conditions.', question: 'When and how will the deposit be returned?' }
];

export function analyzeOffline(text) {
  const pieces = text.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
  const clauses = [];
  for (const piece of pieces) {
    for (const rule of rules) {
      if (rule.re.test(piece) && !(rule.label === 'Security deposit' && /does not specify/i.test(piece))) clauses.push({ text: piece.slice(0, 330), rating: rule.rating, label: rule.label, explanation: rule.explanation, question_for_landlord: rule.question });
    }
  }
  const red = clauses.filter(c => c.rating === 'red').length;
  const yellow = clauses.filter(c => c.rating === 'yellow').length;
  const amountMatches = [...text.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map(m => m[0].replace(/,$/, ''));
  const missing = [];
  if (!/deposit.{0,70}return|return.{0,70}deposit/i.test(text) || /does not specify.{0,70}deposit.{0,70}return/i.test(text)) missing.push('Security deposit return timing is not clearly stated.');
  if (!/maintenan|repair/i.test(text)) missing.push('Maintenance and repair responsibilities are not clearly stated.');
  if (!/subleas|sublet/i.test(text)) missing.push('Subleasing is not addressed.');
  const sublease = /subleas|sublet/i.test(text) ? (/written consent|written approval|prior approval/i.test(text) ? 'with approval' : (/prohibit|not allowed/i.test(text) ? 'no' : 'unclear')) : 'not stated';
  return {
    summary: `This lease scan found ${red} high-concern and ${yellow} review-worthy clause${yellow === 1 ? '' : 's'}. ${amountMatches.length ? `It mentions payments of ${[...new Set(amountMatches)].join(', ')}.` : 'No dollar amounts were identified.'} Read the original wording and confirm any open questions before signing.`,
    risk_score: Math.min(100, red * 24 + yellow * 9 + missing.length * 6),
    clauses: clauses.slice(0, 12),
    missing_clauses: missing,
    sublease_allowed: sublease,
    key_dates_and_fees: [...new Set(amountMatches)].map(value => ({ item: 'Amount mentioned in lease', amount_or_date: value })),
    mode: 'offline',
    confidence: 'Limited: keyword scan; clauses may be missed or misread.'
  };
}
