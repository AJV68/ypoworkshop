import { supabase } from './supabase.js';

const cache = new Map();

// Photo files live in a private bucket, so every <img> needs a short-lived
// signed link. They are requested in one batch and cached for the hour they
// remain valid.
export async function signPhotos(paths) {
  const missing = paths.filter((path) => !cache.has(path));

  if (missing.length) {
    const { data, error } = await supabase.storage.from('photos').createSignedUrls(missing, 3600);
    if (error) throw error;
    for (const entry of data ?? []) {
      if (entry.signedUrl) cache.set(entry.path, entry.signedUrl);
    }
  }

  return Object.fromEntries(paths.map((path) => [path, cache.get(path) ?? null]));
}

export function forgetPhoto(path) {
  cache.delete(path);
}
