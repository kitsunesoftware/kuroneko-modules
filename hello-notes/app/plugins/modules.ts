export default defineNuxtPlugin(() => {
  contributeModule({
    id: 'demo.hello.notes',
    parentId: 'demo.hello',
    label: 'Hello Notes',
    description: 'Submódulo de exemplo com anotações.',
    icon: 'i-solar:notes-bold-duotone',
    routes: ['/hello/notes'],
    defaultEnabled: false,
    order: 10,
  })
})
