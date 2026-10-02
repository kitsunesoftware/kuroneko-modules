<script setup lang="ts">
import { startRegistration } from '@simplewebauthn/browser'

type TwoFactorStatus = {
  enabled: boolean
  totpEnabled: boolean
  securityKeyEnabled: boolean
  recoveryCodesRemaining: number
  credentials: Array<{
    id: string
    name: string
    createdAt: string
    lastUsedAt: string | null
  }>
}

type ModalKind = 'totp-setup' | 'totp-disable' | 'webauthn-add' | 'webauthn-remove' | 'recovery' | null

const { token } = useAuth()
const toast = useToast()

const status = ref<TwoFactorStatus | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const modal = ref<ModalKind>(null)

const currentPassword = ref('')
const totpCode = ref('')
const qrDataUrl = ref('')
const totpSecret = ref('')
const recoveryCodes = ref<string[]>([])
const credentialToRemove = ref<string | null>(null)
const keyName = ref('Chave de segurança')

/** Dígitos e hífen (código de recuperação XXXX-XXXX). */
function sanitizeAuthOrRecoveryCode(value: string) {
  return value.replace(/[^\d-]/g, '').slice(0, 11)
}

function onAuthOrRecoveryInput(value: string) {
  totpCode.value = sanitizeAuthOrRecoveryCode(value)
}

const useRecoveryInDisable = ref(false)
const useRecoveryInRegen = ref(false)

function toggleDisableRecovery() {
  useRecoveryInDisable.value = !useRecoveryInDisable.value
  totpCode.value = ''
}

function toggleRegenRecovery() {
  useRecoveryInRegen.value = !useRecoveryInRegen.value
  totpCode.value = ''
}

const authenticatorApp = computed({
  get: () => Boolean(status.value?.totpEnabled),
  set: (value: boolean) => {
    if (value === Boolean(status.value?.totpEnabled)) return
    if (value) openModal('totp-setup')
    else openModal('totp-disable')
  },
})

const securityKey = computed({
  get: () => Boolean(status.value?.securityKeyEnabled),
  set: (value: boolean) => {
    if (value === Boolean(status.value?.securityKeyEnabled)) return
    if (value) openModal('webauthn-add')
    // desligar: usuário remove chaves individualmente
    else if ((status.value?.credentials.length || 0) > 0) {
      toast.error(
        'Remova as chaves',
        'Exclua as chaves registradas abaixo para desativar este método.',
      )
    }
  },
})

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

function openModal(kind: ModalKind) {
  modal.value = kind
  error.value = ''
  currentPassword.value = ''
  totpCode.value = ''
  qrDataUrl.value = ''
  totpSecret.value = ''
  recoveryCodes.value = []
  keyName.value = 'Chave de segurança'
  useRecoveryInDisable.value = false
  useRecoveryInRegen.value = false
  if (kind !== 'webauthn-remove') credentialToRemove.value = null
}

function closeModal() {
  modal.value = null
  saving.value = false
  error.value = ''
}

async function loadStatus() {
  if (!token.value) return
  loading.value = true
  try {
    status.value = await $fetch<TwoFactorStatus>('/api/account/two-factor/status', {
      headers: authHeaders(),
    })
  }
  catch (err: unknown) {
    toast.error('2FA', extractError(err, 'Não foi possível carregar o status.'))
  }
  finally {
    loading.value = false
  }
}

async function startTotpSetup() {
  if (!currentPassword.value) {
    error.value = 'Informe a senha atual.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const data = await $fetch<{
      secret: string
      qrDataUrl: string
    }>('/api/account/two-factor/totp/setup', {
      method: 'POST',
      headers: authHeaders(),
      body: { currentPassword: currentPassword.value },
    })
    totpSecret.value = data.secret
    qrDataUrl.value = data.qrDataUrl
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Não foi possível iniciar o setup.')
  }
  finally {
    saving.value = false
  }
}

async function confirmTotpSetup() {
  if (!totpCode.value.trim()) {
    error.value = 'Informe o código de 6 dígitos do app.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const data = await $fetch<{
      recoveryCodes: string[]
      status: TwoFactorStatus
    }>('/api/account/two-factor/totp/confirm', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        code: totpCode.value,
        currentPassword: currentPassword.value,
      },
    })
    status.value = data.status
    recoveryCodes.value = data.recoveryCodes
    toast.success('Autenticador ativo', 'Guarde os códigos de recuperação em local seguro.')
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Código inválido.')
  }
  finally {
    saving.value = false
  }
}

async function disableTotp() {
  saving.value = true
  error.value = ''
  try {
    const data = await $fetch<{ status: TwoFactorStatus }>('/api/account/two-factor/totp/disable', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        currentPassword: currentPassword.value,
        code: totpCode.value,
      },
    })
    status.value = data.status
    toast.success('Autenticador desativado', 'O app de autenticação foi removido da conta.')
    closeModal()
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Não foi possível desativar.')
  }
  finally {
    saving.value = false
  }
}

async function registerSecurityKey() {
  if (!currentPassword.value) {
    error.value = 'Informe a senha atual.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const optionsRes = await $fetch<{
      options: Record<string, unknown>
      challengeToken: string
    }>('/api/account/two-factor/webauthn/register/options', {
      method: 'POST',
      headers: authHeaders(),
      body: { currentPassword: currentPassword.value },
    })

    const attestation = await startRegistration({
      optionsJSON: optionsRes.options as never,
    })

    const data = await $fetch<{
      recoveryCodes: string[] | null
      status: TwoFactorStatus
    }>('/api/account/two-factor/webauthn/register/verify', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        challengeToken: optionsRes.challengeToken,
        response: attestation,
        name: keyName.value,
      },
    })

    status.value = data.status
    if (data.recoveryCodes?.length) {
      recoveryCodes.value = data.recoveryCodes
      toast.success('Chave registrada', 'Guarde os códigos de recuperação gerados.')
    }
    else {
      toast.success('Chave registrada', 'Sua chave de segurança está pronta para uso.')
      closeModal()
    }
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Não foi possível registrar a chave.')
  }
  finally {
    saving.value = false
  }
}

async function removeSecurityKey() {
  if (!credentialToRemove.value) return
  saving.value = true
  error.value = ''
  try {
    const data = await $fetch<{ status: TwoFactorStatus }>(
      `/api/account/two-factor/webauthn/${credentialToRemove.value}`,
      {
        method: 'DELETE',
        headers: authHeaders(),
        body: { currentPassword: currentPassword.value },
      },
    )
    status.value = data.status
    toast.success('Chave removida', 'A chave de segurança foi excluída.')
    closeModal()
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Não foi possível remover a chave.')
  }
  finally {
    saving.value = false
  }
}

async function regenerateRecovery() {
  saving.value = true
  error.value = ''
  try {
    const data = await $fetch<{
      recoveryCodes: string[]
      status: TwoFactorStatus
    }>('/api/account/two-factor/recovery/regenerate', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        currentPassword: currentPassword.value,
        code: totpCode.value,
      },
    })
    status.value = data.status
    recoveryCodes.value = data.recoveryCodes
    toast.success('Novos códigos', 'Os códigos anteriores foram invalidados.')
  }
  catch (err: unknown) {
    error.value = extractError(err, 'Não foi possível regenerar os códigos.')
  }
  finally {
    saving.value = false
  }
}

async function copyRecoveryCodes() {
  if (!recoveryCodes.value.length || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.success('Copiado', 'Códigos de recuperação copiados.')
  }
  catch {
    toast.error('Falha ao copiar', 'Copie os códigos manualmente.')
  }
}

function openRemoveKey(id: string) {
  credentialToRemove.value = id
  openModal('webauthn-remove')
}

const modalTitle = computed(() => {
  switch (modal.value) {
    case 'totp-setup': return 'Ativar autenticador'
    case 'totp-disable': return 'Desativar autenticador'
    case 'webauthn-add': return 'Adicionar chave de segurança'
    case 'webauthn-remove': return 'Remover chave'
    case 'recovery': return 'Códigos de recuperação'
    default: return ''
  }
})

onMounted(() => {
  void loadStatus()
})
</script>

<template>
  <section class="space-y-3">
    <div>
      <h2 class="text-xl font-semibold text-[var(--color-ink)]">
        Autenticação de dois fatores
      </h2>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        Adicione uma camada extra de segurança à sua conta com 2FA.
      </p>
    </div>

    <div class="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
      <div class="flex items-start gap-3 px-4 py-4">
        <Icon
          name="i-solar:smartphone-bold-duotone"
          class="mt-0.5 shrink-0 text-xl text-[var(--color-muted)]"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-[var(--color-ink)]">
            Aplicativo de autenticação
          </p>
          <p class="mt-0.5 text-sm text-[var(--color-muted)]">
            Use um app como Google Authenticator ou Authy para gerar códigos.
          </p>
        </div>
        <UiToggle
          v-model="authenticatorApp"
          :disabled="loading || saving"
        />
      </div>

      <div class="border-t border-[var(--color-line)]" />

      <div class="flex items-start gap-3 px-4 py-4">
        <Icon
          name="i-solar:key-bold-duotone"
          class="mt-0.5 shrink-0 text-xl text-[var(--color-muted)]"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-[var(--color-ink)]">
            Chave de segurança
          </p>
          <p class="mt-0.5 text-sm text-[var(--color-muted)]">
            Use uma chave física (WebAuthn / FIDO2) para confirmar o login.
          </p>
          <ul
            v-if="status?.credentials?.length"
            class="mt-3 space-y-2"
          >
            <li
              v-for="cred in status.credentials"
              :key="cred.id"
              class="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-[var(--color-ink)]">
                  {{ cred.name }}
                </p>
                <p class="text-xs text-[var(--color-muted)]">
                  Adicionada em {{ new Date(cred.createdAt).toLocaleDateString('pt-BR') }}
                </p>
              </div>
              <UiButton
                variant="outline"
                type="button"
                @click="openRemoveKey(cred.id)"
              >
                Remover
              </UiButton>
            </li>
          </ul>
        </div>
        <UiToggle
          v-model="securityKey"
          :disabled="loading || saving"
        />
      </div>

      <template v-if="status?.enabled">
        <div class="border-t border-[var(--color-line)]" />
        <div class="flex items-start gap-3 px-4 py-4">
          <Icon
            name="i-solar:shield-check-bold-duotone"
            class="mt-0.5 shrink-0 text-xl text-[var(--color-muted)]"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-[var(--color-ink)]">
              Códigos de recuperação
            </p>
            <p class="mt-0.5 text-sm text-[var(--color-muted)]">
              {{ status.recoveryCodesRemaining }} código{{ status.recoveryCodesRemaining === 1 ? '' : 's' }} restante{{ status.recoveryCodesRemaining === 1 ? '' : 's' }}.
              Use se perder o autenticador.
            </p>
          </div>
          <UiButton
            variant="outline"
            type="button"
            @click="openModal('recovery')"
          >
            Regenerar
          </UiButton>
        </div>
      </template>
    </div>

    <div
      v-if="!status?.enabled"
      class="flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/8 px-4 py-4"
    >
      <Icon
        name="i-solar:shield-keyhole-bold-duotone"
        class="mt-0.5 shrink-0 text-xl text-[var(--color-accent)]"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-[var(--color-ink)]">
          Recomendamos ativar 2FA
        </p>
        <p class="mt-0.5 text-sm text-[var(--color-muted)]">
          Contas com autenticação em dois fatores são significativamente mais seguras.
        </p>
      </div>
      <UiButton
        variant="outline"
        type="button"
        @click="openModal('totp-setup')"
      >
        Ativar
      </UiButton>
    </div>

    <UiModal
      :model-value="Boolean(modal)"
      :title="modalTitle"
      @update:model-value="(value) => { if (!value) closeModal() }"
    >
      <div class="space-y-4">
        <p
          v-if="error"
          class="rounded-[var(--radius)] border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ error }}
        </p>

        <!-- Setup TOTP -->
        <template v-if="modal === 'totp-setup'">
          <template v-if="recoveryCodes.length">
            <p class="text-sm text-[var(--color-muted)]">
              Guarde estes códigos em local seguro. Cada um só pode ser usado uma vez.
            </p>
            <div class="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-paper-deep)] p-3 font-mono text-sm">
              <span
                v-for="code in recoveryCodes"
                :key="code"
              >{{ code }}</span>
            </div>
          </template>
          <template v-else-if="!qrDataUrl">
            <p class="text-sm text-[var(--color-muted)]">
              Confirme sua senha para gerar o QR Code do autenticador.
            </p>
            <UiInput
              id="2fa-totp-password"
              v-model="currentPassword"
              label="Senha atual"
              type="password"
              autocomplete="current-password"
              :disabled="saving"
            />
          </template>
          <template v-else>
            <p class="text-sm text-[var(--color-muted)]">
              Escaneie o QR no app autenticador e informe o código gerado.
            </p>
            <div class="flex justify-center">
              <img
                :src="qrDataUrl"
                alt="QR Code TOTP"
                class="h-48 w-48 rounded-lg border border-[var(--color-line)] bg-white p-2"
              >
            </div>
            <p class="break-all text-center font-mono text-xs text-[var(--color-muted)]">
              {{ totpSecret }}
            </p>
            <OtpDigitsInput
              id="2fa-totp-code"
              v-model="totpCode"
              label="Código de 6 dígitos"
              :disabled="saving"
              autofocus
              hint="Digite o código gerado no aplicativo."
            />
          </template>
        </template>

        <!-- Disable TOTP -->
        <template v-else-if="modal === 'totp-disable'">
          <p class="text-sm text-[var(--color-muted)]">
            Informe a senha e um código do app (ou de recuperação) para desativar.
          </p>
          <UiInput
            id="2fa-disable-password"
            v-model="currentPassword"
            label="Senha atual"
            type="password"
            autocomplete="current-password"
            :disabled="saving"
          />
          <OtpDigitsInput
            v-if="!useRecoveryInDisable"
            id="2fa-disable-code"
            v-model="totpCode"
            label="Código do autenticador"
            :disabled="saving"
            autofocus
          />
          <UiInput
            v-else
            id="2fa-disable-recovery"
            :model-value="totpCode"
            label="Código de recuperação"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="0000-0000"
            maxlength="11"
            :disabled="saving"
            @update:model-value="onAuthOrRecoveryInput"
          />
          <button
            type="button"
            class="text-sm text-[var(--color-accent)] underline-offset-2 hover:underline"
            :disabled="saving"
            @click="toggleDisableRecovery"
          >
            {{ useRecoveryInDisable ? 'Usar código do autenticador' : 'Usar código de recuperação' }}
          </button>
        </template>

        <!-- WebAuthn add -->
        <template v-else-if="modal === 'webauthn-add'">
          <template v-if="recoveryCodes.length">
            <p class="text-sm text-[var(--color-muted)]">
              Códigos de recuperação gerados automaticamente. Guarde-os com segurança.
            </p>
            <div class="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-paper-deep)] p-3 font-mono text-sm">
              <span
                v-for="code in recoveryCodes"
                :key="code"
              >{{ code }}</span>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-[var(--color-muted)]">
              Conecte ou aproxime sua chave e confirme a senha da conta.
            </p>
            <UiInput
              id="2fa-key-name"
              v-model="keyName"
              label="Nome da chave"
              :disabled="saving"
            />
            <UiInput
              id="2fa-key-password"
              v-model="currentPassword"
              label="Senha atual"
              type="password"
              autocomplete="current-password"
              :disabled="saving"
            />
          </template>
        </template>

        <!-- WebAuthn remove -->
        <template v-else-if="modal === 'webauthn-remove'">
          <p class="text-sm text-[var(--color-muted)]">
            Confirme sua senha para remover esta chave de segurança.
          </p>
          <UiInput
            id="2fa-remove-key-password"
            v-model="currentPassword"
            label="Senha atual"
            type="password"
            autocomplete="current-password"
            :disabled="saving"
          />
        </template>

        <!-- Recovery regenerate -->
        <template v-else-if="modal === 'recovery'">
          <template v-if="recoveryCodes.length">
            <p class="text-sm text-[var(--color-muted)]">
              Novos códigos gerados. Os anteriores não funcionam mais.
            </p>
            <div class="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-paper-deep)] p-3 font-mono text-sm">
              <span
                v-for="code in recoveryCodes"
                :key="code"
              >{{ code }}</span>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-[var(--color-muted)]">
              Informe a senha e um código atual (app ou recuperação) para gerar novos códigos.
            </p>
            <UiInput
              id="2fa-recovery-password"
              v-model="currentPassword"
              label="Senha atual"
              type="password"
              autocomplete="current-password"
              :disabled="saving"
            />
            <OtpDigitsInput
              v-if="!useRecoveryInRegen"
              id="2fa-recovery-verify"
              v-model="totpCode"
              label="Código do autenticador"
              :disabled="saving"
              autofocus
            />
            <UiInput
              v-else
              id="2fa-recovery-code"
              :model-value="totpCode"
              label="Código de recuperação"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="0000-0000"
              maxlength="11"
              :disabled="saving"
              @update:model-value="onAuthOrRecoveryInput"
            />
            <button
              type="button"
              class="text-sm text-[var(--color-accent)] underline-offset-2 hover:underline"
              :disabled="saving"
              @click="toggleRegenRecovery"
            >
              {{ useRecoveryInRegen ? 'Usar código do autenticador' : 'Usar código de recuperação' }}
            </button>
          </template>
        </template>
      </div>

      <template #footer>
        <UiButton
          variant="outline"
          type="button"
          :disabled="saving"
          @click="closeModal"
        >
          {{ recoveryCodes.length ? 'Concluir' : 'Cancelar' }}
        </UiButton>

        <UiButton
          v-if="recoveryCodes.length"
          type="button"
          :disabled="saving"
          @click="copyRecoveryCodes"
        >
          Copiar códigos
        </UiButton>

        <UiButton
          v-else-if="modal === 'totp-setup' && !qrDataUrl"
          type="button"
          :loading="saving"
          @click="startTotpSetup"
        >
          Continuar
        </UiButton>
        <UiButton
          v-else-if="modal === 'totp-setup'"
          type="button"
          :loading="saving"
          @click="confirmTotpSetup"
        >
          Ativar
        </UiButton>
        <UiButton
          v-else-if="modal === 'totp-disable'"
          type="button"
          :loading="saving"
          @click="disableTotp"
        >
          Desativar
        </UiButton>
        <UiButton
          v-else-if="modal === 'webauthn-add'"
          type="button"
          :loading="saving"
          @click="registerSecurityKey"
        >
          Registrar chave
        </UiButton>
        <UiButton
          v-else-if="modal === 'webauthn-remove'"
          type="button"
          :loading="saving"
          @click="removeSecurityKey"
        >
          Remover
        </UiButton>
        <UiButton
          v-else-if="modal === 'recovery'"
          type="button"
          :loading="saving"
          @click="regenerateRecovery"
        >
          Regenerar
        </UiButton>
      </template>
    </UiModal>
  </section>
</template>
