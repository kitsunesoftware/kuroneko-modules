import {
  getTurnstileSiteKey,
  isTurnstileLocalMode,
  isTurnstileRequired,
} from '../../../utils/turnstile'

/** Expõe se o widget deve aparecer e a site key pública. */
export default defineEventHandler(async () => {
  const required = await isTurnstileRequired()
  if (!required) {
    return {
      required: false,
      localMode: false,
      siteKey: null as string | null,
    }
  }

  const [siteKey, localMode] = await Promise.all([
    getTurnstileSiteKey(),
    isTurnstileLocalMode(),
  ])

  return {
    required: Boolean(siteKey),
    localMode,
    siteKey,
  }
})
