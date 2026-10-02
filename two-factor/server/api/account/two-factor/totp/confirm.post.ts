import { confirmTotpSetup } from '../../../../utils/two-factor'
import { requireAuthUser } from '../../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody<{ code?: string, currentPassword?: string }>(event)
  return await confirmTotpSetup(
    user.id,
    typeof body?.code === 'string' ? body.code : '',
    typeof body?.currentPassword === 'string' ? body.currentPassword : '',
  )
})
