<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import FeedbackForm from '#lib/components/FeedbackForm.svelte';
	import { fetchTracked, type Tracked } from '#lib/api';
	import { PLACE, categoryLabel, formatThai, statusLabel } from '#lib/domain';

	let report = $state<Tracked | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');

	onMount(async () => {
		// the token lives in the URL fragment so it is never sent to the server in a request line or logs
		const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
		if (!token) {
			phase = 'missing';
			return;
		}
		try {
			report = await fetchTracked(page.params.id ?? '', token);
			phase = 'ready';
		} catch (e) {
			phase = (e as Error).message === '404' ? 'missing' : 'error';
		}
	});
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f7f8f4]">
	<header class="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
		<a href="/" class="grid h-9 w-9 place-items-center" aria-label="กลับ">←</a>
		<h1 class="flex-1 text-[17px] font-bold">ติดตามรายงานของฉัน</h1>
	</header>
	{#if phase === 'loading'}
		<p class="p-6 text-neutral-500">กำลังโหลด…</p>
	{:else if phase === 'missing'}
		<p class="p-6">ไม่พบรายงาน หรือลิงก์ติดตามไม่ถูกต้อง ต้องเปิดจากลิงก์ที่ได้ตอนส่งรายงานเท่านั้น<br /><span class="text-[12px] text-neutral-500">ลิงก์ติดตามใช้ได้ 30 วันหลังส่ง หลังจากนั้นรูปและรายละเอียดถูกลบตามนโยบายเก็บข้อมูล 30 วัน</span></p>
	{:else if phase === 'error' || !report}
		<p class="p-6">โหลดไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่</p>
	{:else}
		<div class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
			{#if report.image_url}
				<img src={report.image_url} alt="รูปที่คุณส่ง" class="h-48 w-full rounded-2xl object-cover" />
			{/if}
			<div class="flex items-start justify-between gap-2">
				<h2 class="text-xl font-bold">{categoryLabel(report.category)}</h2>
				<span class="rounded-full bg-[#e7f6ea] px-2 py-1 text-[12px] font-medium text-leaf">{statusLabel(report.status)}</span>
			</div>
			<p class="text-[13px] text-neutral-600">{formatThai(report.submitted_at)} · {PLACE.label}</p>
			{#if report.status === 'pending'}
				<p class="rounded-2xl bg-white p-3 text-[13px] ring-1 ring-neutral-200">รอผู้ดูแลตรวจสอบก่อนเผยแพร่บนแผนที่</p>
			{:else if report.status === 'rejected'}
				<p class="rounded-2xl bg-white p-3 text-[13px] ring-1 ring-neutral-200">รายงานนี้ไม่ได้เผยแพร่</p>
			{/if}
			{#if report.moderator_note}
				<p class="rounded-2xl bg-white p-3 text-[14px] ring-1 ring-neutral-200">ข้อความจากผู้ดูแล: {report.moderator_note}</p>
			{/if}
			{#if report.status === 'published'}
				<FeedbackForm reportId={report.id} kind="fixed" needPhoto title="แจ้งว่าแก้ไขแล้ว (แนบรูป)" hint="ผู้ดูแลจะตรวจรูปก่อนปิดรายงาน" />
			{/if}
			{#if report.status !== 'rejected'}
				<FeedbackForm reportId={report.id} kind="more_info" title="แจ้งข้อมูลเพิ่มเติม" />
				<FeedbackForm reportId={report.id} kind="removal_request" title="ขอลบภาพหรือรายงานนี้" />
			{/if}
			<p class="text-[11px] text-neutral-400">เก็บลิงก์นี้ไว้ ใครมีลิงก์นี้ก็ดูรายงานนี้ได้ ใช้ได้ 30 วันหลังส่งรายงาน</p>
		</div>
	{/if}
</div>
