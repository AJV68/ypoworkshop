import { supabase, state, memberName } from '../supabase.js';
import { signPhotos } from '../media.js';
import {
  el, todayISO, addDaysISO, formatDateRange, formatRelative, stayLocation, isActive,
} from '../util.js';

const KIND_LABEL = { note: 'Message', question: 'Question', article: 'Article' };

export async function renderHome(root) {
  const today = todayISO();
  const horizon = addDaysISO(today, 60);

  const [staysResult, postsResult, photosResult] = await Promise.all([
    supabase
      .from('stays')
      .select('id, member_id, place_id, custom_location, starts_on, ends_on, note')
      .lte('starts_on', horizon)
      .gte('ends_on', today)
      .order('starts_on'),
    supabase
      .from('posts')
      .select('id, author_id, kind, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('photos')
      .select('id, storage_path, caption, uploaded_by')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  for (const result of [staysResult, postsResult, photosResult]) {
    if (result.error) throw result.error;
  }

  const stays = staysResult.data ?? [];
  const current = stays.filter((stay) => isActive(stay, today));
  const upcoming = stays.filter((stay) => stay.starts_on > today).slice(0, 8);

  const blocks = [
    el('header', { class: 'page-head' },
      el('h1', {}, greeting()),
      el('p', { class: 'page-head__sub' },
        new Date().toLocaleDateString(undefined, {
          weekday: 'long', month: 'long', day: 'numeric',
        })),
    ),
    renderHouses(current),
    renderAway(current),
    renderUpcoming(upcoming),
    renderPosts(postsResult.data ?? []),
    await renderPhotos(photosResult.data ?? []),
  ];

  root.append(...blocks.filter(Boolean));
}

function greeting() {
  const hour = new Date().getHours();
  const name = (state.me?.display_name || '').split(' ')[0];
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function renderHouses(current) {
  const homes = state.places.filter((place) => place.is_home);

  return el('section', { class: 'section' },
    el('h2', { class: 'section__title' }, 'The houses'),
    el('div', { class: 'houses' },
      homes.map((home) => {
        const here = current.filter((stay) => stay.place_id === home.id);
        return el('article', { class: `house ${here.length ? 'house--occupied' : ''}` },
          el('h3', { class: 'house__name' }, home.name),
          el('p', { class: 'house__locality' }, home.locality ?? ''),
          here.length
            ? el('ul', { class: 'house__people' },
                here.map((stay) => el('li', {},
                  el('span', { class: 'house__person' }, memberName(stay.member_id)),
                  el('span', { class: 'house__dates' }, formatDateRange(stay.starts_on, stay.ends_on)),
                )))
            : el('p', { class: 'house__empty' }, 'Nobody there right now'),
        );
      })),
  );
}

function renderAway(current) {
  const away = current.filter((stay) => !stay.place_id);
  if (!away.length) return null;

  return el('section', { class: 'section' },
    el('h2', { class: 'section__title' }, 'Away from the houses'),
    el('ul', { class: 'rows' },
      away.map((stay) => el('li', { class: 'row' },
        el('div', {},
          el('p', { class: 'row__title' }, memberName(stay.member_id)),
          el('p', { class: 'row__sub' }, stayLocation(stay, state.places), stay.note ? ` · ${stay.note}` : ''),
        ),
        el('span', { class: 'pill' }, formatDateRange(stay.starts_on, stay.ends_on)),
      ))),
  );
}

function renderUpcoming(upcoming) {
  return el('section', { class: 'section' },
    el('div', { class: 'section__head' },
      el('h2', { class: 'section__title' }, 'Coming up'),
      el('a', { class: 'link', href: '#/travel' }, 'All travel'),
    ),
    upcoming.length
      ? el('ul', { class: 'rows' },
          upcoming.map((stay) => el('li', { class: 'row' },
            el('div', {},
              el('p', { class: 'row__title' }, memberName(stay.member_id)),
              el('p', { class: 'row__sub' }, stayLocation(stay, state.places), stay.note ? ` · ${stay.note}` : ''),
            ),
            el('span', { class: 'pill' }, formatDateRange(stay.starts_on, stay.ends_on)),
          )))
      : el('p', { class: 'empty' }, 'No travel on the calendar yet.'),
  );
}

function renderPosts(posts) {
  return el('section', { class: 'section' },
    el('div', { class: 'section__head' },
      el('h2', { class: 'section__title' }, 'Latest from the family'),
      el('a', { class: 'link', href: '#/posts' }, 'All posts'),
    ),
    posts.length
      ? el('ul', { class: 'rows' },
          posts.map((post) => el('li', { class: 'row row--link', onClick: () => { location.hash = `#/posts/${post.id}`; } },
            el('div', {},
              el('p', { class: 'row__title' }, post.title || excerpt(post.body)),
              el('p', { class: 'row__sub' },
                `${KIND_LABEL[post.kind]} from ${memberName(post.author_id)} · ${formatRelative(post.created_at)}`),
            ),
          )))
      : el('p', { class: 'empty' }, 'Nothing posted yet. Be the first.'),
  );
}

async function renderPhotos(photos) {
  const section = el('section', { class: 'section' },
    el('div', { class: 'section__head' },
      el('h2', { class: 'section__title' }, 'Recent photos'),
      el('a', { class: 'link', href: '#/photos' }, 'All photos'),
    ),
  );

  if (!photos.length) {
    section.append(el('p', { class: 'empty' }, 'No photos yet.'));
    return section;
  }

  const urls = await signPhotos(photos.map((photo) => photo.storage_path));
  section.append(
    el('div', { class: 'thumb-strip' },
      photos.map((photo) => el('a', { class: 'thumb', href: '#/photos' },
        el('img', {
          src: urls[photo.storage_path] ?? '',
          alt: photo.caption || `Photo from ${memberName(photo.uploaded_by)}`,
          loading: 'lazy',
        })))),
  );
  return section;
}

function excerpt(body) {
  const text = body.trim().replace(/\s+/g, ' ');
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
