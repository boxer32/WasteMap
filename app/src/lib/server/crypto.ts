// Import-free on purpose: also loaded by scripts/*.mjs and vitest (Node strips the types).

export const PBKDF2_ITERATIONS = 100_000; // workerd rejects more than 100000

const enc = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function toBase64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
	const data = typeof input === 'string' ? enc.encode(input) : input;
	return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource)));
}

/** Constant-time string compare (length is not secret: hashes are fixed-size). */
export function timingSafeEqual(a: string, b: string): boolean {
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	const n = Math.max(x.length, y.length);
	for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

export async function hashToken(token: string): Promise<string> {
	return sha256Hex(token);
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
	return timingSafeEqual(await sha256Hex(token), storedHash);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		256
	);
	return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return { hash: await pbkdf2(password, salt, iterations), salt: toHex(salt), iterations };
}

export async function verifyPassword(
	password: string,
	rec: { hash: string; salt: string; iterations: number }
): Promise<boolean> {
	return timingSafeEqual(await pbkdf2(password, fromHex(rec.salt), rec.iterations), rec.hash);
}
