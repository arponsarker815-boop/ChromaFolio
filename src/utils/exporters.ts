import JSZip from 'jszip';
import { getThemeForPage } from '../data/palettes';
import { EbookDocument } from '../types/ebook';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportAsEpub(book: EbookDocument): Promise<void> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  const metaInf = zip.folder('META-INF');
  metaInf?.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const oebps = zip.folder('OEBPS');
  oebps?.file(
    'styles.css',
    `body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.7;
  margin: 0;
  padding: 1.5rem;
}
.colourful-page {
  border-radius: 14px;
  padding: 2rem;
  border: 1px solid rgba(0,0,0,0.08);
  min-height: 85vh;
}
.folio {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 1.25rem;
  display: flex;
  justify-content: space-between;
}
h1 { font-size: 1.6rem; margin: 0 0 1rem 0; line-height: 1.25; }
h2 { font-size: 1.2rem; margin: 1.25rem 0 0.6rem 0; }
p { margin: 0 0 0.95rem 0; }
blockquote {
  margin: 1.25rem 0;
  padding: 0.9rem 1.2rem;
  border-radius: 10px;
  font-style: italic;
}
ul { padding-left: 1.4rem; margin: 0.75rem 0 1rem 0; }
li { margin-bottom: 0.45rem; }
table.scan-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.88rem; }
table.scan-table th, table.scan-table td { border: 1px solid rgba(0,0,0,0.2); padding: 0.45rem 0.6rem; text-align: left; }
figure.scan-diagram { margin: 1.1rem 0; text-align: center; }
figure.scan-diagram img { max-width: 100%; height: auto; border-radius: 8px; }
figure.scan-diagram figcaption { font-size: 0.8rem; opacity: 0.8; margin-top: 0.4rem; }
aside.scan-footnote { margin-top: 0.85rem; padding-top: 0.55rem; border-top: 1px solid rgba(0,0,0,0.14); font-size: 0.8rem; opacity: 0.85; }
`
  );

  const manifestItems: string[] = [
    '<item id="css" href="styles.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  ];
  const spineItems: string[] = [];

  for (const page of book.pages) {
    const theme = getThemeForPage(book.paletteId, page.pageNumber, page.customThemeIndex);
    const fileName = `page-${page.pageNumber}.xhtml`;
    manifestItems.push(
      `<item id="p${page.pageNumber}" href="${fileName}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`<itemref idref="p${page.pageNumber}"/>`);

    const blocksHtml = page.blocks
      .map((block, bIdx) => {
        const safe = escapeXml(block.text);
        if (block.type === 'heading') {
          return `<h1 style="color:${theme.accentColor};">${safe}</h1>`;
        }
        if (block.type === 'subheading') {
          return `<h2 style="color:${theme.accentColor};">${safe}</h2>`;
        }
        if (block.type === 'quote') {
          return `<blockquote style="background:${theme.calloutBg};color:${theme.inkColor};border:1px solid ${theme.borderColor};">${safe}</blockquote>`;
        }
        if (block.type === 'formula') {
          return `<div style="background:${theme.calloutBg};color:${theme.inkColor};border:1px solid ${theme.accentColor};border-radius:10px;padding:0.85rem 1.1rem;margin:1rem 0;font-family:monospace;font-weight:600;"><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:${theme.accentColor};margin-bottom:0.25rem;">Formula / Key Rule</div><div>${safe}</div></div>`;
        }
        if (block.type === 'table') {
          if (block.tableRows && block.tableRows.length > 0) {
            const [headRow, ...bodyRows] = block.tableRows;
            const headHtml = `<thead><tr>${headRow
              .map((cell) => `<th>${escapeXml(cell)}</th>`)
              .join('')}</tr></thead>`;
            const bodyHtml =
              bodyRows.length > 0
                ? `<tbody>${bodyRows
                    .map(
                      (row) =>
                        `<tr>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`
                    )
                    .join('')}</tbody>`
                : '';
            return `<table class="scan-table">${headHtml}${bodyHtml}</table>`;
          }
          return `<pre style="background:${theme.calloutBg};padding:0.75rem;border-radius:8px;overflow:auto;">${safe}</pre>`;
        }
        if (block.type === 'diagram') {
          let imgMarkup = '';
          if (block.imageDataUrl) {
            const m = block.imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
            if (m) {
              const ext = m[1].toLowerCase() === 'png' ? 'png' : m[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
              const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
              const imgPath = `images/diag-p${page.pageNumber}-${bIdx}.${ext}`;
              const rawBin = atob(m[2]);
              const bytes = new Uint8Array(rawBin.length);
              for (let k = 0; k < rawBin.length; k++) bytes[k] = rawBin.charCodeAt(k);
              oebps?.file(imgPath, bytes);
              manifestItems.push(
                `<item id="img-p${page.pageNumber}-${bIdx}" href="${imgPath}" media-type="${mime}"/>`
              );
              imgMarkup = `<img src="${imgPath}" alt="${safe}"/>`;
            }
          }
          return `<figure class="scan-diagram">${imgMarkup}<figcaption>${safe}</figcaption></figure>`;
        }
        if (block.type === 'footnote') {
          return `<aside class="scan-footnote">${safe}</aside>`;
        }
        if (block.type === 'list-item') {
          return `<ul><li>${safe}</li></ul>`;
        }
        return `<p>${safe}</p>`;
      })
      .join('\n');

    oebps?.file(
      fileName,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(book.title)} — Page ${page.pageNumber}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body style="background:${theme.paperBg};color:${theme.inkColor};">
  <div class="colourful-page" style="background:${theme.paperBg};border-color:${theme.borderColor};">
    <div class="folio" style="color:${theme.mutedInk};">
      <span>${escapeXml(page.chapterTitle)}</span>
      <span>Page ${page.pageNumber} / ${book.totalPages}</span>
    </div>
    ${blocksHtml}
  </div>
</body>
</html>`
    );
  }

  const navLinks = book.chapters
    .map(
      (ch) =>
        `<li><a href="page-${ch.pageNumber}.xhtml">${escapeXml(ch.title)} (p.${ch.pageNumber})</a></li>`
    )
    .join('\n');

  oebps?.file(
    'nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>${navLinks}</ol>
  </nav>
</body>
</html>`
  );

  oebps?.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${escapeXml(book.id)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.author)}</dc:creator>
    <dc:language>${escapeXml(book.activeLanguage && book.activeLanguage !== 'original' ? book.activeLanguage : 'en')}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`
  );

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const safeSlug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'ebook';
  downloadBlob(blob, `${safeSlug}-colourful.epub`);
}

export function exportAsStandaloneHtml(book: EbookDocument): void {
  const pagesHtml = book.pages
    .map((page) => {
      const theme = getThemeForPage(book.paletteId, page.pageNumber, page.customThemeIndex);
      const blocks = page.blocks
        .map((b) => {
          const text = b.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          if (b.type === 'heading') {
            return `<h2 style="color:${theme.accentColor};font-family:Georgia,serif;font-size:1.75rem;margin:0 0 1rem 0;">${text}</h2>`;
          }
          if (b.type === 'subheading') {
            return `<h3 style="color:${theme.accentColor};font-size:1.2rem;margin:1.25rem 0 0.5rem 0;">${text}</h3>`;
          }
          if (b.type === 'quote') {
            return `<blockquote style="background:${theme.calloutBg};border:1px solid ${theme.borderColor};padding:1rem 1.25rem;border-radius:12px;margin:1.2rem 0;font-style:italic;">${text}</blockquote>`;
          }
          if (b.type === 'formula') {
            return `<div style="background:${theme.calloutBg};border:1px solid ${theme.accentColor};padding:1rem 1.25rem;border-radius:12px;margin:1.2rem 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${theme.accentColor};margin-bottom:4px;">Formula / Key Rule</div><div>${text}</div></div>`;
          }
          if (b.type === 'table' && b.tableRows && b.tableRows.length > 0) {
            const rowsHtml = b.tableRows
              .map(
                (row, rIdx) =>
                  `<tr>${row
                    .map((cell) => {
                      const cSafe = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return rIdx === 0
                        ? `<th style="border:1px solid ${theme.borderColor};padding:6px 10px;text-align:left;background:${theme.calloutBg};">${cSafe}</th>`
                        : `<td style="border:1px solid ${theme.borderColor};padding:6px 10px;">${cSafe}</td>`;
                    })
                    .join('')}</tr>`
              )
              .join('');
            return `<table style="width:100%;border-collapse:collapse;margin:1.2rem 0;font-size:14px;">${rowsHtml}</table>`;
          }
          if (b.type === 'diagram') {
            const imgTag = b.imageDataUrl
              ? `<img src="${b.imageDataUrl}" alt="${text}" style="max-width:100%;border-radius:10px;margin-bottom:8px;" />`
              : '';
            return `<figure style="margin:1.2rem 0;text-align:center;">${imgTag}<figcaption style="font-size:13px;color:${theme.mutedInk};">${text}</figcaption></figure>`;
          }
          if (b.type === 'footnote') {
            return `<aside style="margin-top:0.8rem;padding-top:0.5rem;border-top:1px solid ${theme.borderColor};font-size:13px;color:${theme.mutedInk};">${text}</aside>`;
          }
          if (b.type === 'list-item') {
            return `<li style="margin:0.4rem 0 0.4rem 1.4rem;">${text}</li>`;
          }
          return `<p style="margin:0 0 1rem 0;">${text}</p>`;
        })
        .join('\n');

      return `<article class="ebook-page" data-page="${page.pageNumber}" style="background:${theme.paperGradient};color:${theme.inkColor};border:1px solid ${theme.borderColor};">
        <header style="display:flex;justify-content:space-between;font-size:12px;color:${theme.mutedInk};border-bottom:1px solid ${theme.borderColor};padding-bottom:10px;margin-bottom:24px;">
          <span>${page.chapterTitle}</span>
          <span>Page ${page.pageNumber} of ${book.totalPages}</span>
        </header>
        ${blocks}
      </article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="${book.activeLanguage && book.activeLanguage !== 'original' ? book.activeLanguage : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${book.title} — Colourful Interactive eBook</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, Georgia, serif; background:#18181b; color:#fafafa; padding:24px; }
    .shell { max-width:820px; margin:0 auto; }
    .bar { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#27272a; border-radius:12px; margin-bottom:20px; position:sticky; top:12px; z-index:10; }
    .btn { background:#f59e0b; color:#18181b; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer; }
    .ebook-page { display:none; padding:48px 54px; border-radius:18px; line-height:1.75; font-size:17px; box-shadow:0 24px 60px rgba(0,0,0,0.4); }
    .ebook-page.active { display:block; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="bar">
      <div><strong>${book.title}</strong> · <span id="counter">Page 1 of ${book.totalPages}</span></div>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="go(-1)">Previous</button>
        <button class="btn" onclick="go(1)">Next</button>
      </div>
    </div>
    ${pagesHtml}
  </div>
  <script>
    let current = 1;
    const total = ${book.totalPages};
    function show(n) {
      current = Math.max(1, Math.min(total, n));
      document.querySelectorAll('.ebook-page').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.page) === current);
      });
      document.getElementById('counter').textContent = 'Page ' + current + ' of ' + total;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function go(d) { show(current + d); }
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    });
    show(1);
  </script>
</body>
</html>`;

  const safeSlug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'ebook';
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeSlug}-colourful.html`);
}

export function exportNotesAsMarkdown(book: EbookDocument): void {
  const lines: string[] = [
    `# ${book.title} — Reading Notes & Highlights`,
    `Author: ${book.author}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    '',
    '## Bookmarks',
  ];

  if (book.bookmarks.length === 0) {
    lines.push('_No bookmarks saved._');
  } else {
    for (const bm of book.bookmarks) {
      lines.push(`- **Page ${bm.pageNumber}**: ${bm.label}`);
    }
  }

  lines.push('', '## Highlights & Margin Notes');
  if (book.highlights.length === 0) {
    lines.push('_No highlights saved._');
  } else {
    for (const h of book.highlights) {
      lines.push(`### Page ${h.pageNumber} (${h.color})`);
      lines.push(`> ${h.text}`);
      if (h.note) {
        lines.push(`- **Note**: ${h.note}`);
      }
      lines.push('');
    }
  }

  lines.push('', '## Study Cheat-Sheets');
  const studyNotes = book.studyNotes ?? [];
  if (studyNotes.length === 0) {
    lines.push('_No study sheets saved._');
  } else {
    for (const sn of studyNotes) {
      lines.push(`### ${sn.title} (Page ${sn.pageNumber})`);
      lines.push(sn.content);
      lines.push('');
    }
  }

  lines.push('', '## Flashcards');
  const flashcards = book.flashcards ?? [];
  if (flashcards.length === 0) {
    lines.push('_No flashcards saved._');
  } else {
    for (const fc of flashcards) {
      lines.push(`- **Q (p.${fc.pageNumber}):** ${fc.front}`);
      lines.push(`  - **A:** ${fc.back}`);
    }
  }

  const safeSlug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'ebook';
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `${safeSlug}-notes.md`);
}

export function exportFlashcardsAsCsv(book: EbookDocument): void {
  const flashcards = book.flashcards ?? [];
  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const rows = [
    ['Front', 'Back', 'Page', 'Mastered'].join(','),
    ...flashcards.map((fc) =>
      [
        escapeCsv(fc.front),
        escapeCsv(fc.back),
        String(fc.pageNumber),
        fc.mastered ? 'Yes' : 'No',
      ].join(',')
    ),
  ];
  const safeSlug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'ebook';
  downloadBlob(
    new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `${safeSlug}-flashcards.csv`
  );
}
