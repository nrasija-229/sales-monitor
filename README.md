# sales-order-monitoring
Sales Order Monitoring Web App

This repository contains a responsive web application that helps a sales team monitor sales orders across multiple branches. It was built for the Harrisons Sabah Sdn Bhd IT Executive assessment and uses only the provided fictional, read-only mock REST API as its data source.

- **Live app:** https://sales-monitor-beta.vercel.app/
- **Repository:** https://github.com/nrasija-229/sales-monitor

## Core Applications

### 1. sales-monitor (Web App: UI + Server Proxy)
*   **Framework:** SvelteKit 3 (Svelte 5 runes), TypeScript, plain CSS
*   **Purpose:** A single application containing the dashboard UI and a server-side proxy that connect to the mock API.
*   **Key Features:**
    *   **Dashboard:** total orders, open orders, invoiced, delivered, cancelled, and total order value.
    *   **Dashboard follows filters:** with no filter it shows the API's own summary; with a search, branch or status filter it shows totals for the matching orders only. If no filters apply, the orders will show all the data.
    *   **Order listing:** order number, customer, branch, created date, order status and amount.
    *   **Search and filters:** search with short delay. Branch and status populated using data from the API's `/meta` endpoint.
    *   **Pagination:** 10 / 25 / 50 / 100 rows per page, with a "Showing N of M orders" line (rows on the current page out of all matching orders).
    *   **Shareable state:** search, filters, page and page size are kept in the URL.
    *   **UX states:** loading skeleton, empty state, and error state with a Retry button.
    *   **Responsive:** on screens under 640px the table turns into stacked cards.
*   **Development:** `npm run dev`
*   **Build:** `npm run build`
*   **Deployment:** Deployed on Vercel from this repository.

### 2. Server proxy routes (inside the same app)
*   **Framework:** SvelteKit server endpoints (`+server.ts`)
*   **Location:** `src/routes/api/orders/+server.ts` and `src/routes/api/meta/+server.ts`
*   **Purpose:** The browser only calls these routes. They forward the query string to the mock API and add the `x-assessment-key` header on the server, so the key never reaches the client bundle and CORS is not an issue.
*   **Key Features:**
    *   Read-only: only `GET` is exposed, matching the API's rules.
    *   Passes through `page`, `pageSize`, `status`, `site` and `q`.
    *   Returns the upstream status code on failure so the UI can show an error state.

## External Services

*   **Mock Sales Orders API** (`https://hiring.harrisons.my/api/mock/sales-orders`): the sole data source. Read-only (GET / OPTIONS), 1,200 fictional orders. The list response contains a `summary` object plus `data`; `/meta` lists the valid branches and statuses. Note: the brief writes the base URL inconsistently (`salesorders` in one place); the working endpoint is `sales-orders` (with a hyphen).

## Infrastructure & Operations

*   **Environment variables:** declared in `src/env.ts` (SvelteKit 3 explicit env variables) and read on the server only via `$app/env/private`.

    | Name | Value |
    |---|---|
    | `ASSESSMENT_API_BASE` | `https://hiring.harrisons.my/api/mock/sales-orders` |
    | `ASSESSMENT_API_KEY` | the assessment key from the brief |

*   **Deployment:** Vercel. Import the repo, add the two environment variables under Project Settings, and deploy. Pushes to the main branch redeploy automatically.
*   **Secrets:** `.env` is git-ignored; `.env.example` documents the variables.

## Documentation

*   **Architecture and API notes, AI-use disclosure, testing:** `SUBMISSION.md`.
*   **Known limitations:**
    *   The data source is read-only, so there is no create, edit or delete.
    *   When a filter is active, dashboard totals are calculated in the browser by fetching every matching order. This is fine for 1,200 orders but would not scale to a much larger dataset; a server-side aggregate endpoint would be the better design.
    *   While those totals are recalculating, the cards briefly keep showing the previous numbers.
    *   Filter options are read from `/meta` with a tolerant parser, because the response shape is only documented by example.
    *   The currency is assumed to be MYR.
    *   No sorting controls, caching, authentication or automated tests. Testing was manual.

## Development Setup

Requires a recent Node.js LTS release and npm.

1.  Clone the repository and install dependencies:
    ```bash
    git clone https://github.com/nrasija-229/sales-monitor
    cd sales-monitor
    npm install
    ```
2.  Create the environment file:
    ```bash
    cp .env.example .env        
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    Then open http://localhost:5173.

## Structure
- `src/env.ts`: declares the server-side environment variables.
- `src/routes/+page.svelte`: dashboard, filters, table and pagination.
- `src/routes/api/orders/+server.ts`: read-only proxy to the orders endpoint.
- `src/routes/api/meta/+server.ts`: read-only proxy to `/meta` (branches, statuses).
- `.env.example`: template for the required environment variables.
- `SUBMISSION.md`: architecture notes, AI-use disclosure and testing.
