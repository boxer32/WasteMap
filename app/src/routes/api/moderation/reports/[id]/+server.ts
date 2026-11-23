import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, images, randomImageKey, type ReportRow } from '#lib/server/db';
import { BodyTooLarge, bad, readBody, sameOrigin } from '#lib/server/http';
import { validateJpeg } from '#lib/server/image';
import { deleteReport } from '#lib/server/remove';
import { modView } from '#lib/server/moderation';

const ACTIONS = ['approve', 'reject', 'resolve', 'delete', 'dismiss_feedback'];

export const PATCH: RequestHandler = async ({ params, request, url, locals }) => {
	if (!locals.moderator) return bad('unauthorized', 401);
	if (!sameOrigin(request, url)) return bad('forbidden', 403);
	let body;
	try {
		body = await readBody(request);
	} catch (e) {
		return e instanceof BodyTooLarge ? bad('ไฟล์ใหญ่เกินไป', 413) : bad('invalid body');
	}
	const action = body.fields.action ?? '';
	if (!ACTIONS.includes(action)) return bad('invalid action');
	const note = (body.fields.note ?? '').trim().slice(0, 500) || null;

	const d = db();
	const row = await d.prepare('SELECT * FROM reports WHERE id = ?').bind(params.id).first<ReportRow>();
	if (!row) return bad('not found', 404);
	if (row.purged_at && action !== 'delete') return bad('report was purged under the 30-day policy', 409);
	const fbId = body.fields.feedback_id ? Number(body.fields.feedback_id) : null;

	if (action === 'dismiss_feedback') {
		if (!fbId) return bad('feedback_id required');
		await d.prepare('UPDATE feedback SET handled = 1 WHERE id = ? AND report_id = ?').bind(fbId, row.id).run();
		return json({ ok: true });
	}

	if (action === 'approve') {
		if (row.status !== 'pending') return bad('only pending reports can be approved', 409);
		await d.prepare(`UPDATE reports SET status = 'published', moderator_note = COALESCE(?, moderator_note) WHERE id = ?`).bind(note, row.id).run();
	} else if (action === 'reject') {
		if (row.status === 'rejected') return bad('already rejected', 409);
		await d.prepare(`UPDATE reports SET status = 'rejected', moderator_note = COALESCE(?, moderator_note) WHERE id = ?`).bind(note, row.id).run();
	} else if (action === 'resolve') {
		if (row.status !== 'published') return bad('only published reports can be resolved', 409);
		let key: string | null = null;
		if (body.image) {
			const check = validateJpeg(body.image);
			if (!check.ok) return bad(`รูปไม่ผ่านการตรวจ: ${check.reason}`, 400);
			key = await randomImageKey();
			await images().put(key, body.image, { httpMetadata: { contentType: 'image/jpeg' } });
		} else if (fbId) {
			const fb = await d
				.prepare(`SELECT image_key FROM feedback WHERE id = ? AND report_id = ? AND kind = 'fixed'`)
				.bind(fbId, row.id)
				.first<{ image_key: string | null }>();
			key = fb?.image_key ?? null;
		}
		if (!key) return bad('resolve requires an "after" photo or an accepted fixed feedback with a photo', 422);
		await d
			.prepare(
				`UPDATE reports SET status = 'resolved', resolved_at = ?, resolution_image_key = ?,
				 moderator_note = COALESCE(?, moderator_note) WHERE id = ?`
			)
			.bind(new Date().toISOString(), key, note, row.id)
			.run();
		if (fbId) await d.prepare('UPDATE feedback SET handled = 1 WHERE id = ? AND report_id = ?').bind(fbId, row.id).run();
	} else {
		// delete: removal request or unlawful content. Report row, feedback rows and every R2 object go.
		await deleteReport(d, images(), row);
		return json({ ok: true, deleted: true });
	}
	const fresh = await d.prepare('SELECT * FROM reports WHERE id = ?').bind(row.id).first<ReportRow>();
	return json({ ok: true, report: modView(fresh!) });
};
