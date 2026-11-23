/// <reference lib="webworker" />
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';

declare const self: ServiceWorkerGlobalScope;

// App shell only: built assets + static files + the two entry pages. Never API responses, never map tiles.
const CACHE = `shell-${version}`;
const build = immutable.map((f) => f.path);
const files = assets.map((f) => f.path as string);
const SHELL = ['/', '/report', ...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then(async (cache) => {
			// pages are best-effort so a flaky first load does not block installing
			await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)));
			await self.skipWaiting();
		})
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mod')) return;

	if (req.mode === 'navigate') {
		// network first so moderation/status pages stay fresh; fall back to the cached shell offline
		event.respondWith(
			fetch(req).catch(async () => {
				const cache = await caches.open(CACHE);
				return (await cache.match(url.pathname)) ?? (await cache.match('/report')) ?? (await cache.match('/')) ?? Response.error();
			})
		);
		return;
	}
	if (build.includes(url.pathname) || files.includes(url.pathname)) {
		event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
	}
});
