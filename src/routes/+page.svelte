<script lang="ts">
	import { onMount } from "svelte";
	import { page as pg } from "$app/state";
	import { replaceState } from "$app/navigation";

	const pick = (o: any, ...keys: string[]) =>
		keys.map((k) => o?.[k]).find((v) => v != null);

	const normalize = (o: any) => ({
		id: o.SalesId ?? "",
		customer: o.SalesName ?? o.CustAccount ?? "",
		site: o.InventSiteId ?? "",
		date: o.CreatedDateTime1 ?? o.ShippingDateRequested,
		status: o.SalesStatus ?? "",
		amount: Number(o.HAR_TotalSOAmount ?? 0),
	});

	//to convert API metadata values into a simple string list for filter options
	const asList = (x: any): string[] =>
		(Array.isArray(x) ? x : []).map((v) =>
			typeof v === "string" ? v : (v.value ?? v.name ?? v.id ?? v.code),
		);

	//to store the current search/filter values and pagination settings
	const sp = pg.url.searchParams;
	let qInput = $state(sp.get("q") ?? "");
	let q = $state(sp.get("q") ?? "");
	let site = $state(sp.get("site") ?? "");
	let status = $state(sp.get("status") ?? "");
	let pageNo = $state(Number(sp.get("page")) || 1);
	let pageSize = $state(Number(sp.get("pageSize")) || 25);

	let orders = $state<ReturnType<typeof normalize>[]>([]);
	let summary = $state<any>(null);
	let pagination = $state<any>(null);
	let sites = $state<string[]>([]);
	let statuses = $state<string[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let ready = false;
	let ctrl: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout>;

	let filteredSummary = $state<any>(null);
	let summaryLoading = $state(false);

	const money = new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
	});
	const fmtDate = (d: any) =>
		d ? new Date(d).toLocaleDateString("en-GB") : "—";

	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			q = qInput.trim();
			pageNo = 1;
		}, 300);
	}
	function reset() {
		qInput = q = site = status = "";
		pageNo = 1;
	}

	async function loadFilteredSummary(signal: AbortSignal) {
		const base = new URLSearchParams({ pageSize: "100" });
		if (q) base.set("q", q);
		if (site) base.set("site", site);
		if (status) base.set("status", status);

		const get = async (n: number) => {
			const p = new URLSearchParams(base);
			p.set("page", String(n));
			const r = await fetch(`/api/orders?${p}`, { signal });
			if (!r.ok) throw new Error(`Summary request failed (${r.status})`);
			return r.json();
		};

		const first = await get(1);
		const pages = first.totalPages ?? 1;
		const rest = await Promise.all(
			Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
				get(i + 2),
			),
		);
		const rows = [first, ...rest].flatMap((b) => b.data ?? []);

		const counts = (re: RegExp) =>
			rows.filter((r: any) => re.test(r.SalesStatus ?? "")).length;
		return {
			filtered_orders: first.total ?? rows.length,
			total_orders: first.summary?.total_orders ?? rows.length,
			open_orders: counts(/open/i),
			invoiced_orders: counts(/invoiced/i),
			delivered_orders: counts(/delivered/i),
			cancelled_orders: counts(/cancel/i),
			total_order_value: rows.reduce(
				(sum: number, r: any) => sum + Number(r.HAR_TotalSOAmount ?? 0),
				0,
			),
		};
	}

	// Load orders from the API based on the current pagination and filters
	async function load() {
		ctrl?.abort();
		ctrl = new AbortController();
		loading = true;
		err = null;

		// Build the API query parameters
		const p = new URLSearchParams({
			page: String(pageNo),
			pageSize: String(pageSize),
		});

		// Add filters only when the user has selected or entered a value
		if (q) p.set("q", q);
		if (site) p.set("site", site);
		if (status) p.set("status", status);
		if (ready) replaceState(`?${p}`, {});
		try {
			const res = await fetch(`/api/orders?${p}`, {
				signal: ctrl.signal,
			});
			if (!res.ok)
				throw new Error(
					`Request failed (${res.status}). Check the API key and try again.`,
				);
			const body = await res.json();
			orders = (body.data ?? []).map(normalize);
			summary = body.summary ?? null;
			pagination = body.pagination ?? body.meta ?? null;
			loading = false;
		} catch (e: any) {
			if (e.name === "AbortError") return;
			err = e.message;
			loading = false;
		}
	}

	function findOptions(obj: any, re: RegExp): string[] {
		for (const [k, v] of Object.entries(obj ?? {})) {
			if (re.test(k)) {
				if (Array.isArray(v))
					return v
						.map((x: any) =>
							typeof x === "string"
								? x
								: String(
										x.value ??
											x.id ??
											x.code ??
											x.name ??
											x.InventSiteId ??
											"",
									),
						)
						.filter(Boolean);
				if (v && typeof v === "object") return Object.keys(v);
			}
			if (v && typeof v === "object" && !Array.isArray(v)) {
				const r = findOptions(v, re);
				if (r.length) return r;
			}
		}
		return [];
	}

	onMount(async () => {
		ready = true;
		try {
			// get available filter options from the API meta endpoint
			const res = await fetch("/api/meta");
			const m = await res.json();
			sites = findOptions(m, /site|branch/i);
			statuses = findOptions(m, /status/i);
		} catch (e) {
			console.error("meta failed", e);
		}
	});

	//recalculate the dashboard summary whenever the search or filters change
	$effect(() => {
		q;
		site;
		status;
		pageNo;
		pageSize;

		load();
	});

	$effect(() => {
		q;
		site;
		status;

		if (!q && !site && !status) {
			filteredSummary = null;
			summaryLoading = false;
			return;
		}

		const controller = new AbortController();
		summaryLoading = true;

		loadFilteredSummary(controller.signal)
			.then((s) => {
				if (!controller.signal.aborted) {
					filteredSummary = s;
				}
			})
			.catch((e) => {
				if (e.name !== "AbortError") {
					filteredSummary = null;
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					summaryLoading = false;
				}
			});

		return () => {
			controller.abort();
		};
	});

	// calculate dashboard statistics from users input and reflect only the matched orders, not the total summary from the API
	const counts = $derived.by(() => {
		const s = filteredSummary ?? summary ?? {};
		return {
			total: s.filtered_orders ?? 0,
			filtered: s.filtered_orders ?? 0,
			open: s.open_orders ?? 0,
			invoiced: s.invoiced_orders ?? 0,
			delivered: s.delivered_orders ?? 0,
			cancelled: s.cancelled_orders ?? 0,
			value: Number(s.total_order_value ?? 0),
		};
	});

	const totalPages = $derived(
		Math.max(1, Math.ceil(counts.filtered / pageSize)),
	);

	const badge = (s: string) =>
		/cancel/i.test(s)
			? "bad"
			: /complete|invoice|deliver/i.test(s)
				? "good"
				: /open|pending/i.test(s)
					? "warn"
					: "";
</script>

<svelte:head><title>Sales Order Monitor</title></svelte:head>

<main>
	<header>
		<h1>SALES ORDER MONITORING</h1>
		<p>
			Monitor sales orders across branches with real-time filtering and summary updates based on selected criteria.
		</p>
	</header>

	<section class="stats" aria-label="Summary">
		<div>
			<span>TOTAL ORDERS</span><b>{counts.total.toLocaleString()}</b>
		</div>
		<div><span>OPEN ORDERS</span><b>{counts.open.toLocaleString()}</b></div>
		<div>
			<span>INVOICED</span><b>{counts.invoiced.toLocaleString()}</b>
		</div>
		<div>
			<span>DELIVERED</span><b>{counts.delivered.toLocaleString()}</b>
		</div>
		<div>
			<span>CANCELLED</span><b>{counts.cancelled.toLocaleString()}</b>
		</div>
		<div class="wide">
			<span>TOTAL ORDER VALUE</span><b>{money.format(counts.value)}</b>
		</div>
	</section>

	<section class="filters">
		<input
			type="search"
			placeholder="Search order, customer…"
			bind:value={qInput}
			oninput={onSearch}
			aria-label="Search"
		/>
		<select
			bind:value={site}
			onchange={() => (pageNo = 1)}
			aria-label="Branch"
		>
			<option value="">All branches</option>
			{#each sites as s}<option value={s}>{s}</option>{/each}
		</select>
		<select
			bind:value={status}
			onchange={() => (pageNo = 1)}
			aria-label="Status"
		>
			<option value="">All statuses</option>
			{#each statuses as s}<option value={s}>{s}</option>{/each}
		</select>
		<button class="ghost" onclick={reset}>Clear filters</button>

		<p class="count">
			Showing {orders.length.toLocaleString()} of {counts.total.toLocaleString()}
			orders
		</p>
	</section>

	{#if err}
		<div class="state error" role="alert">
			<p>{err}</p>
			<button onclick={load}>Retry</button>
		</div>
	{:else if loading}
		<div class="state" aria-busy="true">
			{#each Array(6) as _}<div class="skeleton"></div>{/each}
		</div>
	{:else if orders.length === 0}
		<div class="state">
			<p>No orders match these filters.</p>
			<button class="ghost" onclick={reset}>Clear filters</button>
		</div>
	{:else}
		<div class="scroll">
			<table>
				<thead
					><tr
						><th><b>ORDER NO.</b></th><th><b>CUSTOMER</b></th><th
							><b>BRANCH</b></th
						><th><b>Date</b></th><th><b>STATUS</b></th><th
							class="num"><b>AMOUNT</b></th
						></tr
					></thead
				>
				<tbody>
					{#each orders as o (o.id)}
						<tr>
							<td data-label="Order">{o.id}</td>
							<td data-label="Customer">{o.customer}</td>
							<td data-label="Branch">{o.site}</td>
							<td data-label="Date">{fmtDate(o.date)}</td>
							<td data-label="Status"
								><span class="badge {badge(o.status)}"
									>{o.status}</span
								></td
							>
							<td data-label="Amount" class="num"
								>{money.format(o.amount)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<footer class="pager">
		<label
			>Rows
			<select bind:value={pageSize} onchange={() => (pageNo = 1)}>
				{#each [10, 25, 50, 100] as n}<option value={n}>{n}</option
					>{/each}
			</select>
		</label>
		<button
			class="ghost"
			disabled={pageNo <= 1 || loading}
			onclick={() => pageNo--}>Previous</button
		>
		<span>Page {pageNo}{totalPages ? ` of ${totalPages}` : ""}</span>
		<button
			class="ghost"
			disabled={loading ||
				(totalPages ? pageNo >= totalPages : orders.length < pageSize)}
			onclick={() => pageNo++}>Next</button
		>
	</footer>
</main>

<style>
	:global(:root) {
		--paper: #f6f7f4;
		--card: #fff;
		--ink: #1c2321;
		--muted: #5d6a66;
		--line: #dfe4e0;
		--accent: #0f445c;
		--good: #46a4cf;
		--warn: #9a6a00;
		--bad: #b23a30;
		font-family: "Segoe UI", system-ui, sans-serif;
		color: var(--ink);
	}
	:global(body) {
		margin: 0;
		background: var(--paper);
	}
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}
	h1 {
		margin: 1rem 0;
		font-size: 2rem;
	}
	header p {
		margin: 0.25rem 0 1.25rem;
		color: var(--muted);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.stats div {
		background: var(--card);
		border: 2px solid var(--line);
		border-radius: 6px;
		padding: 0.85rem 1rem;
		display: grid;
		gap: 0.25rem;
	}
	.stats span {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.stats b {
		font-size: 1rem;
	}
	.stats .wide {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.stats .wide span {
		color: #cfe6e0;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	input,
	select,
	button {
		font: inherit;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--card);
		color: inherit;
	}
	input {
		flex: 1 1 220px;
	}
	button {
		cursor: pointer;
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	button.ghost {
		background: var(--card);
		color: var(--ink);
		border-color: var(--line);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	:is(input, select, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.scroll {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 6px;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.65rem 0.85rem;
		text-align: left;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	th {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 400;
	}
	tr:last-child td {
		border-bottom: 0;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.badge {
		padding: 0.15rem 0.55rem;
		border-radius: 99px;
		font-size: 0.8rem;
		border: 1px solid currentColor;
	}
	.good {
		color: var(--good);
	}
	.warn {
		color: var(--warn);
	}
	.bad {
		color: var(--bad);
	}
	.state {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 1.5rem;
		text-align: center;
		display: grid;
		gap: 0.75rem;
		justify-items: center;
	}
	.state.error {
		border-color: var(--bad);
		color: var(--bad);
	}
	.skeleton {
		width: 100%;
		height: 2rem;
		border-radius: 4px;
		background: linear-gradient(
			90deg,
			#eceeea 25%,
			#f6f7f4 50%,
			#eceeea 75%
		);
		background-size: 200% 100%;
		animation: sh 1.2s infinite;
	}
	@keyframes sh {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}
	}
	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1rem;
		color: var(--muted);
	}
	.pager label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-right: auto;
	}
	@media (max-width: 640px) {
		thead {
			display: none;
		}
		table,
		tbody,
		tr,
		td {
			display: block;
		}
		tr {
			padding: 0.6rem 0.85rem;
			border-bottom: 1px solid var(--line);
		}
		td {
			border: 0;
			padding: 0.15rem 0;
			display: flex;
			justify-content: space-between;
			gap: 1rem;
			white-space: normal;
		}
		td::before {
			content: attr(data-label);
			color: var(--muted);
		}
	}
	.count {
		color: var(--muted);
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
	}
</style>
