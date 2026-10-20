// @ts-check
/**
 * ESLint Rule: no-context-after-await
 *
 * Flags a composable that needs the Nuxt or Vue context, called after an `await` in the same
 * function of a `.ts`/`.js` module (a composable, a util, a store).
 *
 * Nuxt and Vue find the current app and component through a synchronous context. An `await`
 * ends it on the server, where the context is per request: the code after it runs in a later
 * tick, where `useNuxtApp()` throws "[nuxt] instance unavailable", `inject()` / `useI18n()` find
 * no component, and a lifecycle hook registers on nothing. Nuxt restores the context only where
 * its compiler rewrites the awaits: `<script setup>`, `defineNuxtPlugin` and
 * `defineNuxtRouteMiddleware`.
 *
 * Only functions that run during SSR are checked: the body of a `use*` composable (it runs in
 * setup), a `useAsyncData` / `useLazyAsyncData` / `callOnce` handler, and a Pinia Colada `query`.
 * An action a composable returns (save, logout, navigate) runs on a user event in the browser,
 * where Nuxt keeps the app context set, so it is not reported.
 */

import { docsUrl } from './docs.js'

// Composables and APIs that read the Nuxt app or the current component instance.
const CONTEXT_CALLS = new Set([
  // Nuxt app
  'useNuxtApp', 'useRuntimeConfig', 'useAppConfig', 'useState', 'useCookie', 'useRoute', 'useRouter',
  'useRequestEvent', 'useRequestHeaders', 'useRequestHeader', 'useRequestURL', 'useRequestFetch',
  'useResponseHeader', 'useError', 'clearError', 'useFetch', 'useLazyFetch', 'useAsyncData',
  'useLazyAsyncData', 'useNuxtData', 'refreshNuxtData', 'clearNuxtData', 'useHead', 'useSeoMeta',
  'useServerHead', 'useServerSeoMeta', 'useLoadingIndicator', 'useRouteAnnouncer', 'navigateTo',
  'abortNavigation', 'useHydration', 'usePreviewMode',
  // Vue component instance
  'inject', 'provide', 'getCurrentInstance', 'useSlots', 'useAttrs', 'useTemplateRef', 'useId',
  'onBeforeMount', 'onMounted', 'onBeforeUpdate', 'onUpdated', 'onBeforeUnmount', 'onUnmounted',
  'onActivated', 'onDeactivated', 'onErrorCaptured', 'onServerPrefetch',
  // modules built on the above (inject / useNuxtApp)
  'useI18n', 'useLocalePath', 'useLocaleRoute', 'useSwitchLocalePath', 'useLocaleHead',
  'useSupabaseClient', 'useSupabaseUser', 'useSupabaseSession', 'useToast',
  'useQuery', 'useMutation', 'useQueryCache', 'useInfiniteQuery'
])
// Callbacks Nuxt or Pinia Colada run during SSR, with the context set only until their first await.
const SSR_HANDLERS = new Set(['useAsyncData', 'useLazyAsyncData', 'callOnce'])
const QUERY_DEFINERS = new Set(['useQuery', 'useInfiniteQuery', 'defineQueryOptions', 'defineQuery'])
const COMPOSABLE = /^use[A-Z0-9]/
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

/** @param {any} node */
const calleeName = node => node.callee?.type === 'Identifier' ? node.callee.name : undefined

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow context composables after an await outside setup' },
    schema: [{
      type: 'object',
      properties: { composables: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false
    }],
    messages: {
      afterAwait: [
        '❌ {{name}}() after an await',
        '💡 This function runs during SSR, where the Nuxt/Vue context is per request and an await ends it: after it, {{name}}() runs in a later tick where useNuxtApp() throws "[nuxt] instance unavailable" and inject() finds no component (or another request\'s state). Nuxt only restores the context in <script setup>, defineNuxtPlugin and defineNuxtRouteMiddleware.',
        '🛠 Call {{name}}() before the first await and keep the result, or capture const nuxtApp = useNuxtApp() first and run the rest in nuxtApp.runWithContext(() => …).',
        '📖 ' + docsUrl('no-context-after-await')
      ].join('\n')
    }
  },
  create (context) {
    // In an SFC, Nuxt rewrites the top-level awaits of <script setup> (withAsyncContext).
    if (context.filename.endsWith('.vue')) return {}
    const calls = new Set([...CONTEXT_CALLS, ...(context.options[0]?.composables ?? [])])
    const { sourceCode } = context
    // Where the first await of each function ends: a call inside the awaited expression
    // (`await Promise.all([useFetch(…)])`) runs before the function suspends.
    /** @type {Map<any, number>} */
    const firstAwaitEnd = new Map()

    /** @param {any} node */
    const owner = node => sourceCode.getAncestors(node).findLast(a => FUNCTION_TYPES.has(a.type))

    /** Does `fn` run during SSR (setup or a server-side data handler)? @param {any} fn */
    function runsDuringSsr (fn) {
      const parent = fn.parent
      // export async function useX() {} / const useX = async () => {} at module scope
      const name = fn.id?.name ?? (parent?.type === 'VariableDeclarator' ? parent.id?.name : undefined)
      if (name && COMPOSABLE.test(name) && !owner(fn)) return true
      // useAsyncData(key, async () => …) / callOnce(async () => …)
      if (parent?.type === 'CallExpression' && SSR_HANDLERS.has(calleeName(parent) ?? '')) return true
      // useQuery({ key, query: async () => … })
      const object = parent?.type === 'Property' && (parent.key?.name ?? parent.key?.value) === 'query' ? parent.parent : undefined
      const call = object?.parent
      return call?.type === 'CallExpression' && QUERY_DEFINERS.has(calleeName(call) ?? '')
    }

    return {
      /** @param {any} node */
      'AwaitExpression, ForOfStatement[await=true]' (node) {
        const fn = owner(node)
        if (fn) firstAwaitEnd.set(fn, Math.min(firstAwaitEnd.get(fn) ?? Infinity, node.range[1]))
      },
      /** @param {any} node */
      'CallExpression:exit' (node) {
        const name = calleeName(node)
        if (!name || !calls.has(name)) return
        const fn = owner(node)
        const awaitEnd = fn && firstAwaitEnd.get(fn)
        if (awaitEnd === undefined || awaitEnd > node.range[0] || !runsDuringSsr(fn)) return
        context.report({ node, messageId: 'afterAwait', data: { name } })
      }
    }
  }
}
