import { supabase, state, loadIdentity } from './supabase.js';
import { el, clear, toast, describeError } from './util.js';
import { renderHome } from './views/home.js';
import { renderTravel } from './views/travel.js';
import { renderPhotos } from './views/photos.js';
import { renderPosts, renderPostDetail } from './views/posts.js';
import { renderFamily } from './views/family.js';

const NAV = [
  { href: '#/', label: 'Home' },
  { href: '#/travel', label: 'Travel' },
  { href: '#/photos', label: 'Photos' },
  { href: '#/posts', label: 'Posts' },
  { href: '#/family', label: 'Family' },
];

const appRoot = document.getElementById('app');

async function start() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  // The magic-link handshake leaves a ?code= behind; tidy it away.
  if (location.search.includes('code=')) {
    history.replaceState({}, '', location.pathname + location.hash);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    const changed = session?.user?.id !== state.session?.user?.id;
    state.session = session;
    if (changed) boot();
  });

  await boot();
}

async function boot() {
  clear(appRoot);

  if (!state.session) {
    appRoot.append(signInView());
    return;
  }

  try {
    await loadIdentity();

    // An account can exist without being linked to a roster row — someone
    // removed and later re-invited, for instance. Claim it before giving up.
    if (!state.me) {
      const { data: claimed } = await supabase.rpc('claim_membership');
      if (claimed) await loadIdentity();
    }
  } catch (error) {
    appRoot.append(fatalView(describeError(error)));
    return;
  }

  if (!state.me) {
    appRoot.append(fatalView(
      'This account is signed in, but it is not on the family list. Ask an admin to add your email.'));
    return;
  }

  if (!state.me.display_name) {
    appRoot.append(namePromptView());
    return;
  }

  appRoot.append(shell());
  await route();
}

/* ---------------------------------------------------------------- sign in */

function signInView() {
  const email = el('input', {
    class: 'input', type: 'email', required: true, autocomplete: 'email',
    inputMode: 'email', placeholder: 'you@example.com',
  });
  const submit = el('button', { class: 'button button--wide', type: 'submit' }, 'Email me a sign-in link');
  const note = el('p', { class: 'form__note' });

  const form = el('form', { class: 'signin__form' },
    el('label', { class: 'field' }, el('span', {}, 'Your email'), email),
    submit,
    note,
  );

  // The emailed link opens in the phone's browser. If someone added this site
  // to their home screen, that window is a separate container and would stay
  // signed out — so the same email also carries a code they can type here.
  const code = el('input', {
    class: 'input', type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code',
    maxLength: 10, placeholder: '123456',
  });
  const verify = el('button', { class: 'button button--wide button--quiet', type: 'submit' }, 'Sign in with code');
  const codeNote = el('p', { class: 'form__note' });

  const codeForm = el('form', { class: 'signin__form', hidden: true },
    el('label', { class: 'field' },
      el('span', {}, 'Or type the code from that email'),
      code),
    verify,
    codeNote,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    note.textContent = 'Sending\u2026';
    note.dataset.tone = '';

    const { error } = await supabase.auth.signInWithOtp({
      email: email.value.trim().toLowerCase(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });

    submit.disabled = false;

    if (error) {
      note.textContent = describeError(error);
      note.dataset.tone = 'error';
      return;
    }

    note.textContent = 'Check your email. Tap the link, or type the code below. Both last one hour.';
    note.dataset.tone = 'ok';
    codeForm.hidden = false;
    code.focus();
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = code.value.replace(/\D/g, '');
    if (!token) return;

    verify.disabled = true;
    codeNote.textContent = 'Checking\u2026';
    codeNote.dataset.tone = '';

    const { error } = await supabase.auth.verifyOtp({
      email: email.value.trim().toLowerCase(),
      token,
      type: 'email',
    });

    verify.disabled = false;

    if (error) {
      codeNote.textContent = 'That code did not work. Check it, or tap the link in the email instead.';
      codeNote.dataset.tone = 'error';
      return;
    }

    codeNote.textContent = '';
    // onAuthStateChange picks the new session up and re-renders.
  });

  return el('div', { class: 'signin' },
    el('div', { class: 'signin__card' },
      el('p', { class: 'signin__eyebrow' }, 'Private'),
      el('h1', { class: 'signin__title' }, 'The Family Site'),
      el('p', { class: 'signin__lede' },
        'Where everyone is, what everyone is up to, and the pictures to go with it. '
        + 'Sign in with the email address your invitation went to.'),
      form,
      codeForm,
    ));
}

function namePromptView() {
  const name = el('input', {
    class: 'input', type: 'text', required: true, maxLength: 60, autofocus: true,
    placeholder: 'Dad',
  });
  const submit = el('button', { class: 'button button--wide', type: 'submit' }, 'Continue');

  const form = el('form', { class: 'signin__form' },
    el('label', { class: 'field' }, el('span', {}, 'Your name'), name),
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!name.value.trim()) return;

    submit.disabled = true;
    const { error } = await supabase
      .from('members')
      .update({ display_name: name.value.trim() })
      .eq('id', state.me.id);
    submit.disabled = false;

    if (error) return toast(describeError(error), 'error');
    await boot();
  });

  return el('div', { class: 'signin' },
    el('div', { class: 'signin__card' },
      el('h1', { class: 'signin__title' }, 'One quick thing'),
      el('p', { class: 'signin__lede' }, 'What should the family see next to your posts and photos?'),
      form,
    ));
}

function fatalView(message) {
  return el('div', { class: 'signin' },
    el('div', { class: 'signin__card' },
      el('h1', { class: 'signin__title' }, 'Hold on'),
      el('p', { class: 'signin__lede' }, message),
      el('button', {
        class: 'button button--wide', type: 'button',
        onClick: () => supabase.auth.signOut(),
      }, 'Sign out'),
    ));
}

/* ------------------------------------------------------------------ shell */

function shell() {
  const nav = el('nav', { class: 'nav' },
    NAV.map((item) => el('a', { class: 'nav__link', href: item.href, dataset: { href: item.href } }, item.label)));

  return el('div', { class: 'shell' },
    el('header', { class: 'topbar' },
      el('a', { class: 'brand', href: '#/' }, 'The Family Site'),
      nav,
      el('div', { class: 'topbar__end' },
        el('span', { class: 'whoami' }, state.me.display_name),
        el('button', {
          class: 'link link--quiet', type: 'button',
          onClick: () => supabase.auth.signOut(),
        }, 'Sign out'),
      ),
    ),
    el('main', { class: 'main', id: 'view' }),
  );
}

/* ----------------------------------------------------------------- router */

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'posts' && parts[1]) return { name: 'post', id: parts[1] };
  return { name: parts[0] };
}

async function route() {
  const view = document.getElementById('view');
  if (!view) return;

  const current = parseRoute();
  clear(view).append(el('p', { class: 'empty' }, 'Loading…'));

  for (const link of document.querySelectorAll('.nav__link')) {
    const target = link.dataset.href.replace(/^#/, '') || '/';
    const active = target === '/'
      ? current.name === 'home'
      : target.replace(/^\//, '') === (current.name === 'post' ? 'posts' : current.name);
    link.classList.toggle('nav__link--active', active);
  }

  try {
    clear(view);
    switch (current.name) {
      case 'travel': await renderTravel(view); break;
      case 'photos': await renderPhotos(view); break;
      case 'posts': await renderPosts(view); break;
      case 'post': await renderPostDetail(view, current.id); break;
      case 'family': await renderFamily(view); break;
      default: await renderHome(view);
    }
  } catch (error) {
    clear(view).append(el('p', { class: 'empty' }, describeError(error)));
  }

  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
window.addEventListener('identity-changed', () => {
  const whoami = document.querySelector('.whoami');
  if (whoami) whoami.textContent = state.me.display_name;
});

start();
