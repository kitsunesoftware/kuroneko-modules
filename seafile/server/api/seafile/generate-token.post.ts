import { requirePermission } from '../../../../../../auth/modules/roles/server/utils/require-permission'
import {
  getModuleSettings,
  patchModuleSettings,
} from '../../../../../../base/server/utils/module-settings'
import { SEAFILE_MODULE_ID } from '../../../shared/seafile-settings'
import { obtainSeafileAuthToken } from '../../utils/seafile'

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'panel.modules.settings')

  const body = await readBody<{
    username?: string
    password?: string
  }>(event)

  const stored = await getModuleSettings(SEAFILE_MODULE_ID)
  const server = asString(stored.server)
  const username = asString(body?.username)
  const password = asString(body?.password)

  if (!server) {
    throw createError({
      statusCode: 400,
      message: 'Configure a URL do Seafile antes de autenticar.',
    })
  }
  if (!username || !password) {
    throw createError({
      statusCode: 400,
      message: 'Informe e-mail e senha do Seafile.',
    })
  }

  const token = await obtainSeafileAuthToken(server, username, password)

  await patchModuleSettings(SEAFILE_MODULE_ID, {
    token,
  })

  return {
    ok: true,
    configured: true,
    tokenPreview: `${token.slice(0, 6)}…${token.slice(-4)}`,
  }
})
