// Integration smoke test against a running `vite dev --port 5180` with a migrated LOCAL D1.
//   npm run db:migrate:local && npx vite dev --port 5180 --host 127.0.0.1   (other terminal)
//   BASE=http://127.0.0.1:5180 node scripts/smoke.mjs
// Creates a throwaway moderator with a random password that exists only in this process and the local DB,
// and deletes it and every report it created before exiting.
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../src/lib/server/crypto.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5180';
const ORIGIN = new URL(BASE).origin;
let failures = 0;
const check = (name, ok, extra = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
	if (!ok) failures++;
};

// structurally valid JPEG (SOI, APP0/JFIF, SOS, EOI) without / with an APP1 Exif segment
const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0, 0, 1, 0, 1, 0, 0];
const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9];
const exif = [0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8];
const JPEG = Uint8Array.from([0xff, 0xd8, ...app0, ...sos]);
const JPEG_EXIF = Uint8Array.from([0xff, 0xd8, ...app0, ...exif, ...sos]);

const REAL = { lat: 10.82911, lng: 99.21377 }; // inside Salui, near the tambon office
const ip = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}-${randomBytes(4).toString('hex')}`;
const created = [];
// exact number match: REAL.lng is a prefix of unrelated random public coordinates now and then
const exactNum = (text, n) => new RegExp(`(?<![\\d.])${String(n).replace('.', '\\.')}(?!\\d)`).test(text);

function reportForm({ id = randomUUID(), token = randomBytes(32).toString('base64url'), image = JPEG, lat = REAL.lat, lng = REAL.lng, category = 'overflow' } = {}) {
	const f = new FormData();
	f.set('id', id);
	f.set('tracking_token', token);
	f.set('category', category);
	f.set('latitude', String(lat));
	f.set('longitude', String(lng));
	f.set('location_source', 'gps');
	f.set('description', 'smoke test');
	if (image) f.set('image', new Blob([image], { type: 'image/jpeg' }), 'photo.jpg');
	return { id, token, form: f };
}
const post = (path, form, headers = {}) =>
	fetch(BASE + path, { method: 'POST', body: form, headers: { Origin: ORIGIN, ...headers } });

function wrangler(sql) {
	const dir = mkdtempSync(join(tmpdir(), 'wm-smoke-'));
	const file = join(dir, 'q.sql');
	writeFileSync(file, sql);
	const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'wastemap-salui', '--local', `--file=${file}`, '--json'], { encoding: 'utf8' });
	rmSync(dir, { recursive: true, force: true });
	if (r.status !== 0) throw new Error('wrangler failed: ' + r.stderr.slice(-300));
	return JSON.parse(r.stdout);
}

// ---- throwaway moderator
const modName = `smoke-${randomBytes(4).toString('hex')}`;
const modPass = randomBytes(18).toString('base64url');
const h = await hashPassword(modPass);
wrangler(`INSERT INTO moderators (username, password_hash, salt, iterations, created_at) VALUES ('${modName}', '${h.hash}', '${h.salt}', ${h.iterations}, '${new Date().toISOString()}');`);

try {
	// ---- submit
	const ipA = ip();
	const first = reportForm();
	let res = await post('/api/reports', first.form, { 'CF-Connecting-IP': ipA });
	const body = await res.json();
	check('POST report with client token + JPEG -> 201, server returns no token', res.status === 201 && body.tracking_token === undefined && body.replay === false, `${res.status} ${JSON.stringify(body)}`);
	created.push(first.id);
	const token = first.token;
	const badTok = reportForm({ token: 'short' });
	res = await post('/api/reports', badTok.form, { 'CF-Connecting-IP': ipA });
	check('malformed tracking_token -> 400', res.status === 400, String(res.status));

	const again = reportForm({ id: first.id, token: first.token });
	res = await post('/api/reports', again.form, { 'CF-Connecting-IP': ipA });
	const replay = await res.json();
	check('same id + same token again -> 200 replay', res.status === 200 && replay.replay === true, `${res.status}`);
	const hijack = reportForm({ id: first.id });
	res = await post('/api/reports', hijack.form, { 'CF-Connecting-IP': ipA });
	check('same id + different token -> 409', res.status === 409, String(res.status));
	const count = wrangler(`SELECT COUNT(*) AS n FROM reports WHERE id = '${first.id}';`)[0].results[0].n;
	check('same id again -> exactly one row in D1', count === 1, String(count));

	// ---- privacy of public API
	const pub = await (await fetch(`${BASE}/api/reports`)).text();
	check('pending report absent from public list', !pub.includes(first.id));
	res = await fetch(`${BASE}/api/reports/${first.id}`);
	check('pending report detail -> 404', res.status === 404);
	res = await fetch(`${BASE}/api/images/${first.id}`);
	check('pending image without token/session -> 404', res.status === 404);
	res = await fetch(`${BASE}/api/images/${first.id}?token=${token}`);
	check('pending image with owner token -> 200 image/jpeg', res.status === 200 && res.headers.get('content-type') === 'image/jpeg');
	const mine = await fetch(`${BASE}/api/my-reports/${first.id}?token=${token}`);
	const mineText = await mine.text();
	check('my-reports with token -> 200, hides real coordinates', mine.status === 200 && !exactNum(mineText, REAL.lat) && !/"(latitude|longitude|image_key|tracking_token_hash)"/.test(mineText));
	res = await fetch(`${BASE}/api/my-reports/${first.id}?token=${token}x`);
	check('my-reports with wrong token -> 404', res.status === 404);
	res = await fetch(`${BASE}/api/my-reports/${first.id}`);
	check('my-reports without token -> 404', res.status === 404);

	// ---- moderator login
	const loginUrl = `${BASE}/mod/login`;
	const login = (pw) =>
		fetch(loginUrl, {
			method: 'POST',
			redirect: 'manual',
			headers: { Origin: ORIGIN, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip() },
			body: new URLSearchParams({ username: modName, password: pw })
		});
	res = await login('definitely-wrong-password');
	check('login with wrong password -> 401, no cookie', res.status === 401 && !res.headers.get('set-cookie'), String(res.status));
	res = await login(modPass);
	const setCookie = res.headers.get('set-cookie') ?? '';
	check('login ok -> 303 + HttpOnly SameSite=Strict cookie, ~12h', res.status === 303 && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Max-Age=43200/i.test(setCookie), `${res.status} ${setCookie}`);
	console.log(`INFO  cookie Secure flag on ${new URL(BASE).hostname}: ${/;\s*Secure/i.test(setCookie)} (set for non-localhost hosts)`);
	const cookie = setCookie.split(';')[0];
	const mod = { Cookie: cookie, Origin: ORIGIN };

	res = await fetch(`${BASE}/api/moderation/queue`);
	check('queue without session -> 401', res.status === 401);
	res = await fetch(`${BASE}/api/moderation/queue`, { headers: { Cookie: cookie } });
	const queue = await res.json();
	const q = queue.pending?.find((r) => r.id === first.id);
	check('queue with session -> real location + photo, once', res.status === 200 && q && Math.abs(q.latitude - REAL.lat) < 1e-9 && q.image_url && queue.pending.filter((r) => r.id === first.id).length === 1);
	res = await fetch(`${BASE}/api/images/${first.id}`, { headers: { Cookie: cookie } });
	check('moderator can view pending image', res.status === 200);

	const patch = (id, fields, image, headers = mod) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(fields)) f.set(k, v);
		if (image) f.set('image', new Blob([image], { type: 'image/jpeg' }), 'after.jpg');
		return fetch(`${BASE}/api/moderation/reports/${id}`, { method: 'PATCH', body: f, headers });
	};
	res = await patch(first.id, { action: 'approve' }, null, { Origin: ORIGIN });
	check('PATCH without session -> 401', res.status === 401);
	res = await patch(first.id, { action: 'approve' }, null, { Cookie: cookie, Origin: 'https://evil.example' });
	check('PATCH with foreign Origin -> 403', res.status === 403);
	res = await patch(first.id, { action: 'approve' });
	check('approve -> 200', res.status === 200);

	const pub2 = await (await fetch(`${BASE}/api/reports`)).json();
	const feat = pub2.features.find((f) => f.properties.id === first.id);
	const pubText = JSON.stringify(pub2);
	check('approved report appears in public list', !!feat);
	check('public list: no real lat/lng, no image_key', !exactNum(pubText, REAL.lat) && !exactNum(pubText, REAL.lng) && !/image_key|"latitude"|"longitude"/.test(pubText), (pubText.match(new RegExp(String(REAL.lat) + '(?!\\d)|' + String(REAL.lng) + '(?!\\d)|image_key|"latitude"|"longitude"')) ?? []).join(' '));
	const [pLng, pLat] = feat?.geometry.coordinates ?? [0, 0];
	const dist = Math.hypot((pLat - REAL.lat) * 111320, (pLng - REAL.lng) * 111320 * Math.cos((REAL.lat * Math.PI) / 180));
	check('public point offset 50-100 m from real', dist > 50 && dist < 100, dist.toFixed(1));
	res = await fetch(`${BASE}/api/images/${first.id}`);
	check('published image public -> 200', res.status === 200);
	const detail = await (await fetch(`${BASE}/api/reports/${first.id}`)).text();
	check('detail hides internals', !/image_key|"latitude"|tracking|possible_duplicate/.test(detail) && !exactNum(detail, REAL.lat));

	// ---- feedback + resolve evidence rules
	const fb = (kind, text, image) => {
		const f = new FormData();
		f.set('kind', kind);
		f.set('text', text);
		if (image) f.set('image', new Blob([image], { type: 'image/jpeg' }), 'x.jpg');
		return post(`/api/reports/${first.id}/feedback`, f, { 'CF-Connecting-IP': ip() });
	};
	res = await fb('fixed', '', null);
	check('feedback "fixed" without photo -> 400', res.status === 400);
	res = await fb('fixed', 'cleared', JPEG_EXIF);
	check('feedback photo with EXIF -> 400', res.status === 400);
	res = await patch(first.id, { action: 'resolve' });
	check('resolve without evidence -> 422 (still published)', res.status === 422 && (await (await fetch(`${BASE}/api/reports/${first.id}`)).json()).status === 'published');
	res = await patch(first.id, { action: 'resolve' }, JPEG_EXIF);
	check('resolve with EXIF photo -> 400', res.status === 400);
	res = await fb('removal_request', 'please remove my photo', null);
	check('feedback removal_request -> 201', res.status === 201);
	res = await fb('fixed', 'cleared', JPEG);
	check('feedback "fixed" with photo -> 201', res.status === 201);
	const q2 = await (await fetch(`${BASE}/api/moderation/queue`, { headers: { Cookie: cookie } })).json();
	const fixed = q2.feedback.find((f) => f.report_id === first.id && f.kind === 'fixed');
	check('moderator sees both feedback items', q2.feedback.filter((f) => f.report_id === first.id).length === 2 && !!fixed?.image_url);
	res = await fetch(`${BASE}${fixed.image_url}`, { headers: { Cookie: cookie } });
	const anon = await fetch(`${BASE}${fixed.image_url}`);
	check('feedback image: moderator 200, public 404', res.status === 200 && anon.status === 404);
	res = await patch(first.id, { action: 'resolve', feedback_id: String(fixed.id) });
	const resolved = await res.json();
	check('resolve via accepted fixed feedback with photo -> resolved', res.status === 200 && resolved.report.status === 'resolved' && !!resolved.report.resolved_at);
	const d2 = await (await fetch(`${BASE}/api/reports/${first.id}`)).json();
	res = await fetch(`${BASE}${d2.resolution_image_url}`);
	check('resolved: public after-photo served', d2.status === 'resolved' && res.status === 200);

	// second report: resolve with direct after-photo upload
	const second = reportForm({ lat: 10.8302, lng: 99.2142, category: 'uncollected' });
	res = await post('/api/reports', second.form, { 'CF-Connecting-IP': ip() });
	created.push(second.id);
	await patch(second.id, { action: 'approve' });
	res = await patch(second.id, { action: 'resolve', note: 'collected' }, JPEG);
	check('resolve with uploaded after-photo -> resolved', res.status === 200 && (await res.json()).report.status === 'resolved');

	// ---- validation
	const far = reportForm({ lat: 13.7563, lng: 100.5018 });
	res = await post('/api/reports', far.form, { 'CF-Connecting-IP': ip() });
	check('point outside Salui bbox -> 422', res.status === 422, String(res.status));
	const exifPost = reportForm({ image: JPEG_EXIF });
	res = await post('/api/reports', exifPost.form, { 'CF-Connecting-IP': ip() });
	check('report JPEG with EXIF -> 400', res.status === 400, String(res.status));
	const noImg = reportForm({ image: null });
	res = await post('/api/reports', noImg.form, { 'CF-Connecting-IP': ip() });
	check('report without image -> 400', res.status === 400);
	const png = reportForm({ image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
	res = await post('/api/reports', png.form, { 'CF-Connecting-IP': ip() });
	check('report non-JPEG -> 400', res.status === 400);
	res = await fetch(`${BASE}/api/reports`, { method: 'POST', body: reportForm().form });
	check('report POST without Origin -> 403', res.status === 403);

	// ---- body size is enforced on actual bytes
	const big = reportForm({ image: new Uint8Array(3 * 1024 * 1024 + 10) });
	res = await post('/api/reports', big.form, { 'CF-Connecting-IP': ip() });
	check('oversized body -> 413', res.status === 413, String(res.status));
	res = await fetch(BASE + '/api/reports', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip(), 'Content-Type': 'multipart/form-data; boundary=x', 'Transfer-Encoding': 'chunked' }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.close(); } }), duplex: 'half' }).catch(() => ({ status: 0 }));
	check('streamed body without Content-Length -> rejected (413/411/400)', [413, 411, 400, 0].includes(res.status), String(res.status));

	// ---- reject action
	const rej = reportForm({ lat: 10.8400, lng: 99.2000, category: 'other' });
	await post('/api/reports', rej.form, { 'CF-Connecting-IP': ip() });
	created.push(rej.id);
	res = await patch(rej.id, { action: 'reject', note: 'blurry' });
	check('reject -> 200, status rejected', res.status === 200 && (await res.json()).report.status === 'rejected');
	check('rejected report not public, image 404', (await fetch(`${BASE}/api/reports/${rej.id}`)).status === 404 && (await fetch(`${BASE}/api/images/${rej.id}`)).status === 404);
	const trk = await (await fetch(`${BASE}/api/my-reports/${rej.id}?token=${rej.token}`)).json();
	check('owner sees rejected status + note', trk.status === 'rejected' && trk.moderator_note === 'blurry');

	// ---- image cache headers
	res = await fetch(`${BASE}/api/images/${first.id}?token=${token}`);
	check('image: published, anonymous -> public, max-age=60', (await fetch(`${BASE}/api/images/${second.id}`)).headers.get('cache-control') === 'public, max-age=60');
	check('image: owner token fetch -> private, no-store', res.headers.get('cache-control') === 'private, no-store');
	const pend = reportForm({ lat: 10.8350, lng: 99.2300, category: 'other' });
	await post('/api/reports', pend.form, { 'CF-Connecting-IP': ip() });
	created.push(pend.id);
	res = await fetch(`${BASE}/api/images/${pend.id}?token=${pend.token}`);
	check('image: pending owner fetch -> private, no-store', res.status === 200 && res.headers.get('cache-control') === 'private, no-store');

	// ---- security headers on a live HTML response
	res = await fetch(BASE + '/', { headers: { Accept: 'text/html' } });
	const csp = res.headers.get('content-security-policy') ?? '';
	check('headers: CSP with worker blob + openfreemap, frame-ancestors none', /worker-src[^;]*blob:/.test(csp) && csp.includes('tiles.openfreemap.org') && /frame-ancestors 'none'/.test(csp), csp.slice(0, 120));
	check('headers: X-Content-Type-Options nosniff', res.headers.get('x-content-type-options') === 'nosniff');
	check('headers: Referrer-Policy', res.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
	check('headers: mod queue is no-store', (await fetch(`${BASE}/api/moderation/queue`, { headers: { Cookie: cookie } })).headers.get('cache-control') === 'no-store');

	// ---- login rate limit: 10 attempts per hour per key, 11th -> 429
	const ipL = ip();
	const lcodes = [];
	for (let i = 0; i < 11; i++) {
		const lr = await fetch(loginUrl, { method: 'POST', redirect: 'manual', headers: { Origin: ORIGIN, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ipL }, body: new URLSearchParams({ username: 'nobody', password: 'wrong-password-x' }) });
		lcodes.push(lr.status);
	}
	check('login: 10 wrong attempts -> 401, 11th -> 429', lcodes.slice(0, 10).every((c) => c === 401) && lcodes[10] === 429, lcodes.join(','));

	// ---- duplicate hint (real-coordinate based)
	const dupA = reportForm({ lat: 10.8250, lng: 99.2100, category: 'illegal_dumping' });
	const dupB = reportForm({ lat: 10.82515, lng: 99.2100, category: 'illegal_dumping' }); // ~17 m
	const ipD = ip();
	await post('/api/reports', dupA.form, { 'CF-Connecting-IP': ipD });
	await post('/api/reports', dupB.form, { 'CF-Connecting-IP': ipD });
	created.push(dupA.id, dupB.id);
	const q3 = await (await fetch(`${BASE}/api/moderation/queue`, { headers: { Cookie: cookie } })).json();
	check('near-identical report flagged possible_duplicate_of', q3.pending.find((r) => r.id === dupB.id)?.possible_duplicate_of === dupA.id);

	// ---- stats + export
	const stats = await (await fetch(`${BASE}/api/stats`)).json();
	check('stats counts published+resolved', stats.total >= 2 && stats.resolved >= 2);
	const csv = await (await fetch(`${BASE}/api/export?format=csv`)).text();
	const gj = await (await fetch(`${BASE}/api/export?format=geojson`)).text();
	check('export: public coords only, no description/images', csv.startsWith('id,category,status') && !/smoke test|image|description/.test(csv + gj) && !exactNum(csv, REAL.lat));

	// ---- rate limit: 10 ok, 11th 429 (fresh key)
	const ipR = ip();
	const codes = [];
	for (let i = 0; i < 11; i++) {
		const r = reportForm({ lat: 10.8 + Math.random() * 0.05, lng: 99.2 + Math.random() * 0.03, category: 'other' });
		const rr = await post('/api/reports', r.form, { 'CF-Connecting-IP': ipR });
		codes.push(rr.status);
		created.push(r.id);
	}
	check('11th POST within an hour -> 429 (first 10 accepted)', codes.slice(0, 10).every((c) => c === 201) && codes[10] === 429, codes.join(','));
	const keys = wrangler('SELECT key FROM rate_limits;')[0].results.map((r) => r.key).join(' ');
	check('rate_limits stores no raw IP', !keys.includes('203.0.113'));

	const fb2 = (rid) => { const f = new FormData(); f.set('kind', 'more_info'); f.set('text', 'late note'); return post(`/api/reports/${rid}/feedback`, f, { 'CF-Connecting-IP': ip() }); };

	// ---- 30-day retention (lazy purge trigger; R2 checked through the platform proxy, not HTTP)
	{
		const { getPlatformProxy } = await import('wrangler');
		const proxy = await getPlatformProxy({ configPath: new URL('../wrangler.jsonc', import.meta.url).pathname });
		try {
			const statsBefore = (await (await fetch(`${BASE}/api/stats`)).json()).total;
			const ret = reportForm({ lat: 10.8330, lng: 99.2250, category: 'overflow' });
			const ipT = ip();
			await post('/api/reports', ret.form, { 'CF-Connecting-IP': ipT });
			created.push(ret.id);
			await patch(ret.id, { action: 'approve' });
			await patch(ret.id, { action: 'resolve' }, JPEG);
			const ff = new FormData();
			ff.set('kind', 'more_info');
			ff.set('text', 'extra photo for retention');
			ff.set('image', new Blob([JPEG], { type: 'image/jpeg' }), 'x.jpg');
			res = await post(`/api/reports/${ret.id}/feedback`, ff, { 'CF-Connecting-IP': ipT });
			check('retention setup: report + after photo + feedback photo', res.status === 201);
			const rows = wrangler(`SELECT image_key AS k FROM reports WHERE id='${ret.id}' UNION ALL SELECT resolution_image_key FROM reports WHERE id='${ret.id}' UNION ALL SELECT image_key FROM feedback WHERE report_id='${ret.id}';`)[0].results.map((r) => r.k).filter(Boolean);
			const present = await Promise.all(rows.map(async (k) => !!(await proxy.env.IMAGES.head(k))));
			check('retention setup: 3 objects exist in local R2', rows.length === 3 && present.every(Boolean), JSON.stringify({ rows, present }));

			const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
			wrangler(`UPDATE reports SET submitted_at='${old}' WHERE id='${ret.id}'; DELETE FROM meta WHERE name='last_purge';`);
			await fetch(`${BASE}/api/stats`); // any request claims the throttled purge (runs via waitUntil)
			let purged = null;
			for (let i = 0; i < 30 && !purged; i++) {
				await new Promise((r) => setTimeout(r, 500));
				purged = wrangler(`SELECT purged_at AS p FROM reports WHERE id='${ret.id}';`)[0].results[0].p;
			}
			check('retention: lazy purge ran, purged_at set', !!purged);
			const row = wrangler(`SELECT latitude, longitude, public_latitude, public_longitude, description, image_key, image_hash, tracking_token_hash, resolution_image_key, moderator_note, status, resolved_at FROM reports WHERE id='${ret.id}';`)[0].results[0];
			check('retention: real coords replaced by public ones, personal fields null, stats fields kept',
				row.latitude === row.public_latitude && row.longitude === row.public_longitude &&
				[row.description, row.image_key, row.image_hash, row.tracking_token_hash, row.resolution_image_key, row.moderator_note].every((v) => v === null) &&
				row.status === 'resolved' && !!row.resolved_at);
			const fbLeft = wrangler(`SELECT COUNT(*) AS n FROM feedback WHERE report_id='${ret.id}';`)[0].results[0].n;
			check('retention: feedback rows deleted', fbLeft === 0);
			const gone = await Promise.all(rows.map(async (k) => (await proxy.env.IMAGES.head(k)) === null));
			check('retention: all 3 R2 objects really gone (platform proxy)', gone.every(Boolean), JSON.stringify(gone));
			const pubDetail = await (await fetch(`${BASE}/api/reports/${ret.id}`)).json();
			check('retention: public detail has no description / image, flagged purged', pubDetail.description === null && pubDetail.image_url === null && pubDetail.resolution_image_url === null && pubDetail.purged === true);
			check('retention: image endpoints 404', (await fetch(`${BASE}/api/images/${ret.id}`)).status === 404 && (await fetch(`${BASE}/api/images/${ret.id}?kind=after`)).status === 404);
			check('retention: tracking link 404', (await fetch(`${BASE}/api/my-reports/${ret.id}?token=${ret.token}`)).status === 404);
			check('retention: stats still count the report', (await (await fetch(`${BASE}/api/stats`)).json()).total === statsBefore + 1);
			const mq = await (await fetch(`${BASE}/api/moderation/queue`, { headers: { Cookie: cookie } })).json();
			check('retention: purged report not in moderator queue', !mq.published.some((r) => r.id === ret.id));
			res = await fb2(ret.id);
			check('retention: feedback on purged report -> 404', res.status === 404);
		} finally {
			await proxy.dispose();
		}
	}

	// ---- delete (removal) removes rows and R2 objects
	res = await patch(first.id, { action: 'delete' });
	check('moderator delete -> 200', res.status === 200);
	res = await fetch(`${BASE}/api/images/${first.id}`, { headers: { Cookie: cookie } });
	check('deleted report image gone', res.status === 404);
} catch (e) {
	failures++;
	console.log('FAIL  exception', e);
} finally {
	// cleanup: sessions, moderator, every report this run created (R2 objects removed via moderator delete when possible)
	try {
		wrangler(
			`DELETE FROM sessions WHERE moderator_id IN (SELECT id FROM moderators WHERE username='${modName}');` +
				`DELETE FROM moderators WHERE username='${modName}';` +
				`DELETE FROM feedback WHERE report_id IN (${created.map((i) => `'${i}'`).join(',')});` +
				`DELETE FROM reports WHERE id IN (${created.map((i) => `'${i}'`).join(',')});` +
				`DELETE FROM rate_limits;`
		);
	} catch (e) {
		console.log('WARN cleanup failed', e.message);
	}
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
