export const PLACE = {
	tambon: 'สลุย',
	amphoe: 'ท่าแซะ',
	province: 'ชุมพร',
	label: 'ตำบลสลุย อ.ท่าแซะ จ.ชุมพร',
	/** ที่ทำการ อบต.สลุย หมู่ 6 — 10°49′39.9″N 99°12′49.3″E */
	center: { lng: 99.213694, lat: 10.82775 }
} as const;

export type Category =
	| 'overflow'
	| 'missed_collection'
	| 'uncollected'
	| 'illegal_dumping'
	| 'other';

export type Status = 'pending' | 'published' | 'resolved' | 'rejected';

export type LocationSource = 'exif' | 'gps' | 'manual';

/** Public view returned by the API: never carries the real location or image keys. */
export interface Report {
	id: string;
	category: Category;
	status: Status;
	submitted_at: string;
	resolved_at: string | null;
	description: string | null;
	public_latitude: number;
	public_longitude: number;
	purged?: boolean;
	image_url: string | null;
	resolution_image_url: string | null;
}

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
	{ id: 'overflow', label: 'ขยะล้นถัง', hint: 'ถังเต็ม ถุงล้นออกมา' },
	{ id: 'missed_collection', label: 'ไม่ได้มาเก็บ', hint: 'เลยกำหนดแล้วยังไม่มา' },
	{ id: 'uncollected', label: 'เก็บไม่หมด', hint: 'มีขยะตกค้าง' },
	{ id: 'illegal_dumping', label: 'ทิ้งขยะผิดที่', hint: 'กองนอกจุดที่กำหนด' },
	{ id: 'other', label: 'ปัญหาอื่น', hint: 'อธิบายเพิ่มด้านล่าง' }
];

export function categoryLabel(id: Category) {
	return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function statusLabel(status: Status) {
	switch (status) {
		case 'pending':
			return 'รอตรวจสอบ';
		case 'published':
			return 'เผยแพร่แล้ว';
		case 'resolved':
			return 'แก้ไขแล้ว';
		case 'rejected':
			return 'ไม่เผยแพร่';
	}
}

/** พิกัดสาธารณะขยับประมาณ ~70 ม. ไม่ใช้เป็นตำแหน่งบ้าน */
export function obscure(lat: number, lng: number, salt: string) {
	let h = 0;
	for (const ch of salt) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
	const meters = 55 + (h % 40);
	const angle = ((h >> 8) % 360) * (Math.PI / 180);
	const dLat = (meters / 111_320) * Math.cos(angle);
	const dLng = (meters / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
	return { lat: lat + dLat, lng: lng + dLng };
}

export function formatThai(iso: string) {
	const d = new Date(iso);
	const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${hh}:${mm} น.`;
}

export function isOpen(report: Pick<Report, 'status'>) {
	return report.status === 'published' || report.status === 'pending';
}
