const config = window.SUPABASE_CONFIG || {};
const statusEl = document.getElementById('status');
const entriesEl = document.getElementById('entries');
const formEl = document.getElementById('entry-form');
const noteEl = document.getElementById('form-note');
const submitEl = document.getElementById('submit');

function setStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function setNote(text, state) {
  noteEl.textContent = text;
  noteEl.dataset.state = state || '';
}

if (!config.url || !config.publishableKey) {
  setStatus('Supabase is not configured', 'error');
  entriesEl.innerHTML = '<li class="placeholder">Missing Supabase settings in config.js.</li>';
  formEl.hidden = true;
  throw new Error('Missing Supabase configuration');
}

const client = window.supabase.createClient(config.url, config.publishableKey);

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function renderEntries(rows) {
  if (!rows.length) {
    entriesEl.innerHTML = '<li class="placeholder">No entries yet — be the first.</li>';
    return;
  }

  entriesEl.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');

      const head = document.createElement('div');
      head.className = 'entry-head';

      const name = document.createElement('span');
      name.className = 'entry-name';
      name.textContent = row.name;

      const time = document.createElement('time');
      time.className = 'entry-time';
      time.dateTime = row.created_at;
      time.textContent = timeFormat.format(new Date(row.created_at));

      head.append(name, time);

      const message = document.createElement('p');
      message.className = 'entry-message';
      message.textContent = row.message;

      item.append(head, message);
      return item;
    })
  );
}

async function loadEntries() {
  const { data, error } = await client
    .from('guestbook')
    .select('id, name, message, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    setStatus('Could not reach Supabase', 'error');
    entriesEl.innerHTML = '<li class="placeholder">Could not load entries.</li>';
    console.error(error);
    return;
  }

  setStatus('Connected to Supabase', 'ok');
  renderEntries(data);
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = formEl.elements.name.value.trim();
  const message = formEl.elements.message.value.trim();

  if (!name || !message) {
    setNote('Please fill in both fields.', 'error');
    return;
  }

  submitEl.disabled = true;
  setNote('Saving…');

  const { error } = await client.from('guestbook').insert({ name, message });

  submitEl.disabled = false;

  if (error) {
    setNote('Could not save that entry. Please try again.', 'error');
    console.error(error);
    return;
  }

  formEl.reset();
  setNote('Saved to Supabase.', 'ok');
  await loadEntries();
});

loadEntries();
