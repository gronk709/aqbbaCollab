/* ==========================================================================
   Link/document/image attachment fields — shared between the public Forum
   (js/views/forum.js) and the Committee Forum (js/views/committeeForum.js),
   which both attach the same three kinds of thing to a post the same way.
   Pure form/DOM helpers: nothing here touches Supabase or decides who can
   see what, so sharing this module doesn't cross either forum's own
   confidentiality boundary — that's entirely in each one's own store.js
   functions and RLS.
   ========================================================================== */

import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES } from './store.js';
import { IMAGE_ACCEPT, prepareImage } from './images.js';
import { icons, toast } from './ui.js';

export function attachFieldsHTML() {
  return `
    <div class="field">
      <label>Links</label>
      <div data-links></div>
      <button type="button" class="btn btn-ghost btn-sm" data-add-link>${icons.link} Add a link</button>
    </div>
    <div class="field">
      <label>Documents</label>
      <input type="file" data-files multiple accept="${ATTACHMENT_ACCEPT}">
      <p class="tw:mt-1.5 tw:text-[13px] tw:text-propolis-40">Supported formats: PDF, Word, Spreadsheet, Slides, Text (Max 20MB)</p>
    </div>
    <div class="field">
      <label>Images</label>
      <input type="file" data-images multiple accept="${IMAGE_ACCEPT}">
      <p class="tw:mt-1.5 tw:text-[13px] tw:text-propolis-40">JPEG or PNG. Shown in the post and resized for the web automatically.</p>
    </div>`;
}

export function addLinkRow(list) {
  const row = document.createElement('div');
  row.className = 'tw:mb-2 tw:flex tw:items-center tw:gap-2';
  row.innerHTML = `
    <input type="url" placeholder="https://…" data-link-url class="tw:min-w-0 tw:flex-1">
    <input type="text" placeholder="Label (optional)" data-link-title class="tw:min-w-0 tw:flex-1">
    <button type="button" class="attach-remove tw:grid tw:size-9 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:border tw:border-comb-shade tw:bg-white tw:text-propolis-40 tw:transition tw:hover:border-propolis-40 tw:hover:text-propolis tw:[&_svg]:size-3.5" aria-label="Remove link">${icons.x}</button>`;
  row.querySelector('.attach-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

export function bindAttachFields(container) {
  const list = container.querySelector('[data-links]');
  container.querySelector('[data-add-link]').addEventListener('click', () => addLinkRow(list));
}

export function collectLinks(container) {
  const urls = [...container.querySelectorAll('[data-link-url]')];
  const titles = [...container.querySelectorAll('[data-link-title]')];
  return urls.map((input, i) => {
    const url = input.value.trim();
    if (!url) return null;
    const title = titles[i].value.trim();
    return { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, title };
  }).filter(Boolean);
}

/* Documents as chosen, plus any images — which are resized and compressed
   in the browser first (js/images.js), hence async. Returns null (after
   telling the member why) if an image can't be used, so the caller stops
   before posting anything. */
export async function collectFiles(container) {
  const input = container.querySelector('[data-files]');
  const docs = input && input.files ? [...input.files] : [];
  const imageInput = container.querySelector('[data-images]');
  const picked = imageInput && imageInput.files ? [...imageInput.files] : [];
  try {
    const images = [];
    for (const f of picked) images.push(await prepareImage(f));
    return [...docs, ...images];
  } catch (err) {
    toast(err.message);
    return null;
  }
}

/* Returns the offending file's name if anything is over the limit — the
   caller checks this before the actual publish/post call, so a too-big
   file fails fast with a clear message instead of an upload error deep
   inside saveAttachments. */
export function oversizeFile(files) {
  return files.find((f) => f.size > ATTACHMENT_MAX_BYTES)?.name;
}
