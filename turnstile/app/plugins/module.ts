export { TURNSTILE_MODULE_ID, turnstileSettingsDefaults } from '../../shared/turnstile-settings'
import LoginTurnstileWidget from '../components/auth/LoginTurnstileWidget.vue'
import { TURNSTILE_MODULE_ID, turnstileSettingsDefaults } from '../../shared/turnstile-settings'

export default defineNuxtPlugin(() => {
  contributeModule({
    id: TURNSTILE_MODULE_ID,
    parentId: 'auth.login',
    label: 'Cloudflare Turnstile',
    description: 'Proteção anti-bot no login com Cloudflare Turnstile.',
    icon: 'i-solar:shield-keyhole-bold-duotone',
    defaultEnabled: true,
    installable: true,
    order: 20,
  })

  contributeModuleSettings({
    moduleId: TURNSTILE_MODULE_ID,
    groups: [
      {
        id: 'mode',
        label: 'Modo',
        fields: [
          {
            key: 'localMode',
            type: 'boolean',
            label: 'Modo local (teste)',
            description:
              'Usa as chaves de teste da Cloudflare (sempre passa). Ideal para desenvolvimento — não use em produção.',
            default: turnstileSettingsDefaults.localMode,
          },
        ],
      },
      {
        id: 'keys',
        label: 'Chaves Cloudflare',
        description: 'Obtenha as chaves em Cloudflare Dashboard → Turnstile. Ignoradas no modo local.',
        fields: [
          {
            key: 'siteKey',
            type: 'text',
            label: 'Site Key',
            description: 'Chave pública usada no widget do login.',
            default: turnstileSettingsDefaults.siteKey,
            placeholder: '0x4AAAA...',
            enabledWhen: {
              key: 'localMode',
              equals: false,
            },
          },
          {
            key: 'secretKey',
            type: 'text',
            label: 'Secret Key',
            description: 'Chave secreta para validação no servidor. Nunca compartilhe.',
            default: turnstileSettingsDefaults.secretKey,
            secret: true,
            placeholder: '0x4AAAA...',
            enabledWhen: {
              key: 'localMode',
              equals: false,
            },
          },
        ],
      },
    ],
  })

  contributeLoginSlot({
    id: 'turnstile',
    moduleId: TURNSTILE_MODULE_ID,
    order: 10,
    component: LoginTurnstileWidget,
  })
})
