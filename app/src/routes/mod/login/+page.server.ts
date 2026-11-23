import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyPassword } from '#lib/server/crypto';
import { clientKey, db } from '#lib/server/db';
import { TOO_MANY } from '#lib/server/http';
import { hit } from '#lib/server/ratelimit';
import { COOKIE, SESSION_MS, createSession } from '#lib/server/session';

// fixed dummy record: an unknown username verifies against it, costing exactly one PBKDF2 like a known user
const DUMMY = { hash: '0'.repeat(64), salt: '00'.repeat(16), iterations: 100_000 };

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.moderator) redirect(303, '/mod');
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const d = db();
		if (!(await hit(d, await clientKey(d, request), 'login'))) return fail(429, { error: TOO_MANY });
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const mod = await d
			.prepare('SELECT id, password_hash, salt, iterations FROM moderators WHERE username = ?')
			.bind(username)
			.first<{ id: number; password_hash: string; salt: string; iterations: number }>();
		// exactly one PBKDF2 either way, so unknown usernames cost the same as wrong passwords
		const rec = mod ? { hash: mod.password_hash, salt: mod.salt, iterations: mod.iterations } : DUMMY;
		const ok = await verifyPassword(password, rec);
		if (!mod || !ok) return fail(401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
		const token = await createSession(d, mod.id);
		const local = ['localhost', '127.0.0.1'].includes(url.hostname);
		cookies.set(COOKIE, token, {
			path: '/',
			httpOnly: true,
			secure: !local, // browsers accept Secure on http://localhost only for some hosts
			sameSite: 'strict',
			maxAge: SESSION_MS / 1000
		});
		redirect(303, '/mod');
	}
};
