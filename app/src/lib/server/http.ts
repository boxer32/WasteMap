import { json } from '@sveltejs/kit';

export function bad(message: string, status = 400) {
	return json({ error: message }, { status });
}

/** CSRF defence for cookie-authenticated and public mutations: Origin must match the site. */
export function sameOrigin(request: Request, url: URL): boolean {
	return request.headers.get('origin') === url.origin;
}

export const TOO_MANY = 'ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';

export const MAX_BODY_BYTES = 3 * 1024 * 1024;

export class BodyTooLarge extends Error {}

/**
 * Reads JSON or multipart into one shape. The limit is enforced on the bytes actually received:
 * a missing/oversized Content-Length is rejected up front, and the stream is counted while read.
 */
export async function readBody(
	request: Request,
	max = MAX_BODY_BYTES
): Promise<{ fields: Record<string, string>; image: Uint8Array | null }> {
	const declared = request.headers.get('content-length');
	if (declared === null || !(Number(declared) <= max)) throw new BodyTooLarge();
	const reader = request.body?.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (reader) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > max) {
			await reader.cancel();
			throw new BodyTooLarge();
		}
		chunks.push(value);
	}
	const buf = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		buf.set(c, off);
		off += c.length;
	}
	const type = request.headers.get('content-type') ?? '';
	const fields: Record<string, string> = {};
	if (type.includes('application/json')) {
		const data = JSON.parse(new TextDecoder().decode(buf)) as Record<string, unknown>;
		for (const [k, v] of Object.entries(data ?? {})) if (typeof v === 'string' || typeof v === 'number') fields[k] = String(v);
		return { fields, image: null };
	}
	const form = await new Response(buf, { headers: { 'content-type': type } }).formData();
	let image: Uint8Array | null = null;
	for (const [k, v] of form.entries()) {
		if (typeof v === 'string') fields[k] = v;
		else if (k === 'image') image = new Uint8Array(await v.arrayBuffer());
	}
	return { fields, image };
}
