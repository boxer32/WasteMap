import type { Db } from './ratelimit';

/** The slice of R2Bucket used for deletion (lets tests pass a fake). */
export interface Bucket {
	delete(keys: string | string[]): Promise<void>;
}

/** Removal request / unlawful content: every R2 object, the feedback rows and the report row go. */
export async function deleteReport(
	d: Db,
	bucket: Bucket,
	row: { id: string; image_key: string | null; resolution_image_key: string | null }
): Promise<string[]> {
	const { results } = await d
		.prepare('SELECT image_key FROM feedback WHERE report_id = ? AND image_key IS NOT NULL')
		.bind(row.id)
		.all<{ image_key: string }>();
	const keys = [...new Set([row.image_key, row.resolution_image_key, ...results.map((r) => r.image_key)].filter(Boolean) as string[])];
	await bucket.delete(keys);
	await d.prepare('DELETE FROM feedback WHERE report_id = ?').bind(row.id).run();
	await d.prepare('DELETE FROM reports WHERE id = ?').bind(row.id).run();
	return keys;
}
