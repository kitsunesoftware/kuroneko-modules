import type { H3Event } from 'h3'
import QRCode from 'qrcode'
import { Secret, TOTP } from 'otpauth'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server'
import { usePrisma } from '../../../../../base/server/utils/prisma'
import { getUserById } from '../../../../server/utils/auth'
import { createAuthSessionFromEvent } from '../../../../server/utils/sessions'
import { getUserPermissionKeys } from '../../../roles/server/utils/roles'
import { verifyPassword } from '../../../../server/utils/password'
import {
  createChallengeToken,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCodes,
  issuerName,
  verifyRecoveryCode,
} from './crypto'

const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_CHALLENGE_ATTEMPTS = 5
const RECOVERY_CODE_COUNT = 10

function getRp(event: H3Event) {
  const url = getRequestURL(event)
  const rpID = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    ? 'localhost'
    : url.hostname
  const origin = `${url.protocol}//${url.host}`
  return { rpID, origin, rpName: issuerName() }
}

async function ensureSettings(userId: string) {
  const prisma = usePrisma()
  return prisma.twoFactorSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

const TOTP_PERIOD_SECONDS = 30

function buildTotp(secretBase32: string, label: string) {
  return new TOTP({
    issuer: issuerName(),
    label: label || 'conta',
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  })
}

function isValidTotpCode(code: string) {
  return /^\d{6}$/.test(code.trim())
}

function totpStepFromDelta(delta: number) {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + delta
}

/**
 * Valida TOTP apenas no período atual (window 0) e impede reuso do mesmo timestep.
 * Retorna o step consumido ou null se inválido/expirado/já usado.
 */
async function consumeTotpCode(
  userId: string,
  secretBase32: string,
  code: string,
  label: string,
  options?: { persistStep?: boolean },
): Promise<number | null> {
  const totp = buildTotp(secretBase32, label)
  const delta = totp.validate({ token: code.trim(), window: 0 })
  if (delta === null) return null

  const step = totpStepFromDelta(delta)
  const prisma = usePrisma()
  const settings = await ensureSettings(userId)

  if (settings.totpLastStep != null && step <= settings.totpLastStep) {
    return null
  }

  if (options?.persistStep !== false) {
    await prisma.twoFactorSettings.update({
      where: { userId },
      data: { totpLastStep: step },
    })
  }

  return step
}

export async function getTwoFactorStatus(userId: string) {
  const prisma = usePrisma()
  const [settings, credentials, recoveryRemaining] = await Promise.all([
    ensureSettings(userId),
    prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.twoFactorRecoveryCode.count({
      where: { userId, usedAt: null },
    }),
  ])

  const totpEnabled = Boolean(settings.totpEnabled && settings.totpSecretEnc)
  const securityKeyEnabled = credentials.length > 0
  const enabled = totpEnabled || securityKeyEnabled

  return {
    enabled,
    totpEnabled,
    securityKeyEnabled,
    recoveryCodesRemaining: recoveryRemaining,
    credentials: credentials.map((item) => ({
      id: item.id,
      name: item.name || 'Chave de segurança',
      createdAt: item.createdAt.toISOString(),
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
    })),
  }
}

export async function userHasTwoFactor(userId: string) {
  try {
    const status = await getTwoFactorStatus(userId)
    return status.enabled
  }
  catch {
    return false
  }
}

export async function assertCurrentPassword(userId: string, password: string) {
  if (!password) {
    throw createError({ statusCode: 400, message: 'Informe a senha atual.' })
  }
  const prisma = usePrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
  if (!user?.passwordHash) {
    throw createError({ statusCode: 400, message: 'Esta conta não possui senha.' })
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    throw createError({ statusCode: 401, message: 'Senha atual incorreta.' })
  }
}

export async function beginTotpSetup(userId: string, currentPassword: string) {
  await assertCurrentPassword(userId, currentPassword)
  const prisma = usePrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true, name: true },
  })
  if (!user) {
    throw createError({ statusCode: 404, message: 'Usuário não encontrado.' })
  }

  const secret = new Secret({ size: 20 })
  const label = user.email || user.username || user.name || 'conta'
  const totp = buildTotp(secret.base32, label)
  const otpauthUrl = totp.toString()
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
  })

  await prisma.twoFactorSettings.upsert({
    where: { userId },
    create: {
      userId,
      totpPendingEnc: encryptSecret(secret.base32),
    },
    update: {
      totpPendingEnc: encryptSecret(secret.base32),
    },
  })

  return {
    secret: secret.base32,
    otpauthUrl,
    qrDataUrl,
  }
}

async function replaceRecoveryCodes(userId: string) {
  const prisma = usePrisma()
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT)
  const hashed = await hashRecoveryCodes(codes)
  await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } })
  await prisma.twoFactorRecoveryCode.createMany({
    data: hashed.map((item) => ({
      userId,
      codeHash: item.codeHash,
    })),
  })
  return codes
}

export async function confirmTotpSetup(
  userId: string,
  code: string,
  currentPassword: string,
) {
  await assertCurrentPassword(userId, currentPassword)
  if (!isValidTotpCode(code)) {
    throw createError({ statusCode: 400, message: 'Informe o código de 6 dígitos.' })
  }

  const prisma = usePrisma()
  const settings = await ensureSettings(userId)
  if (!settings.totpPendingEnc) {
    throw createError({
      statusCode: 400,
      message: 'Nenhum setup de autenticador em andamento. Inicie novamente.',
    })
  }

  const secretBase32 = decryptSecret(settings.totpPendingEnc)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  })
  const label = user?.email || user?.username || 'conta'
  const step = await consumeTotpCode(userId, secretBase32, code, label, { persistStep: false })
  if (step === null) {
    throw createError({
      statusCode: 400,
      message: 'Código inválido ou expirado. Use o código atual do aplicativo.',
    })
  }

  const recoveryCodes = await replaceRecoveryCodes(userId)

  await prisma.twoFactorSettings.update({
    where: { userId },
    data: {
      totpEnabled: true,
      totpSecretEnc: encryptSecret(secretBase32),
      totpPendingEnc: null,
      totpLastStep: step,
    },
  })

  return {
    ok: true,
    recoveryCodes,
    status: await getTwoFactorStatus(userId),
  }
}

export async function disableTotp(
  userId: string,
  currentPassword: string,
  code: string,
) {
  await assertCurrentPassword(userId, currentPassword)
  const prisma = usePrisma()
  const settings = await ensureSettings(userId)
  if (!settings.totpEnabled || !settings.totpSecretEnc) {
    throw createError({ statusCode: 400, message: 'Aplicativo autenticador não está ativo.' })
  }

  const verified = await verifyTotpOrRecovery(userId, code, settings.totpSecretEnc)
  if (!verified.ok) {
    throw createError({ statusCode: 400, message: verified.message })
  }

  await prisma.twoFactorSettings.update({
    where: { userId },
    data: {
      totpEnabled: false,
      totpSecretEnc: null,
      totpPendingEnc: null,
    },
  })

  // Se não houver chave WebAuthn, limpa códigos de recuperação.
  const remainingKeys = await prisma.webAuthnCredential.count({ where: { userId } })
  if (!remainingKeys) {
    await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } })
  }

  return { ok: true, status: await getTwoFactorStatus(userId) }
}

export async function regenerateRecoveryCodes(
  userId: string,
  currentPassword: string,
  code: string,
) {
  await assertCurrentPassword(userId, currentPassword)
  const status = await getTwoFactorStatus(userId)
  if (!status.enabled) {
    throw createError({ statusCode: 400, message: 'Ative o 2FA antes de gerar códigos.' })
  }

  const prisma = usePrisma()
  const settings = await ensureSettings(userId)
  const verified = await verifyTotpOrRecovery(
    userId,
    code,
    settings.totpEnabled ? settings.totpSecretEnc : null,
    { allowWithoutTotp: status.securityKeyEnabled },
  )
  if (!verified.ok) {
    throw createError({ statusCode: 400, message: verified.message })
  }

  const recoveryCodes = await replaceRecoveryCodes(userId)
  return { recoveryCodes, status: await getTwoFactorStatus(userId) }
}

type VerifyResult = { ok: true, via: 'totp' | 'recovery' } | { ok: false, message: string }

async function verifyTotpOrRecovery(
  userId: string,
  code: string,
  totpSecretEnc: string | null | undefined,
  options?: { allowWithoutTotp?: boolean },
): Promise<VerifyResult> {
  const trimmed = code.trim()
  if (!trimmed) {
    return { ok: false, message: 'Informe o código do autenticador ou um código de recuperação.' }
  }

  if (isValidTotpCode(trimmed) && totpSecretEnc) {
    const prisma = usePrisma()
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    })
    const secretBase32 = decryptSecret(totpSecretEnc)
    const step = await consumeTotpCode(
      userId,
      secretBase32,
      trimmed,
      user?.email || user?.username || 'conta',
    )
    if (step !== null) {
      return { ok: true, via: 'totp' }
    }
  }

  // Recovery codes
  const prisma = usePrisma()
  const candidates = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  })

  for (const candidate of candidates) {
    if (await verifyRecoveryCode(trimmed, candidate.codeHash)) {
      await prisma.twoFactorRecoveryCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      })
      return { ok: true, via: 'recovery' }
    }
  }

  if (!totpSecretEnc && options?.allowWithoutTotp) {
    return {
      ok: false,
      message: 'Informe um código de recuperação válido.',
    }
  }

  return { ok: false, message: 'Código inválido.' }
}

export async function createLoginChallenge(event: H3Event, userId: string) {
  const prisma = usePrisma()
  const status = await getTwoFactorStatus(userId)
  if (!status.enabled) {
    throw createError({ statusCode: 400, message: '2FA não está ativo nesta conta.' })
  }

  const methods: Array<'totp' | 'webauthn'> = []
  if (status.totpEnabled) methods.push('totp')
  if (status.securityKeyEnabled) methods.push('webauthn')

  let webauthnOptions: unknown = null
  if (status.securityKeyEnabled) {
    const { rpID } = getRp(event)
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    })
    webauthnOptions = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((item) => ({
        id: item.credentialId,
        transports: parseTransports(item.transports),
      })),
      userVerification: 'preferred',
    })
  }

  const token = createChallengeToken()
  await prisma.twoFactorLoginChallenge.deleteMany({
    where: {
      OR: [
        { userId },
        { expiresAt: { lte: new Date() } },
      ],
    },
  })

  await prisma.twoFactorLoginChallenge.create({
    data: {
      token,
      userId,
      webauthnOptions: webauthnOptions as object | undefined,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  })

  return {
    requiresTwoFactor: true as const,
    challengeToken: token,
    methods,
    webauthnOptions,
  }
}

async function loadChallenge(challengeToken: string) {
  const prisma = usePrisma()
  const challenge = await prisma.twoFactorLoginChallenge.findUnique({
    where: { token: challengeToken },
  })
  if (!challenge) {
    throw createError({ statusCode: 400, message: 'Desafio 2FA inválido ou expirado.' })
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
    throw createError({ statusCode: 400, message: 'Desafio 2FA expirado. Faça login novamente.' })
  }
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
    throw createError({
      statusCode: 429,
      message: 'Muitas tentativas no código 2FA. Faça login novamente.',
    })
  }
  return challenge
}

async function bumpChallengeAttempt(challengeId: string) {
  const prisma = usePrisma()
  await prisma.twoFactorLoginChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
  })
}

export async function completeLoginWithTotp(
  event: H3Event,
  challengeToken: string,
  code: string,
) {
  const prisma = usePrisma()
  const challenge = await loadChallenge(challengeToken)
  const settings = await ensureSettings(challenge.userId)

  if (!settings.totpEnabled || !settings.totpSecretEnc) {
    // ainda permite recovery code se tiver só webauthn + recovery
  }

  const verified = await verifyTotpOrRecovery(
    challenge.userId,
    code,
    settings.totpSecretEnc,
    { allowWithoutTotp: true },
  )

  if (!verified.ok) {
    await bumpChallengeAttempt(challenge.id)
    throw createError({ statusCode: 401, message: verified.message })
  }

  await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
  return issueSession(event, challenge.userId)
}

export async function completeLoginWithWebAuthn(
  event: H3Event,
  challengeToken: string,
  response: AuthenticationResponseJSON,
) {
  const prisma = usePrisma()
  const challenge = await loadChallenge(challengeToken)
  const { rpID, origin } = getRp(event)

  const expectedChallenge = (challenge.webauthnOptions as { challenge?: string } | null)?.challenge
  if (!expectedChallenge) {
    throw createError({ statusCode: 400, message: 'Desafio WebAuthn indisponível. Use o código do app.' })
  }

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  })
  if (!credential || credential.userId !== challenge.userId) {
    await bumpChallengeAttempt(challenge.id)
    throw createError({ statusCode: 401, message: 'Chave de segurança não reconhecida.' })
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
        counter: Number(credential.counter),
        transports: parseTransports(credential.transports),
      },
      requireUserVerification: false,
    })

    if (!verification.verified) {
      await bumpChallengeAttempt(challenge.id)
      throw createError({ statusCode: 401, message: 'Falha na autenticação da chave.' })
    }

    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    })
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    await bumpChallengeAttempt(challenge.id)
    throw createError({ statusCode: 401, message: 'Falha na autenticação da chave.' })
  }

  await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
  return issueSession(event, challenge.userId)
}

async function issueSession(event: H3Event, userId: string) {
  const user = await getUserById(userId)
  if (!user) {
    throw createError({ statusCode: 404, message: 'Usuário não encontrado.' })
  }
  const access = await getUserPermissionKeys(userId)
  const { token } = await createAuthSessionFromEvent(event, userId)
  return {
    token,
    user: {
      ...user,
      roleKey: access.roleKey ?? user.roleKey ?? null,
      permissions: access.permissions,
    },
  }
}

function parseTransports(raw: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    return parsed.filter((item): item is AuthenticatorTransportFuture => typeof item === 'string')
  }
  catch {
    return undefined
  }
}

export async function beginWebAuthnRegistration(event: H3Event, userId: string, currentPassword: string) {
  await assertCurrentPassword(userId, currentPassword)
  const prisma = usePrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, name: true },
  })
  if (!user) {
    throw createError({ statusCode: 404, message: 'Usuário não encontrado.' })
  }

  const { rpID, rpName } = getRp(event)
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  })

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email || user.username || user.id,
    userDisplayName: user.name || user.email || user.username || 'Usuário',
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((item) => ({
      id: item.credentialId,
      transports: parseTransports(item.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  // Reaproveita challenge table com prefixo de registro
  const token = `reg_${createChallengeToken()}`
  await prisma.twoFactorLoginChallenge.create({
    data: {
      token,
      userId,
      webauthnOptions: options as object,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  })

  return { options, challengeToken: token }
}

export async function finishWebAuthnRegistration(
  event: H3Event,
  userId: string,
  challengeToken: string,
  response: RegistrationResponseJSON,
  name?: string,
) {
  const prisma = usePrisma()
  const challenge = await prisma.twoFactorLoginChallenge.findUnique({
    where: { token: challengeToken },
  })
  if (!challenge || challenge.userId !== userId) {
    throw createError({ statusCode: 400, message: 'Desafio de registro inválido.' })
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
    throw createError({ statusCode: 400, message: 'Desafio expirado. Tente novamente.' })
  }

  const expectedChallenge = (challenge.webauthnOptions as { challenge?: string } | null)?.challenge
  if (!expectedChallenge) {
    throw createError({ statusCode: 400, message: 'Desafio WebAuthn inválido.' })
  }

  const { rpID, origin } = getRp(event)
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  }
  catch {
    throw createError({ statusCode: 400, message: 'Não foi possível verificar a chave.' })
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw createError({ statusCode: 400, message: 'Registro da chave não verificado.' })
  }

  const { credential } = verification.registrationInfo

  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: BigInt(credential.counter),
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
      name: name?.trim() || 'Chave de segurança',
    },
  })

  await prisma.twoFactorLoginChallenge.delete({ where: { id: challenge.id } }).catch(() => {})

  // Garante códigos de recuperação se ainda não existirem
  const remaining = await prisma.twoFactorRecoveryCode.count({
    where: { userId, usedAt: null },
  })
  let recoveryCodes: string[] | null = null
  if (remaining === 0) {
    recoveryCodes = await replaceRecoveryCodes(userId)
  }

  return {
    ok: true,
    recoveryCodes,
    status: await getTwoFactorStatus(userId),
  }
}

export async function removeWebAuthnCredential(
  userId: string,
  credentialId: string,
  currentPassword: string,
) {
  await assertCurrentPassword(userId, currentPassword)
  const prisma = usePrisma()
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { id: credentialId, userId },
  })
  if (!credential) {
    throw createError({ statusCode: 404, message: 'Chave não encontrada.' })
  }

  await prisma.webAuthnCredential.delete({ where: { id: credential.id } })

  const status = await getTwoFactorStatus(userId)
  if (!status.enabled) {
    await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } })
  }

  return { ok: true, status }
}
