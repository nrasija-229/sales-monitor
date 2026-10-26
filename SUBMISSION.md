# Submission notes

- **Live app:** [vercel-link]
- **Repository:** [github-link]

## 1. Architecture / API integration notes

- **Stack:** SvelteKit 3 (Svelte 5 runes), TypeScript, plain CSS. No database; all data comes from the mock REST API.
- **Server-side proxy:** the browser calls only my own endpoints, `/api/orders` and `/api/meta`. These `+server.ts` routes forward the query string to the mock API and add the `x-assessment-key` header on the server. This keeps the key out of the client bundle, avoids CORS issues, and exposes `GET` only (the API is read-only).
- **Configuration:** `ASSESSMENT_API_BASE` and `ASSESSMENT_API_KEY` are declared in `src/env.ts` (SvelteKit 3 explicit env variables) and read on the server via `$app/env/private`. `.env` is git-ignored; `.env.example` documents the variables.
- **Search, filtering and paging are done by the API** using `q`, `site`, `status`, `page` and `pageSize` (max 100), so the full dataset is never loaded just to render a page. The branch and status dropdowns are filled from `/meta`. State is mirrored into the URL, search is debounced (300 ms), and each new request aborts the previous one with `AbortController` so a slow old response cannot overwrite a newer one.
- **Dashboard:** with no filter, the cards use the `summary` object returned by the API. With a search or filter active, a separate effect fetches all matching orders (`pageSize=100`, pages in parallel) and recalculates status counts and total value (`HAR_TotalSOAmount`), so the dashboard follows the filter. Trade-off: fine for 1,200 orders, but a larger dataset would need a server-side aggregate.
- **Field mapping:** one `normalize()` function maps the API's ERP-style fields to the UI (`SalesId`, `SalesName`, `InventSiteId`, `CreatedDateTime1`, `SalesStatus`, `HAR_TotalSOAmount`), so naming changes are fixed in one place.
- **UX:** loading skeleton, empty state, error state with Retry, and a responsive layout (table becomes cards under 640px). The line above the table shows "Showing N of M orders" (rows on this page out of all matching orders).
- **Limitations:** read-only data; filtered totals are calculated in the browser and the cards briefly show the previous numbers while recalculating; currency assumed to be MYR; no sorting, caching, authentication or automated tests.

## 2. AI-use disclosure

I used Claude (Anthropic) as a coding assistant. I used it for a first draft and for debugging help, then reviewed, changed and tested the code myself.

**Where the AI helped**
- Proposed the overall structure (SvelteKit with a server-side proxy) and drafted the first versions of `+page.svelte` and the two proxy routes.
- Explained the API brief and helped diagnose errors.
- Drafted the first version of the filtered-dashboard logic, the README and these notes.

**What I did myself**
- Ran the app, inspected the real API responses (`/api/orders`, `/api/meta`) and replaced the AI's guessed field names with the real fields (for example `HAR_TotalSOAmount` for amounts, `SalesName` for customers, `CreatedDateTime1` for dates).
- Set up and debugged the SvelteKit 3 environment configuration. The AI's early advice assumed SvelteKit 2 (`$env/dynamic/private`), so I checked the SvelteKit 3 setup, moved to `src/env.ts` with `$app/env/private`, and fixed a circular-import error in `src/env.ts`.
- Restructured the filtered-dashboard logic: I moved it into its own `$effect` that aborts its in-flight requests when the filters change, instead of triggering it from inside the load function.
- Changed the dashboard to match the brief more closely: separate Invoiced and Delivered cards, status counts based on the real status values, and the total taken from the API summary when no filter is active.
- Fixed the "Showing N of M orders" line myself after the AI's suggested fix showed the same number twice.
- Adjusted the UI: colour palette, heading and card labels, typography, and added code comments.
- Deployed the app and wrote up the testing below.

I reviewed the code and can explain the proxy, the environment setup, the fetch and abort logic, and the dashboard calculation.

## 3. How I tested

Manual testing. [EDIT: keep only what you really did, and add the result of each.]

- [ ] No filters: dashboard matches the API summary (1,200 orders, 420 open, 360 invoiced, 300 delivered, 120 cancelled)
- [ ] Search for a customer (for example "Siti"): table, count line and dashboard totals all change
- [ ] Branch filter, status filter, and both combined with search
- [ ] Search with no results shows the empty state
- [ ] Pagination: Next and Previous, changing rows per page, last page disabled correctly
- [ ] Error state: with a wrong API key the error message shows and Retry works
- [ ] Loading state with network throttling in browser DevTools
- [ ] Responsive layout at about 375px and on desktop
- [ ] Reloading a URL with filters restores the same view
- [ ] `npm run build` succeeds
- [ ] Deployed URL checked in a private window and on a phone
