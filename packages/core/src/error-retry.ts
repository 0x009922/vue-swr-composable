import { computed, watch, onUnmounted, isVue3, onScopeDispose } from 'vue-demi'
import { UseResourceReturn } from './types'

export interface ErrorRetryParams {
    count: number
    interval: number
}

export function setupErrorRetry<T>(
    { state, mutate }: Pick<UseResourceReturn<T>, 'state' | 'mutate'>,
    params: ErrorRetryParams,
): void {
    const retryCount = params.count
    const retryInterval = params.interval

    const isActive = computed<boolean>(() => !!state.value?.error)

    let interval: ReturnType<typeof setInterval>
    let passedRetries = 0
    function reset() {
        passedRetries = 0
        if (retryCount > 0 && isActive.value) {
            interval = setInterval(() => {
                passedRetries++
                mutate()
                if (passedRetries >= retryCount) {
                    cancel()
                }
            }, retryInterval)
        }
    }
    function cancel() {
        clearInterval(interval)
    }

    watch(isActive, (val) => (val ? reset() : cancel()), { immediate: true })
    isVue3 ? onScopeDispose(cancel) : onUnmounted(cancel)
}
