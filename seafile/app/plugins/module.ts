export { SEAFILE_MODULE_ID, seafileSettingsDefaults } from '../../shared/seafile-settings'
import { SEAFILE_MODULE_ID, seafileSettingsDefaults } from '../../shared/seafile-settings'

export default defineNuxtPlugin(() => {
  contributeModule({
    id: SEAFILE_MODULE_ID,
    parentId: 'panel',
    label: 'Seafile',
    description: 'Armazenamento de arquivos via Seafile, disponível para outros módulos.',
    icon: 'i-solar:cloud-storage-bold-duotone',
    sidebarGroupId: 'panel',
    defaultEnabled: true,
    installable: true,
    order: 40,
  })

  contributeModuleSettings({
    moduleId: SEAFILE_MODULE_ID,
    groups: [
      {
        id: 'connection',
        label: 'Conexão',
        description: 'Servidor e biblioteca usados por módulos que precisam armazenar arquivos (avatares, anexos, etc.).',
        fields: [
          {
            key: 'server',
            type: 'text',
            label: 'URL do Seafile',
            description: 'Ex.: https://seafile.exemplo.com (sem barra no final). Uploads usam este host público mesmo se o Seafile devolver um file server interno.',
            default: seafileSettingsDefaults.server,
            placeholder: 'https://seafile.exemplo.com',
          },
          {
            key: 'repoId',
            type: 'text',
            label: 'ID da biblioteca',
            description: 'UUID da library/repositório no Seafile.',
            default: seafileSettingsDefaults.repoId,
            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          },
          {
            key: 'defaultPath',
            type: 'text',
            label: 'Pasta padrão',
            description: 'Diretório base na library. Cada módulo pode usar um subcaminho próprio.',
            default: seafileSettingsDefaults.defaultPath,
            placeholder: '/',
          },
          {
            key: 'auth',
            type: 'action',
            label: 'Acesso Seafile',
            description: 'Conecta com a conta Seafile e salva o Auth Token (não use o API Token da biblioteca).',
            default: '',
            endpoint: '/api/seafile/generate-token',
            buttonLabel: 'Autenticar',
            buttonLabelConfigured: 'Regenerar acesso',
            statusKey: 'token',
            statusConfiguredLabel: 'Conectado',
            statusEmptyLabel: 'Não conectado',
            modal: {
              title: 'Autenticar no Seafile',
              titleConfigured: 'Regenerar acesso Seafile',
              description: 'Informe e-mail e senha da conta Seafile. O Kuroneko gera o Auth Token e salva — a senha não fica armazenada.',
              fields: [
                {
                  name: 'username',
                  label: 'E-mail',
                  placeholder: 'usuario@exemplo.com',
                },
                {
                  name: 'password',
                  label: 'Senha',
                  secret: true,
                  placeholder: '••••••••',
                },
              ],
              submitLabel: 'Gerar acesso',
              submitLabelConfigured: 'Regenerar acesso',
            },
          },
        ],
      },
    ],
  })
})
