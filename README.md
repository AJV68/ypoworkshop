# YPO Workshop

A small starter website for the YPO Workshop. It is plain HTML, CSS and
JavaScript — no build step — reading and writing a `guestbook` table in
Supabase and hosted on Vercel.

## How it fits together

| Piece | Where |
| --- | --- |
| Site source | this repository (`index.html`, `styles.css`, `app.js`) |
| Database | Supabase project `ypo-workshop` |
| Hosting | Vercel project `ypo-workshop`, deployed from the `main` branch |

Every push to `main` triggers a new production deployment on Vercel.

## Running it locally

Any static file server works, because there is nothing to build:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Supabase settings

`config.js` holds two public values: the project URL and the **publishable**
(anon) key. Both are meant to be visible in the browser — access to data is
controlled by Row Level Security policies on the database, not by hiding the
key.

The `guestbook` table has RLS enabled with two policies: anyone may read
entries, and anyone may insert one.

### Secrets

Never commit the Supabase `service_role` key, the database password, or any
other secret to this repository. Nothing in this repo is secret. If a value
must stay private, it belongs in a Vercel environment variable and must only
ever be used from server-side code.
