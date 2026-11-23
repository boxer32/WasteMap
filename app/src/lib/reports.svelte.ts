import { fetchFeatures, type MapFeature } from './api';

/** Map/list data comes from the API; nothing is cached or seeded on the client. */
export const reportState = $state({ items: [] as MapFeature[], loading: false, error: '' });

export async function loadReports(params: { days?: number; category?: string; status?: string } = {}) {
	reportState.loading = true;
	reportState.error = '';
	try {
		reportState.items = await fetchFeatures(params);
	} catch {
		reportState.error = 'โหลดรายงานไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
	} finally {
		reportState.loading = false;
	}
}
