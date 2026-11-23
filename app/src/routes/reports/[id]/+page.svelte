<script lang="ts">
	import { page } from '$app/state';
	import FeedbackForm from '#lib/components/FeedbackForm.svelte';
	import { fetchReport } from '#lib/api';
	import { PLACE, categoryLabel, formatThai, statusLabel, type Report } from '#lib/domain';

	let report = $state<Report | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let more = $state(false);

	$effect(() => {
		const id = page.params.id ?? '';
		phase = 'loading';
		fetchReport(id)
			.then((r) => {
				report = r;
				phase = 'ready';
			})
			.catch((e: Error) => {
				phase = e.message === '404' ? 'missing' : 'error';
			});
	});
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f7f8f4]">
	<header class="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
		<a href="/" class="grid h-9 w-9 place-items-center" aria-label="กลับ">←</a>
		<h1 class="flex-1 text-[17px] font-bold">รายละเอียดรายงาน</h1>
	</header>

	{#if phase === 'loading'}
		<p class="p-6 text-neutral-500">กำลังโหลด…</p>
	{:else if phase === 'missing'}
		<p class="p-6">ไม่พบรายงานนี้ หรือยังไม่เผยแพร่</p>
	{:else if phase === 'error' || !report}
		<p class="p-6">โหลดรายงานไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่</p>
	{:else}
		<div class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
			<div class="relative overflow-hidden rounded-2xl bg-[#d7e4c8]">
				{#if report.image_url && !report.purged}
					<img src={report.image_url} alt="รูปที่ผู้ใช้ส่ง" class="h-48 w-full object-cover" />
				{:else}
					<div class="grid h-48 place-items-center text-4xl">🗑</div>
				{/if}
				<span class="absolute top-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[12px] text-white">#{report.id.slice(0, 8)}</span>
			</div>

			<div class="flex items-start justify-between gap-2">
				<h2 class="text-xl font-bold">{categoryLabel(report.category)}</h2>
				<span class="rounded-full bg-[#e7f6ea] px-2 py-1 text-[12px] font-medium text-leaf">{statusLabel(report.status)}</span>
			</div>
			<p class="text-[13px] text-neutral-600">{formatThai(report.submitted_at)} · {PLACE.label}</p>
			<button type="button" class="rounded-xl bg-white py-3 font-semibold ring-1 ring-neutral-200" onclick={() => (more = !more)}>
				{more ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
			</button>
			{#if more}
				<p class="text-[14px]">
					📍 {PLACE.label}<br />
					<span class="text-[12px] text-neutral-500">
						พิกัดโดยประมาณ {report.public_latitude.toFixed(5)}, {report.public_longitude.toFixed(5)}
					</span>
				</p>
				{#if report.purged}
					<p class="rounded-2xl bg-white p-3 text-[13px] text-neutral-600 ring-1 ring-neutral-200">รูปและรายละเอียดถูกลบตามนโยบายเก็บข้อมูล 30 วัน</p>
				{:else if report.description}
					<p class="rounded-2xl bg-white p-3 text-[14px] ring-1 ring-neutral-200">{report.description}</p>
				{/if}

				<section class="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
					<h3 class="mb-2 font-semibold">ลำดับเหตุการณ์</h3>
					<ol class="space-y-3 text-[13px]">
						<li class="flex gap-2">
							<span class="mt-0.5 text-leaf">●</span>
							<div>
								<div class="font-medium">ส่งรายงาน</div>
								<div class="text-neutral-500">{formatThai(report.submitted_at)}</div>
							</div>
						</li>
						<li class="flex gap-2">
							<span class="mt-0.5 text-leaf">●</span>
							<div>
								<div class="font-medium">ผู้ดูแลตรวจแล้ว เผยแพร่รายงาน</div>
								<div class="text-neutral-500">พิกัดจริงไม่แสดงบนแผนที่สาธารณะ</div>
							</div>
						</li>
						<li class="flex gap-2">
							<span class="mt-0.5 {report.status === 'resolved' ? 'text-leaf' : 'text-neutral-300'}">●</span>
							<div>
								<div class="font-medium">แก้ไขแล้ว</div>
								<div class="text-neutral-500">{report.resolved_at ? formatThai(report.resolved_at) : 'ยังไม่ยืนยัน'}</div>
							</div>
						</li>
					</ol>
				</section>
				{#if report.resolution_image_url}
					<img src={report.resolution_image_url} alt="รูปหลังแก้ไข" class="h-40 w-full rounded-2xl object-cover" />
				{/if}

				{#if report.status === 'published' && !report.purged}
					<FeedbackForm
						reportId={report.id}
						kind="fixed"
						needPhoto
						title="แจ้งว่าแก้ไขแล้ว (แนบรูป)"
						hint="ผู้ดูแลจะตรวจรูปก่อนปิดรายงาน สถานะไม่เปลี่ยนทันที"
					/>
				{/if}
				{#if !report.purged}
					<FeedbackForm reportId={report.id} kind="more_info" title="แจ้งข้อมูลเพิ่มเติม" />
					<FeedbackForm
						reportId={report.id}
						kind="removal_request"
						title="ขอลบภาพหรือรายงานนี้"
						hint="เช่น ภาพมีบุคคลหรือทะเบียนรถ บอกเหตุผลสั้น ๆ ผู้ดูแลจะพิจารณา"
					/>
				{/if}
			{/if}
		</div>
	{/if}
</div>
