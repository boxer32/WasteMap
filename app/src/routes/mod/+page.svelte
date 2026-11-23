<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { compressToJpeg } from '#lib/image-compress';
	import { categoryLabel, formatThai, type Category } from '#lib/domain';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let note = $state<Record<string, string>>({});
	let busy = $state('');
	let error = $state('');

	const KIND: Record<string, string> = { more_info: 'ข้อมูลเพิ่มเติม', fixed: 'แจ้งว่าแก้ไขแล้ว', removal_request: 'ขอลบ' };

	async function patch(id: string, fields: Record<string, string>, image?: Blob) {
		busy = id;
		error = '';
		const form = new FormData();
		for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
		if (image) form.set('image', image, 'after.jpg');
		const res = await fetch(`/api/moderation/reports/${id}`, { method: 'PATCH', body: form });
		busy = '';
		if (!res.ok) {
			error = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `ผิดพลาด ${res.status}`;
			return;
		}
		await invalidateAll();
	}

	async function resolveWithPhoto(id: string, event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await patch(id, { action: 'resolve', note: note[id] ?? '' }, await compressToJpeg(file));
	}
</script>

<svelte:head><title>ผู้ดูแล</title><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-3 bg-[#f7f8f4] px-4 py-3">
	<header class="flex items-center gap-2">
		<h1 class="flex-1 text-[17px] font-bold text-leaf-dark">ผู้ดูแล · {data.moderator}</h1>
		<form method="POST" action="?/logout" use:enhance><button class="rounded-full bg-white px-3 py-1 text-[13px] ring-1 ring-neutral-300">ออก</button></form>
	</header>
	{#if error}<p class="rounded-xl bg-red-50 p-2 text-[13px] text-red-700">{error}</p>{/if}

	<h2 class="font-semibold">รอตรวจสอบ ({data.queue.pending.length})</h2>
	{#each data.queue.pending as r (r.id)}
		<article class="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<img src={r.image_url} alt="" class="h-44 w-full rounded-xl object-cover" />
			<p class="font-semibold">{categoryLabel(r.category as Category)} · {formatThai(r.submitted_at)}</p>
			<p class="text-[12px] text-neutral-600">
				พิกัดจริง <a class="underline" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat={r.latitude}&mlon={r.longitude}#map=18/{r.latitude}/{r.longitude}">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</a>
				· ที่มา {r.location_source}
			</p>
			{#if r.possible_duplicate_of}
				<p class="rounded-lg bg-[#fff4e8] px-2 py-1 text-[12px] text-amber">อาจซ้ำกับ #{r.possible_duplicate_of.slice(0, 8)} (ประเภทเดียวกัน ไม่เกิน 30 ม. ใน 48 ชม.)</p>
			{/if}
			{#if r.description}<p class="text-[14px]">{r.description}</p>{/if}
			<input bind:value={note[r.id]} placeholder="ข้อความถึงผู้ส่ง (ไม่บังคับ)" class="w-full rounded-xl border border-neutral-200 px-3 py-2 text-[14px]" />
			<div class="grid grid-cols-2 gap-2">
				<button disabled={busy === r.id} class="rounded-xl bg-leaf py-2 font-semibold text-white disabled:opacity-50" onclick={() => patch(r.id, { action: 'approve', note: note[r.id] ?? '' })}>อนุมัติ</button>
				<button disabled={busy === r.id} class="rounded-xl bg-white py-2 font-semibold text-red-700 ring-1 ring-red-300 disabled:opacity-50" onclick={() => patch(r.id, { action: 'reject', note: note[r.id] ?? '' })}>ปฏิเสธ</button>
			</div>
		</article>
	{:else}
		<p class="text-[13px] text-neutral-500">ไม่มีรายงานรอตรวจ</p>
	{/each}

	<h2 class="mt-2 font-semibold">เรื่องที่ประชาชนแจ้ง ({data.queue.feedback.length})</h2>
	{#each data.queue.feedback as f (f.id)}
		<article class="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<p class="text-[13px] font-semibold">{KIND[f.kind] ?? f.kind} · #{f.report_id.slice(0, 8)} · {formatThai(f.created_at)}</p>
			{#if f.text}<p class="text-[14px]">{f.text}</p>{/if}
			{#if f.image_url}<img src={f.image_url} alt="" class="h-36 w-full rounded-xl object-cover" />{/if}
			<div class="grid grid-cols-2 gap-2 text-[13px]">
				{#if f.kind === 'fixed' && f.image_url}
					<button class="rounded-xl bg-leaf py-2 font-semibold text-white" onclick={() => patch(f.report_id, { action: 'resolve', feedback_id: String(f.id) })}>ยอมรับ ปิดรายงาน</button>
				{/if}
				{#if f.kind === 'removal_request'}
					<button class="rounded-xl bg-white py-2 font-semibold text-red-700 ring-1 ring-red-300" onclick={() => confirm('ลบรายงานและรูปทั้งหมดถาวร?') && patch(f.report_id, { action: 'delete' })}>ลบรายงานและรูป</button>
					<button class="rounded-xl bg-white py-2 ring-1 ring-neutral-300" onclick={() => patch(f.report_id, { action: 'reject' })}>ถอดจากแผนที่</button>
				{/if}
				<button class="rounded-xl bg-white py-2 ring-1 ring-neutral-300" onclick={() => patch(f.report_id, { action: 'dismiss_feedback', feedback_id: String(f.id) })}>ปิดเรื่องนี้</button>
			</div>
		</article>
	{:else}
		<p class="text-[13px] text-neutral-500">ไม่มีเรื่องค้าง</p>
	{/each}

	<h2 class="mt-2 font-semibold">เผยแพร่แล้ว · ปิดรายงานด้วยรูปหลังแก้ไข ({data.queue.published.length})</h2>
	{#each data.queue.published as r (r.id)}
		<article class="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
			<p class="text-[14px] font-semibold">{categoryLabel(r.category as Category)} · #{r.id.slice(0, 8)} · {formatThai(r.submitted_at)}</p>
			<label class="block text-[13px]">รูปหลังแก้ไข (จำเป็น)
				<input type="file" accept="image/*" class="mt-1 block w-full" disabled={busy === r.id} onchange={(e) => resolveWithPhoto(r.id, e)} />
			</label>
			<button class="w-full rounded-xl bg-white py-2 text-[13px] text-red-700 ring-1 ring-red-300" onclick={() => patch(r.id, { action: 'reject' })}>ถอดออก (ปฏิเสธ)</button>
		</article>
	{/each}
</div>
