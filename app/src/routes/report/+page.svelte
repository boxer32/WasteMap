<script lang="ts">
	import { onMount } from 'svelte';
	import WasteMap from '#lib/components/WasteMap.svelte';
	import { CATEGORIES, type Category, type LocationSource } from '#lib/domain';
	import { StorageFullError, newToken, draftState, refreshDrafts, saveDraft, syncOne, trackLink, type Draft } from '#lib/drafts.svelte';
	import { readJpegGps } from '#lib/exif-gps';
	import { compressToJpeg } from '#lib/image-compress';

	let image = $state<Blob | undefined>();
	let preview = $state<string | undefined>();
	let capturedAt = $state<string | undefined>();
	let category = $state<Category | null>('overflow');
	let description = $state('');
	let pin = $state<[number, number] | null>(null);
	let source = $state<LocationSource>('gps');
	let message = $state('ถ่ายรูปตรงจุดขยะ แอปจะใช้ตำแหน่งตอนถ่าย');
	let sending = $state(false);
	/** set after the server confirmed: tracking link (shown once) or "queued" */
	let result = $state<{ id: string; link: string | null; queued: boolean } | null>(null);
	let copied = $state(false);

	onMount(refreshDrafts);

	async function onFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			message = 'ใช้ไฟล์รูปเท่านั้น';
			return;
		}
		const shotAt = Date.now();
		// read EXIF GPS from the original first: the canvas re-encode below strips all metadata
		const fromPhoto = readJpegGps(await file.arrayBuffer());
		capturedAt = file.lastModified ? new Date(file.lastModified).toISOString() : undefined;
		try {
			image = await compressToJpeg(file);
			if (preview) URL.revokeObjectURL(preview);
			preview = URL.createObjectURL(image);
		} catch (e) {
			message = e instanceof Error ? e.message : 'อ่านรูปไม่สำเร็จ';
			return;
		}
		if (fromPhoto) {
			pin = [fromPhoto.lng, fromPhoto.lat];
			source = 'exif';
			message = 'ใช้ตำแหน่งที่บันทึกในรูปตอนถ่าย';
			return;
		}
		message = 'รูปไม่มีตำแหน่งฝังอยู่ กำลังจับตำแหน่งโทรศัพท์ตอนนี้…';
		const here = await phoneFix();
		if (!here || Date.now() - shotAt > 20_000) {
			message = 'จับตำแหน่งโทรศัพท์ไม่ได้ แตะบนแผนที่เพื่อปักหมุดตำแหน่งเอง';
			return;
		}
		pin = [here.lng, here.lat];
		source = 'gps';
		message = 'ใช้ตำแหน่งโทรศัพท์ตอนถ่ายรูป';
	}

	function phoneFix() {
		return new Promise<{ lat: number; lng: number } | null>((resolve) => {
			if (!navigator.geolocation) {
				resolve(null);
				return;
			}
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
				() => resolve(null),
				{ enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
			);
		});
	}

	async function submit() {
		if (!category || !pin || !image) {
			message = 'ถ่ายรูปและระบุตำแหน่งก่อนส่ง';
			return;
		}
		sending = true;
		const draft: Draft = {
			id: crypto.randomUUID(),
			category,
			latitude: pin[1],
			longitude: pin[0],
			location_source: source,
			description: description.trim() || undefined,
			photo_captured_at: capturedAt,
			image,
			token: newToken(),
			created_at: new Date().toISOString()
		};
		try {
			// persist first: a failed or interrupted send never loses the report
			await saveDraft(draft);
		} catch (e) {
			sending = false;
			message =
				e instanceof StorageFullError
					? 'พื้นที่เก็บข้อมูลในเครื่องเต็ม ลบรูปหรือแอปที่ไม่ใช้ออกก่อน แล้วส่งใหม่'
					: 'บันทึกร่างในเครื่องไม่ได้ ลองส่งอีกครั้ง';
			return;
		}
		const r = await syncOne(draft);
		sending = false;
		if (r.ok) {
			result = { id: draft.id, link: trackLink(draft.id, r.token), queued: false };
		} else if (r.retry) {
			result = { id: draft.id, link: null, queued: true };
		} else {
			message = r.message;
		}
	}

	async function copy(link: string) {
		try {
			await navigator.clipboard.writeText(location.origin + link);
			copied = true;
		} catch {
			message = 'คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอกเอง';
		}
	}
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f7f8f4]">
	<header class="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
		<a href="/" class="grid h-9 w-9 place-items-center text-leaf" aria-label="กลับ">←</a>
		<div>
			<h1 class="text-[17px] font-bold">ส่งรายงานปัญหาขยะ</h1>
			<p class="text-[12px] text-neutral-500">แจ้งจุดที่พบปัญหาขยะในตำบลสลุย</p>
		</div>
	</header>

	{#if result}
		<div class="flex flex-1 flex-col gap-3 px-4 py-6">
			{#if result.queued}
				<h2 class="text-xl font-bold">เก็บรายงานไว้ในเครื่องแล้ว</h2>
				<p class="text-[14px]">ตอนนี้ส่งไม่ได้ (ไม่มีสัญญาณหรือเซิร์ฟเวอร์ไม่ว่าง) แอปจะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์หรือเปิดแอปอีกครั้ง ไม่ต้องกดซ้ำ</p>
				<p class="rounded-2xl bg-white p-3 text-[12px] text-neutral-600 ring-1 ring-neutral-200">
					ระวัง: รายงานที่ยังไม่ส่งอยู่ในที่เก็บข้อมูลของเว็บไซต์นี้ในเครื่อง ถ้าล้างข้อมูลเว็บไซต์หรือพื้นที่จัดเก็บถูกเคลียร์ รายงานอาจสูญหาย
				</p>
			{:else}
				<h2 class="text-xl font-bold">ส่งรายงานแล้ว</h2>
				<p class="text-[14px]">รอผู้ดูแลตรวจสอบก่อนขึ้นแผนที่สาธารณะ</p>
				{#if result.link}
					<div class="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
						<p class="text-[13px] font-semibold">ลิงก์ติดตามรายงาน (แสดงครั้งเดียว บันทึกไว้)</p>
						<a href={result.link} class="mt-1 block text-[12px] break-all text-leaf underline">{result.link}</a>
						<button type="button" class="mt-2 w-full rounded-xl bg-leaf py-2 font-semibold text-white" onclick={() => copy(result!.link!)}>
							{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
						</button>
						<p class="mt-2 text-[11px] text-neutral-500">ลิงก์ใช้ได้ 30 วันหลังส่งรายงาน หลังจากนั้นรูปและรายละเอียดจะถูกลบ ใครมีลิงก์นี้ก็ติดตามและแจ้งแก้ไขรายงานนี้ได้</p>
					</div>
				{:else}
					<p class="text-[13px] text-neutral-600">รายงานนี้เคยส่งสำเร็จแล้ว (ส่งซ้ำไม่สร้างรายการใหม่) ลิงก์ติดตามแสดงเฉพาะตอนส่งครั้งแรก</p>
				{/if}
			{/if}
			{#if message}<p class="text-[13px] text-red-600">{message}</p>{/if}
			<a href="/" class="rounded-2xl bg-white py-3 text-center ring-1 ring-neutral-200">กลับหน้าแผนที่</a>
		</div>
	{:else}
	<div class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
		{#if draftState.count > 0}
			<p class="rounded-xl bg-[#fff4e8] px-3 py-2 text-[13px] text-amber">รอส่ง {draftState.count} รายการ{draftState.failed ? ` (ไม่ผ่าน ${draftState.failed})` : ''} · จะส่งอัตโนมัติเมื่อออนไลน์</p>
		{/if}
		<label class="relative block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-leaf bg-[#e7f6ea]">
			{#if preview}
				<img src={preview} alt="รูปที่เลือก" class="h-44 w-full object-cover" />
				<span class="absolute right-3 bottom-3 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-leaf shadow">แตะเพื่อเปลี่ยนรูป</span>
			{:else}
				<div class="grid h-44 place-items-center text-center text-leaf-dark">
					<div>
						<div class="text-3xl" aria-hidden="true">📷</div>
						<div class="mt-1 font-semibold">แตะกรอบนี้เพื่อถ่ายหรือเลือกรูป</div>
						<div class="text-[12px] text-neutral-500">ตำแหน่งใช้จุดตอนถ่ายรูป</div>
					</div>
				</div>
			{/if}
			<input type="file" accept="image/*" capture="environment" class="absolute inset-0 cursor-pointer opacity-0" onchange={onFile} />
		</label>

		<p class="font-semibold">ตำแหน่ง</p>
		<div class="relative h-52 overflow-hidden rounded-2xl ring-1 ring-neutral-200">
			<WasteMap reports={[]} interactive={false} bind:pin onPick={() => { source = 'manual'; message = 'ใช้ตำแหน่งที่ปักหมุดเอง'; }} />
		</div>
		<p class="text-[12px] text-neutral-500">
			จุดบนแผนที่สาธารณะถูกขยับประมาณ 50–100 เมตร จุดที่ส่งคือตำแหน่งตอนถ่าย
			{#if pin}
				· {pin[1].toFixed(5)}, {pin[0].toFixed(5)}
			{/if}
		</p>

		<p class="font-semibold">ประเภทปัญหา <span class="text-red-500">*</span></p>
		<div class="grid grid-cols-2 gap-2">
			{#each CATEGORIES as item}
				<button
					type="button"
					class="rounded-2xl px-3 py-3 text-left ring-1 {category === item.id
						? 'bg-[#e7f6ea] ring-leaf'
						: 'bg-white ring-neutral-200'}"
					aria-pressed={category === item.id}
					onclick={() => (category = item.id)}
				>
					<div class="font-semibold">{category === item.id ? '✓ ' : ''}{item.label}</div>
					<div class="text-[12px] text-neutral-500">{item.hint}</div>
				</button>
			{/each}
		</div>

		<label class="block">
			<span class="font-semibold">รายละเอียดเพิ่มเติม (ไม่บังคับ)</span>
			<textarea
				bind:value={description}
				maxlength="300"
				rows="3"
				class="mt-1 w-full rounded-2xl border border-neutral-200 bg-white p-3"
				placeholder="เช่น ถังขยะล้นมาหลายวันแล้ว"
			></textarea>
			<span class="text-[12px] text-neutral-400">{description.length} / 300</span>
		</label>
		{#if message}<p class="text-[13px] text-leaf-dark">{message}</p>{/if}
	</div>

	<div class="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
		<button
			type="button"
			class="w-full rounded-2xl bg-leaf py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
			disabled={sending || !image || !pin}
			onclick={submit}>ส่งรายงาน</button
		>
		<p class="mt-2 text-center text-[12px] text-neutral-400">ส่งได้ทันที ไม่ต้องสมัครสมาชิก · รายงานใหม่เป็นสถานะรอตรวจสอบ</p>
		<p class="mt-1 text-center text-[11px] text-neutral-400">ถ้าไม่มีสัญญาณ แอปเก็บไว้ในเครื่องแล้วส่งให้ทีหลัง ถ้าล้างข้อมูลเว็บไซต์ก่อนส่ง รายงานที่ยังไม่ส่งอาจหาย</p>
	</div>
	{/if}
</div>
