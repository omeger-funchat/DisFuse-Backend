# DisFuse-Backend

Self-hosted backend for the DisFuse block-coding frontend (Express + SQLite + Socket.IO).

Everyone is premium here: limits are 30 projects / 30 websites / 25 versions, no Stripe.

## Deploy (free, Render)

1. https://dashboard.render.com → New → Web Service → connect this repo.
2. Build: `npm install`, Start: `npm start`, Health check: `/health`.
3. Env: `CORS_ORIGIN=https://omeger-funchat.github.io`, `ADMIN_IDS=<your discord user id>`.
4. Copy the service URL, e.g. `https://disfuse-backend.onrender.com`.
5. Point the frontend at it: in DisFuse `src/config/config.js` set the
   production `apiUrl` to that URL and redeploy the site.

Note: Render free has no persistent disk, so the SQLite file resets when
the service restarts. Move to Postgres for permanent storage later.

## Run locally

```
npm install
CORS_ORIGIN=http://localhost:3000 node src/index.js
```

## Roadmap

- Live bot hosting (running user bots 24/7) is not included yet: the
  editor, projects, versions, templates, websites and dashboard work;
  `/control` live sessions return "unsupported" until a bot runner exists.
