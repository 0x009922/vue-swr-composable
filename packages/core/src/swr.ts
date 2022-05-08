import {
  computed,
  watch,
  onUnmounted,
  markRaw,
  onScopeDispose,
  Ref,
  unref,
  ComputedRef,
  ref,
  shallowRef,
  reactive,
  readonly,
  getCurrentScope,
  EffectScope,
  effectScope,
  watchEffect,
} from 'vue'
import { computedEager, whenever } from '@vueuse/core'
import {
  ResourceState,
  ResourceStore,
  UseResourceParams,
  UseResourceReturn,
  ResourceKey,
  KeyedFetchFn,
  FetchFn,
  ResourceFetchConfig,
  ANONYMOUS_KEY,
  Option,
  Resource,
  FetchFnOnAbort,
} from './types'
import { AmnesiaStore, createAmnesiaStore } from './amnesia-store'
// import { normalizeResourceFetch, createLogger, Logger } from './tools'
// import { setupErrorRetry } from './error-retry'
import { Except, Opaque } from 'type-fest'

// const RESOURCE_STATE_EMPTY: ResourceState<any> = Object.freeze({
//   data: null,
//   error: null,
//   isPending: false,
// })

const FETCH_TASK_ABORTED = Symbol('Aborted')

export function useSwr<T, S extends ResourceStore<T> = AmnesiaStore<T>>(
  params: UseResourceParams<T, S>,
): UseResourceReturn<T> {
  const fetch = normalizeFetch(params.fetch)
  const keyReactive = computed<null | ResourceKey>(() => fetch.value?.key ?? null)
  const resource = shallowRef<null | Resource<T>>(null)

  const store = params.store ?? createAmnesiaStore()

  useKeyedScope(keyReactive, (keyStatic) => {
    console.log('keyed scope:', keyStatic)
    const state = computed(() => store.get(keyStatic))
    // const stateIsEmpty = computed(() => !state.value)

    // Ownership

    const { confirmed: ownershipConfirmed } = useResourceOwnership(state)

    // State management

    function reset() {
      console.log('RESET')
      store.set(keyStatic, {
        data: null,
        error: null,
        fresh: false,
        pending: false,
        owners: 0,
      })
    }

    function markStale() {
      if (state.value) {
        state.value.fresh = false
      }
    }

    watchEffect(() => {
      console.log('STATE', { ...state.value }, state.value)
    })

    whenever(
      () => !state.value,
      () =>
        // if there are multiple owners of the resource, it may cause duplicated resets from all of them
        // promise is required here because of some strange vue behavior
        Promise.resolve().then(reset),
      { immediate: true },
    )

    // Resource fetch triggering scope when ownership is confirmed

    useConditionalScope(ownershipConfirmed, () => {
      console.log('owned')

      const currentFetchTask = ref<null | { promise: Promise<void>; abort: () => void }>(null)

      function abortFetchTaskIfThereIsSome() {
        currentFetchTask.value?.abort()
        currentFetchTask.value = null
      }

      const triggerExecuteFetch = computed<boolean>(() => !!state.value && !state.value.pending && !state.value.fresh)
      watch(
        [triggerExecuteFetch, state],
        ([trigger]) => {
          if (trigger) {
            // maybe state changed
            abortFetchTaskIfThereIsSome()

            const { abort, onAbort } = initFetchAbort()
            const promise = executeFetch({
              fetch: fetch.value!,
              state: state.value!,
              onAbort,
              // eslint-disable-next-line max-nested-callbacks
            }).finally(() => {
              if (promise === currentFetchTask.value?.promise) {
                currentFetchTask.value = null
                console.log('fetch finalized, promise is still there, nulled')
              }
            })

            currentFetchTask.value = { promise, abort }
          }
        },
        { immediate: true },
      )

      resource.value = readonly<Except<Resource<T>, 'state'> & { state: Ref<ResourceState<T>> }>({
        state: state as Ref<ResourceState<T>>,
        key: keyStatic,
        markStale,
        reset,
      }) as Resource<T>

      onScopeDispose(() => {
        abortFetchTaskIfThereIsSome()
        resource.value = null
      })
    })
  })

  return { resource }
}

/**
 * Normalizes variative configuration to keyed fetch
 */
function normalizeFetch<T>(fetch: ResourceFetchConfig<T>): Ref<null | KeyedFetchFn<T>> {
  return computed(() => {
    const value = unref(fetch)

    if (!value) return null
    if (typeof value === 'function')
      return {
        key: ANONYMOUS_KEY,
        fn: value,
      }
    return {
      key: ANONYMOUS_KEY,
      ...value,
    }
  })
}

function useKeyedScope(key: Ref<null | ResourceKey>, setup: (key: ResourceKey) => void) {
  const main = getCurrentScope() || effectScope()
  let scope: null | EffectScope = null

  watch(
    key,
    (key) => {
      if (scope) {
        scope.stop()
        scope = null
      }
      if (key) {
        main.run(() => {
          scope = effectScope()
          scope.run(() => setup(key))
        })
      }
    },
    { immediate: true },
  )
}

function useConditionalScope(condition: Ref<boolean>, setup: () => void) {
  const main = getCurrentScope() || effectScope()
  let scope: null | EffectScope = null

  watch(
    condition,
    (value) => {
      if (value) {
        main.run(() => {
          scope = effectScope()
          scope.run(setup)
        })
      } else {
        scope?.stop()
        scope = null
      }
    },
    { immediate: true },
  )
}

function useResourceOwnership(state: Ref<null | ResourceState<unknown>>): {
  /**
   * Sign that ownership is committed and not violated
   */
  confirmed: Ref<boolean>
} {
  const committed = ref(false)
  const confirmed = computed(() => !!state.value && state.value.owners === 1 && committed.value)

  watch(
    state,
    (state) => {
      if (state) {
        state.owners++
        committed.value = true
      } else {
        committed.value = false
      }

      console.log('ownership status:', committed.value, state?.owners)
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    if (committed.value && state.value) {
      state.value.owners--
    }
  })

  return { confirmed }
}

interface ExecuteFetchParams<T> {
  fetch: KeyedFetchFn<T>
  state: ResourceState<T>
  onAbort: FetchFnOnAbort
}

/**
 * Run fetch and update state accordingly to progress. May be aborted.
 */
async function executeFetch<T>({ fetch, state, onAbort }: ExecuteFetchParams<T>): Promise<void> {
  // // is it needed?
  // await Promise.resolve()

  state.pending = true
  let result: typeof FETCH_TASK_ABORTED | T

  try {
    result = await new Promise((resolve, reject) => {
      onAbort(() => {
        resolve(FETCH_TASK_ABORTED)
      })

      fetch.fn(onAbort).then(resolve).catch(reject)
    })

    if (result === FETCH_TASK_ABORTED) return

    state.data = someMarkRaw(result)
    state.fresh = true
    state.error = null
    state.pending = false
  } catch (err) {
    state.error = someMarkRaw(err)
    state.fresh = true
    state.pending = false
  }
}

interface FetchAbort {
  onAbort: FetchFnOnAbort
  abort: () => void
}

function initFetchAbort(): FetchAbort {
  const hooks: (() => void)[] = []

  return {
    onAbort: (fn) => hooks.push(fn),
    abort: () => {
      for (const fn of hooks) {
        try {
          fn()
        } catch (err) {
          console.error('Fetch abortation hook error:', err)
        }
      }
    },
  }
}

function someMarkRaw<T>(some: T): Option<T> {
  return markRaw({ some })
}
