import { requireAuthUser } from '../../../../../account/server/utils/require-auth-user'
import {
  listUserDevices,
  resolveAuthSession,
} from '../../../../../../server/utils/sessions'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)

  const header = getHeader(event, 'authorization')
  const bearer = header?.startsWith('Bearer ')
    ? header.slice(7)
    : undefined
  const config = useRuntimeConfig()
  const cookieName = String(config.public?.auth?.cookieName || 'kuroneko_auth')
  const cookieToken = getCookie(event, cookieName) || undefined
  const current = await resolveAuthSession(bearer || cookieToken)

  const devices = await listUserDevices(user.id, current?.sessionId)
  return { devices }
})
