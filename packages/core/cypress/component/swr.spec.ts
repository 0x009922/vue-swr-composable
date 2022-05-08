import { mount } from '@cypress/vue'
import { config } from '@vue/test-utils'
import { whenever } from '@vueuse/core'
import { computed, defineComponent, nextTick, PropType, reactive, Ref, ref } from 'vue'
import { useSwr, Resource, createAmnesiaStore, ResourceState } from '~lib'

const DisplayOpt = defineComponent({
  props: {
    value: Object,
  },
  template: `
    <code>
      <template v-if="!value">
        None
      </template>
      <template v-else>
        Some({{ value.some }})
      </template>
    </code>
  `,
})

const ResourceStateView = defineComponent({
  components: {
    DisplayOpt,
  },
  props: {
    state: {
      type: Object as PropType<ResourceState<any>>,
      required: true,
    },
  },
  template: `
    <div class="grid gap-2">
      <p>Data: <DisplayOpt :value="state.data" /> </p>
      <p>Err: <DisplayOpt :value="state.error" /> </p>
      <p>Pending: {{ state.pending }}</p>
      <p>Fresh: {{ state.fresh }}</p>
      <p>Owners: {{ state.owners }}</p>
    </div>
  `,
})

const ResourceView = defineComponent({
  components: {
    DisplayOpt,
    ResourceStateView,
  },
  props: {
    resource: Object as PropType<null | Resource<any>>,
  },
  template: `
    <div class="p-2 text-sm border rounded grid gap-2">
      <template v-if="!resource">
        No resource
      </template>

      <template v-else>
        <ResourceStateView :state="resource.state" />
        <p>Key: <code>{{ resource.key }}</code></p>
        <div class="space-x-2">
          <button @click="resource.markStale()">
            Mark stale
          </button>
          <button @click="resource.reset()">
            Reset
          </button>
        </div>
      </template>
    </div>
  `,
})

interface PromiseControl<T> {
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function useControlledPromise<T>(): {
  control: Ref<null | PromiseControl<T>>
  create: () => Promise<T>
} {
  const control = ref<null | PromiseControl<T>>(null)
  let promiseControlled: Promise<T> | null = null
  // let counter = 0

  return {
    control,
    create: () => {
      const promise = new Promise<T>((res, rej) => {
        control.value = {
          resolve: res,
          reject: rej,
        }
      }).finally(() => {
        if (promiseControlled === promise) {
          control.value = null
        }
      })

      promiseControlled = promise
      return promise
    },
  }
}

before(() => {
  config.global.components = { ResourceView, ResourceStateView }
})

describe('fetch abortation', () => {
  describe('happened...', () => {
    it('when res is mutated while pending')
    it('when composable is disposed')
    it('when second res owner appears')
    it('when res is reset')
  })

  it('happened and fetch result is not committed to the store')
  it('happened on key change, and *pending* flag of aborted resource is set to false')
})

describe('ownership', () => {
  it('when second owner appears, both of them are nulled')
  it('when first owner disappears, state of the rest one comes to initial')
  it(
    'when there are a lot of owners, and state is reset, ' +
      'then they are still inactive and owners counter is set properly',
  )

  // `refresh on capture` functionality may be moved to plugin
  // it('when state restores after ownership violation, initial fetch happens')
})

describe('etc', () => {
  it('when res is just initialized, it is pending immediately', () => {
    mount({
      setup() {
        const { resource } = useSwr({
          fetch: async () => undefined,
        })

        return {
          resource,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />
      `,
    })

    cy.contains('Pending: true')
  })

  it('when res is fetched, its data appears at state', () => {
    mount({
      setup() {
        const { control, create } = useControlledPromise<string>()
        const { resource } = useSwr({
          fetch: create,
        })

        return {
          resource,
          control,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />
        <button v-if="control" @click="control.resolve('foo')">Resolve</button>
      `,
    })

    cy.contains('Resolve').click()
    cy.contains('Pending: false')
    cy.contains('Data: Some(foo)')
  })

  it('when refresh is called, res is stale, but pending again', () => {
    mount({
      setup() {
        const { control, create } = useControlledPromise<string>()
        const { resource } = useSwr({
          fetch: create,
        })

        return {
          resource,
          control,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />
        <button v-if="control" @click="control.resolve('foo')">Resolve</button>
      `,
    })

    cy.contains('Pending: true')
    cy.contains('Resolve').click()
    cy.contains('Mark stale').click()
    cy.contains('Pending: true')
    cy.contains('Data: Some(foo)')
  })

  it('when refresh is done, res is updated', () => {
    mount({
      setup() {
        const { control, create } = useControlledPromise<string>()
        const { resource } = useSwr({
          fetch: create,
        })

        return {
          resource,
          control,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />
        <template v-if="control">
          <button @click="control.resolve('foo')">Resolve foo</button>
          <button @click="control.resolve('bar')">Resolve bar</button>
        </template>
      `,
    })

    cy.contains('Pending: true')
    cy.contains('Resolve foo').click()
    cy.contains('Data: Some(foo)')
    cy.contains('Mark stale').click()
    cy.contains('Resolve bar').click()
    cy.contains('Data: Some(bar)')
  })

  it('when fetch is errored, error appears', () => {
    mount({
      setup() {
        const { control, create } = useControlledPromise<string>()
        const { resource } = useSwr({
          fetch: create,
        })

        function reject() {
          control.value?.reject(new Error('foobar'))
        }

        return {
          resource,
          control,
          reject,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        <template v-if="control">
          <button @click="reject">Reject</button>
        </template>
      `,
    })

    cy.contains('Reject').click()
    cy.contains('Pending: false')
    cy.contains('Data: None')
    cy.contains('Err: Some(Error: foobar)')
  })

  it('when res is loaded, but refresh is failed, error appears and data is stale', () => {
    mount({
      setup() {
        const { control, create } = useControlledPromise<string>()
        const { resource } = useSwr({
          fetch: create,
        })

        return {
          resource,
          control,
          reject: () => {
            control.value?.reject(new Error('foobar'))
          },
          resolve: () => {
            control.value?.resolve('bar')
          },
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        <template v-if="control">
          <button @click="resolve">Resolve</button>
          <button @click="reject">Reject</button>
        </template>
      `,
    })

    cy.contains('Resolve').click()
    cy.contains('Mark stale').click()
    cy.contains('Reject').click()

    cy.contains('Data: Some(bar)')
    cy.contains('Err: Some')
  })

  it('when res is reset, it is immediately fetched again', () => {
    mount({
      setup() {
        const fetchFires = ref(0)
        const { resource } = useSwr({
          fetch: () =>
            new Promise(() => {
              fetchFires.value++
            }),
        })

        return { fetchFires, resource }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        Fires: {{ fetchFires }}
      `,
    })

    cy.contains('Fires: 1')
    cy.contains('Reset').click()
    cy.contains('Fires: 2')
  })

  // Seems unnecessary
  it('when refresh is called, `fresh` field became false')

  it('when key is updated, then new resource is initialized', () => {
    mount({
      setup() {
        const key = ref('foo')
        const { resource } = useSwr({
          fetch: computed(() => ({
            key: key.value,
            fn: () =>
              new Promise((r) => {
                r({ value: key.value })
              }),
          })),
        })

        return {
          key,
          resource,
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        <button @click="key = 'bar'">Set key to bar</button>
      `,
    })

    cy.contains('Key: foo')
    cy.contains('Data: Some({ "value": "foo" })')

    cy.contains('Set key to bar').click()

    cy.contains('Key: bar')
    cy.contains('Data: Some({ "value": "bar" })')
  })

  it(
    'when key is updated, but then returned to the initial one, then initial state is reused and' +
      'fetch is not re-evaluated',
    () => {
      mount({
        setup() {
          const key = ref('foo')
          const { control, create } = useControlledPromise<string>()
          const { resource } = useSwr({
            fetch: computed(() => ({
              key: key.value,
              fn: create,
            })),
          })

          const fired = ref(0)
          whenever(
            () => resource.value?.state.pending,
            () => {
              fired.value++
              control.value?.resolve(key.value)
            },
            { immediate: true },
          )

          return {
            fired,
            key,
            resource,
          }
        },
        template: `
            <ResourceView v-bind="{ resource }" />

            Fired: {{ fired }}
    
            <button @click="key = 'bar'">Set key to bar</button>
            <button @click="key = 'foo'">Set key to foo</button>
          `,
      })

      cy.contains('Data: Some(foo)')

      cy.contains('Set key to bar').click()
      cy.contains('Data: Some(bar)')

      cy.contains('Set key to foo').click()
      cy.contains('Data: Some(foo)')
      cy.contains('Fired: 2')
    },
  )

  it('when keyed fetch is recomputed to the same one, it is not refetched', () => {
    mount({
      setup() {
        const counter = ref(0)
        const { resource } = useSwr({
          fetch: computed(() => {
            const value = counter.value

            return {
              key: 'static',
              fn: async () => value,
            }
          }),
        })

        return { resource, counter }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        <button @click="counter++">inc {{ counter }}</button>
      `,
    })

    cy.contains('Data: Some(0)')
    cy.contains('inc 0')
      .click()
      .contains('inc 1')
      .then(async () => {
        await nextTick()
        await nextTick()
        await nextTick()
      })

    cy.contains('Data: Some(0)')

    cy.contains('Mark stale').click()
    cy.contains('Data: Some(1)')
  })

  it.only("when fetch is pending, store state resets and fetch resolves, then store isn't mutated, even pending state", () => {
    mount({
      setup() {
        const store = createAmnesiaStore<any>()
        const prom1 = useControlledPromise()
        const prom2 = useControlledPromise()
        const { resource } = useSwr({
          fetch: {
            key: 'static',
            fn: async () => {
              if (prom1.control.value) return prom2.create()
              return prom1.create()
            },
          },
          store,
        })

        return {
          resource,
          resolveFirst: () => {
            prom1.control.value?.resolve('one')
          },
          resetStore: () => {
            store.storage.clear()
          },
          secondPending: computed(() => !!prom2.control.value),
          // state: computed(() => store.get('static'))
        }
      },
      template: `
        <ResourceView v-bind="{ resource }" />

        <button @click="resetStore">Reset store</button>
        <button v-if="secondPending" @click="resolveFirst">Resolve first</button>
      `,
    })

    cy.contains('Pending: true')
    cy.contains('Reset store').click()
    cy.contains('Resolve first').click()
    cy.contains('Pending: true')
    cy.contains('Data: None')
  })

  it("when fetch is pending, store state resets and fetch rejects, then store's error isn't mutated")
})
