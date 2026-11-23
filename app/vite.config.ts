import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			// maplibre: blob workers, OpenFreeMap tiles/fonts/sprites; Sarabun from Google Fonts.
			// 'auto' adds hashes/nonces for SvelteKit's own inline bootstrap script.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'data:', 'https://fonts.gstatic.com', 'https://tiles.openfreemap.org'],
					'img-src': ['self', 'data:', 'blob:', 'https://tiles.openfreemap.org'],
					'connect-src': ['self', 'https://tiles.openfreemap.org'],
					'worker-src': ['self', 'blob:'],
					'child-src': ['blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});
