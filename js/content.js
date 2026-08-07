/* ==========================================================================
   Repository content loader.

   Real association content lives as files under content/repository/<subId>/ —
   Markdown articles plus document attachments — indexed by a manifest that
   tools/rebuild_manifest.py regenerates from disk. The manifest is fetched
   once at boot; article bodies are fetched when opened.

   This is the authoring path until the backend exists: add a file, run the
   script, commit, push. See the README's "Authoring repository content".
   ========================================================================== */

import { esc } from './ui.js';

let manifest = {};

export async function loadContent() {
  try {
    const res = await fetch('content/repository/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch {
    /* No manifest (fresh checkout before any content, or file:// misuse):
       the repository pages fall back to their seeded placeholders. */
    manifest = {};
  }
}

export const contentFor = (subId) => manifest[subId] || null;

export function articleFor(subId, slug) {
  const c = manifest[subId];
  return c ? c.articles.find((a) => a.slug === slug) : null;
}

export async function fetchArticleBody(article) {
  const res = await fetch(article.file);
  if (!res.ok) throw new Error(`Could not load ${article.file}`);
  const text = await res.text();
  return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

/* --------------------------------------------------------------------------
   Minimal Markdown → HTML. Covers what association articles actually use:
   ## headings, paragraphs, **bold**, *italic*, links, lists, blockquotes.
   Everything is escaped first; the renderer only reintroduces its own tags.
   -------------------------------------------------------------------------- */

function inline(md) {
  return esc(md)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) =>
      /^(https?:\/\/|#\/|content\/)/.test(href)
        ? `<a href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${label}</a>`
        : label);
}

export function mdToHtml(md) {
  const blocks = md.split(/\n{2,}/);
  return blocks.map((block) => {
    const b = block.trim();
    if (!b) return '';
    const h = b.match(/^(#{1,4})\s+(.*)$/);
    if (h) return `<h3>${inline(h[2])}</h3>`;
    if (/^>\s?/.test(b)) {
      return `<blockquote>${inline(b.replace(/^>\s?/gm, '').trim())}</blockquote>`;
    }
    if (/^[-*]\s+/m.test(b) && b.split('\n').every((l) => /^[-*]\s+/.test(l.trim()))) {
      const items = b.split('\n').map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ''))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (/^\d+\.\s+/m.test(b) && b.split('\n').every((l) => /^\d+\.\s+/.test(l.trim()))) {
      const items = b.split('\n').map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ''))}</li>`).join('');
      return `<ol style="padding-left:var(--s5);margin:var(--s3) 0">${items}</ol>`;
    }
    return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
  }).join('');
}
