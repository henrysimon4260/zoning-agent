# Lintel

A conversational zoning and building-code desk for New York City. Give it a street address in any of the five boroughs. It resolves the tax lot, reads MapPLUTO, and then asks **one question at a time** for what the city file does not already say. The report is titled with the address and carries the borough, block, lot, BBL, and a ZoLa link.

The interview is deliberate: the model may phrase the acknowledgement, but the next question always comes from the server, so it cannot pile questions on or skip ahead. Visitors never paste an API key. The server calls xAI Grok at `https://api.x.ai/v1` with `XAI_API_KEY`.

## New York City parcel

The first question is a street address. The server calls [NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc/v2/search), then [MapPLUTO](https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks) (`64uk-42ks`) with the lot polygon. It intersects the same NYC Planning layers ZoLa draws: zoning districts, commercial overlays, special districts, subdistricts, limited height, E-designations, inclusionary housing, mandatory inclusionary housing, transit zones, and waterfront access plans. Historic districts are confirmed against the LPC historic-district layer. A condo unit lot (lots 1000–6999) is read through its billing lot. The latest DOB BIS certificate of occupancy for the address BIN is included and labeled temporary when it is. Failed layers are retried and, if they still fail, listed on the sheet instead of being invented. FRESH boundaries are not on that map service, so the checklist says so. Addresses outside the five boroughs are turned away. If the same house number and street exist in more than one borough, the desk asks which parcel.

After that it asks only what remains: occupancy, construction type, proposed stories and height, proposed area, sprinklers, and scope.

Zoning links point at [zr.planning.nyc.gov](https://zr.planning.nyc.gov/), including a reminder that City of Yes amended use, parking, and bulk. Building-code items point at the 2022 NYC Construction Codes. DOB, Landmarks, and FDNY items are included. Anything not read from MapPLUTO or the linked section is labeled unverified. Model IBC numbers, when shown, are a cross-check only.

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

`npm test` includes a live check of real lots in all five boroughs (plus a split lot, a condo billing lot, an E-designation, and a waterfront lot) against the zoning layers ZoLa uses. Set `NYC_LIVE=0` to skip that check when you are offline.

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
