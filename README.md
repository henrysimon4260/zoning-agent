# Lintel

A conversational zoning and building-code desk for architects and developers. It asks **one question at a time**, writes each answer into a project file you can edit, then drafts a checklist of the building-code and zoning sections that govern the project. You mark what applies, add notes, and download a PDF titled with the property.

The interview is deliberate: the model may phrase the acknowledgement, but the next question always comes from the desk, so it cannot pile questions on or skip ahead.

## What you can do without any keys

- Walk the interview and edit the project sheet.
- Compare height, stories, and area with the **unamended 2021 IBC** model tables (504.3, 504.4, 506.2, Equation 5-1 / 5-2), plus egress, sprinklers, fire resistance, accessibility, and the usual exception paths (mezzanines, podiums, unlimited area, existing buildings).
- Get zoning headings (use, height, setbacks, FAR, coverage, parking, overlays) with search links to Municode and American Legal. Those items stay labeled **unverified** until an ordinance page is actually read.
- Generate the PDF.
- Keep every project in this browser.

Numbers are model-code figures, not a permit review. The report says so, in the document, not only here.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000/zoning-agent/](http://localhost:3000/zoning-agent/).

```bash
npm test
npm run build
```

## Live site

[https://henrysimon4260.github.io/zoning-agent/](https://henrysimon4260.github.io/zoning-agent/)

The site is a static export. GitHub Pages has no Node server, so the model is called from the browser.

## Environment

Copy `.env.example` to `.env.local` for local builds. Every variable is optional. Do not put a model API key in `NEXT_PUBLIC_*` — that would ship the secret inside the static JavaScript. Enter the key in the app under **Model**. It stays in this browser's local storage.

| Variable | What it unlocks |
| --- | --- |
| Model key in the **Model** panel | Streamed acknowledgements, a second pass on messy answers, and ordinance search. Stored only in this browser. OpenAI-compatible base URL can point at your own proxy. |
| `NEXT_PUBLIC_LLM_BASE_URL` | Optional build-time default for that endpoint. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional build-time Supabase project. You can paste the URL and publishable key in **Model** instead, and skip a rebuild. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preferred Supabase browser key. `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works. |

The app never asks you to sign in until you press **Save**.

Anonymous work stays in `localStorage`. On the first successful save, drafts on the device are copied to the account. Signing in later merges by project id and keeps the newer copy.

### Supabase

1. Create a project and turn on email/password. Magic link uses the same project.
2. Add `http://localhost:3000/zoning-agent/auth/callback/` and `https://henrysimon4260.github.io/zoning-agent/auth/callback/` to the auth redirect allow list.
3. Run `supabase/migrations/20261030120000_projects.sql` in the SQL editor. It creates `public.projects`, enables row level security, and limits every row to `auth.uid()`. The policies do not read `user_metadata`.

There is no service-role key in this app. The browser uses the publishable key, and the database policies do the rest.

## Deploy

Production is GitHub Pages. `main` runs `.github/workflows/pages.yml`, which builds with `output: 'export'` and `basePath: /zoning-agent`, then deploys the `out/` directory.

Locally:

```bash
npm run build
npx serve out
```

The dev server is at [http://localhost:3000/zoning-agent/](http://localhost:3000/zoning-agent/).

Pages has to be set to **GitHub Actions** as the source (Settings → Pages, or `gh api` `build_type=workflow`). Optional repository secrets, all build-time and public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_LLM_BASE_URL`.

Add this redirect URL in Supabase if you use magic links on the live site:

`https://henrysimon4260.github.io/zoning-agent/auth/callback/`

## How a checklist item is labeled

- **Model code** — unamended 2021 IBC. If you set the edition to 2018 or 2024, comparisons stay “needs a closer look” instead of being marked within or over a 2021 number.
- **Verified** — a zoning figure was present in text fetched from a linked ordinance page.
- **Unverified** — a search lead, or a reading that did not contain the number. Do not treat it as the adopted standard.

## Stack

Next.js (App Router), React, TypeScript, Tailwind, PDF generation with `pdf-lib`, optional Supabase Auth. Tests are Vitest and cover the interview, the IBC area examples, citation grounding, and the PDF header.
