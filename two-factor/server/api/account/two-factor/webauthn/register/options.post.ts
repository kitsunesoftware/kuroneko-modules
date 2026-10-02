import { beginWebAuthnRegistration } from '../../../../../utils/two-factor'
import { requireAuthUser } from '../../../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody<{ currentPassword?: string }>(event)
  return await beginWebAuthnRegistration(
    event,
    user.id,
    typeof body?.currentPassword === 'string' ? body.currentPassword : '',
  )
})
