<script lang="ts">
	import { page } from '$app/state';
	import { draftState } from '#lib/drafts.svelte';

	let {
		title,
		subtitle,
		back = false,
		share = false,
		children
	}: {
		title: string;
		subtitle?: string;
		back?: boolean;
		share?: boolean;
		children: import('svelte').Snippet;
	} = $props();

	const tabs = [
		{ href: '/', label: 'แผนที่', icon: 'map' },
		{ href: '/reports', label: 'รายงาน', icon: 'list' },
		{ href: '/stats', label: 'สถิติ', icon: 'chart' },
		{ href: '/about', label: 'เกี่ยวกับ', icon: 'info' }
	];

	function active(href: string) {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-[#f7f8f4] shadow-xl">
	<header class="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
		{#if back}
			<a href="/" class="grid h-9 w-9 place-items-center rounded-full text-leaf" aria-label="กลับ">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
					<path d="M15 6 9 12l6 6" />
				</svg>
			</a>
		{:else}
			<div class="grid h-11 w-11 place-items-center rounded-full bg-leaf text-white">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
					<path d="M7 8h10l-1 12H8L7 8zm2-3h6l1 2H8l1-2z" />
				</svg>
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-[17px] font-bold text-leaf-dark">{title}</h1>
			{#if subtitle}<p class="truncate text-[12px] text-neutral-500">{subtitle}</p>{/if}
		</div>
		{#if draftState.count > 0}
			<a href="/report" class="shrink-0 rounded-full bg-[#fff4e8] px-2 py-1 text-[12px] font-medium text-amber">รอส่ง {draftState.count}</a>
		{/if}
		{#if share}
			<button class="grid h-9 w-9 place-items-center text-neutral-500" aria-label="แชร์" type="button">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="18" cy="5" r="2.2" /><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="19" r="2.2" />
					<path d="m8 11 8-5M8 13l8 5" />
				</svg>
			</button>
		{:else if !back}
			<button class="grid h-9 w-9 place-items-center text-leaf" aria-label="การแจ้งเตือน" type="button">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16z" /><path d="M10 19a2 2 0 0 0 4 0" />
				</svg>
			</button>
		{/if}
	</header>
	<div class="flex min-h-0 flex-1 flex-col">{@render children()}</div>
	{#if !back}
		<nav class="grid grid-cols-4 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
			{#each tabs as tab}
				<a
					href={tab.href}
					aria-current={active(tab.href) ? 'page' : undefined}
					class="flex flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] {active(tab.href)
						? 'border-leaf font-semibold text-leaf'
						: 'border-transparent text-neutral-400'}"
				>
					{#if tab.icon === 'map'}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4 3 6.5V20l6-2.5L15 20l6-2.5V4L15 6.5 9 4z" /><path d="M9 4v13.5M15 6.5V20" /></svg>
					{:else if tab.icon === 'list'}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 7h12M8 12h12M8 17h12" /><circle cx="4" cy="7" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="17" r="1" fill="currentColor" /></svg>
					{:else if tab.icon === 'chart'}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16" /><path d="M8 15v-3M12 15V8M16 15v-5" /></svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></svg>
					{/if}
					{tab.label}
				</a>
			{/each}
		</nav>
	{/if}
</div>
