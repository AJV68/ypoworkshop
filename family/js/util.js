// Small DOM builder. Children may be nodes, strings, or null/false to skip.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates in the database are plain calendar dates (no timezone). Parsing them
// as local noon avoids the classic off-by-one-day shift.
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(iso, days) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDate(iso, options = { month: 'short', day: 'numeric' }) {
  return parseDate(iso).toLocaleDateString(undefined, options);
}

export function formatDateRange(startISO, endISO) {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  const sameYear = start.getFullYear() === end.getFullYear();
  const thisYear = start.getFullYear() === new Date().getFullYear();

  if (startISO === endISO) {
    return formatDate(startISO, { month: 'short', day: 'numeric', year: thisYear ? undefined : 'numeric' });
  }

  const startText = formatDate(startISO, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const endText = formatDate(endISO, {
    month: 'short',
    day: 'numeric',
    year: thisYear && sameYear ? undefined : 'numeric',
  });

  return `${startText} – ${endText}`;
}

export function formatNights(startISO, endISO) {
  const nights = Math.round((parseDate(endISO) - parseDate(startISO)) / DAY_MS);
  if (nights <= 0) return 'day trip';
  return nights === 1 ? '1 night' : `${nights} nights`;
}

export function formatRelative(timestamp) {
  const then = new Date(timestamp);
  const minutes = Math.round((Date.now() - then) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))}d ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function stayLocation(stay, places) {
  if (stay.place_id) {
    const place = places.find((p) => p.id === stay.place_id);
    if (place) return place.name;
  }
  return stay.custom_location ?? 'Somewhere';
}

export function isActive(stay, iso = todayISO()) {
  return stay.starts_on <= iso && stay.ends_on >= iso;
}

// Shrink a photo in the browser before upload. Family phone cameras produce
// 4-8MB files; this keeps them well under a megabyte without visible loss,
// which is what makes the free storage tier last.
export async function downscaleImage(file, maxEdge = 2000, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

export function toast(message, tone = 'info') {
  const host = document.getElementById('toasts');
  const node = el('div', { class: `toast toast--${tone}`, role: 'status' }, message);
  host.append(node);
  setTimeout(() => node.classList.add('toast--out'), 3600);
  setTimeout(() => node.remove(), 4200);
}

export function describeError(error) {
  const message = error?.message ?? String(error);
  if (message.includes('not_on_family_list')) {
    return 'That email is not on the family list yet. Ask an admin to add it first.';
  }
  if (message.includes('Database error saving new user')) {
    return 'That email is not on the family list yet. Ask an admin to add it first.';
  }
  if (message.includes('row-level security')) {
    return 'You do not have permission to do that.';
  }
  return message;
}
