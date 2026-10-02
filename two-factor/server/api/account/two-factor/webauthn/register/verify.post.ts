import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { finishWebAuthnRegistration } from '../../../../../utils/two-factor'
import { requireAuthUser } from '../../../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody<{
    challengeToken?: string
    response?: RegistrationResponseJSON
    name?: string
  }>(event)

  if (!body?.challengeToken || !body?.response) {
    throw createError({ statusCode: 400, message: 'Resposta WebAuthn incompleta.' })
  }

  return await finishWebAuthnRegistration(
    event,
    user.id,
    body.challengeToken,
    body.response,
    typeof body.name === 'string' ? body.name : undefined,
  )
})
