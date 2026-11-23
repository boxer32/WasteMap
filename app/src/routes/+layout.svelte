<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { refreshDrafts, syncDrafts } from '#lib/drafts.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// spec §6.2: sync on app open and on reconnect (Background Sync is not relied on)
	onMount(() => {
		void refreshDrafts().then(syncDrafts);
		const online = () => void syncDrafts();
		window.addEventListener('online', online);
		return () => window.removeEventListener('online', online);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Citizen Waste Map — ตำบลสลุย</title>
</svelte:head>

{@render children()}
