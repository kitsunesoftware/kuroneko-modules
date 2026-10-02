import { removeWebAuthnCredential } from '../../../../utils/two-factor'
import { requireAuthUser } from '../../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Chave inválida.' })
  }
  const body = await readBody<{ currentPassword?: string }>(event)
  return await removeWebAuthnCredential(
    user.id,
    id,
    typeof body?.currentPassword === 'string' ? body.currentPassword : '',
  )
})
