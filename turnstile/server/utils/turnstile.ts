import { getModuleSettings } from '../../../../../base/server/utils/module-settings'
import { usePrisma } from '../../../../../base/server/utils/prisma'
import {
  TURNSTILE_LOCAL_SECRET_KEY,
  TURNSTILE_LOCAL_SITE_KEY,
  TURNSTILE_MODULE_ID,
  TURNSTILE_SITEVERIFY_URL,
  turnstileSettingsDefaults,
} from '../../shared/turnstile-settings'

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export async function isTurnstileModuleEnabled() {
  const prisma = usePrisma()
  const row = await prisma.installedModule.findUnique({
    where: { moduleId: TURNSTILE_MODULE_ID },
    select: { enabled: true },
  })
  return Boolean(row?.enabled)
}

export async function getTurnstileSettings() {
  const stored = await getModuleSettings(TURNSTILE_MODULE_ID)
  const localMode = asBoolean(stored.localMode, turnstileSettingsDefaults.localMode)

  if (localMode) {
    return {
      localMode: true,
      siteKey: TURNSTILE_LOCAL_SITE_KEY,
      secretKey: TURNSTILE_LOCAL_SECRET_KEY,
    }
  }

  return {
    localMode: false,
    siteKey: asString(stored.siteKey, turnstileSettingsDefaults.siteKey),
    secretKey: asString(stored.secretKey, turnstileSettingsDefaults.secretKey),
  }
}

export async function isTurnstileRequired() {
  if (!await isTurnstileModuleEnabled()) return false
  const { localMode, siteKey, secretKey } = await getTurnstileSettings()
  if (localMode) return true
  return Boolean(siteKey && secretKey)
}

export async function getTurnstileSiteKey() {
  if (!await isTurnstileRequired()) return null
  const { siteKey } = await getTurnstileSettings()
  return siteKey || null
}

export async function isTurnstileLocalMode() {
  if (!await isTurnstileModuleEnabled()) return false
  const { localMode } = await getTurnstileSettings()
  return localMode
}

export async function verifyTurnstileToken(token: string, ip?: string | null) {
  const required = await isTurnstileRequired()
  if (!required) return

  const value = token.trim()
  if (!value) {
    throw createError({
      statusCode: 400,
      message: 'Confirme o desafio Turnstile para continuar.',
    })
  }

  const { secretKey } = await getTurnstileSettings()
  if (!secretKey) {
    throw createError({
      statusCode: 503,
      message: 'Turnstile não está configurado. Peça a um administrador.',
    })
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: value,
  })
  if (ip) body.set('remoteip', ip)

  let data: { success?: boolean, 'error-codes'?: string[] }
  try {
    data = await $fetch<{ success?: boolean, 'error-codes'?: string[] }>(
      TURNSTILE_SITEVERIFY_URL,
      {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    )
  }
  catch {
    throw createError({
      statusCode: 502,
      message: 'Não foi possível validar o Turnstile. Tente novamente.',
    })
  }

  if (!data?.success) {
    throw createError({
      statusCode: 400,
      message: 'Verificação Turnstile inválida. Tente novamente.',
      data: {
        codes: data?.['error-codes'] ?? [],
      },
    })
  }
}
