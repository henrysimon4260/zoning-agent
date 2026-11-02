# Lintel

A conversational zoning and building-code desk for architects and developers. It asks **one question at a time**, writes each answer into a project file you can edit, then drafts a checklist of the building-code and zoning sections that govern the project. You mark what applies, add notes, and download a PDF titled with the property.

The interview is deliberate: the model may phrase the acknowledgement, but the next question always comes from the server, so it cannot pile questions on or skip ahead. Visitors never paste an API key. The server calls xAI Grok at `https://api.x.ai/v1` with `XAI_API_KEY`.

## What works with no keys

- The interview and the editable project sheet.
- Height, stories, and area compared with the **unamended 2021 IBC** model tables (504.3, 504.4, 506.2, Equation 5-1 / 5-2), plus egress, sprinklers, fire resistance, accessibility, and the usual exception paths.
- Zoning headings with search links to Municode and American Legal. Those items stay **unverified** until the server has read an ordinance page.
- The PDF.
- Projects saved in this browser.

Numbers are model-code figures, not a permit review. The report says so.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run build
```

## Environment variables for Vercel

Set these in the Vercel project (Settings → Environment Variables). Do not prefix the model key with `NEXT_PUBLIC_`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `XAI_API_KEY` | Yes, for the model | Server-only key. Replies and streaming go to `https://api.x.ai/v1/chat/completions`. Ordinance lookup uses the same host. |
| `XAI_MODEL` | No | Defaults to `grok-4.7`. |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL. Without it, Save keeps the draft on this device. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon (publishable) key. Pair it with the URL. |

That is the full set. There is no visitor-supplied model key.

API routes are limited to 40 requests per minute per IP. The limit lives in the server instance, so it is a basic guard, not a global quota.

### Supabase

1. Create a project and turn on email/password. Magic link uses the same project.
2. Add `http://localhost:3000/auth/callback` and your Vercel URL (`https://<project>.vercel.app/auth/callback`) to the redirect allow list.
3. Run `supabase/migrations/20261030120000_projects.sql` in the SQL editor. It creates `public.projects`, enables row level security, and limits every row to `auth.uid()`. The policies do not read `user_metadata`.

The browser uses the anon key. There is no service-role key in this app. Anonymous work stays in `localStorage` and is copied to the account the first time a signed-in user saves.

The app does not ask anyone to sign in until they press **Save**.

## Deploy

```bash
npx vercel
```

Or, with a token already in the environment:

```bash
npm run deploy
```

`vercel.json` marks the app as Next.js and tells caches not to store `/api` responses. Production is a Node server, not a static export. The GitHub Pages workflow has been removed.

## How a checklist item is labeled

- **Model code** — unamended 2021 IBC. If the file says 2018 or 2024, comparisons stay “needs a closer look” instead of being marked within or over a 2021 number.
- **Verified** — a zoning figure was present in text the server fetched from a linked ordinance page.
- **Unverified** — a search lead, or a reading that did not contain the number.

## Stack

Next.js (App Router), React, TypeScript, Tailwind, PDF generation with `pdf-lib` on the server, optional Supabase Auth. Tests are Vitest and cover the interview, the IBC area examples, citation grounding, the PDF header, and the rate limiter.
