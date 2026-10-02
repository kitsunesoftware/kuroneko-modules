<script setup lang="ts">
type DeviceSession = {
  id: string
  title: string
  type: string
  ip: string
  activity: string
  current: boolean
  remember: boolean
}

const { token, logout } = useAuth()
const toast = useToast()

const devicesOpen = ref(true)
const loading = ref(true)
const busyId = ref<string | null>(null)
const revokingOthers = ref(false)
const devices = ref<DeviceSession[]>([])

const otherDevicesCount = computed(
  () => devices.value.filter((device) => !device.current).length,
)

function authHeaders() {
  return token.value ? { Authorization: `Bearer ${token.value}` } : undefined
}

function extractError(err: unknown, fallback: string) {
  if (
    err
    && typeof err === 'object'
    && 'data' in err
    && err.data
    && typeof err.data === 'object'
    && 'message' in err.data
    && typeof err.data.message === 'string'
  ) {
    return err.data.message
  }
  return fallback
}

async function loadDevices() {
  if (!token.value) return
  loading.value = true
  try {
    const data = await $fetch<{ devices: DeviceSession[] }>('/api/account/devices', {
      headers: authHeaders(),
    })
    devices.value = data.devices || []
  }
  catch (err: unknown) {
    toast.error('Dispositivos', extractError(err, 'Não foi possível carregar as sessões.'))
  }
  finally {
    loading.value = false
  }
}

async function revokeDevice(device: DeviceSession) {
  if (busyId.value) return
  busyId.value = device.id
  try {
    const data = await $fetch<{ ok: boolean, revokedCurrent?: boolean }>(
      `/api/account/devices/${device.id}`,
      {
        method: 'DELETE',
        headers: authHeaders(),
      },
    )

    if (data.revokedCurrent || device.current) {
      toast.success('Sessão encerrada', 'Você saiu deste dispositivo.')
      await logout()
      return
    }

    toast.success('Sessão encerrada', `${device.title} foi desconectado.`)
    await loadDevices()
  }
  catch (err: unknown) {
    toast.error('Falha ao encerrar', extractError(err, 'Tente novamente.'))
  }
  finally {
    busyId.value = null
  }
}

async function revokeOthers() {
  if (revokingOthers.value || otherDevicesCount.value === 0) return
  revokingOthers.value = true
  try {
    const data = await $fetch<{ ok: boolean, revokedCount: number }>(
      '/api/account/devices/revoke-others',
      {
        method: 'POST',
        headers: authHeaders(),
      },
    )
    toast.success(
      'Sessões encerradas',
      `${data.revokedCount} dispositivo${data.revokedCount === 1 ? '' : 's'} desconectado${data.revokedCount === 1 ? '' : 's'}.`,
    )
    await loadDevices()
  }
  catch (err: unknown) {
    toast.error('Falha ao encerrar', extractError(err, 'Tente novamente.'))
  }
  finally {
    revokingOthers.value = false
  }
}

onMounted(() => {
  void loadDevices()
})
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold text-[var(--color-ink)]">
          Dispositivos conectados
        </h2>
        <p class="mt-1 text-sm text-[var(--color-muted)]">
          Veja e encerre sessões ativas na sua conta
        </p>
        <p class="mt-1 text-sm text-[var(--color-muted)]">
          Estes são os locais em que sua conta está logada. Encerre sessões que você não reconhece.
        </p>
      </div>

      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
        :aria-expanded="devicesOpen"
        @click="devicesOpen = !devicesOpen"
      >
        {{ loading ? '…' : `${devices.length} dispositivo${devices.length === 1 ? '' : 's'}` }}
        <Icon
          name="i-solar:alt-arrow-up-linear"
          class="text-base transition-transform"
          :class="{ 'rotate-180': !devicesOpen }"
        />
      </button>
    </div>

    <div
      v-show="devicesOpen"
      class="space-y-3"
    >
      <div
        v-if="loading"
        class="rounded-xl border border-[var(--color-line)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
      >
        Carregando sessões…
      </div>

      <div
        v-else-if="devices.length === 0"
        class="rounded-xl border border-[var(--color-line)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
      >
        Nenhuma sessão ativa encontrada. Faça login novamente neste dispositivo.
      </div>

      <div
        v-for="device in devices"
        :key="device.id"
        class="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-line)] bg-white px-4 py-4"
      >
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-[var(--color-ink)]">
              {{ device.title }}
            </p>
            <span
              v-if="device.current"
              class="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white"
            >
              Este dispositivo
            </span>
          </div>
          <p class="text-sm text-[var(--color-muted)]">
            {{ device.type }}
          </p>
          <p class="text-sm text-[var(--color-muted)]">
            IP {{ device.ip }}
          </p>
          <p class="text-sm text-[var(--color-muted)]">
            {{ device.activity }}
          </p>
        </div>

        <button
          type="button"
          class="shrink-0 text-sm font-medium transition disabled:opacity-55"
          :class="
            device.current
              ? 'text-red-600 hover:text-red-700'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          "
          :disabled="busyId === device.id || revokingOthers"
          @click="revokeDevice(device)"
        >
          {{ busyId === device.id ? '…' : device.current ? 'Sair' : 'Encerrar' }}
        </button>
      </div>

      <button
        v-if="otherDevicesCount > 0"
        type="button"
        class="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-deep)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-line)]/60 disabled:opacity-55"
        :disabled="revokingOthers || Boolean(busyId)"
        @click="revokeOthers"
      >
        {{ revokingOthers ? 'Encerrando…' : `Encerrar outros (${otherDevicesCount})` }}
      </button>
    </div>
  </section>
</template>
