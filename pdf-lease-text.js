import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { maxLeaseCharacters, maxPdfPages } from './lease-limits.js';

export async function extractLeaseText(pdf) {
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  try {
    const document = await loading.promise;
    if (document.numPages > maxPdfPages) throw Object.assign(new Error(`PDFs are limited to ${maxPdfPages} pages.`), { status: 413 });
    const pages = [];
    let length = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || '').join(' ').trim();
      length += text.length + (pages.length ? 2 : 0);
      page.cleanup();
      if (length > maxLeaseCharacters) throw Object.assign(new Error(`Extracted lease text is too long (${maxLeaseCharacters.toLocaleString()} characters max).`), { status: 413 });
      pages.push(text);
    }
    const text = pages.join('\n\n').trim();
    if (text.length < 80) throw Object.assign(new Error('This PDF has too little selectable text. If it is scanned, use OCR first or paste the lease text.'), { status: 422 });
    return text;
  } finally {
    await loading.destroy();
  }
}
