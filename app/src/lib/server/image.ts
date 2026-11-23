export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageCheck = { ok: true } | { ok: false; reason: 'too_large' | 'not_jpeg' | 'has_exif' | 'malformed' };

/**
 * Server-side defence in depth: the client re-encodes through canvas (no EXIF), the server
 * only accepts a JPEG that carries no APP1 (Exif/XMP) segment.
 */
export function validateJpeg(bytes: Uint8Array): ImageCheck {
	if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
		return { ok: false, reason: 'not_jpeg' };
	}
	let i = 2;
	while (i + 4 <= bytes.length) {
		if (bytes[i] !== 0xff) return { ok: false, reason: 'malformed' };
		const marker = bytes[i + 1];
		if (marker === 0xff) {
			i++; // fill byte
			continue;
		}
		if (marker === 0xda) return { ok: true }; // start of scan: metadata is behind us
		if (marker === 0xe1) return { ok: false, reason: 'has_exif' };
		if (marker === 0xd9) return { ok: false, reason: 'malformed' };
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			i += 2; // standalone markers carry no length
			continue;
		}
		const len = (bytes[i + 2] << 8) | bytes[i + 3];
		if (len < 2) return { ok: false, reason: 'malformed' };
		i += 2 + len;
	}
	return { ok: false, reason: 'malformed' };
}
