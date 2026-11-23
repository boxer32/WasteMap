<script lang="ts">
	import AppFrame from '#lib/components/AppFrame.svelte';
	import { PLACE, categoryLabel, formatThai, isOpen, statusLabel } from '#lib/domain';
	import { loadReports, reportState } from '#lib/reports.svelte';

	let days = $state<7 | 30 | 0>(7);

	$effect(() => {
		void loadReports({ days });
	});

	const rows = $derived(
		[...reportState.items].sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
	);
	const openCount = $derived(rows.filter((r) => isOpen(r)).length);
	const resolvedCount = $derived(rows.filter((r) => r.status === 'resolved').length);
</script>

<AppFrame title="รายงาน" subtitle="ตำบลสลุย">
	<div class="flex min-h-0 flex-1 flex-col">
		<section class="mx-3 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<div class="mb-2 flex gap-2 text-[13px]">
				{#each [{ n: 7, label: '7 วัน' }, { n: 30, label: '30 วัน' }, { n: 0, label: 'ทั้งหมด' }] as chip}
					<button
						type="button"
						aria-pressed={days === chip.n}
						class="rounded-full px-3 py-1 {days === chip.n ? 'bg-leaf text-white' : 'bg-neutral-100 text-neutral-600'}"
						onclick={() => (days = chip.n as 7 | 30 | 0)}
					>
						{chip.label}
					</button>
				{/each}
			</div>
			<div class="grid grid-cols-3 text-center">
				<div>
					<div class="text-2xl font-bold">{rows.length}</div>
					<div class="text-[12px] text-neutral-500">ทั้งหมด</div>
				</div>
				<div>
					<div class="text-2xl font-bold text-amber">{openCount}</div>
					<div class="text-[12px] text-neutral-500">ยังไม่แก้ไข</div>
				</div>
				<div>
					<div class="text-2xl font-bold text-leaf">{resolvedCount}</div>
					<div class="text-[12px] text-neutral-500">แก้ไขแล้ว</div>
				</div>
			</div>
		</section>

		{#if reportState.error}
			<p class="mx-3 mt-2 rounded-xl bg-white p-3 text-[13px] ring-1 ring-neutral-200">{reportState.error}</p>
		{:else if !reportState.loading && rows.length === 0}
			<p class="mx-3 mt-2 rounded-xl bg-white p-3 text-[13px] text-neutral-500 ring-1 ring-neutral-200">
				ยังไม่มีรายงานที่เผยแพร่ในช่วงนี้
			</p>
		{/if}

		<ul class="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
			{#each rows as report (report.id)}
				<li>
					<a href="/reports/{report.id}" class="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200">
						<span class="min-w-0 flex-1">
							<span class="block font-semibold">{categoryLabel(report.category)}</span>
							<span class="block truncate text-[13px] text-neutral-500">{PLACE.label} · {formatThai(report.submitted_at)}</span>
						</span>
						<span class="shrink-0 text-[12px] text-neutral-500">{statusLabel(report.status)}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</AppFrame>
