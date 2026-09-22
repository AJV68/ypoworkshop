import { supabase, state, loadIdentity } from '../supabase.js';
import { el, clear, toast, describeError } from '../util.js';

export async function renderFamily(root) {
  const listHost = el('div', {});

  const blocks = [
    el('header', { class: 'page-head' },
      el('h1', {}, 'The family'),
      el('p', { class: 'page-head__sub' },
        'Everyone with access to this site. Adding someone here is the invitation — nobody else can sign in.'),
    ),
    renderMyDetails(() => refresh(listHost)),
    state.me?.is_admin ? renderInvite(() => refresh(listHost)) : null,
    listHost,
  ];

  root.append(...blocks.filter(Boolean));

  renderList(listHost);
}

async function refresh(listHost) {
  await loadIdentity();
  renderList(listHost);
}

function renderMyDetails(onSaved) {
  const name = el('input', {
    class: 'input', type: 'text', maxLength: 60, required: true,
    value: state.me?.display_name ?? '', placeholder: 'How the family knows you',
  });
  const submit = el('button', { class: 'button', type: 'submit' }, 'Save');

  const form = el('form', { class: 'card form' },
    el('h2', { class: 'card__title' }, 'Your details'),
    el('div', { class: 'form__grid' },
      el('label', { class: 'field' }, el('span', {}, 'Display name'), name),
      el('label', { class: 'field' },
        el('span', {}, 'Email'),
        el('input', { class: 'input', type: 'text', value: state.me?.email ?? '', disabled: true })),
    ),
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;

    const { error } = await supabase
      .from('members')
      .update({ display_name: name.value.trim() })
      .eq('id', state.me.id);

    submit.disabled = false;
    if (error) return toast(describeError(error), 'error');

    toast('Saved.', 'ok');
    await onSaved();
    window.dispatchEvent(new CustomEvent('identity-changed'));
  });

  return form;
}

function renderInvite(onSaved) {
  const email = el('input', {
    class: 'input', type: 'email', required: true, placeholder: 'name@example.com',
  });
  const name = el('input', {
    class: 'input', type: 'text', maxLength: 60, placeholder: 'What we call them',
  });
  const submit = el('button', { class: 'button', type: 'submit' }, 'Add to the family');

  const form = el('form', { class: 'card form' },
    el('h2', { class: 'card__title' }, 'Invite someone'),
    el('p', { class: 'card__hint' },
      'They sign in at this address with the same email — there is no password to send them.'),
    el('div', { class: 'form__grid' },
      el('label', { class: 'field' }, el('span', {}, 'Email'), email),
      el('label', { class: 'field' }, el('span', {}, 'Name'), name),
    ),
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;

    const { error } = await supabase.from('members').insert({
      email: email.value.trim().toLowerCase(),
      display_name: name.value.trim(),
    });

    submit.disabled = false;

    if (error) {
      const duplicate = error.code === '23505';
      toast(duplicate ? 'That email is already on the list.' : describeError(error), 'error');
      return;
    }

    toast(`${name.value.trim() || email.value.trim()} can now sign in.`, 'ok');
    email.value = '';
    name.value = '';
    await onSaved();
  });

  return form;
}

function renderList(host) {
  clear(host).append(
    el('section', { class: 'section' },
      el('h2', { class: 'section__title' }, `${state.members.length} people`),
      el('ul', { class: 'rows' }, state.members.map(memberRow)),
    ),
  );
}

function memberRow(member) {
  const isMe = member.id === state.me?.id;
  const amAdmin = Boolean(state.me?.is_admin);

  return el('li', { class: 'row' },
    el('div', {},
      el('p', { class: 'row__title' },
        member.display_name || member.email,
        isMe ? el('span', { class: 'row__where' }, ' · you') : null),
      el('p', { class: 'row__sub' },
        member.email,
        member.user_id ? '' : ' · has not signed in yet'),
    ),
    el('div', { class: 'row__end' },
      member.is_admin ? el('span', { class: 'pill pill--accent' }, 'Admin') : null,
      amAdmin && !isMe && el('button', {
        class: 'link link--quiet', type: 'button',
        onClick: async () => {
          const label = member.display_name || member.email;
          if (!confirm(`Remove ${label}? They will lose access to the site.`)) return;
          const { error } = await supabase.from('members').delete().eq('id', member.id);
          if (error) return toast(describeError(error), 'error');
          toast(`${label} removed.`, 'ok');
          await loadIdentity();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        },
      }, 'Remove'),
    ),
  );
}
