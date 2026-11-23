import { describe, expect, it } from 'vitest';
import { obscure } from '../src/lib/domain';
import { BodyTooLarge, readBody } from '../src/lib/server/http';
import { hashPassword, hashToken, PBKDF2_ITERATIONS, randomToken, verifyPassword, verifyToken } from '../src/lib/server/crypto';
import { SALUI_BBOX, duplicateQuery, haversineM, inBbox, nearestDuplicate } from '../src/lib/server/geo';
import { MAX_IMAGE_BYTES, validateJpeg } from '../src/lib/server/image';
import { LIMITS, WINDOW_MS, hit } from '../src/lib/server/ratelimit';
import { BATCH, purgeExpired, purgeIfDue } from '../src/lib/server/retention';
import { deleteReport } from '../src/lib/server/remove';
import { memoryDb } from './d1-shim';

/** SOI, APP0 (JFIF), SOS header, a few scan bytes, EOI. */
function jpeg(...extra: number[][]): Uint8Array {
	const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0, 0, 1, 0, 1, 0, 0];
	const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
	return Uint8Array.from([0xff, 0xd8, ...app0, ...extra.flat(), ...sos, 0x12, 0x34, 0xff, 0xd9]);
}
const exifApp1 = [0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8];

describe('obscure', () => {
	it('moves the public point 55-95 m from the real one, deterministically', () => {
		const lat = 10.83487,
			lng = 99.18772;
		for (let i = 0; i < 300; i++) {
			const p = obscure(lat, lng, `report-${i}-secret`);
			const d = haversineM(lat, lng, p.lat, p.lng);
			expect(d).toBeGreaterThan(54);
			expect(d).toBeLessThan(96);
			expect(obscure(lat, lng, `report-${i}-secret`)).toEqual(p);
		}
	});
});

describe('tracking token', () => {
	it('verifies only the matching token, constant-time compare on hashes', async () => {
		const token = randomToken(32);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const stored = await hashToken(token);
		expect(stored).toMatch(/^[0-9a-f]{64}$/);
		expect(stored).not.toContain(token);
		expect(await verifyToken(token, stored)).toBe(true);
		expect(await verifyToken(randomToken(32), stored)).toBe(false);
		expect(await verifyToken('', stored)).toBe(false);
	});
});

describe('jpeg validation', () => {
	it('accepts a JPEG without APP1', () => {
		expect(validateJpeg(jpeg())).toEqual({ ok: true });
	});
	it('rejects a JPEG with an APP1/Exif segment', () => {
		expect(validateJpeg(jpeg(exifApp1))).toEqual({ ok: false, reason: 'has_exif' });
	});
	it('rejects non-JPEG, oversize and truncated input', () => {
		expect(validateJpeg(new TextEncoder().encode('GIF89a....'))).toEqual({ ok: false, reason: 'not_jpeg' });
		expect(validateJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({ ok: false, reason: 'not_jpeg' });
		expect(validateJpeg(new Uint8Array(MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, reason: 'too_large' });
		expect(validateJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2]))).toEqual({ ok: false, reason: 'malformed' });
	});
});

describe('bbox', () => {
	it('accepts Salui and a 1 km margin, rejects far points and junk', () => {
		expect(inBbox(10.82775, 99.213694)).toBe(true);
		expect(inBbox(SALUI_BBOX.maxLat - 0.001, 99.2)).toBe(true);
		expect(inBbox(13.7563, 100.5018)).toBe(false); // Bangkok
		expect(inBbox(SALUI_BBOX.maxLat + 0.05, 99.2)).toBe(false); // ~5.5 km north
		expect(inBbox(NaN, 99.2)).toBe(false);
		expect(inBbox(0, 0)).toBe(false);
	});
});

describe('rate limit', () => {
	it('allows 10 reports per window, blocks the 11th, resets after the window, isolates keys', async () => {
		const db = memoryDb();
		const t0 = 1_700_000_000_000;
		for (let i = 0; i < LIMITS.report; i++) expect(await hit(db, 'k1', 'report', t0 + i)).toBe(true);
		expect(await hit(db, 'k1', 'report', t0 + 20)).toBe(false);
		expect(await hit(db, 'k2', 'report', t0 + 20)).toBe(true);
		expect(await hit(db, 'k1', 'feedback', t0 + 20)).toBe(true); // separate bucket
		expect(await hit(db, 'k1', 'report', t0 + WINDOW_MS + 1)).toBe(true);
		const row = await db.prepare('SELECT key FROM rate_limits').bind().all<{ key: string }>();
		expect(row.results.every((r) => !r.key.includes('.'))).toBe(true);
	});
});

describe('duplicate detection', () => {
	const now = Date.parse('2026-11-23T12:00:00Z');
	const base = { lat: 10.83, lng: 99.2 };
	const metersNorth = (m: number) => base.lat + m / 111_320;

	async function seed() {
		const db = memoryDb();
		const ins = (id: string, cat: string, lat: number, ageH: number, status = 'published') =>
			db
				.prepare(
					`INSERT INTO reports (id, category, latitude, longitude, location_source, public_latitude, public_longitude,
					 image_key, submitted_at, status, tracking_token_hash) VALUES (?, ?, ?, ?, 'gps', ?, ?, 'k', ?, ?, 'h')`
				)
				.bind(id, cat, lat, base.lng, lat, base.lng, new Date(now - ageH * 3_600_000).toISOString(), status)
				.run();
		await ins('near', 'overflow', metersNorth(30), 1);
		await ins('far', 'overflow', metersNorth(40), 1);
		await ins('othercat', 'uncollected', metersNorth(10), 1);
		await ins('old', 'overflow', metersNorth(5), 49);
		await ins('rejected', 'overflow', metersNorth(5), 1, 'rejected');
		return db;
	}

	it('flags the same category within 30 m, 48 h, not rejected', async () => {
		const db = await seed();
		const q = duplicateQuery('overflow', base.lat, base.lng, now);
		const { results } = await db.prepare(q.sql).bind(...q.params).all<{ id: string; latitude: number; longitude: number }>();
		// SQL prefilter drops other category, >48 h, rejected and anything outside the ~45 m box
		expect(results.map((r) => r.id).sort()).toEqual(['far', 'near']);
		expect(nearestDuplicate(base.lat, base.lng, results)).toBe('near');
	});
	it('returns null when nothing is within 30 m', () => {
		expect(nearestDuplicate(base.lat, base.lng, [{ id: 'x', latitude: metersNorth(40), longitude: base.lng }])).toBeNull();
	});
});

describe('deleteReport', () => {
	it('removes every R2 key (photo, after-photo, feedback photos) and all rows', async () => {
		const db = memoryDb();
		await db.prepare(`INSERT INTO reports (id, category, latitude, longitude, location_source, public_latitude, public_longitude, image_key, submitted_at, tracking_token_hash, resolution_image_key) VALUES ('r1','other',1,1,'gps',1,1,'img/a.jpg','2026-01-01T00:00:00Z','h','img/b.jpg')`).bind().run();
		await db.prepare(`INSERT INTO feedback (report_id, kind, image_key, created_at) VALUES ('r1','fixed','img/c.jpg','x'), ('r1','more_info',NULL,'x'), ('r1','fixed','img/b.jpg','x')`).bind().run();
		const gone: string[] = [];
		const keys = await deleteReport(db, { delete: async (k) => void gone.push(...[k].flat()) }, { id: 'r1', image_key: 'img/a.jpg', resolution_image_key: 'img/b.jpg' });
		expect(gone.sort()).toEqual(['img/a.jpg', 'img/b.jpg', 'img/c.jpg']);
		expect(keys.length).toBe(3);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM reports').bind().first<{ n: number }>())!.n).toBe(0);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM feedback').bind().first<{ n: number }>())!.n).toBe(0);
	});
});

describe('pbkdf2', () => {
	it('verifies the right password, rejects wrong ones, uses 100k iterations and a random salt', async () => {
		const a = await hashPassword('correct horse battery');
		const b = await hashPassword('correct horse battery');
		expect(a.iterations).toBe(PBKDF2_ITERATIONS);
		expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
		expect(a.salt).not.toBe(b.salt);
		expect(a.hash).not.toBe(b.hash);
		expect(await verifyPassword('correct horse battery', { hash: a.hash, salt: a.salt, iterations: a.iterations })).toBe(true);
		expect(await verifyPassword('wrong', { hash: a.hash, salt: a.salt, iterations: a.iterations })).toBe(false);
	});
});

describe('readBody limit', () => {
	const mk = (body: string, headers: Record<string, string> = {}) =>
		new Request('http://x/', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
	it('accepts a body within the limit', async () => {
		const b = '{"a":"b"}';
		expect((await readBody(mk(b, { 'content-length': String(b.length) }), 100)).fields).toEqual({ a: 'b' });
	});
	it('rejects missing Content-Length, oversized declared length, and a lying small header', async () => {
		await expect(readBody(mk('{}'), 100)).rejects.toBeInstanceOf(BodyTooLarge);
		await expect(readBody(mk('{}', { 'content-length': '101' }), 100)).rejects.toBeInstanceOf(BodyTooLarge);
		await expect(readBody(mk('{"a":"' + 'x'.repeat(200) + '"}', { 'content-length': '10' }), 100)).rejects.toBeInstanceOf(BodyTooLarge);
	});
});

describe('retention purge', () => {
	const now = Date.parse('2026-12-31T00:00:00Z');
	const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
	const fakeBucket = () => {
		const calls: string[][] = [];
		return { calls, delete: async (k: string | string[]) => void calls.push([k].flat()) };
	};
	const ins = (db: ReturnType<typeof memoryDb>, id: string, days: number, status = 'published', img = `img/${id}.jpg`, res: string | null = null) =>
		db
			.prepare(
				`INSERT INTO reports (id, category, latitude, longitude, location_accuracy, location_source, public_latitude, public_longitude,
				 image_key, image_hash, description, photo_captured_at, submitted_at, status, possible_duplicate_of, resolved_at,
				 tracking_token_hash, resolution_image_key, moderator_note)
				 VALUES (?, 'overflow', 10.8, 99.2, 5, 'gps', 10.801, 99.201, ?, 'hash', 'secret text', 'cap', ?, ?, 'dupof', 'res-at', 'th', ?, 'note')`
			)
			.bind(id, img, ago(days), status, res)
			.run();

	it('anonymises only reports older than 30 days, deletes all their R2 keys and feedback, keeps stats fields', async () => {
		const db = memoryDb();
		await ins(db, 'old', 31, 'resolved', 'img/old.jpg', 'img/old-after.jpg');
		await ins(db, 'oldpending', 45, 'pending');
		await ins(db, 'fresh', 29);
		const fb = (rid: string, key: string | null) => db.prepare(`INSERT INTO feedback (report_id, kind, image_key, created_at) VALUES (?, 'fixed', ?, 'x')`).bind(rid, key).run();
		await fb('old', 'img/fb1.jpg');
		await fb('old', null);
		await fb('fresh', 'img/fresh-fb.jpg');
		await db.prepare(`INSERT INTO sessions VALUES ('a', 1, ?), ('b', 1, ?)`).bind(now - 1, now + 1000).run();
		await db.prepare(`INSERT INTO rate_limits VALUES ('old', ?, 1), ('new', ?, 1)`).bind(now - 3 * 86_400_000, now - 1000).run();

		const bucket = fakeBucket();
		const r = await purgeExpired(db, bucket, now);
		expect(r).toEqual({ reports: 2, objects: 4, sessions: 1, rateLimits: 1 });
		expect(bucket.calls.flat().sort()).toEqual(['img/fb1.jpg', 'img/old-after.jpg', 'img/old.jpg', 'img/oldpending.jpg']);

		const row = (id: string) => db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<Record<string, unknown>>();
		const old = (await row('old'))!;
		expect(old).toMatchObject({
			latitude: 10.801, longitude: 99.201, public_latitude: 10.801, public_longitude: 99.201,
			description: null, image_key: null, image_hash: null, tracking_token_hash: null, resolution_image_key: null,
			moderator_note: null, location_accuracy: null, photo_captured_at: null, purged_at: new Date(now).toISOString(),
			// kept
			id: 'old', category: 'overflow', status: 'resolved', submitted_at: ago(31), resolved_at: 'res-at', possible_duplicate_of: 'dupof'
		});
		expect((await row('oldpending'))).toMatchObject({ status: 'pending', description: null, purged_at: expect.any(String) });
		expect((await row('fresh'))).toMatchObject({ description: 'secret text', image_key: 'img/fresh.jpg', latitude: 10.8, purged_at: null });
		const left = await db.prepare('SELECT report_id FROM feedback').bind().all<{ report_id: string }>();
		expect(left.results.map((x) => x.report_id)).toEqual(['fresh']);

		const again = fakeBucket();
		expect(await purgeExpired(db, again, now)).toEqual({ reports: 0, objects: 0, sessions: 0, rateLimits: 0 });
		expect(again.calls).toEqual([]);
	});

	it('works through batches of at most 100', async () => {
		const db = memoryDb();
		for (let i = 0; i < 250; i++) await ins(db, `r${i}`, 40);
		const bucket = fakeBucket();
		const r = await purgeExpired(db, bucket, now);
		expect(r.reports).toBe(250);
		expect(bucket.calls.length).toBe(3);
		expect(Math.max(...bucket.calls.map((c) => c.length))).toBeLessThanOrEqual(BATCH);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE purged_at IS NULL').bind().first<{ n: number }>())!.n).toBe(0);
	});

	it('lazy trigger runs at most once per hour', async () => {
		const db = memoryDb();
		await ins(db, 'old', 40);
		const b = fakeBucket();
		expect((await purgeIfDue(db, b, now))?.reports).toBe(1);
		await ins(db, 'old2', 40);
		expect(await purgeIfDue(db, b, now + 59 * 60_000)).toBeNull();
		expect((await purgeIfDue(db, b, now + 61 * 60_000))?.reports).toBe(1);
	});
});
