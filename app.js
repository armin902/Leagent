import { maxLeaseCharacters, maxTextFileBytes, maxPdfBytes } from './lease-limits.js';

const $ = selector => document.querySelector(selector);
const leaseText = $('#leaseText');
const resultPanel = $('#resultPanel');
const roommates = ['Unassigned', 'Alex', 'Sam', 'Jordan'];
let items = [
  { id: 1, name: 'Shower curtain', assignedTo: 'Unassigned', shared: true },
  { id: 2, name: 'Trash cans', assignedTo: 'Alex', shared: true },
  { id: 3, name: 'Kitchen basics', assignedTo: 'Sam', shared: true },
  { id: 4, name: 'Cleaning supplies', assignedTo: 'Jordan', shared: true }
];

function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function add(parent, tag, className, value) { const node = el(tag, className, value); parent.append(node); return node; }

if ($('#sampleBtn')) {
$('#sampleBtn').addEventListener('click', async () => {
  try { leaseText.value = await (await fetch('/sample-lease.txt')).text(); leaseText.focus(); }
  catch { alert('Could not load sample lease.'); }
});
$('#leaseFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  const status = $('#uploadStatus');
  const pdf = /\.pdf$/i.test(file.name);
  if (!/\.(pdf|txt|md)$/i.test(file.name)) { status.textContent = 'Please use a PDF, .txt, or .md file.'; return; }
  if (file.size > (pdf ? maxPdfBytes : maxTextFileBytes)) { status.textContent = pdf ? 'PDFs are limited to 15 MB.' : 'Text files are limited to 1 MB.'; return; }
  status.textContent = pdf ? 'Extracting text from PDF…' : 'Reading file…';
  try {
    if (pdf) {
      const response = await fetch('/api/extract-pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read this PDF.');
      leaseText.value = data.text;
    } else {
      const text = await file.text();
      if (text.length > maxLeaseCharacters) throw new Error(`Lease text is limited to ${maxLeaseCharacters.toLocaleString()} characters.`);
      leaseText.value = text;
    }
    status.textContent = `${file.name} is ready to analyze.`;
  } catch (error) { status.textContent = error.message; }
});
$('#analyzeBtn').addEventListener('click', async () => {
  const text = leaseText.value.trim();
  if (text.length < 80) { alert('Please paste at least 80 characters of lease text.'); leaseText.focus(); return; }
  if (text.length > maxLeaseCharacters) { alert(`Lease text is limited to ${maxLeaseCharacters.toLocaleString()} characters.`); leaseText.focus(); return; }
  const button = $('#analyzeBtn'); button.disabled = true; button.textContent = 'Analyzing lease…';
  resultPanel.replaceChildren(); const loading = add(resultPanel, 'div', 'empty-state'); add(loading, 'span', 'empty-icon', '✦'); add(loading, 'h3', '', 'Reading your lease…'); add(loading, 'p', '', 'Looking for key terms and questions worth asking.');
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Analysis failed.');
    renderResult(data);
  } catch (error) { resultPanel.replaceChildren(); const box = add(resultPanel, 'div', 'empty-state'); add(box, 'h3', '', 'Analysis unavailable'); add(box, 'p', '', error.message); }
  finally { button.disabled = false; button.innerHTML = 'Analyze lease <span>→</span>'; }
});

function renderResult(data) {
  resultPanel.replaceChildren();
  const top = add(resultPanel, 'div', 'result-top'); add(top, 'h3', '', 'Lease snapshot'); add(top, 'span', 'mode-badge', data.mode === 'ai' ? `✦ ${data.provider || 'LIVE AI'} ANALYSIS` : 'LOCAL PROTOTYPE SCAN');
  if (data.notice) add(resultPanel, 'div', 'notice', data.notice);
  const scoreRow = add(resultPanel, 'div', 'score-row'); const score = Number(data.risk_score) || 0; add(scoreRow, 'div', `score ${score >= 60 ? 'high' : score < 25 ? 'low' : ''}`, String(score)); const scoreCopy = add(scoreRow, 'div'); add(scoreCopy, 'strong', '', 'Review priority / 100'); add(scoreCopy, 'small', '', 'A guide to which terms deserve a closer look, not a legal rating.');
  add(resultPanel, 'p', 'summary', data.summary || 'No summary available.');
  add(resultPanel, 'div', 'result-title', 'Clauses to review');
  if (!data.clauses?.length) add(resultPanel, 'p', 'summary', 'No matching clauses found. Read the full lease carefully.');
  for (const clause of data.clauses || []) {
    const card = add(resultPanel, 'article', `clause ${clause.rating}`); const head = add(card, 'div', 'clause-head'); add(head, 'strong', '', clause.label); add(head, 'span', `rating ${clause.rating}`, clause.rating); add(card, 'p', '', clause.explanation); add(card, 'blockquote', '', clause.text); if (clause.question_for_landlord) add(card, 'div', 'question', `Ask: ${clause.question_for_landlord}`);
  }
  add(resultPanel, 'div', 'result-title', 'Sublease status'); add(resultPanel, 'p', 'summary', data.sublease_allowed || 'not stated');
  if (data.missing_clauses?.length) { add(resultPanel, 'div', 'result-title', 'Possibly missing'); const list = add(resultPanel, 'ul', 'detail-list'); for (const value of data.missing_clauses) add(list, 'li', '', value); }
  if (data.key_dates_and_fees?.length) { add(resultPanel, 'div', 'result-title', 'Dates & fees mentioned'); const list = add(resultPanel, 'ul', 'detail-list'); for (const value of data.key_dates_and_fees) add(list, 'li', '', `${value.item}: ${value.amount_or_date}`); }
  add(resultPanel, 'div', 'notice', `${data.confidence || 'Review confidence is limited.'} This is not legal advice.`);
}
}

function renderBoard() {
  const board = $('#boardColumns'); board.replaceChildren();
  for (const person of roommates) {
    const column = add(board, 'div', 'board-column'); column.dataset.person = person;
    const head = add(column, 'div', 'column-head'); add(head, 'strong', '', person); add(head, 'span', '', String(items.filter(item => item.assignedTo === person).length));
    column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('dragover'); });
    column.addEventListener('dragleave', () => column.classList.remove('dragover'));
    column.addEventListener('drop', event => { event.preventDefault(); column.classList.remove('dragover'); const id = Number(event.dataTransfer.getData('text/plain')); const item = items.find(item => item.id === id); if (item) { item.assignedTo = person; renderBoard(); } });
    for (const item of items.filter(item => item.assignedTo === person)) {
      const card = add(column, 'div', 'item-card'); card.draggable = true; card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(item.id)));
      add(card, 'span', 'item-name', item.name); add(card, 'span', 'item-meta', item.shared ? 'Shared item' : 'Personal item');
      const select = add(card, 'select'); select.setAttribute('aria-label', `Assign ${item.name}`);
      for (const name of roommates) { const option = add(select, 'option', '', name); option.value = name; option.selected = name === person; }
      select.addEventListener('change', () => { item.assignedTo = select.value; renderBoard(); });
    }
  }
}

if ($('#generateBtn')) {
$('#generateBtn').addEventListener('click', () => {
  const bedrooms = Number($('#bedrooms').value); const furnished = $('#furnished').value === 'yes';
  const names = ['Shower curtain', 'Trash cans', 'Cleaning supplies', 'Vacuum', 'First-aid kit', 'Kitchen basics', 'Wi-Fi router', 'Toilet paper', 'Laundry detergent', 'Dish soap'];
  if (!furnished) names.push('Sofa', 'Dining table', ...Array.from({ length: bedrooms }, (_, index) => `Bedroom ${index + 1} lamp`));
  items = names.map((name, index) => ({ id: index + 1, name, assignedTo: index < 4 ? roommates[index] : 'Unassigned', shared: !name.startsWith('Bedroom') })); renderBoard();
});
renderBoard();
}
