import { supabase, state } from './supabase.js';
import { el, toast, describeError } from './util.js';

// One heart per person per item, used by both posts and photos.
// `target` is either { post_id } or { photo_id }.
export function heartButton(target, reactions) {
  const key = target.post_id ? 'post_id' : 'photo_id';
  const id = target[key];
  let mine = reactions.some((row) => row[key] === id && row.member_id === state.me?.id);
  let count = reactions.filter((row) => row[key] === id).length;

  const button = el('button', { class: 'heart', type: 'button' });

  const paint = () => {
    button.classList.toggle('heart--on', mine);
    button.textContent = count ? `♥ ${count}` : '♥';
    button.setAttribute('aria-label', mine ? 'Remove your heart' : 'Add a heart');
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    const wasMine = mine;

    // Paint first so the tap feels instant, then roll back if the write fails.
    mine = !mine;
    count += wasMine ? -1 : 1;
    paint();

    const { error } = wasMine
      ? await supabase.from('reactions').delete().eq(key, id).eq('member_id', state.me.id)
      : await supabase.from('reactions').insert({ ...target, member_id: state.me.id });

    if (error) {
      mine = wasMine;
      count += wasMine ? 1 : -1;
      paint();
      toast(describeError(error), 'error');
    }

    button.disabled = false;
  });

  paint();
  return button;
}
