import { supabase, state, memberName } from '../supabase.js';
import {
  el, clear, todayISO, formatDateRange, formatNights, stayLocation, isActive, toast, describeError,
} from '../util.js';

export async function renderTravel(root) {
  const listHost = el('div', {});

  root.append(
    el('header', { class: 'page-head' },
      el('h1', {}, 'Travel'),
      el('p', { class: 'page-head__sub' },
        'Where everyone is, and where everyone is going. Anyone can add a trip, including on someone else’s behalf.'),
    ),
    renderForm(() => loadList(listHost)),
    listHost,
  );

  await loadList(listHost);
}

function renderForm(onSaved) {
  const memberSelect = el('select', { class: 'input', name: 'member', required: true },
    state.members.map((member) => el('option', {
      value: member.id,
      selected: member.id === state.me?.id,
    }, member.display_name || member.email)));

  const placeSelect = el('select', { class: 'input', name: 'place' },
    state.places.map((place) => el('option', { value: place.id }, place.name)),
    el('option', { value: 'other' }, 'Somewhere else…'));

  const customInput = el('input', {
    class: 'input', name: 'custom', type: 'text', maxLength: 120,
    placeholder: 'Lisbon, Portugal', hidden: true,
  });

  placeSelect.addEventListener('change', () => {
    const other = placeSelect.value === 'other';
    customInput.hidden = !other;
    customInput.required = other;
    if (other) customInput.focus();
  });

  const today = todayISO();
  const startInput = el('input', { class: 'input', name: 'starts', type: 'date', required: true, value: today });
  const endInput = el('input', { class: 'input', name: 'ends', type: 'date', required: true, value: today });

  startInput.addEventListener('change', () => {
    if (endInput.value < startInput.value) endInput.value = startInput.value;
    endInput.min = startInput.value;
  });

  const submit = el('button', { class: 'button', type: 'submit' }, 'Add to the calendar');

  const form = el('form', { class: 'card form' },
    el('h2', { class: 'card__title' }, 'Add a trip or a stay'),
    el('div', { class: 'form__grid' },
      el('label', { class: 'field' }, el('span', {}, 'Who'), memberSelect),
      el('label', { class: 'field' }, el('span', {}, 'Where'), placeSelect),
      el('label', { class: 'field field--wide', hidden: true }, el('span', {}, 'Place name'), customInput),
      el('label', { class: 'field' }, el('span', {}, 'Arriving'), startInput),
      el('label', { class: 'field' }, el('span', {}, 'Leaving'), endInput),
      el('label', { class: 'field field--wide' },
        el('span', {}, 'Note (optional)'),
        el('input', { class: 'input', name: 'note', type: 'text', maxLength: 200, placeholder: 'Bringing the dog' })),
    ),
    submit,
  );

  // Keep the custom-location field and its label in step with the dropdown.
  placeSelect.addEventListener('change', () => {
    customInput.closest('.field').hidden = placeSelect.value !== 'other';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;

    const usingCustom = placeSelect.value === 'other';
    const payload = {
      member_id: memberSelect.value,
      place_id: usingCustom ? null : placeSelect.value,
      custom_location: usingCustom ? customInput.value.trim() : null,
      starts_on: startInput.value,
      ends_on: endInput.value,
      note: form.elements.note.value.trim() || null,
      created_by: state.me.id,
    };

    const { error } = await supabase.from('stays').insert(payload);
    submit.disabled = false;

    if (error) {
      toast(describeError(error), 'error');
      return;
    }

    form.elements.note.value = '';
    customInput.value = '';
    toast('Added to the calendar.', 'ok');
    await onSaved();
  });

  return form;
}

async function loadList(host) {
  clear(host);
  const today = todayISO();

  const { data, error } = await supabase
    .from('stays')
    .select('id, member_id, place_id, custom_location, starts_on, ends_on, note, created_by')
    .gte('ends_on', today)
    .order('starts_on');

  if (error) {
    host.append(el('p', { class: 'empty' }, describeError(error)));
    return;
  }

  const stays = data ?? [];
  const now = stays.filter((stay) => isActive(stay, today));
  const later = stays.filter((stay) => stay.starts_on > today);

  host.append(
    section('Right now', now, 'Nobody has a stay recorded for today.'),
    section('Still to come', later, 'Nothing on the calendar beyond today.'),
    el('details', { class: 'past' },
      el('summary', {}, 'Show past travel'),
      el('div', { class: 'past__body' }, el('p', { class: 'empty' }, 'Loading…')),
    ),
  );

  const details = host.querySelector('details');
  details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.loaded) return;
    details.dataset.loaded = 'yes';

    const { data: past, error: pastError } = await supabase
      .from('stays')
      .select('id, member_id, place_id, custom_location, starts_on, ends_on, note, created_by')
      .lt('ends_on', today)
      .order('starts_on', { ascending: false })
      .limit(50);

    const body = clear(details.querySelector('.past__body'));
    if (pastError) {
      body.append(el('p', { class: 'empty' }, describeError(pastError)));
      return;
    }
    body.append(past?.length
      ? el('ul', { class: 'rows' }, past.map(stayRow))
      : el('p', { class: 'empty' }, 'No past travel recorded.'));
  }, { once: false });
}

function section(title, stays, emptyText) {
  return el('section', { class: 'section' },
    el('h2', { class: 'section__title' }, title),
    stays.length
      ? el('ul', { class: 'rows' }, stays.map(stayRow))
      : el('p', { class: 'empty' }, emptyText),
  );
}

function stayRow(stay) {
  const canEdit = state.me?.is_admin
    || stay.member_id === state.me?.id
    || stay.created_by === state.me?.id;

  const row = el('li', { class: 'row' },
    el('div', {},
      el('p', { class: 'row__title' },
        memberName(stay.member_id),
        el('span', { class: 'row__where' }, ` · ${stayLocation(stay, state.places)}`)),
      el('p', { class: 'row__sub' },
        formatNights(stay.starts_on, stay.ends_on),
        stay.note ? ` · ${stay.note}` : ''),
    ),
    el('div', { class: 'row__end' },
      el('span', { class: 'pill' }, formatDateRange(stay.starts_on, stay.ends_on)),
      canEdit && el('button', {
        class: 'icon-button', type: 'button', title: 'Remove this trip', 'aria-label': 'Remove this trip',
        onClick: async () => {
          if (!confirm('Remove this trip from the calendar?')) return;
          const { error } = await supabase.from('stays').delete().eq('id', stay.id);
          if (error) return toast(describeError(error), 'error');
          row.remove();
          toast('Removed.', 'ok');
        },
      }, '×'),
    ),
  );

  return row;
}
