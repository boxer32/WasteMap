import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { obscure } from '#lib/domain';
import { hashToken, sha256Hex, timingSafeEqual } from '#lib/server/crypto';
import { clientKey, db, images, publicReport, randomImageKey, secret, type ReportRow } from '#lib/server/db';
import { duplicateQuery, inBbox, nearestDuplicate } from '#lib/server/geo';
import { BodyTooLarge, bad, readBody, sameOrigin, TOO_MANY } from '#lib/server/http';
import { validateJpeg } from '#lib/server/image';
import { hit } from '#lib/server/ratelimit';

const CATEGORIES = ['overflow', 'missed_collection', 'uncollected', 'illegal_dumping', 'other'];
const SOURCES = ['exif', 'gps', 'manual'];
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ url }) => {
	const where = [`status IN ('published','resolved')`];
	const params: unknown[] = [];
	const days = Number(url.searchParams.get('days') ?? 0);
	if (days > 0) {
		where.push('submitted_at >= ?');
		params.push(new Date(Date.now() - Math.min(days, 3650) * 86_400_000).toISOString());
	}
	const category = url.searchParams.get('category');
	if (category) {
		if (!CATEGORIES.includes(category)) return bad('invalid category');
		where.push('category = ?');
		params.push(category);
	}
	const status = url.searchParams.get('status');
	if (status) {
		if (status !== 'published' && status !== 'resolved') return bad('invalid status');
		where.push('status = ?');
		params.push(status);
	}
	const bbox = url.searchParams.get('bbox');
	if (bbox) {
		const [w, s, e, n] = bbox.split(',').map(Number);
		if ([w, s, e, n].some((v) => !Number.isFinite(v))) return bad('invalid bbox');
		where.push('public_longitude BETWEEN ? AND ? AND public_latitude BETWEEN ? AND ?');
		params.push(w, e, s, n);
	}
	const { results } = await db()
		.prepare(
			`SELECT id, category, status, submitted_at, resolved_at, public_latitude, public_longitude
			 FROM reports WHERE ${where.join(' AND ')} ORDER BY submitted_at DESC LIMIT 5000`
		)
		.bind(...params)
		.all<Pick<ReportRow, 'id' | 'category' | 'status' | 'submitted_at' | 'resolved_at' | 'public_latitude' | 'public_longitude'>>();
	return json(
		{
			type: 'FeatureCollection',
			features: results.map((r) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [r.public_longitude, r.public_latitude] },
				properties: {
					id: r.id,
					category: r.category,
					status: r.status,
					submitted_at: r.submitted_at,
					resolved_at: r.resolved_at
				}
			}))
		},
		{ headers: { 'Cache-Control': 'public, max-age=30' } }
	);
};

export const POST: RequestHandler = async ({ request, url }) => {
	if (!sameOrigin(request, url)) return bad('forbidden', 403);
	const d = db();
	if (!(await hit(d, await clientKey(d, request), 'report'))) return bad(TOO_MANY, 429);

	let body;
	try {
		body = await readBody(request);
	} catch (e) {
		return e instanceof BodyTooLarge ? bad('ไฟล์ใหญ่เกินไป', 413) : bad('invalid body');
	}
	const f = body.fields;
	const id = (f.id ?? '').toLowerCase();
	if (!UUID.test(id)) return bad('invalid id');

	// the client generates the tracking token (so it survives a lost response); the server keeps only its hash
	const token = f.tracking_token ?? '';
	if (!TOKEN.test(token)) return bad('invalid tracking_token');
	const tokenHash = await hashToken(token);

	// idempotent replay: same id + same token -> stored record; a different token never gets it
	const existing = await d.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRow>();
	if (existing) {
		if (!existing.tracking_token_hash || !timingSafeEqual(tokenHash, existing.tracking_token_hash)) return bad('id already used', 409);
		return json({ report: publicReport(existing), replay: true }, { status: 200 });
	}

	const lat = Number(f.latitude);
	const lng = Number(f.longitude);
	if (!SOURCES.includes(f.location_source ?? '')) return bad('invalid location_source');
	if (!CATEGORIES.includes(f.category ?? '')) return bad('invalid category');
	if (!inBbox(lat, lng)) return bad('ตำแหน่งอยู่นอกพื้นที่ตำบลสลุย', 422);
	const description = (f.description ?? '').trim().slice(0, 300) || null;
	if ((f.description ?? '').trim().length > 300) return bad('description too long');
	const accuracy = f.location_accuracy ? Number(f.location_accuracy) : null;
	if (accuracy !== null && !Number.isFinite(accuracy)) return bad('invalid accuracy');
	let captured: string | null = null;
	if (f.photo_captured_at) {
		const t = new Date(f.photo_captured_at);
		if (Number.isNaN(+t)) return bad('invalid photo_captured_at');
		captured = t.toISOString();
	}
	if (!body.image) return bad('ต้องแนบรูป');
	const check = validateJpeg(body.image);
	if (!check.ok) return bad(`รูปไม่ผ่านการตรวจ: ${check.reason}`, check.reason === 'too_large' ? 413 : 400);

	const now = Date.now();
	const dupQ = duplicateQuery(f.category, lat, lng, now);
	const { results: near } = await d
		.prepare(dupQ.sql)
		.bind(...dupQ.params)
		.all<{ id: string; latitude: number; longitude: number }>();
	const duplicateOf = nearestDuplicate(lat, lng, near);

	const pub = obscure(lat, lng, id + (await secret(d, 'geo_secret')));
	const key = await randomImageKey();
	await images().put(key, body.image, { httpMetadata: { contentType: 'image/jpeg' } });

	const res = (await d
		.prepare(
			`INSERT INTO reports (id, category, latitude, longitude, location_accuracy, location_source,
				public_latitude, public_longitude, image_key, image_hash, description, photo_captured_at,
				submitted_at, status, possible_duplicate_of, tracking_token_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
			 ON CONFLICT(id) DO NOTHING`
		)
		.bind(
			id, f.category, lat, lng, accuracy, f.location_source, pub.lat, pub.lng, key,
			await sha256Hex(body.image), description, captured, new Date(now).toISOString(),
			duplicateOf, tokenHash
		)
		.run()) as { meta?: { changes?: number } };

	if (res.meta?.changes === 0) {
		// lost a race with a concurrent identical POST: keep theirs, drop our upload
		await images().delete(key);
		const row = (await d.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRow>())!;
		if (!row.tracking_token_hash || !timingSafeEqual(tokenHash, row.tracking_token_hash)) return bad('id already used', 409);
		return json({ report: publicReport(row), replay: true }, { status: 200 });
	}
	const row = await d.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRow>();
	return json({ report: publicReport(row!), replay: false }, { status: 201 });
};
