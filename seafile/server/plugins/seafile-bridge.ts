import { registerSeafileApi } from '../../../../../base/server/utils/seafile-bridge'
import {
  getSeafileConnection,
  isSeafileReady,
  normalizeSeafileDir,
  seafileAuthHeaders,
  seafileDeleteFile,
  seafileGetDownloadUrl,
  seafileUploadFile,
} from '../utils/seafile'

export default defineNitroPlugin(() => {
  registerSeafileApi({
    getSeafileConnection,
    isSeafileReady,
    normalizeSeafileDir,
    seafileAuthHeaders,
    seafileDeleteFile,
    seafileGetDownloadUrl,
    seafileUploadFile,
  })
})
