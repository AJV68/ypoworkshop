import { supabase, state, memberName } from '../supabase.js';
import { heartButton } from '../hearts.js';
import { el, clear, formatRelative, toast, describeError } from '../util.js';

const KINDS = [
  { value: 'note', label: 'Message' },
  { value: 'question', label: 'Question' },
  { value: 'article', label: 'Article' },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export async function renderPosts(root) {
  const feed = el('div', {});

  root.append(
    el('header', { class: 'page-head' },
      el('h1', {}, 'Posts'),
      el('p', { class: 'page-head__sub' },
        'Share news, ask the family a question, or write something longer.'),
    ),
    renderComposer(() => loadFeed(feed)),
    feed,
  );

  await loadFeed(feed);
}

function renderComposer(onPosted) {
  const kind = el('select', { class: 'input', name: 'kind' },
    KINDS.map((option) => el('option', { value: option.value }, option.label)));
  const title = el('input', {
    class: 'input', type: 'text', name: 'title', maxLength: 140, placeholder: 'Optional headline',
  });
  const body = el('textarea', {
    class: 'input', name: 'body', rows: 4, required: true, maxLength: 20000,
    placeholder: 'What would you like to tell everyone?',
  });
  const submit = el('button', { class: 'button', type: 'submit' }, 'Post it');

  const form = el('form', { class: 'card form' },
    el('h2', { class: 'card__title' }, 'Write something'),
    el('div', { class: 'form__grid' },
      el('label', { class: 'field' }, el('span', {}, 'Type'), kind),
      el('label', { class: 'field' }, el('span', {}, 'Title'), title),
      el('label', { class: 'field field--wide' }, el('span', {}, 'Message'), body),
    ),
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!body.value.trim()) return;

    submit.disabled = true;
    const { error } = await supabase.from('posts').insert({
      author_id: state.me.id,
      kind: kind.value,
      title: title.value.trim() || null,
      body: body.value.trim(),
    });
    submit.disabled = false;

    if (error) return toast(describeError(error), 'error');

    title.value = '';
    body.value = '';
    toast('Posted.', 'ok');
    await onPosted();
  });

  return form;
}

async function loadFeed(host) {
  clear(host).append(el('p', { class: 'empty' }, 'Loading…'));

  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, kind, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    clear(host).append(el('p', { class: 'empty' }, describeError(error)));
    return;
  }

  const posts = data ?? [];
  if (!posts.length) {
    clear(host).append(el('p', { class: 'empty' }, 'Nothing posted yet.'));
    return;
  }

  const ids = posts.map((post) => post.id);
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    supabase.from('reactions').select('post_id, member_id').in('post_id', ids),
    supabase.from('comments').select('post_id').in('post_id', ids),
  ]);

  const commentCounts = tally((comments ?? []).map((row) => row.post_id));

  clear(host).append(
    el('section', { class: 'section' },
      el('ul', { class: 'cards' },
        posts.map((post) => postCard(post, reactions ?? [], commentCounts[post.id] ?? 0)))),
  );
}

function postCard(post, reactions, commentCount) {
  const mine = reactions.filter((row) => row.post_id === post.id);

  return el('li', { class: 'card post' },
    el('div', { class: 'post__head' },
      el('span', { class: `badge badge--${post.kind}` }, KIND_LABEL[post.kind]),
      el('span', { class: 'post__meta' },
        `${memberName(post.author_id)} · ${formatRelative(post.created_at)}`),
    ),
    post.title ? el('h3', { class: 'post__title' }, post.title) : null,
    el('p', { class: 'post__body' }, truncate(post.body)),
    el('div', { class: 'post__foot' },
      heartButton({ post_id: post.id }, mine),
      el('a', { class: 'link', href: `#/posts/${post.id}` },
        commentCount === 1 ? '1 comment' : `${commentCount} comments`),
      canManage(post) && el('button', {
        class: 'link link--quiet', type: 'button',
        onClick: async () => {
          if (!confirm('Delete this post and its comments?')) return;
          const { error } = await supabase.from('posts').delete().eq('id', post.id);
          if (error) return toast(describeError(error), 'error');
          toast('Deleted.', 'ok');
          location.hash = '#/posts';
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        },
      }, 'Delete'),
    ),
  );
}

export async function renderPostDetail(root, postId) {
  const { data: post, error } = await supabase
    .from('posts')
    .select('id, author_id, kind, title, body, created_at')
    .eq('id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!post) {
    root.append(el('p', { class: 'empty' }, 'That post is no longer here.'));
    return;
  }

  const { data: reactions } = await supabase
    .from('reactions').select('post_id, member_id').eq('post_id', post.id);

  const commentHost = el('div', {});

  root.append(
    el('a', { class: 'link', href: '#/posts' }, '← All posts'),
    el('article', { class: 'card post post--full' },
      el('div', { class: 'post__head' },
        el('span', { class: `badge badge--${post.kind}` }, KIND_LABEL[post.kind]),
        el('span', { class: 'post__meta' },
          `${memberName(post.author_id)} · ${formatRelative(post.created_at)}`),
      ),
      post.title ? el('h1', { class: 'post__title post__title--full' }, post.title) : null,
      el('div', { class: 'post__body post__body--full' },
        post.body.split(/\n{2,}/).map((para) => el('p', {}, para))),
      el('div', { class: 'post__foot' }, heartButton({ post_id: post.id }, reactions ?? [])),
    ),
    el('section', { class: 'section' },
      el('h2', { class: 'section__title' }, 'Replies'),
      commentHost,
      commentForm(post.id, () => loadComments(commentHost, post.id)),
    ),
  );

  await loadComments(commentHost, post.id);
}

function commentForm(postId, onSaved) {
  const body = el('textarea', {
    class: 'input', rows: 3, required: true, maxLength: 4000, placeholder: 'Write a reply…',
  });
  const submit = el('button', { class: 'button', type: 'submit' }, 'Reply');

  const form = el('form', { class: 'form form--inline' }, body, submit);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!body.value.trim()) return;

    submit.disabled = true;
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      author_id: state.me.id,
      body: body.value.trim(),
    });
    submit.disabled = false;

    if (error) return toast(describeError(error), 'error');
    body.value = '';
    await onSaved();
  });

  return form;
}

async function loadComments(host, postId) {
  clear(host);

  const { data, error } = await supabase
    .from('comments')
    .select('id, author_id, body, created_at')
    .eq('post_id', postId)
    .order('created_at');

  if (error) {
    host.append(el('p', { class: 'empty' }, describeError(error)));
    return;
  }

  const comments = data ?? [];
  if (!comments.length) {
    host.append(el('p', { class: 'empty' }, 'No replies yet.'));
    return;
  }

  host.append(el('ul', { class: 'rows' },
    comments.map((comment) => {
      const row = el('li', { class: 'row row--stack' },
        el('p', { class: 'row__sub' },
          `${memberName(comment.author_id)} · ${formatRelative(comment.created_at)}`),
        el('p', { class: 'row__title row__title--normal' }, comment.body),
        canManage(comment) && el('button', {
          class: 'link link--quiet', type: 'button',
          onClick: async () => {
            const { error: deleteError } = await supabase.from('comments').delete().eq('id', comment.id);
            if (deleteError) return toast(describeError(deleteError), 'error');
            row.remove();
          },
        }, 'Delete'),
      );
      return row;
    })));
}

function canManage(record) {
  return state.me?.is_admin || record.author_id === state.me?.id;
}

function tally(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function truncate(body) {
  const text = body.trim();
  return text.length > 320 ? `${text.slice(0, 320)}…` : text;
}
