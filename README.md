# Convo Rooms starter

A minimal starter for the site you described:

- email + password sign up / log in
- one Webfishing-style room row in a lobby
- Discord-style chat page
- rotating conversation prompt every 10 minutes
- account settings page for email / password / username

## Stack

- Next.js App Router
- Supabase Auth
- Supabase Postgres + Realtime

## Why this stack

This is cleaner than fighting a restrictive visual builder:

- normal codebase
- known file structure
- proper database tables
- real auth
- real-time chat without inventing a socket server from scratch

## 1. Create the app

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Then fill `.env.local` with your Supabase URL and anon key.

## 2. Create your Supabase project

In Supabase:

1. create a project
2. copy your URL + anon key into `.env.local`
3. run `supabase/schema.sql` in the SQL editor
4. in Auth, make sure email auth is enabled

## 3. What is already implemented

### `/`
Auth page.

- create account with username, email, password
- log in with email and password
- creates a `profiles` row after signup

### `/lobby`
A simple room list.

- shows the one seeded room
- shows the current prompt preview
- join button goes to the chat page

### `/chat/[roomId]`
Main chat page.

- prompt at the top
- countdown to the next topic
- message list
- realtime incoming messages
- send message box

### `/settings`
Account settings page.

- change username
- change email
- change password
- syncs username into the `profiles` table

## 4. Important simplification used here

The topic changes are calculated from time, not stored in the database.

That means:

- every 10-minute block maps to one prompt
- everyone sees the same topic at the same time
- you do not need a cron job for the MVP

Later, if you want room-specific topic histories, skip votes, pinned topics, or premium packs, move topic rotation into the database.

## 5. Realistic next upgrades

1. online user count instead of hardcoded `1 / 7`
2. protected routes via middleware
3. password reset email flow
4. typing indicators
5. presence / join / leave events
6. moderation tools
7. multiple rooms spawning when others fill up
8. admin prompt packs and category toggles

## 6. Difficulty estimate

### MVP
Moderate. Not technically hard, just several moving parts.

If I were writing it cleanly from scratch:

- basic auth + schema: a few hours
- lobby + room UI: a few hours
- chat + realtime: a few hours
- settings page: 1–2 hours
- polish / bug fixes: another block of time

So the first usable version is very doable.

### Production-ready version
Harder than the MVP because the real work becomes:

- edge cases
- auth/session handling
- anti-spam
- moderation
- rate limiting
- presence accuracy
- mobile polish
- deployment

## 7. Honest answer

Your requested site is not a crazy build.

The MVP is very reasonable in plain code. The hard part is not “can this be coded,” it is cleaning up the auth/data/realtime details so it does not turn into a brittle mess.
