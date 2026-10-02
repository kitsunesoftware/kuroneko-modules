import { disableTotp } from '../../../../utils/two-factor'
import { requireAuthUser } from '../../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody<{ code?: string, currentPassword?: string }>(event)
  return await disableTotp(
    user.id,
    typeof body?.currentPassword === 'string' ? body.currentPassword : '',
    typeof body?.code === 'string' ? body.code : '',
  )
})
