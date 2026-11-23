export const MAX_EDGE = 1600;
export const TARGET_BYTES = 1.5 * 1024 * 1024;

/**
 * Re-encode through canvas: JPEG, long edge <= 1600 px, quality stepped down until <= 1.5 MB.
 * Canvas output carries no EXIF, so GPS must be read from the original file BEFORE calling this.
 */
export async function compressToJpeg(file: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	for (let round = 0; round < 4; round++) {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
			if (blob && blob.size <= TARGET_BYTES) {
				bitmap.close();
				return blob;
			}
		}
		scale *= 0.8;
	}
	bitmap.close();
	throw new Error('รูปใหญ่เกินไป ลองถ่ายใหม่');
}
