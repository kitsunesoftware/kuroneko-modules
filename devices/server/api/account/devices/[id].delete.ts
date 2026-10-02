import { requireAuthUser } from '../../../../../account/server/utils/require-auth-user'
import {
  resolveAuthSession,
  revokeSessionById,
} from '../../../../../../server/utils/sessions'

export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Sessão inválida.' })
  }

  const header = getHeader(event, 'authorization')
  const bearer = header?.startsWith('Bearer ')
    ? header.slice(7)
    : undefined
  const config = useRuntimeConfig()
  const cookieName = String(config.public?.auth?.cookieName || 'kuroneko_auth')
  const cookieToken = getCookie(event, cookieName) || undefined
  const current = await resolveAuthSession(bearer || cookieToken)

  await revokeSessionById(user.id, id)

  return {
    ok: true,
    revokedCurrent: Boolean(current && current.sessionId === id),
  }
})
