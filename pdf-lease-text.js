import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractLeaseText(pdf) {
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  try {
    const document = await loading.promise;
    if (document.numPages > 100) throw Object.assign(new Error('PDFs are limited to 100 pages.'), { status: 413 });
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || '').join(' ').trim());
      page.cleanup();
      if (pages.join('\n\n').length > 80000) throw Object.assign(new Error('Extracted lease text is too long (80,000 characters max).'), { status: 413 });
    }
    const text = pages.join('\n\n').trim();
    if (text.length < 80) throw Object.assign(new Error('This PDF has too little selectable text. If it is scanned, use OCR first or paste the lease text.'), { status: 422 });
    return text;
  } finally {
    await loading.destroy();
  }
}
