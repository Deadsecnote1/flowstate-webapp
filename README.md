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

Open `http://localhost:5173`. Sign in, then use Tasks, Planner, and Clock. Edits sync about 2 seconds later, and again when you return to the tab. **Sync now** still works. Clock stays on this device and is not synced.

Press `/` to jump to task search. Archive of completed tasks stays on this browser only.

Do not commit `.env.local`.
