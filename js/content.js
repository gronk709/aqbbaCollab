/* ==========================================================================
   Repository content loader.

   Real association content lives as files under content/repository/<subId>/ —
   Markdown articles plus document attachments — indexed by a manifest that
   tools/rebuild_manifest.py regenerates from disk. The manifest is fetched
   once at boot; article bodies are fetched when opened.

   This is the authoring path until the backend exists: add a file, run the
   script, commit, push. See the README's "Authoring repository content".
   ========================================================================== */

import { esc, icons } from './ui.js';

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

/* Same slugging tools.rebuild_manifest.py-style name → id conversion, used
   both here (to match a `doc:` link target against a document's display
   name) and by js/views/repository.js (to build the same document's actual
   anchor id) — the two have to agree on the exact same string. */
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* A `doc:some-slug` link target jumps to (scrolls to and briefly highlights)
   a document or link already listed in the sub-topic's Documents panel,
   rather than duplicating its URL in the article body — see README's
   "Authoring repository content". Matched by slugified display name, not by
   an opaque id, so an author writing prose can guess it (e.g. the
   attachment "Larry Connor - 'Queen Rearing Essentials'" is reachable as
   doc:queen-rearing-essentials, a substring match against its full slug —
   doesn't need to be exact). `docs` is the same merged file+db attachment
   list js/views/repository.js already builds (mergedDocuments); passed in
   here because this module has no idea a "documents panel" exists
   otherwise — it's just a Markdown renderer. */
function docLink(href, label, docs) {
  const target = href.slice(4).toLowerCase();
  const match = docs.find((d) => slugify(d.name).includes(target));
  /* class="doc-jump" (css/main.css) plus the same link icon the Documents
     panel already shows next to a link-type attachment — so the mention in
     the article visually reads as "this points to that list", not just an
     ordinary link. */
  return match
    ? `<a href="#" class="doc-jump" data-jump-doc="${esc(match.key)}">${icons.link}${label}</a>`
    : label;
}

function inline(md, docs) {
  return esc(md)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      if (/^(https?:\/\/|#\/|content\/)/.test(href)) {
        return `<a href="${href}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${label}</a>`;
      }
      if (href.startsWith('doc:')) return docLink(href, label, docs);
      return label;
    });
}

export function mdToHtml(md, docs = []) {
  const blocks = md.split(/\n{2,}/);
  return blocks.map((block) => {
    const b = block.trim();
    if (!b) return '';
    const h = b.match(/^(#{1,4})\s+(.*)$/);
    if (h) return `<h3>${inline(h[2], docs)}</h3>`;
    if (/^>\s?/.test(b)) {
      return `<blockquote>${inline(b.replace(/^>\s?/gm, '').trim(), docs)}</blockquote>`;
    }
    if (/^[-*]\s+/m.test(b) && b.split('\n').every((l) => /^[-*]\s+/.test(l.trim()))) {
      const items = b.split('\n').map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ''), docs)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (/^\d+\.\s+/m.test(b) && b.split('\n').every((l) => /^\d+\.\s+/.test(l.trim()))) {
      const items = b.split('\n').map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ''), docs)}</li>`).join('');
      return `<ol style="padding-left:var(--s5);margin:var(--s3) 0">${items}</ol>`;
    }
    return `<p>${inline(b.replace(/\n/g, ' '), docs)}</p>`;
  }).join('');
}
