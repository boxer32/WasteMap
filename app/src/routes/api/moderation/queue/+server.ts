import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bad } from '#lib/server/http';
import { loadQueue } from '#lib/server/moderation';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.moderator) return bad('unauthorized', 401);
	return json(await loadQueue(), { headers: { 'Cache-Control': 'no-store' } });
};
