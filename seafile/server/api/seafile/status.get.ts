import {
  getSeafileConnection,
  isSeafileReady,
} from '../../utils/seafile'

/**
 * Status público da conexão (sem expor o token).
 * Útil para outros módulos checarem se o Seafile está pronto.
 */
export default defineEventHandler(async () => {
  const conn = await getSeafileConnection()
  return {
    configured: isSeafileReady(conn),
    server: conn.server || null,
    repoId: conn.repoId || null,
    defaultPath: conn.defaultPath || '/',
  }
})
