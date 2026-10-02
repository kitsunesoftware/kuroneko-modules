import { registerTwoFactorLoginApi } from '../../../../server/utils/two-factor-bridge'
import {
  completeLoginWithTotp,
  completeLoginWithWebAuthn,
  createLoginChallenge,
  userHasTwoFactor,
} from '../utils/two-factor'

export default defineNitroPlugin(() => {
  registerTwoFactorLoginApi({
    userHasTwoFactor,
    createLoginChallenge,
    completeLoginWithTotp,
    completeLoginWithWebAuthn,
  })
})
