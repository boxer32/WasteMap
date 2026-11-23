<script lang="ts">
	import { postFeedback } from '#lib/api';
	import { compressToJpeg } from '#lib/image-compress';

	let {
		reportId,
		kind,
		title,
		needPhoto = false,
		hint = ''
	}: { reportId: string; kind: 'fixed' | 'more_info' | 'removal_request'; title: string; needPhoto?: boolean; hint?: string } = $props();

	let open = $state(false);
	let text = $state('');
	let photo = $state<Blob | null>(null);
	let preview = $state('');
	let busy = $state(false);
	let message = $state('');
	let done = $state(false);

	async function pick(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		message = '';
		try {
			photo = await compressToJpeg(file);
			preview = URL.createObjectURL(photo);
		} catch (e) {
			message = e instanceof Error ? e.message : 'อ่านรูปไม่สำเร็จ';
		}
	}

	async function send() {
		if (needPhoto && !photo) {
			message = 'ต้องแนบรูปหลังแก้ไข';
			return;
		}
		if (kind !== 'fixed' && text.trim().length < 4) {
			message = 'กรุณาระบุรายละเอียดอย่างน้อย 4 ตัวอักษร';
			return;
		}
		busy = true;
		message = '';
		try {
			await postFeedback(reportId, kind, text.trim(), photo ?? undefined);
			done = true;
		} catch (e) {
			message = e instanceof Error ? e.message : 'ส่งไม่สำเร็จ';
		} finally {
			busy = false;
		}
	}
</script>

{#if done}
	<p class="rounded-2xl bg-[#e7f6ea] p-3 text-[13px] text-leaf-dark">ส่งเรื่องแล้ว ผู้ดูแลจะตรวจสอบ ยังไม่เปลี่ยนสถานะจนกว่าผู้ดูแลยืนยัน</p>
{:else if !open}
	<button type="button" class="w-full rounded-2xl bg-white py-3 text-[14px] ring-1 ring-neutral-200" onclick={() => (open = true)}>{title}</button>
{:else}
	<section class="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
		<h3 class="font-semibold">{title}</h3>
		{#if hint}<p class="text-[12px] text-neutral-500">{hint}</p>{/if}
		<textarea bind:value={text} maxlength="500" rows="2" class="w-full rounded-xl border border-neutral-200 p-2 text-[14px]" placeholder="รายละเอียด"></textarea>
		<label class="block text-[13px]">
			{needPhoto ? 'รูปหลังแก้ไข (จำเป็น)' : 'แนบรูป (ไม่บังคับ)'}
			<input type="file" accept="image/*" class="mt-1 block w-full text-[13px]" onchange={pick} />
		</label>
		{#if preview}<img src={preview} alt="รูปที่แนบ" class="h-28 w-full rounded-xl object-cover" />{/if}
		{#if message}<p class="text-[13px] text-red-600">{message}</p>{/if}
		<button type="button" disabled={busy} class="w-full rounded-xl bg-leaf py-2.5 font-semibold text-white disabled:opacity-50" onclick={send}>
			{busy ? 'กำลังส่ง…' : 'ส่ง'}
		</button>
	</section>
{/if}
