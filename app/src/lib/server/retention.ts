import type { Bucket } from './remove';
import type { Db } from './ratelimit';

export const RETENTION_DAYS = 30;
export const BATCH = 100; // also the D1 limit on bound parameters per statement
const MAX_BATCHES = 20; // bounds one run (2000 reports); the next run continues
const PURGE_EVERY_MS = 3_600_000;

export interface PurgeResult {
	reports: number;
	objects: number;
	sessions: number;
	rateLimits: number;
}

/**
 * Anonymise every report older than 30 days (any status): delete its R2 objects and feedback rows,
 * overwrite the real location with the public one, null the personal fields, stamp purged_at.
 * Idempotent: purged rows are skipped, so a failed or repeated run is safe (R2 goes first, DB second).
 */
export async function purgeExpired(d: Db, bucket: Bucket, now = Date.now()): Promise<PurgeResult> {
	const out: PurgeResult = { reports: 0, objects: 0, sessions: 0, rateLimits: 0 };
	const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
	const stamp = new Date(now).toISOString();

	for (let i = 0; i < MAX_BATCHES; i++) {
		const { results } = await d
			.prepare(
				`SELECT id, image_key, resolution_image_key FROM reports
				 WHERE purged_at IS NULL AND submitted_at < ? ORDER BY submitted_at LIMIT ${BATCH}`
			)
			.bind(cutoff)
			.all<{ id: string; image_key: string | null; resolution_image_key: string | null }>();
		if (results.length === 0) break;
		const ids = results.map((r) => r.id);
		const marks = ids.map(() => '?').join(',');
		const { results: fb } = await d
			.prepare(`SELECT image_key FROM feedback WHERE report_id IN (${marks}) AND image_key IS NOT NULL`)
			.bind(...ids)
			.all<{ image_key: string }>();
		const keys = [
			...new Set([...results.flatMap((r) => [r.image_key, r.resolution_image_key]), ...fb.map((f) => f.image_key)].filter(Boolean) as string[])
		];
		if (keys.length) await bucket.delete(keys);
		await d.prepare(`DELETE FROM feedback WHERE report_id IN (${marks})`).bind(...ids).run();
		await d
			.prepare(
				`UPDATE reports SET latitude = public_latitude, longitude = public_longitude,
				 description = NULL, image_key = NULL, image_hash = NULL, tracking_token_hash = NULL,
				 resolution_image_key = NULL, moderator_note = NULL, location_accuracy = NULL,
				 photo_captured_at = NULL, purged_at = ? WHERE id IN (${marks})`
			)
			.bind(stamp, ...ids)
			.run();
		out.reports += ids.length;
		out.objects += keys.length;
		if (results.length < BATCH) break;
	}

	const s = await d.prepare('DELETE FROM sessions WHERE expires_at <= ? RETURNING 1 AS n').bind(now).all();
	out.sessions = s.results.length;
	const r = await d
		.prepare('DELETE FROM rate_limits WHERE window_start < ? RETURNING 1 AS n')
		.bind(now - 2 * 86_400_000)
		.all();
	out.rateLimits = r.results.length;
	return out;
}

/** Throttled trigger: at most one purge per hour across all isolates (claimed atomically in `meta`). */
export async function purgeIfDue(d: Db, bucket: Bucket, now = Date.now()): Promise<PurgeResult | null> {
	const claimed = await d
		.prepare(
			`INSERT INTO meta (name, value) VALUES ('last_purge', ?1)
			 ON CONFLICT(name) DO UPDATE SET value = ?1 WHERE CAST(value AS INTEGER) <= ?2
			 RETURNING name`
		)
		.bind(String(now), now - PURGE_EVERY_MS)
		.first();
	return claimed ? purgeExpired(d, bucket, now) : null;
}
