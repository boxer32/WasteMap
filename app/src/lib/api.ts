import type { Category, Report, Status } from './domain';

export interface MapFeature {
	id: string;
	category: Category;
	status: Status;
	submitted_at: string;
	lng: number;
	lat: number;
}

export interface Stats {
	total: number;
	open: number;
	resolved: number;
	by_category: Record<string, number>;
	weekly: number[];
}

export interface Tracked extends Report {
	moderator_note: string | null;
}

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw new Error(`${res.status}`);
	return (await res.json()) as T;
}

export async function fetchFeatures(params: { days?: number; status?: string; category?: string } = {}) {
	const q = new URLSearchParams();
	if (params.days) q.set('days', String(params.days));
	if (params.status) q.set('status', params.status);
	if (params.category) q.set('category', params.category);
	const fc = await getJson<{ features: { geometry: { coordinates: [number, number] }; properties: Omit<MapFeature, 'lng' | 'lat'> }[] }>(
		`/api/reports?${q}`
	);
	return fc.features.map((f) => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) as MapFeature);
}

export const fetchReport = (id: string) => getJson<Report>(`/api/reports/${encodeURIComponent(id)}`);
export const fetchStats = () => getJson<Stats>('/api/stats');
export const fetchTracked = (id: string, token: string) =>
	getJson<Tracked>(`/api/my-reports/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);

export async function postFeedback(reportId: string, kind: string, text: string, image?: Blob) {
	const form = new FormData();
	form.set('kind', kind);
	form.set('text', text);
	if (image) form.set('image', image, 'photo.jpg');
	const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/feedback`, { method: 'POST', body: form });
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (!res.ok) throw new Error(data.error ?? `${res.status}`);
}
