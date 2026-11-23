import { randomToken, sha256Hex } from './crypto';
import type { Db } from './ratelimit';

export const COOKIE = 'wm_session';
export const SESSION_MS = 12 * 3_600_000;

export async function createSession(d: Db, moderatorId: number, now = Date.now()): Promise<string> {
	const token = randomToken(32);
	await d.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
	await d
		.prepare('INSERT INTO sessions (token_hash, moderator_id, expires_at) VALUES (?, ?, ?)')
		.bind(await sha256Hex(token), moderatorId, now + SESSION_MS)
		.run();
	return token;
}

export async function moderatorFor(d: Db, token: string | undefined, now = Date.now()) {
	if (!token) return null;
	return d
		.prepare(
			`SELECT m.id, m.username FROM sessions s JOIN moderators m ON m.id = s.moderator_id
			 WHERE s.token_hash = ? AND s.expires_at > ?`
		)
		.bind(await sha256Hex(token), now)
		.first<{ id: number; username: string }>();
}

export async function destroySession(d: Db, token: string) {
	await d.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}
