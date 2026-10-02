import AccountTwoFactorSection from '../components/account/TwoFactorSection.vue'

export default defineNuxtPlugin(() => {
  contributeModule({
    id: 'auth.two-factor',
    parentId: 'auth.account',
    label: 'Autenticação de dois fatores',
    description: '2FA por app autenticador e chave de segurança.',
    icon: 'i-solar:shield-keyhole-bold-duotone',
    defaultEnabled: true,
    installable: true,
    order: 30,
  })

  contributeAccountSection({
    id: 'two-factor',
    moduleId: 'auth.two-factor',
    order: 30,
    component: AccountTwoFactorSection,
  })
})
