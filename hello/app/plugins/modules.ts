export default defineNuxtPlugin(() => {
  contributeModule({
    id: 'demo.hello',
    label: 'Hello Demo',
    description: 'Módulo de exemplo baixado pela loja.',
    icon: 'i-solar:hand-shake-bold-duotone',
    routes: ['/hello'],
    defaultEnabled: false,
    order: 60,
  })
})
