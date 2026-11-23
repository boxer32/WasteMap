import type { RequestHandler } from './$types';
import { verifyToken } from '#lib/server/crypto';
import { db, images, type ReportRow } from '#lib/server/db';
import { bad } from '#lib/server/http';

/**
 * Serves by report id (the R2 key never leaves the server).
 * Public: published/resolved only. Moderator session: everything. Owner token: own pending photo.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const d = db();
	const row = await d.prepare('SELECT * FROM reports WHERE id = ?').bind(params.id).first<ReportRow>();
	if (!row) return bad('not found', 404);
	const kind = url.searchParams.get('kind');
	const mod = !!locals.moderator;
	const fb = url.searchParams.get('feedback');
	let key: string | null;
	let allowed: boolean;

	if (fb) {
		const f = mod
			? await d
					.prepare('SELECT image_key FROM feedback WHERE id = ? AND report_id = ?')
					.bind(Number(fb), row.id)
					.first<{ image_key: string | null }>()
			: null;
		key = f?.image_key ?? null;
		allowed = mod;
	} else if (kind === 'after') {
		key = row.resolution_image_key;
		allowed = mod || row.status === 'resolved';
	} else {
		key = row.image_key;
		const token = url.searchParams.get('token') ?? '';
		allowed =
			mod ||
			row.status === 'published' ||
			row.status === 'resolved' ||
			(!!token && !!row.tracking_token_hash && (await verifyToken(token, row.tracking_token_hash)));
	}
	if (!key || !allowed) return bad('not found', 404);
	// pending, owner-token and moderator fetches are never cached; only anonymous published/resolved ones
	const isPublic = !mod && !fb && !url.searchParams.get('token') && (kind === 'after' ? row.status === 'resolved' : row.status === 'published' || row.status === 'resolved');
	const obj = await images().get(key);
	if (!obj) return bad('not found', 404);
	return new Response(obj.body, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': isPublic ? 'public, max-age=60' : 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
