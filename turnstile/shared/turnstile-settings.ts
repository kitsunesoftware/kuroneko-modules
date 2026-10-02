export const TURNSTILE_MODULE_ID = 'auth.login.turnstile'

/** Chaves de teste da Cloudflare (widget visível, sempre passa). */
export const TURNSTILE_LOCAL_SITE_KEY = '1x00000000000000000000AA'
export const TURNSTILE_LOCAL_SECRET_KEY = '1x0000000000000000000000000000000AA'

export const turnstileSettingsDefaults = {
  localMode: false,
  siteKey: '',
  secretKey: '',
}

export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
