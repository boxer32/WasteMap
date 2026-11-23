<script lang="ts">
	import { goto } from '$app/navigation';
	import AppFrame from '#lib/components/AppFrame.svelte';
	import WasteMap from '#lib/components/WasteMap.svelte';
	import { PLACE } from '#lib/domain';
	import { loadReports, reportState } from '#lib/reports.svelte';

	let days = $state<7 | 30 | 0>(7);
	let onlyOverflow = $state(false);
	let onlyOpen = $state(true);

	// filters are applied by the API (spec §9: bbox/filter), not in the browser
	$effect(() => {
		void loadReports({ days, category: onlyOverflow ? 'overflow' : undefined, status: onlyOpen ? 'published' : undefined });
	});
</script>

<AppFrame title="Citizen Waste Map" subtitle="รายงานปัญหาขยะในชุมชน">
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="px-3 pb-2">
			<p class="truncate px-1 pb-2 text-[13px] font-semibold text-leaf-dark">{PLACE.label}</p>
			<div class="flex gap-2 overflow-x-auto pb-1 text-[13px]">
				{#each [{ n: 7, label: '7 วัน' }, { n: 30, label: '30 วัน' }, { n: 0, label: 'ทั้งหมด' }] as chip}
					<button
						type="button"
						aria-pressed={days === chip.n}
						class="shrink-0 rounded-full px-3 py-1.5 font-medium {days === chip.n
							? 'bg-leaf text-white shadow-sm'
							: 'bg-white text-neutral-600 ring-1 ring-neutral-300'}"
						onclick={() => (days = chip.n as 7 | 30 | 0)}
					>
						{days === chip.n ? '✓ ' : ''}{chip.label}
					</button>
				{/each}
				<button
					type="button"
					aria-pressed={onlyOverflow}
					class="shrink-0 rounded-full px-3 py-1.5 font-medium {onlyOverflow
						? 'bg-[#e7f6ea] text-leaf ring-2 ring-leaf'
						: 'bg-white text-neutral-600 ring-1 ring-neutral-300'}"
					onclick={() => (onlyOverflow = !onlyOverflow)}
				>
					{onlyOverflow ? '✓ ' : ''}เฉพาะขยะล้นถัง
				</button>
				<button
					type="button"
					aria-pressed={onlyOpen}
					class="shrink-0 rounded-full px-3 py-1.5 font-medium {onlyOpen
						? 'bg-[#fff4e8] text-amber ring-2 ring-amber'
						: 'bg-white text-neutral-600 ring-1 ring-neutral-300'}"
					onclick={() => (onlyOpen = !onlyOpen)}
				>
					{onlyOpen ? '✓ ' : ''}ยังไม่แก้ไข
				</button>
			</div>
		</div>
		<div class="relative min-h-0 flex-1">
			<WasteMap reports={reportState.items} onSelect={(id) => goto(`/reports/${id}`)} />
			<p class="pointer-events-none absolute top-2 left-2 rounded-full bg-white/95 px-2 py-1 text-[11px] shadow">
				<span class="text-amber">ส้ม ยังไม่แก้</span>
				<span class="text-neutral-300"> · </span>
				<span class="text-leaf">เขียว แก้แล้ว</span>
			</p>
			{#if reportState.error}
				<p class="absolute inset-x-3 bottom-20 z-10 rounded-xl bg-white px-3 py-2 text-[13px] shadow">{reportState.error}</p>
			{/if}
			<a
				href="/report"
				class="absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-amber px-4 py-3 text-[15px] font-semibold text-white shadow-lg ring-2 ring-white"
			>
				<span class="grid h-6 w-6 place-items-center rounded-full bg-white/25" aria-hidden="true">＋</span>
				ส่งรายงาน
			</a>
		</div>
	</div>
</AppFrame>
