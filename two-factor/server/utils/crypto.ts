import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'
import { hashPassword, verifyPassword } from '../../../../server/utils/password'

const ENC_SALT = 'kuroneko-2fa-v1'

function authSecret() {
  const config = useRuntimeConfig()
  return String(config.authSecret || 'kuroneko-dev-secret')
}

function deriveKey(secret: string) {
  return scryptSync(secret, ENC_SALT, 32)
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(authSecret()), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptSecret(payload: string) {
  const buf = Buffer.from(payload, 'base64url')
  if (buf.length < 28) {
    throw createError({ statusCode: 500, message: 'Segredo 2FA inválido.' })
  }
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(authSecret()), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function generateRecoveryCodes(count = 10) {
  const codes: string[] = []
  for (let i = 0; i < count; i += 1) {
    // Apenas dígitos (mesmo campo do autenticador no login).
    const raw = randomBytes(4).readUInt32BE(0).toString().padStart(10, '0').slice(-8)
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return codes
}

export async function hashRecoveryCodes(codes: string[]) {
  return Promise.all(codes.map(async (code) => ({
    code,
    codeHash: await hashPassword(normalizeRecoveryCode(code)),
  })))
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export async function verifyRecoveryCode(code: string, codeHash: string) {
  return verifyPassword(normalizeRecoveryCode(code), codeHash)
}

export function createChallengeToken() {
  return randomBytes(32).toString('base64url')
}

export function issuerName() {
  return 'Kuroneko'
}
