import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clientKey, db, images, randomImageKey, type ReportRow } from '#lib/server/db';
import { BodyTooLarge, bad, readBody, sameOrigin, TOO_MANY } from '#lib/server/http';
import { validateJpeg } from '#lib/server/image';
import { hit } from '#lib/server/ratelimit';

const KINDS = ['more_info', 'fixed', 'removal_request'];

export const POST: RequestHandler = async ({ params, request, url }) => {
	if (!sameOrigin(request, url)) return bad('forbidden', 403);
	const d = db();
	if (!(await hit(d, await clientKey(d, request), 'feedback'))) return bad(TOO_MANY, 429);

	let body;
	try {
		body = await readBody(request);
	} catch (e) {
		return e instanceof BodyTooLarge ? bad('ไฟล์ใหญ่เกินไป', 413) : bad('invalid body');
	}
	const kind = body.fields.kind ?? '';
	if (!KINDS.includes(kind)) return bad('invalid kind');
	const text = (body.fields.text ?? '').trim();
	if (text.length > 500) return bad('text too long');
	if (kind !== 'fixed' && text.length < 4) return bad('กรุณาระบุรายละเอียดอย่างน้อย 4 ตัวอักษร');

	const row = await d.prepare('SELECT id, status, purged_at FROM reports WHERE id = ?').bind(params.id).first<Pick<ReportRow, 'id' | 'status' | 'purged_at'>>();
	if (!row || row.purged_at || row.status === 'rejected') return bad('not found', 404);

	let key: string | null = null;
	if (body.image) {
		const check = validateJpeg(body.image);
		if (!check.ok) return bad(`รูปไม่ผ่านการตรวจ: ${check.reason}`, check.reason === 'too_large' ? 413 : 400);
		key = await randomImageKey();
		await images().put(key, body.image, { httpMetadata: { contentType: 'image/jpeg' } });
	}
	if (kind === 'fixed' && !key) return bad('ต้องแนบรูปหลังแก้ไข');

	await d
		.prepare('INSERT INTO feedback (report_id, kind, text, image_key, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(row.id, kind, text || null, key, new Date().toISOString())
		.run();
	return json({ ok: true }, { status: 201 });
};
