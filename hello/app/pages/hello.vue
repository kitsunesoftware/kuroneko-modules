<script setup lang="ts">
const { isEnabled } = useModules()
const active = computed(() => isEnabled('demo.hello'))
</script>

<template>
  <div class="mx-auto max-w-lg px-6 py-16">
    <p class="text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
      Demo
    </p>
    <h1 class="mt-2 font-display text-3xl font-extrabold text-[var(--color-ink)]">
      Hello, Kuroneko
    </h1>
    <p class="mt-3 text-[var(--color-muted)]">
      Esta página veio do módulo de exemplo
      <code class="rounded bg-[var(--color-paper-deep)] px-1.5 py-0.5 text-[var(--color-ink)]">demo.hello</code>.
      Status no painel:
      <strong class="text-[var(--color-ink)]">{{ active ? 'ativo' : 'inativo' }}</strong>.
    </p>
  </div>
</template>
