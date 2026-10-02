/**
 * Cliente Seafile compartilhado.
 * Outros módulos importam daqui para upload/delete/download usando a conexão
 * configurada em panel.seafile.
 */
import {
  getModuleSettings,
  patchModuleSettings,
} from '../../../../../base/server/utils/module-settings'
import {
  SEAFILE_MODULE_ID,
  seafileSettingsDefaults,
} from '../../shared/seafile-settings'

export type SeafileConnection = {
  server: string
  repoId: string
  token: string
  defaultPath: string
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

/** Remove prefixos/aspas que o usuário costuma colar no campo de token. */
export function normalizeSeafileToken(raw: string) {
  let token = raw.trim().replace(/^["']|["']$/g, '')
  token = token.replace(/^(Token|Bearer)\s+/i, '').trim()
  return token
}

export function normalizeSeafileDir(pathValue: string) {
  let path = pathValue.trim().replace(/\\/g, '/')
  if (!path.startsWith('/')) path = `/${path}`
  path = path.replace(/\/+$/, '') || '/'
  return path
}

export function seafileAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Token ${normalizeSeafileToken(token)}`,
    Accept: 'application/json',
  }
}

export function isSeafileReady(conn: Pick<SeafileConnection, 'server' | 'repoId' | 'token'> | null | undefined) {
  return Boolean(conn?.server && conn?.repoId && conn?.token)
}

/**
 * Migra connection settings legadas de auth.account (uma vez).
 * Mantém compatibilidade com instalações anteriores ao módulo panel.seafile.
 */
async function migrateLegacyAccountSeafileSettings(): Promise<Partial<SeafileConnection> | null> {
  try {
    const account = await getModuleSettings('auth.account')
    const server = asString(account.imageSeafileServer).replace(/\/+$/, '')
    const repoId = asString(account.imageSeafileRepoId)
    const token = normalizeSeafileToken(asString(account.imageSeafileToken))
    if (!server && !repoId && !token) return null

    await patchModuleSettings(SEAFILE_MODULE_ID, {
      server,
      repoId,
      token,
      defaultPath: asString(account.imageSeafilePath, seafileSettingsDefaults.defaultPath) || '/',
    })

    // Limpa connection do account; path de avatar permanece lá.
    await patchModuleSettings('auth.account', {
      imageSeafileServer: '',
      imageSeafileRepoId: '',
      imageSeafileToken: '',
      imageSeafilePassword: '',
      imageSeafileUsername: '',
      imageSeafileAuthMode: '',
    })

    return {
      server,
      repoId,
      token,
      defaultPath: asString(account.imageSeafilePath, '/') || '/',
    }
  }
  catch {
    return null
  }
}

/** Lê a conexão Seafile do módulo panel.seafile (com migração legada). */
export async function getSeafileConnection(): Promise<SeafileConnection> {
  const stored = await getModuleSettings(SEAFILE_MODULE_ID)
  let server = asString(stored.server, seafileSettingsDefaults.server).replace(/\/+$/, '')
  let repoId = asString(stored.repoId, seafileSettingsDefaults.repoId)
  let token = normalizeSeafileToken(asString(stored.token, seafileSettingsDefaults.token))
  let defaultPath = asString(stored.defaultPath, seafileSettingsDefaults.defaultPath) || '/'

  if (!server && !repoId && !token) {
    const migrated = await migrateLegacyAccountSeafileSettings()
    if (migrated) {
      server = migrated.server ?? ''
      repoId = migrated.repoId ?? ''
      token = migrated.token ?? ''
      defaultPath = migrated.defaultPath ?? '/'
    }
  }

  return { server, repoId, token, defaultPath }
}

/** Exige conexão pronta; lança 400 se faltar configuração. */
export async function requireSeafileConnection(): Promise<SeafileConnection> {
  const conn = await getSeafileConnection()
  if (!isSeafileReady(conn)) {
    throw createError({
      statusCode: 400,
      message: 'Configure o módulo Seafile do painel (URL, biblioteca e autenticação).',
    })
  }
  return conn
}

function resolveToken(conn: SeafileConnection) {
  const token = normalizeSeafileToken(conn.token)
  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Autentique no Seafile nas settings do módulo (botão Autenticar).',
    })
  }
  return token
}

/** Troca usuário/senha por Auth Token da conta no Seafile. */
export async function obtainSeafileAuthToken(
  server: string,
  username: string,
  password: string,
) {
  const base = server.replace(/\/+$/, '')
  if (!base || !username || !password) {
    throw createError({
      statusCode: 400,
      message: 'Informe URL, usuário e senha do Seafile.',
    })
  }

  const response = await seafileFetch(`${base}/api2/auth-token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ username, password }),
  }, 'Autenticação Seafile')

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const needsOtp = /two factor|otp|2fa/i.test(detail)
    throw createError({
      statusCode: 502,
      message: needsOtp
        ? 'Seafile exige 2FA. Inclua o código OTP e tente novamente, ou desative 2FA para esta conta de serviço.'
        : `Falha ao autenticar no Seafile (${response.status}). Verifique usuário/senha e a URL. ${detail}`.trim(),
    })
  }

  const data = await response.json() as { token?: string }
  if (!data.token) {
    throw createError({ statusCode: 502, message: 'Seafile não retornou token.' })
  }
  return normalizeSeafileToken(data.token)
}

/** Valida o Auth Token via /api2/account/info/. */
export async function seafileValidateToken(conn: SeafileConnection) {
  const token = resolveToken(conn)
  const authHeaders = seafileAuthHeaders(token)
  const accountRes = await seafileFetch(
    `${conn.server}/api2/account/info/`,
    { headers: authHeaders },
    'Validação Seafile',
  )
  if (!accountRes.ok) {
    const detail = await accountRes.text().catch(() => '')
    throw createError({
      statusCode: 502,
      message: accountRes.status === 401 || /invalid token/i.test(detail)
        ? 'Seafile rejeitou o token (401). Use Auth Token de POST /api2/auth-token/ (usuário+senha). Token de biblioteca/link de compartilhamento não funciona.'
        : `Falha ao validar conta no Seafile (${accountRes.status}). ${detail}`.trim(),
    })
  }
  return authHeaders
}

/** Cria cada segmento do caminho se ainda não existir. */
export async function seafileEnsureDir(
  conn: Pick<SeafileConnection, 'server' | 'repoId'>,
  dirPath: string,
  authHeaders: HeadersInit,
) {
  const normalized = normalizeSeafileDir(dirPath)
  if (normalized === '/') return

  const segments = normalized.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`

    const check = await seafileFetch(
      `${conn.server}/api2/repos/${encodeURIComponent(conn.repoId)}/dir/?p=${encodeURIComponent(current)}`,
      { headers: authHeaders },
      'Listar pasta Seafile',
    )
    if (check.ok) continue

    const res = await seafileFetch(
      `${conn.server}/api2/repos/${encodeURIComponent(conn.repoId)}/dir/?p=${encodeURIComponent(current)}`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ operation: 'mkdir' }),
      },
      'Criar pasta Seafile',
    )

    if (res.ok || res.status === 201) continue

    const detail = await res.text().catch(() => '')
    if (/already exists|exist|duplicat/i.test(detail)) continue

    throw createError({
      statusCode: 502,
      message: `Não foi possível criar a pasta ${current} no Seafile (${res.status}). ${detail}`.trim(),
    })
  }
}

/**
 * O Seafile costuma devolver upload-link no FILE_SERVER_ROOT interno (ex.: MinIO),
 * que pode não resolver DNS fora da rede. Reescreve origem para a URL pública
 * configurada no módulo, mantendo path/query do seafhttp.
 */
export function rewriteSeafileFileUrl(fileUrl: string, publicServer: string) {
  const raw = fileUrl.replace(/^"|"$/g, '').trim()
  if (!raw || !publicServer) return raw
  try {
    const link = new URL(raw)
    const server = new URL(publicServer.includes('://') ? publicServer : `https://${publicServer}`)
    if (link.host === server.host && link.protocol === server.protocol) return link.toString()
    link.protocol = server.protocol
    link.host = server.host
    return link.toString()
  }
  catch {
    return raw
  }
}

function describeFetchFailure(error: unknown, label: string) {
  const err = error as { message?: string, cause?: { code?: string, message?: string, hostname?: string } }
  const cause = err?.cause
  const code = cause?.code || ''
  const hostname = cause?.hostname || ''
  if (code === 'ENOTFOUND' || /ENOTFOUND/i.test(String(cause?.message || err?.message || ''))) {
    return `${label}: host inacessível${hostname ? ` (${hostname})` : ''}. O Seafile devolveu um file server interno; use a URL pública do Seafile no módulo.`
  }
  return `${label}: ${cause?.message || err?.message || 'falha de rede'}`
}

async function seafileFetch(url: string, init?: RequestInit, label = 'Seafile') {
  try {
    return await fetch(url, init)
  }
  catch (error: unknown) {
    throw createError({
      statusCode: 502,
      message: describeFetchFailure(error, label),
    })
  }
}

async function getSeafileUploadLink(
  conn: Pick<SeafileConnection, 'server' | 'repoId'>,
  parentDir: string,
  authHeaders: HeadersInit,
) {
  const linkRes = await seafileFetch(
    `${conn.server}/api2/repos/${encodeURIComponent(conn.repoId)}/upload-link/?p=${encodeURIComponent(parentDir)}`,
    { headers: authHeaders },
    'upload-link',
  )

  if (!linkRes.ok) {
    const detail = await linkRes.text().catch(() => '')
    const invalidToken = linkRes.status === 401 || /invalid token/i.test(detail)
    throw createError({
      statusCode: 502,
      message: invalidToken
        ? 'Seafile rejeitou o token no upload-link (401). Confirme URL, biblioteca e Auth Token.'
        : `Não foi possível obter o link de upload do Seafile (${linkRes.status}). ${detail}`.trim(),
      data: { status: linkRes.status, detail },
    })
  }

  const uploadLink = (await linkRes.text()).replace(/^"|"$/g, '').trim()
  if (!uploadLink) {
    throw createError({ statusCode: 502, message: 'Link de upload Seafile vazio.' })
  }
  // FILE_SERVER_ROOT interno (MinIO etc.) → host público do módulo.
  return rewriteSeafileFileUrl(uploadLink, conn.server)
}

export type SeafileUploadOptions = {
  /** Pasta destino dentro da library (ex.: /avatars). */
  parentDir: string
  filename: string
  buffer: Buffer
  contentType?: string
  /** Se true, valida o token via account/info antes do upload. Default: true. */
  validateToken?: boolean
}

/**
 * Faz upload de um arquivo para a library configurada.
 * Retorna URL de download (preferencial) ou URL estável da library.
 */
export async function seafileUploadFile(
  conn: SeafileConnection,
  options: SeafileUploadOptions,
) {
  if (!conn.server || !conn.repoId) {
    throw createError({
      statusCode: 400,
      message: 'Configure URL e ID da biblioteca Seafile nas settings do módulo.',
    })
  }

  const authHeaders = options.validateToken === false
    ? seafileAuthHeaders(resolveToken(conn))
    : await seafileValidateToken(conn)

  const parentDir = normalizeSeafileDir(options.parentDir)
  const filename = options.filename.replace(/[/\\]/g, '')
  if (!filename || filename.includes('..')) {
    throw createError({ statusCode: 400, message: 'Nome de arquivo inválido.' })
  }

  await seafileEnsureDir(conn, parentDir, authHeaders)

  let uploadLink: string
  try {
    uploadLink = await getSeafileUploadLink(conn, parentDir, authHeaders)
  }
  catch (error: unknown) {
    const detail = error && typeof error === 'object' && 'data' in error
      ? String((error as { data?: { detail?: string } }).data?.detail ?? '')
      : ''
    if (/Folder .+ not found/i.test(detail)) {
      await seafileEnsureDir(conn, parentDir, authHeaders)
      uploadLink = await getSeafileUploadLink(conn, parentDir, authHeaders)
    }
    else {
      throw error
    }
  }

  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(options.buffer)], {
      type: options.contentType || 'application/octet-stream',
    }),
    filename,
  )
  form.append('parent_dir', parentDir.endsWith('/') ? parentDir : `${parentDir}/`)
  form.append('replace', '1')

  const uploadRes = await seafileFetch(uploadLink, {
    method: 'POST',
    body: form,
  }, 'Upload Seafile')

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => '')
    throw createError({
      statusCode: 502,
      message: `Falha no upload para o Seafile (${uploadRes.status}). ${detail}`.trim(),
    })
  }

  const filePath = `${parentDir === '/' ? '' : parentDir}/${filename}`.replace(/\/+/g, '/')
  return seafileGetDownloadUrl(conn, filePath, authHeaders)
}

/** Obtém URL de download (reuse=1) ou fallback estável. */
export async function seafileGetDownloadUrl(
  conn: Pick<SeafileConnection, 'server' | 'repoId'>,
  filePath: string,
  authHeaders: HeadersInit,
) {
  const downloadRes = await seafileFetch(
    `${conn.server}/api2/repos/${encodeURIComponent(conn.repoId)}/file/?p=${encodeURIComponent(filePath)}&reuse=1`,
    { headers: authHeaders },
    'Download link Seafile',
  )

  if (downloadRes.ok) {
    const url = (await downloadRes.text()).replace(/^"|"$/g, '').trim()
    if (url) return rewriteSeafileFileUrl(url, conn.server)
  }

  return `${conn.server}/lib/${conn.repoId}/file${filePath}`
}

/** Remove um arquivo; 404 é ignorado. */
export async function seafileDeleteFile(
  conn: Pick<SeafileConnection, 'server' | 'repoId' | 'token'>,
  filePath: string,
) {
  const authHeaders = seafileAuthHeaders(resolveToken(conn as SeafileConnection))
  const res = await seafileFetch(
    `${conn.server}/api2/repos/${encodeURIComponent(conn.repoId)}/file/?p=${encodeURIComponent(filePath)}`,
    {
      method: 'DELETE',
      headers: authHeaders,
    },
    'Excluir arquivo Seafile',
  )
  if (res.ok || res.status === 404) return
  await res.text().catch(() => '')
}
