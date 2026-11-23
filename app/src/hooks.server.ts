import type { Handle } from '@sveltejs/kit/hooks';
import { waitUntil } from 'cloudflare:workers';
import { db, images } from '#lib/server/db';
import { purgeIfDue } from '#lib/server/retention';
import { COOKIE, moderatorFor } from '#lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.moderator = null;
	const token = event.cookies.get(COOKIE);
	if (token) event.locals.moderator = await moderatorFor(db(), token);

	// 30-day retention. adapter-cloudflare 9 has no `scheduled` hook, so a throttled (1/hour, claimed in D1 `meta`)
	// purge runs in the background and never delays or fails the response.
	{
		waitUntil(purgeIfDue(db(), images()).catch((e) => console.error('purge failed', e)));
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
	const path = event.url.pathname;
	if (path.startsWith('/mod') || path.startsWith('/api/moderation')) {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};
