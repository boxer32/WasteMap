import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PLACE } from '#lib/domain';
import { db } from '#lib/server/db';
import { bad } from '#lib/server/http';

/** Anonymised export: category, status, dates, public coordinates, place. No description, no images. */
export const GET: RequestHandler = async ({ url }) => {
	const format = url.searchParams.get('format') ?? 'csv';
	if (format !== 'csv' && format !== 'geojson') return bad('format must be csv or geojson');
	const { results } = await db()
		.prepare(
			`SELECT id, category, status, submitted_at, resolved_at, public_latitude, public_longitude
			 FROM reports WHERE status IN ('published','resolved') ORDER BY submitted_at DESC`
		)
		.bind()
		.all<{
			id: string;
			category: string;
			status: string;
			submitted_at: string;
			resolved_at: string | null;
			public_latitude: number;
			public_longitude: number;
		}>();
	if (format === 'geojson') {
		return json(
			{
				type: 'FeatureCollection',
				features: results.map((r) => ({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [r.public_longitude, r.public_latitude] },
					properties: {
						id: r.id, category: r.category, status: r.status,
						submitted_at: r.submitted_at, resolved_at: r.resolved_at, place: PLACE.label
					}
				}))
			},
			{ headers: { 'Content-Disposition': 'attachment; filename="wastemap-salui.geojson"' } }
		);
	}
	const head = 'id,category,status,submitted_at,resolved_at,public_latitude,public_longitude,place';
	const lines = results.map((r) =>
		[r.id, r.category, r.status, r.submitted_at, r.resolved_at ?? '', r.public_latitude.toFixed(5), r.public_longitude.toFixed(5), `"${PLACE.label}"`].join(',')
	);
	return new Response([head, ...lines].join('\n') + '\n', {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="wastemap-salui.csv"'
		}
	});
};
