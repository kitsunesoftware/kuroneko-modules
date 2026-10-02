import { getTwoFactorStatus } from '../../../utils/two-factor'
import { requireAuthUser } from '../../../../../account/server/utils/require-auth-user'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  return await getTwoFactorStatus(user.id)
})
