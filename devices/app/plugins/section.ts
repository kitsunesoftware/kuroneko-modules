import AccountDevicesSection from '../components/account/DevicesSection.vue'

export default defineNuxtPlugin(() => {
  contributeModule({
    id: 'auth.devices',
    parentId: 'auth.account',
    label: 'Dispositivos conectados',
    description: 'Sessões ativas e encerramento remoto.',
    icon: 'i-solar:devices-bold-duotone',
    defaultEnabled: true,
    installable: true,
    order: 40,
  })

  contributeAccountSection({
    id: 'devices',
    moduleId: 'auth.devices',
    order: 40,
    component: AccountDevicesSection,
  })
})
