<script setup lang="ts">
const note = ref('Minha primeira nota do submódulo.')
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-6 py-16">
    <NuxtLink
      to="/hello"
      class="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
    >
      ← Hello Demo
    </NuxtLink>
    <h1 class="font-display text-3xl font-extrabold text-[var(--color-ink)]">
      Hello Notes
    </h1>
    <p class="text-[var(--color-muted)]">
      Submódulo
      <code class="rounded bg-[var(--color-paper-deep)] px-1.5 py-0.5 text-[var(--color-ink)]">demo.hello.notes</code>.
    </p>
    <textarea
      v-model="note"
      rows="4"
      class="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]"
    />
  </div>
</template>
