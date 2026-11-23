import { env } from 'cloudflare:workers';
import { randomToken, sha256Hex, toHex } from './crypto';
import type { Db } from './ratelimit';

export const db = (): D1Database => env.DB;
export const images = (): R2Bucket => env.IMAGES;

export interface ReportRow {
	id: string;
	category: string;
	latitude: number;
	longitude: number;
	location_accuracy: number | null;
	location_source: string;
	public_latitude: number;
	public_longitude: number;
	image_key: string | null;
	image_hash: string | null;
	description: string | null;
	photo_captured_at: string | null;
	submitted_at: string;
	status: 'pending' | 'published' | 'resolved' | 'rejected';
	possible_duplicate_of: string | null;
	resolved_at: string | null;
	tracking_token_hash: string | null;
	resolution_image_key: string | null;
	moderator_note: string | null;
	purged_at: string | null;
}

/** Server secret generated on first use and kept in D1 (not in code, not in the repo). */
export async function secret(d: Db, name: string): Promise<string> {
	const read = () => d.prepare('SELECT value FROM meta WHERE name = ?').bind(name).first<{ value: string }>();
	const existing = await read();
	if (existing) return existing.value;
	await d.prepare('INSERT OR IGNORE INTO meta (name, value) VALUES (?, ?)').bind(name, randomToken(32)).run();
	return (await read())!.value;
}

/** Rate-limit key: SHA-256(daily salt + IP). The raw IP is never stored. */
export async function clientKey(d: Db, request: Request, now = new Date()): Promise<string> {
	const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
	const day = now.toISOString().slice(0, 10);
	const salt = await sha256Hex((await secret(d, 'rate_secret')) + day);
	return sha256Hex(salt + ip);
}

export function publicReport(r: ReportRow) {
	const visible = (r.status === 'published' || r.status === 'resolved') && !r.purged_at;
	return {
		id: r.id,
		category: r.category,
		status: r.status,
		submitted_at: r.submitted_at,
		resolved_at: r.resolved_at,
		description: r.description,
		public_latitude: r.public_latitude,
		public_longitude: r.public_longitude,
		image_url: visible ? `/api/images/${r.id}` : null,
		purged: !!r.purged_at,
		resolution_image_url: r.status === 'resolved' && r.resolution_image_key ? `/api/images/${r.id}?kind=after` : null
	};
}

export async function randomImageKey(): Promise<string> {
	return `img/${toHex(crypto.getRandomValues(new Uint8Array(16)))}.jpg`;
}

