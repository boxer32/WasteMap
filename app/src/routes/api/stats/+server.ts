import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db';

export const GET: RequestHandler = async () => {
	const d = db();
	const { results } = await d
		.prepare(
			`SELECT category, status, COUNT(*) AS n FROM reports
			 WHERE status IN ('published','resolved') GROUP BY category, status`
		)
		.bind()
		.all<{ category: string; status: string; n: number }>();
	let total = 0,
		resolved = 0;
	const byCategory: Record<string, number> = {};
	for (const r of results) {
		total += r.n;
		if (r.status === 'resolved') resolved += r.n;
		byCategory[r.category] = (byCategory[r.category] ?? 0) + r.n;
	}
	const now = Date.now();
	const since = new Date(now - 28 * 86_400_000).toISOString();
	const { results: recent } = await d
		.prepare(`SELECT submitted_at FROM reports WHERE status IN ('published','resolved') AND submitted_at >= ?`)
		.bind(since)
		.all<{ submitted_at: string }>();
	const weeks = [0, 0, 0, 0];
	for (const r of recent) {
		const w = Math.floor((now - Date.parse(r.submitted_at)) / (7 * 86_400_000));
		if (w >= 0 && w < 4) weeks[3 - w] += 1;
	}
	return json(
		{ total, open: total - resolved, resolved, by_category: byCategory, weekly: weeks },
		{ headers: { 'Cache-Control': 'public, max-age=60' } }
	);
};
