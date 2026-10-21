/* ==========================================================================
   Image preparation for articles and forum posts.

   Members pick photos straight off a phone or camera — often 3–10MB and
   4000px+ wide — which is far more than a web page needs. Every image is
   redrawn in the browser before upload: longest side capped at
   IMAGE_MAX_EDGE, re-encoded as JPEG (photos) or PNG (screenshots, diagrams),
   and shrunk further if it is still over IMAGE_TARGET_BYTES. Only JPEG and
   PNG are accepted; what gets uploaded is always one of those two.
   ========================================================================== */

export const IMAGE_ACCEPT = 'image/jpeg,image/png';
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_TARGET_BYTES = 500 * 1024;
const IMAGE_FLOOR_EDGE = 640;
const IMAGE_INPUT_MAX_BYTES = 25 * 1024 * 1024;

export const isImageMime = (mime) => mime === 'image/jpeg' || mime === 'image/png';

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be read as an image.`)); };
    img.src = url;
  });
}

function encode(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress that image.'))), mime, quality);
  });
}

/* Returns a new File (JPEG or PNG, resized and compressed) ready to upload.
   Throws an Error with a member-readable message for an unsupported or
   unreadable file. */
export async function prepareImage(file) {
  if (!isImageMime(file.type)) {
    throw new Error(`${file.name} is not a JPEG or PNG image.`);
  }
  if (file.size > IMAGE_INPUT_MAX_BYTES) {
    throw new Error(`${file.name} is too large to process (over 25MB).`);
  }

  const img = await loadBitmap(file);
  const mime = file.type;
  const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
  const ext = mime === 'image/png' ? 'png' : 'jpg';

  let edge = Math.min(IMAGE_MAX_EDGE, Math.max(img.naturalWidth, img.naturalHeight));
  let quality = 0.82;
  let blob;
  for (;;) {
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await encode(canvas, mime, quality);
    if (blob.size <= IMAGE_TARGET_BYTES || edge <= IMAGE_FLOOR_EDGE) break;
    if (mime === 'image/jpeg' && quality > 0.62) quality -= 0.1;
    else edge = Math.round(edge * 0.8);
  }

  /* Never make a small, already-web-sized file bigger by re-encoding it. */
  if (blob.size >= file.size && Math.max(img.naturalWidth, img.naturalHeight) <= IMAGE_MAX_EDGE) return file;
  return new File([blob], `${stem}.${ext}`, { type: mime });
}

/* "Honey Flow 3_final.JPG" → "Honey Flow 3 final" — a starting point for
   alt text the author can edit. */
export const altFromFilename = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/[[\]()*]/g, '').trim();
