import { ASSESSMENT_API_BASE, ASSESSMENT_API_KEY } from '$app/env/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	const res = await fetch(`${ASSESSMENT_API_BASE}/meta`, {
		headers: { 'x-assessment-key': ASSESSMENT_API_KEY }
	});
	if (!res.ok) throw error(res.status, 'Upstream API error');
	return Response.json(await res.json());
};