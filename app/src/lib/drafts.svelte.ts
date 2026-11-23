import type { Category, LocationSource } from './domain';

/** Offline draft queue in IndexedDB (spec §6). The UUID doubles as the idempotency key. */
export interface Draft {
	id: string;
	category: Category;
	latitude: number;
	longitude: number;
	location_source: LocationSource;
	location_accuracy?: number;
	description?: string;
	photo_captured_at?: string;
	image: Blob;
	/** 32-byte base64url tracking token, generated on the device; the server stores only its hash */
	token: string;
	created_at: string;
	error?: string;
}

const DB_NAME = 'wastemap';
const STORE = 'drafts';
const TRACK_KEY = 'wastemap-tracking-v1';

export const draftState = $state({ count: 0, failed: 0, syncing: false });

export function newToken(): string {
	const b = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class StorageFullError extends Error {}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	return new Promise<T>((resolve, reject) => {
		const t = db.transaction(STORE, mode);
		const req = run(t.objectStore(STORE));
		t.oncomplete = () => {
			db.close();
			resolve(req.result);
		};
		t.onabort = t.onerror = () => {
			db.close();
			const e = t.error ?? req.error;
			reject(e?.name === 'QuotaExceededError' ? new StorageFullError('quota') : e);
		};
	});
}

export const listDrafts = () => tx<Draft[]>('readonly', (s) => s.getAll());

export async function refreshDrafts() {
	try {
		const all = await listDrafts();
		draftState.count = all.length;
		draftState.failed = all.filter((d) => d.error).length;
	} catch {
		/* IndexedDB unavailable (private mode): queue is simply empty */
	}
}

export async function saveDraft(draft: Draft) {
	await tx('readwrite', (s) => s.put(draft));
	await refreshDrafts();
}

async function removeDraft(id: string) {
	await tx('readwrite', (s) => s.delete(id));
}

/** Tracking tokens are shown once by the server; keep them on this device so the link can be found again. */
export function rememberToken(id: string, token: string) {
	try {
		const all = JSON.parse(localStorage.getItem(TRACK_KEY) ?? '{}') as Record<string, string>;
		all[id] = token;
		localStorage.setItem(TRACK_KEY, JSON.stringify(all));
	} catch {
		/* storage blocked: the on-screen link is still shown */
	}
}

export function trackLink(id: string, token: string) {
	return `/track/${id}#token=${token}`;
}

export type SendResult = { ok: true; token: string } | { ok: false; retry: boolean; message: string };

export async function sendDraft(d: Draft): Promise<SendResult> {
	const form = new FormData();
	form.set('id', d.id);
	form.set('tracking_token', d.token);
	form.set('category', d.category);
	form.set('latitude', String(d.latitude));
	form.set('longitude', String(d.longitude));
	form.set('location_source', d.location_source);
	if (d.location_accuracy != null) form.set('location_accuracy', String(d.location_accuracy));
	if (d.description) form.set('description', d.description);
	if (d.photo_captured_at) form.set('photo_captured_at', d.photo_captured_at);
	form.set('image', d.image, 'photo.jpg');
	let res: Response;
	try {
		res = await fetch('/api/reports', { method: 'POST', body: form });
	} catch {
		return { ok: false, retry: true, message: 'ส่งไม่ได้ตอนนี้ เก็บไว้ในเครื่องแล้ว จะส่งใหม่เมื่อมีสัญญาณ' };
	}
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (res.ok) return { ok: true, token: d.token };
	// 429 and 5xx are transient; other 4xx are rejections that retrying cannot fix
	const retry = res.status === 429 || res.status >= 500;
	return { ok: false, retry, message: data.error ?? `ส่งไม่สำเร็จ (${res.status})` };
}

/** Send one draft; remove it from the queue only after the server confirmed. */
export async function syncOne(d: Draft): Promise<SendResult> {
	const result = await sendDraft(d);
	if (result.ok) {
		rememberToken(d.id, result.token);
		await removeDraft(d.id);
	} else if (!result.retry) {
		await saveDraft({ ...d, error: result.message });
	}
	await refreshDrafts();
	return result;
}

export async function syncDrafts() {
	if (draftState.syncing) return;
	draftState.syncing = true;
	try {
		for (const d of await listDrafts()) {
			if (d.error) continue;
			const r = await syncOne(d);
			if (!r.ok && r.retry) break; // offline or rate limited: try again later
		}
	} catch {
		/* leave the queue untouched */
	} finally {
		draftState.syncing = false;
		await refreshDrafts();
	}
}

export async function discardDraft(id: string) {
	await removeDraft(id);
	await refreshDrafts();
}
