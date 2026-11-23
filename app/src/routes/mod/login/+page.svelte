<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>เข้าสู่ระบบผู้ดูแล</title><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-3 bg-[#f7f8f4] px-6">
	<h1 class="text-xl font-bold text-leaf-dark">เข้าสู่ระบบผู้ดูแล</h1>
	<form method="POST" use:enhance class="space-y-3">
		<label class="block text-[14px]">ชื่อผู้ใช้
			<input name="username" autocomplete="username" required class="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2" />
		</label>
		<label class="block text-[14px]">รหัสผ่าน
			<input name="password" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2" />
		</label>
		{#if form?.error}<p class="text-[13px] text-red-600">{form.error}</p>{/if}
		<button class="w-full rounded-2xl bg-leaf py-3 font-semibold text-white">เข้าสู่ระบบ</button>
	</form>
</div>
