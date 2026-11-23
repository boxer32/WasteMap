// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			moderator: { id: number; username: string } | null;
		}
	}
}

export {};
