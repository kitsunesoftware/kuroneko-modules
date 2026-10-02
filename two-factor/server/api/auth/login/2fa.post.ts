import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { requireTwoFactorLoginApi } from '../../../../../../server/utils/two-factor-bridge'

export default defineEventHandler(async (event) => {
  const api = requireTwoFactorLoginApi()
  const body = await readBody<{
    challengeToken?: string
    code?: string
    webauthnResponse?: AuthenticationResponseJSON
  }>(event)

  const challengeToken = typeof body?.challengeToken === 'string' ? body.challengeToken : ''
  if (!challengeToken) {
    throw createError({ statusCode: 400, message: 'Informe o desafio 2FA.' })
  }

  if (body?.webauthnResponse) {
    return await api.completeLoginWithWebAuthn(event, challengeToken, body.webauthnResponse)
  }

  return await api.completeLoginWithTotp(
    event,
    challengeToken,
    typeof body?.code === 'string' ? body.code : '',
  )
})
