<script lang="ts">
	import { onMount } from 'svelte';
	import AppFrame from '#lib/components/AppFrame.svelte';
	import { fetchStats, type Stats } from '#lib/api';
	import { CATEGORIES, categoryLabel } from '#lib/domain';

	let stats = $state<Stats | null>(null);
	let error = $state('');

	onMount(async () => {
		try {
			stats = await fetchStats();
		} catch {
			error = 'โหลดสถิติไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
		}
	});

	const byCategory = $derived(CATEGORIES.map((c) => ({ ...c, n: stats?.by_category[c.id] ?? 0 })));
	const maxCat = $derived(Math.max(1, ...byCategory.map((c) => c.n)));
	const weeks = $derived(stats?.weekly ?? [0, 0, 0, 0]);
	const maxWeek = $derived(Math.max(1, ...weeks));
</script>

<AppFrame title="สถิติตำบลสลุย" subtitle="ตัวเลขคือจำนวนรายงาน ไม่ใช่ปริมาณขยะ">
	<div class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
		{#if error}<p class="rounded-xl bg-white p-3 text-[13px] ring-1 ring-neutral-200">{error}</p>{/if}
		<div class="grid grid-cols-3 gap-2 rounded-2xl bg-white p-3 text-center ring-1 ring-neutral-200">
			<div><div class="text-2xl font-bold">{stats?.total ?? '–'}</div><div class="text-[12px]">รายงาน</div></div>
			<div><div class="text-2xl font-bold text-amber">{stats?.open ?? '–'}</div><div class="text-[12px]">ยังไม่ปิด</div></div>
			<div><div class="text-2xl font-bold text-leaf">{stats?.resolved ?? '–'}</div><div class="text-[12px]">แก้ไขแล้ว</div></div>
		</div>
		<section class="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<h2 class="mb-2 font-semibold">ตามประเภท</h2>
			{#each byCategory as row}
				<div class="mb-2">
					<div class="flex justify-between text-[13px]"><span>{categoryLabel(row.id)}</span><span>{row.n}</span></div>
					<div class="h-2 rounded-full bg-neutral-100">
						<div class="h-2 rounded-full bg-leaf" style="width: {(row.n / maxCat) * 100}%"></div>
					</div>
				</div>
			{/each}
		</section>
		<section class="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<h2 class="mb-2 font-semibold">รายงาน 4 สัปดาห์ล่าสุด</h2>
			<div class="flex h-28 items-end gap-3">
				{#each weeks as n, i}
					<div class="flex h-full flex-1 flex-col items-center justify-end gap-1">
						<div class="w-full rounded-t bg-amber" style="height: {(n / maxWeek) * 100}%"></div>
						<span class="text-[11px] text-neutral-500">{i === 3 ? 'สัปดาห์นี้' : `${4 - i} สัปดาห์ก่อน`}</span>
					</div>
				{/each}
			</div>
		</section>
		<p class="text-[12px] leading-relaxed text-neutral-500">
			ข้อมูลมาจากรายงานของประชาชนที่ผ่านการตรวจสอบแล้ว จุดที่ไม่มีรายงานไม่ได้แปลว่าไม่มีปัญหา
			และใช้ยืนยันรูปแบบปัญหาไม่ได้ ไม่ใช้คำนวณเส้นทางรถเก็บขยะ
		</p>
		<p class="text-[12px] text-neutral-500">
			ดาวน์โหลดข้อมูลแบบไม่ระบุตัวบุคคล:
			<a class="text-leaf underline" href="/api/export?format=csv">CSV</a> ·
			<a class="text-leaf underline" href="/api/export?format=geojson">GeoJSON</a>
		</p>
	</div>
</AppFrame>
