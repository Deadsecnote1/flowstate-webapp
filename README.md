# Flowstate web

Browser client for Flowstate tasks. Signs in with Google and syncs with the same Supabase project as the Linux and Android apps.

Vite 8 needs Node.js 20.19 or newer.

## Setup

1. Copy the example env file and fill in the same project URL and anon key used by Linux (`~/.config/io.github.Deadsecnote1.Flowstate/sync.env`):

```bash
cp .env.example .env.local
```

2. In the Supabase dashboard, add this redirect URL under Authentication → URL Configuration:

```text
http://localhost:5173/**
```

3. Install and start:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Use **Sync now** to pull then push tasks. Planner and Clock are not implemented yet.

Do not commit `.env.local`.
