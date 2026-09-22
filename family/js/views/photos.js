import { supabase, state, memberName } from '../supabase.js';
import { signPhotos, forgetPhoto } from '../media.js';
import { heartButton } from '../hearts.js';
import {
  el, clear, formatRelative, downscaleImage, toast, describeError,
} from '../util.js';

export async function renderPhotos(root) {
  const grid = el('div', { class: 'photo-grid' });

  root.append(
    el('header', { class: 'page-head' },
      el('h1', {}, 'Photos'),
      el('p', { class: 'page-head__sub' },
        'Only the family can see these. Pictures are shrunk in your browser before they upload, so they stay quick to load.'),
    ),
    renderUploader(() => loadGrid(grid)),
    el('section', { class: 'section' }, grid),
  );

  await loadGrid(grid);
}

function renderUploader(onUploaded) {
  const input = el('input', {
    class: 'input', type: 'file', accept: 'image/*', multiple: true, name: 'files',
  });
  const caption = el('input', {
    class: 'input', type: 'text', maxLength: 200, name: 'caption',
    placeholder: 'Thanksgiving in Easton',
  });
  const submit = el('button', { class: 'button', type: 'submit' }, 'Upload');
  const progress = el('p', { class: 'form__note' });

  const form = el('form', { class: 'card form' },
    el('h2', { class: 'card__title' }, 'Add photos'),
    el('div', { class: 'form__grid' },
      el('label', { class: 'field field--wide' }, el('span', {}, 'Pictures'), input),
      el('label', { class: 'field field--wide' }, el('span', {}, 'Caption (optional)'), caption),
    ),
    submit,
    progress,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const files = [...(input.files ?? [])];
    if (!files.length) {
      toast('Choose at least one picture first.', 'error');
      return;
    }

    submit.disabled = true;
    let done = 0;
    let failed = 0;

    for (const file of files) {
      progress.textContent = `Uploading ${done + failed + 1} of ${files.length}…`;
      try {
        const blob = await downscaleImage(file);
        const path = `${state.me.id}/${crypto.randomUUID()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
        if (uploadError) throw uploadError;

        const { error: rowError } = await supabase.from('photos').insert({
          uploaded_by: state.me.id,
          storage_path: path,
          caption: caption.value.trim() || null,
        });
        if (rowError) {
          // Do not leave an orphaned file behind if the row fails to save.
          await supabase.storage.from('photos').remove([path]);
          throw rowError;
        }

        done += 1;
      } catch (error) {
        failed += 1;
        toast(describeError(error), 'error');
      }
    }

    submit.disabled = false;
    progress.textContent = '';
    input.value = '';
    caption.value = '';

    if (done) toast(done === 1 ? 'Photo added.' : `${done} photos added.`, 'ok');
    if (done) await onUploaded();
  });

  return form;
}

async function loadGrid(grid) {
  clear(grid).append(el('p', { class: 'empty' }, 'Loading…'));

  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, caption, uploaded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    clear(grid).append(el('p', { class: 'empty' }, describeError(error)));
    return;
  }

  const photos = data ?? [];
  if (!photos.length) {
    clear(grid).append(el('p', { class: 'empty' }, 'No photos yet. Add the first one above.'));
    return;
  }

  const [urls, { data: reactions }] = await Promise.all([
    signPhotos(photos.map((photo) => photo.storage_path)),
    supabase.from('reactions').select('photo_id, member_id').in('photo_id', photos.map((p) => p.id)),
  ]);

  clear(grid).append(...photos.map((photo, index) => tile(
    photo,
    urls[photo.storage_path],
    reactions ?? [],
    () => openLightbox(photos, urls, index),
    grid,
  )));
}

function tile(photo, url, reactions, onOpen, grid) {
  const canDelete = state.me?.is_admin || photo.uploaded_by === state.me?.id;

  const figure = el('figure', { class: 'photo' },
    el('button', { class: 'photo__button', type: 'button', onClick: onOpen },
      el('img', {
        src: url ?? '',
        alt: photo.caption || `Photo from ${memberName(photo.uploaded_by)}`,
        loading: 'lazy',
      })),
    el('figcaption', { class: 'photo__caption' },
      photo.caption ? el('span', { class: 'photo__text' }, photo.caption) : null,
      el('span', { class: 'photo__meta' },
        `${memberName(photo.uploaded_by)} · ${formatRelative(photo.created_at)}`),
      el('div', { class: 'photo__actions' }, heartButton({ photo_id: photo.id }, reactions)),
    ),
    canDelete && el('button', {
      class: 'photo__delete', type: 'button', title: 'Delete this photo', 'aria-label': 'Delete this photo',
      onClick: async () => {
        if (!confirm('Delete this photo for everyone?')) return;
        const { error } = await supabase.from('photos').delete().eq('id', photo.id);
        if (error) return toast(describeError(error), 'error');
        await supabase.storage.from('photos').remove([photo.storage_path]);
        forgetPhoto(photo.storage_path);
        figure.remove();
        if (!grid.querySelector('.photo')) {
          clear(grid).append(el('p', { class: 'empty' }, 'No photos yet. Add the first one above.'));
        }
        toast('Photo deleted.', 'ok');
      },
    }, '×'),
  );

  return figure;
}

function openLightbox(photos, urls, startIndex) {
  let index = startIndex;

  const image = el('img', { class: 'lightbox__image', alt: '' });
  const caption = el('p', { class: 'lightbox__caption' });

  const show = () => {
    const photo = photos[index];
    image.src = urls[photo.storage_path] ?? '';
    image.alt = photo.caption || `Photo from ${memberName(photo.uploaded_by)}`;
    caption.textContent = [photo.caption, memberName(photo.uploaded_by)].filter(Boolean).join(' — ');
  };

  const step = (delta) => {
    index = (index + delta + photos.length) % photos.length;
    show();
  };

  const close = () => {
    overlay.remove();
    document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  };

  const overlay = el('div', {
    class: 'lightbox', role: 'dialog', 'aria-modal': 'true',
    onClick: (event) => { if (event.target === overlay) close(); },
  },
    el('button', { class: 'lightbox__close', type: 'button', 'aria-label': 'Close', onClick: close }, '×'),
    el('button', { class: 'lightbox__nav lightbox__nav--prev', type: 'button', 'aria-label': 'Previous', onClick: () => step(-1) }, '‹'),
    image,
    el('button', { class: 'lightbox__nav lightbox__nav--next', type: 'button', 'aria-label': 'Next', onClick: () => step(1) }, '›'),
    caption,
  );

  // Swiping sideways moves between pictures; a mostly-vertical drag is left
  // alone so the caption can still be scrolled.
  let touchStart = null;

  overlay.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  overlay.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  show();
  document.body.classList.add('is-locked');
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
}
