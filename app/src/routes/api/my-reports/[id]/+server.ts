import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '#lib/server/crypto';
import { db, publicReport, type ReportRow } from '#lib/server/db';
import { bad } from '#lib/server/http';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('token') ?? '';
	const row = await db().prepare('SELECT * FROM reports WHERE id = ?').bind(params.id).first<ReportRow>();
	// same answer for unknown id and wrong token
	if (!row || row.purged_at || !row.tracking_token_hash || !token || !(await verifyToken(token, row.tracking_token_hash))) return bad('not found', 404);
	return json(
		{
			...publicReport(row),
			// owner may see their own photo while the report is still pending
			image_url: `/api/images/${row.id}?token=${encodeURIComponent(token)}`,
			moderator_note: row.moderator_note
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
