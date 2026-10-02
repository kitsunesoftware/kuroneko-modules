import { registerTurnstileLoginApi } from '../../../../server/utils/turnstile-bridge'
import {
  getTurnstileSiteKey,
  isTurnstileRequired,
  verifyTurnstileToken,
} from '../utils/turnstile'

export default defineNitroPlugin(() => {
  registerTurnstileLoginApi({
    isRequired: () => isTurnstileRequired(),
    getSiteKey: () => getTurnstileSiteKey(),
    verifyToken: (token, ip) => verifyTurnstileToken(token, ip),
  })
})