<script setup lang="ts">
const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const host = ref<HTMLElement | null>(null)
const ready = ref(false)
const error = ref('')
const siteKey = ref('')
const localMode = ref(false)
const widgetId = ref<string | number | null>(null)

const active = computed(() => Boolean(siteKey.value))

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string | number
  reset: (widgetId?: string | number) => void
  remove: (widgetId?: string | number) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadScript() {
  if (import.meta.server) return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-kuroneko-turnstile]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('script')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.kuronekoTurnstile = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar Turnstile.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

function clearToken() {
  model.value = ''
}

async function refreshConfig() {
  try {
    const data = await $fetch<{
      required: boolean
      localMode?: boolean
      siteKey: string | null
    }>('/api/auth/login/turnstile')
    siteKey.value = data.required && data.siteKey ? data.siteKey : ''
    localMode.value = Boolean(data.localMode)
  }
  catch {
    siteKey.value = ''
    localMode.value = false
  }
}

async function mountWidget() {
  if (!import.meta.client || !active.value || !host.value) return

  error.value = ''
  ready.value = false
  clearToken()

  try {
    await loadScript()
    if (!window.turnstile || !host.value) {
      throw new Error('Turnstile indisponível.')
    }

    if (widgetId.value != null) {
      try {
        window.turnstile.remove(widgetId.value)
      }
      catch {
        // ignore
      }
      widgetId.value = null
      host.value.innerHTML = ''
    }

    widgetId.value = window.turnstile.render(host.value, {
      sitekey: siteKey.value,
      callback: (token) => {
        model.value = token
        error.value = ''
      },
      'expired-callback': () => {
        clearToken()
      },
      'error-callback': () => {
        clearToken()
        error.value = 'Não foi possível carregar o desafio. Atualize a página.'
      },
      theme: 'auto',
    })
    ready.value = true
  }
  catch {
    error.value = 'Não foi possível carregar o Turnstile.'
  }
}

function resetWidget() {
  clearToken()
  if (!import.meta.client || !window.turnstile || widgetId.value == null) return
  try {
    window.turnstile.reset(widgetId.value)
  }
  catch {
    void mountWidget()
  }
}

watch(siteKey, async () => {
  await nextTick()
  void mountWidget()
})

watch(model, (value, previous) => {
  // LoginForm limpa o token após falha → regenera o desafio.
  if (!value && previous && ready.value) {
    resetWidget()
  }
})

onMounted(() => {
  void refreshConfig()
})

onBeforeUnmount(() => {
  if (!import.meta.client || !window.turnstile || widgetId.value == null) return
  try {
    window.turnstile.remove(widgetId.value)
  }
  catch {
    // ignore
  }
  widgetId.value = null
})

defineExpose({ reset: resetWidget })
</script>

<template>
  <div
    v-if="active"
    class="space-y-2"
  >
    <p
      v-if="localMode"
      class="text-center text-xs font-medium text-amber-700"
    >
      Turnstile em modo local (teste)
    </p>
    <div
      ref="host"
      class="flex min-h-[65px] justify-center"
      :class="{ 'pointer-events-none opacity-55': disabled }"
    />
    <p
      v-if="error"
      class="text-center text-xs text-red-600"
    >
      {{ error }}
    </p>
  </div>
</template>
