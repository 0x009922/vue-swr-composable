import { Ref, ShallowRef } from 'vue'
import { SetOptional } from 'type-fest'

/**
 * Data that may exist or may not.
 *
 * Nesting actual data inside of inner object allows to avoid "empty" type overlap with `T`
 */
export type Option<T> = null | {
  some: T
}

/**
 * Reactive resource SWR state
 */
export interface ResourceState<T> {
  /**
   * Last fetched data
   */
  data: Option<T>
  /**
   * Last fetch error
   */
  error: Option<unknown>
  /**
   * Is fetching currently pending or not
   */
  pending: boolean
  /**
   * Indicates whether resource is fresh or not
   */
  fresh: boolean

  /**
   * TODO doc
   */
  owners: number
}

export interface UseResourceReturn<T> {
  /**
   * Reactive resource. It may be null, if resource key is reactive and falsy, or if there
   * is a resource ownership violation (see {@link Resource} docs)
   */
  resource: ShallowRef<null | Resource<T>>
}

/**
 * Resource state, key and controls.
 *
 * ## Resource key
 *
 * Key is usually needed when you fetch something according to some reactive (or not) parameters. In
 * that case you should construct unique key relative to these parameters and return it with
 * a fetch function. It will create a separate resource in the same resource store, so you can
 * toggle between them without loosing their state.
 *
 * If you have a reactive keyed fetch, and it is re-computed to the same keyed fetch, then update of the fetch function
 * itself is ignored.
 *
 * ## Resource ownership rule
 *
 * You are not allowed to use multiple SWR composables that use the same key and **the same store**, because
 * such a case produces uncertainty - whose fetch function to use? So, only a single composable may own a resource at
 * a time.
 *
 * ## Mark data as stale
 *
 * When resource data is outdated, you might tarnish it. The resource data will be still old,
 * but the process of its refreshing will be started.
 *
 * This process may be aborted in several cases:
 *
 * - Resource is mutated while being pending
 * - Resource owners count became 0 or > 1
 *   - Resource key is changed
 *   - Composable is disposed
 *   - New resource owner is appeared
 * - Resource is reset
 */
export interface Resource<T> {
  state: ResourceState<T>
  key: ResourceKey
  /**
   * Mark **current** resource as not fresh
   */
  markStale: () => void
  /**
   * Reset **current** resource
   */
  reset: () => void
}

/**
 * Primitive key to distinguish parametrized resources between each other.
 */
export type ResourceKey = string | number | symbol

/**
 * Special resource key that is used when key is not specified explicitly
 */
export const ANONYMOUS_KEY = Symbol('Anonymous')

export interface ResourceStore<T> {
  get: (key: ResourceKey) => ResourceState<T> | null
  set: (key: ResourceKey, state: ResourceState<T> | null) => void
}

export type FetchFn<T> = (onAbort: FetchFnOnAbort) => Promise<T>

export type FetchFnOnAbort = (fn: () => void) => void

export interface UseResourceParams<T, S extends ResourceStore<T>> {
  /**
   * Static or reactive resource fetching configuration
   */
  fetch: ResourceFetchConfig<T>
  /**
   * Optional custom store. By default, amnesia store is used.
   */
  store?: S
  /**
   * FIXME maybe move to plugin?
   * @default false
   */
  refreshOnCapture?: boolean
  /**
   * Plugins list
   */
  use?: UseResourcePlugin<T, S>[]
}

/**
 * Setup function. Use {@link vue#onScopeDispose} for cleanup.
 */
export type UseResourcePlugin<T, S extends ResourceStore<T>> = (context: UseResourcePluginSetupContext<T, S>) => void

/**
 * TODO add more options like `onAbort()` etc?
 */
export interface UseResourcePluginSetupContext<T, S extends ResourceStore<T>> {
  resource: Resource<T>
  key: ResourceKey
  store: S
}

/**
 * Resource fetching configuration.
 *
 * It may be:
 *
 * - Just a fetch function that resolves to resource data.
 *   In that case it's key considered as {@link ANONYMOUS_KEY}.
 * - Static, but keyed async function.
 * - Reactive resource fetch function, keyed or anonymous.
 *   Also it may be a falsy value in case you need to reactively disable composable at all.
 */
export type ResourceFetchConfig<T> =
  | FetchFn<T>
  | MaybeKeyedFetchFn<T>
  | Ref<null | undefined | false | FetchFn<T> | MaybeKeyedFetchFn<T>>

export interface KeyedFetchFn<T> {
  key: ResourceKey
  fn: FetchFn<T>
}

/**
 * If `key` is omitted, it is considered as {@link ANONYMOUS_KEY}.
 */
export type MaybeKeyedFetchFn<T> = SetOptional<KeyedFetchFn<T>, 'key'>
