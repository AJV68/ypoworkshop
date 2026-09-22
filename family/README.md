# The Family Site

A private site for the family: where everyone is, what everyone is up to, and
the pictures to go with it. Plain HTML, CSS and ES modules — no build step —
with Supabase for the database, sign-in and photo storage, hosted on Vercel.

## What is in it

| Page | What it does |
| --- | --- |
| Home | Who is at each of the four houses today, who is away, what is coming up, latest posts and photos |
| Travel | Add a stay or a trip for yourself or for someone else; upcoming and past travel |
| Photos | Upload (shrunk in the browser first), browse, full-screen viewer, hearts |
| Posts | Messages, questions and longer articles, with replies and hearts |
| Family | The roster; admins invite and remove people; everyone can rename themselves |

## Who can get in

Sign-in is an emailed magic link — there are no passwords anywhere.

Access is controlled by the `members` table: **a row in that table is the
invitation.** A database trigger on signup refuses to create an account for any
email that is not already on the roster, so an outsider who finds the URL can
see the sign-in screen and nothing else. Every table is behind Row Level
Security that requires a linked, signed-in member.

Photo files live in a *private* storage bucket. They are never served from a
public URL; the page requests short-lived signed links for the pictures it is
about to show.

## Running it locally

```bash
python3 -m http.server 8000     # from this directory
# then open http://localhost:8000
```

Add `http://localhost:8000` to the Supabase redirect URL list first, or the
magic link will bounce you to production.

## Secrets

`config.js` holds the Supabase project URL and the **publishable** key. Both
are meant to be visible in the browser; they grant nothing on their own,
because the policies above decide what each signed-in person may read.

Never commit the `service_role` key or the database password. Nothing in this
repository is secret.

## Supabase configuration

One setting lives in the Supabase dashboard rather than in this repo:
**Authentication → URL Configuration** must list the deployed site as the Site
URL and as an allowed redirect URL, otherwise the magic link will not return
people to the site.
