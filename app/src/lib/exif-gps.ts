/** พิกัดที่กล้องบันทึกตอนถ่ายรูป จาก EXIF GPS ของไฟล์ JPEG */
export function readJpegGps(buffer: ArrayBuffer): { lat: number; lng: number } | null {
	const view = new DataView(buffer);
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

	let offset = 2;
	while (offset + 4 < view.byteLength) {
		const marker = view.getUint16(offset);
		if (marker === 0xffda) break;
		const size = view.getUint16(offset + 2);
		if (marker === 0xffe1 && size > 14) {
			const start = offset + 4;
			if (ascii(view, start, 4) === 'Exif') {
				return gpsFromTiff(view, start + 6);
			}
		}
		if (size < 2) break;
		offset += 2 + size;
	}
	return null;
}

function gpsFromTiff(view: DataView, tiff: number): { lat: number; lng: number } | null {
	if (tiff + 8 > view.byteLength) return null;
	const endian = view.getUint16(tiff);
	const le = endian === 0x4949;
	if (!le && endian !== 0x4d4d) return null;
	const u16 = (at: number) => view.getUint16(at, le);
	const u32 = (at: number) => view.getUint32(at, le);
	if (u16(tiff + 2) !== 42) return null;

	const gpsPtr = findTag(view, tiff, tiff + u32(tiff + 4), 0x8825, le);
	if (gpsPtr == null) return null;
	const gps = tiff + gpsPtr;
	const lat = rationalTag(view, tiff, gps, 0x0002, le);
	const lng = rationalTag(view, tiff, gps, 0x0004, le);
	const latRef = asciiTag(view, tiff, gps, 0x0001, le);
	const lngRef = asciiTag(view, tiff, gps, 0x0003, le);
	if (!lat || !lng) return null;
	return {
		lat: latRef === 'S' ? -lat : lat,
		lng: lngRef === 'W' ? -lng : lng
	};
}

function findTag(view: DataView, tiff: number, ifd: number, tag: number, le: boolean): number | null {
	if (ifd + 2 > view.byteLength) return null;
	const count = view.getUint16(ifd, le);
	for (let i = 0; i < count; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > view.byteLength) return null;
		if (view.getUint16(entry, le) === tag) return view.getUint32(entry + 8, le);
	}
	return null;
}

function rationalTag(view: DataView, tiff: number, ifd: number, tag: number, le: boolean): number | null {
	const ptr = findTag(view, tiff, ifd, tag, le);
	if (ptr == null) return null;
	const at = tiff + ptr;
	if (at + 24 > view.byteLength) return null;
	const part = (i: number) => {
		const n = view.getUint32(at + i * 8, le);
		const d = view.getUint32(at + i * 8 + 4, le);
		return d === 0 ? 0 : n / d;
	};
	return part(0) + part(1) / 60 + part(2) / 3600;
}

function asciiTag(view: DataView, tiff: number, ifd: number, tag: number, le: boolean): string {
	const count = view.getUint16(ifd, le);
	for (let i = 0; i < count; i++) {
		const entry = ifd + 2 + i * 12;
		if (view.getUint16(entry, le) !== tag) continue;
		const value = view.getUint32(entry + 8, le);
		const n = view.getUint32(entry + 4, le);
		if (n <= 4) return String.fromCharCode(value & 0xff);
		return ascii(view, tiff + value, 1);
	}
	return '';
}

function ascii(view: DataView, at: number, length: number) {
	let text = '';
	for (let i = 0; i < length && at + i < view.byteLength; i++) {
		const code = view.getUint8(at + i);
		if (code === 0) break;
		text += String.fromCharCode(code);
	}
	return text;
}
