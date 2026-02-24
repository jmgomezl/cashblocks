import { useMemo } from 'react';
import type { CSSProperties } from 'react';

interface WikiPageProps {
  content: string;
  onClose: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(value: string): string {
  let formatted = escapeHtml(value);
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const isAnchor = href.startsWith('#');
    const isExternal = /^https?:\/\//i.test(href);
    const attrs = isAnchor ? '' : isExternal ? ' target="_blank" rel="noreferrer"' : ' target="_blank" rel="noreferrer"';
    return `<a href="${href}"${attrs}>${escapeHtml(label)}</a>`;
  });
  return formatted;
}

function slugify(text: string, registry: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
  const count = registry.get(base) ?? 0;
  registry.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-+:?\s*\|)+\s*$/.test(trimmed);
}

function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableOpened = false;
  const slugRegistry = new Map<string, number>();

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      if (tableOpened) {
        html.push('</tbody></table>');
      }
      inTable = false;
      tableOpened = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (!inCode) {
        closeLists();
        closeTable();
        inCode = true;
        codeBuffer = [];
      } else {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      closeTable();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      closeTable();
      const level = headingMatch[1].length;
      const raw = headingMatch[2].trim();
      const id = slugify(raw, slugRegistry);
      const text = applyInlineFormatting(raw);
      html.push(`<h${level} id="${id}">${text}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeLists();
      closeTable();
      html.push('<hr />');
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      closeTable();
      if (!inUl) {
        closeLists();
        inUl = true;
        html.push('<ul>');
      }
      html.push(`<li>${applyInlineFormatting(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (olMatch) {
      closeTable();
      if (!inOl) {
        closeLists();
        inOl = true;
        html.push('<ol>');
      }
      html.push(`<li>${applyInlineFormatting(olMatch[2])}</li>`);
      continue;
    }

    const nextLine = lines[i + 1];
    if (line.trim().startsWith('|') && nextLine && isTableSeparator(nextLine)) {
      closeLists();
      closeTable();
      const headers = parseTableRow(line).map((cell) => `<th>${applyInlineFormatting(cell)}</th>`).join('');
      html.push('<table><thead><tr>' + headers + '</tr></thead><tbody>');
      inTable = true;
      tableOpened = true;
      i += 1; // Skip separator line
      continue;
    }

    if (inTable && line.trim().startsWith('|')) {
      const cells = parseTableRow(line).map((cell) => `<td>${applyInlineFormatting(cell)}</td>`).join('');
      html.push('<tr>' + cells + '</tr>');
      continue;
    }

    closeTable();
    closeLists();
    html.push(`<p>${applyInlineFormatting(line)}</p>`);
  }

  closeLists();
  closeTable();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

const pageStyle: CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a14',
  color: '#d8d8df',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: CSSProperties = {
  padding: '20px 32px',
  borderBottom: '1px solid #1f1f2b',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const articleStyle: CSSProperties = {
  flex: 1,
  padding: '32px',
  overflow: 'auto',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  lineHeight: 1.7,
};

const buttonStyle: CSSProperties = {
  border: '1px solid #444',
  backgroundColor: '#1f1f2b',
  color: '#eaeaea',
  borderRadius: '6px',
  padding: '8px 16px',
  cursor: 'pointer',
};

const wikiStyles = `
.wiki-content h1 { margin: 0.8em 0 0.4em; font-size: 2rem; }
.wiki-content h2 { margin: 1.2em 0 0.5em; font-size: 1.6rem; color: #d9d9ff; }
.wiki-content h3 { margin: 1em 0 0.4em; font-size: 1.3rem; color: #bfbfe5; }
.wiki-content p { margin: 0.5em 0; }
.wiki-content ul, .wiki-content ol { margin: 0.5em 0 0.5em 1.6em; }
.wiki-content code { background:#1f1f2b; padding:2px 4px; border-radius:4px; font-family: 'Source Code Pro', monospace; }
.wiki-content pre { background:#0f0f1a; padding:16px; border-radius:8px; overflow:auto; border:1px solid #1f1f2b; }
.wiki-content table { border-collapse:collapse; width:100%; margin:1em 0; }
.wiki-content th, .wiki-content td { border:1px solid #2a2a3f; padding:8px 10px; text-align:left; }
.wiki-content tr:nth-child(even) { background-color:#131323; }
.wiki-content a { color:#7dd3fc; }
.wiki-content hr { border:0; border-top:1px solid #1f1f2b; margin:1.5em 0; }
`;

export default function WikiPage({ content, onClose }: WikiPageProps): JSX.Element {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div style={pageStyle}>
      <style>{wikiStyles}</style>
      <header style={headerStyle}>
        <div>
          <div style={{ color: '#8181ff', fontSize: '12px', letterSpacing: '0.1em' }}>Documentation</div>
          <h1 style={{ margin: 0 }}>CashBlocks Wiki</h1>
        </div>
        <button onClick={onClose} style={buttonStyle}>
          Back to Builder
        </button>
      </header>
      <article
        style={articleStyle}
        className="wiki-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
