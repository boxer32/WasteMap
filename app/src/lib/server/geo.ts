import raw from '../../../static/salui-boundary.geojson?raw';

const boundary = JSON.parse(raw) as { geometry: { coordinates: number[][][] } };

export const DUP_RADIUS_M = 30;
export const DUP_WINDOW_MS = 48 * 3_600_000;
const MARGIN_KM = 2;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const rad = Math.PI / 180;
	const dLat = (bLat - aLat) * rad;
	const dLng = (bLng - aLng) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Bbox {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

/** Bounding box of a GeoJSON Polygon feature's outer ring, grown by marginKm. */
export function bboxOfRing(ring: number[][], marginKm: number): Bbox {
	let minLat = 90,
		maxLat = -90,
		minLng = 180,
		maxLng = -180;
	for (const [lng, lat] of ring) {
		minLat = Math.min(minLat, lat);
		maxLat = Math.max(maxLat, lat);
		minLng = Math.min(minLng, lng);
		maxLng = Math.max(maxLng, lng);
	}
	const dLat = marginKm / 111.32;
	const dLng = marginKm / (111.32 * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)));
	return { minLat: minLat - dLat, maxLat: maxLat + dLat, minLng: minLng - dLng, maxLng: maxLng + dLng };
}

export const SALUI_BBOX: Bbox = bboxOfRing(
	boundary.geometry.coordinates[0],
	MARGIN_KM
);

export function inBbox(lat: number, lng: number, box: Bbox = SALUI_BBOX): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= box.minLat &&
		lat <= box.maxLat &&
		lng >= box.minLng &&
		lng <= box.maxLng
	);
}

export interface DupCandidate {
	id: string;
	latitude: number;
	longitude: number;
}

/**
 * Nearest candidate within DUP_RADIUS_M (30 m, spec §4.3). Uses the REAL coordinates (server-side only):
 * public points carry a per-report offset of up to ~95 m, so they cannot detect 50 m duplicates.
 */
export function nearestDuplicate(lat: number, lng: number, rows: DupCandidate[]): string | null {
	let best: string | null = null;
	let bestD = DUP_RADIUS_M;
	for (const r of rows) {
		const d = haversineM(lat, lng, r.latitude, r.longitude);
		if (d <= bestD) {
			bestD = d;
			best = r.id;
		}
	}
	return best;
}

/** SQL prefilter for duplicate candidates; all values are bound parameters. */
export function duplicateQuery(category: string, lat: number, lng: number, now: number) {
	const dLat = (DUP_RADIUS_M * 1.5) / 111_320;
	const dLng = dLat / Math.cos(lat * (Math.PI / 180));
	return {
		sql: `SELECT id, latitude, longitude FROM reports
			WHERE category = ? AND status != 'rejected' AND submitted_at >= ?
			AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
			ORDER BY submitted_at DESC LIMIT 50`,
		params: [category, new Date(now - DUP_WINDOW_MS).toISOString(), lat - dLat, lat + dLat, lng - dLng, lng + dLng]
	};
}
