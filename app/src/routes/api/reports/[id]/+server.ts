import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, publicReport, type ReportRow } from '#lib/server/db';
import { bad } from '#lib/server/http';

export const GET: RequestHandler = async ({ params }) => {
	const row = await db().prepare('SELECT * FROM reports WHERE id = ?').bind(params.id).first<ReportRow>();
	if (!row || (row.status !== 'published' && row.status !== 'resolved')) return bad('not found', 404);
	return json(publicReport(row), { headers: { 'Cache-Control': 'public, max-age=30' } });
};
