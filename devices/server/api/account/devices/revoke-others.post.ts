import { requireAuthUser } from '../../../../../account/server/utils/require-auth-user'
import {
  resolveAuthSession,
  revokeOtherSessions,
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

  if (!current?.sessionId) {
    throw createError({ statusCode: 401, message: 'Sessão inválida.' })
  }

  return await revokeOtherSessions(user.id, current.sessionId)
})
