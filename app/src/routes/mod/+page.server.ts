import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadQueue } from '#lib/server/moderation';
import { db } from '#lib/server/db';
import { COOKIE, destroySession } from '#lib/server/session';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.moderator) redirect(303, '/mod/login');
	return { moderator: locals.moderator.username, queue: await loadQueue() };
};

export const actions: Actions = {
	logout: async ({ cookies }) => {
		const token = cookies.get(COOKIE);
		if (token) await destroySession(db(), token);
		cookies.delete(COOKIE, { path: '/' });
		redirect(303, '/mod/login');
	}
};
