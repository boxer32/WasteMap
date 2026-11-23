import { db, type ReportRow } from './db';

/** Everything a moderator needs: real location, duplicate hint, photos (served by /api/images/:id). */
export function modView(r: ReportRow) {
	return {
		id: r.id,
		category: r.category,
		status: r.status,
		latitude: r.latitude,
		longitude: r.longitude,
		location_source: r.location_source,
		location_accuracy: r.location_accuracy,
		description: r.description,
		photo_captured_at: r.photo_captured_at,
		submitted_at: r.submitted_at,
		resolved_at: r.resolved_at,
		possible_duplicate_of: r.possible_duplicate_of,
		moderator_note: r.moderator_note,
		image_url: `/api/images/${r.id}`,
		resolution_image_url: r.resolution_image_key ? `/api/images/${r.id}?kind=after` : null
	};
}

export async function loadQueue() {
	const d = db();
	const { results: pending } = await d
		.prepare(`SELECT * FROM reports WHERE status = 'pending' AND purged_at IS NULL ORDER BY submitted_at ASC LIMIT 200`)
		.bind()
		.all<ReportRow>();
	const { results: published } = await d
		.prepare(`SELECT * FROM reports WHERE status = 'published' AND purged_at IS NULL ORDER BY submitted_at DESC LIMIT 100`)
		.bind()
		.all<ReportRow>();
	const { results: feedback } = await d
		.prepare(
			`SELECT id, report_id, kind, text, image_key, created_at FROM feedback
			 WHERE handled = 0 ORDER BY created_at ASC LIMIT 200`
		)
		.bind()
		.all<{ id: number; report_id: string; kind: string; text: string | null; image_key: string | null; created_at: string }>();
	return {
		pending: pending.map(modView),
		published: published.map(modView),
		feedback: feedback.map((f) => ({
			id: f.id,
			report_id: f.report_id,
			kind: f.kind,
			text: f.text,
			created_at: f.created_at,
			image_url: f.image_key ? `/api/images/${f.report_id}?feedback=${f.id}` : null
		}))
	};
}
