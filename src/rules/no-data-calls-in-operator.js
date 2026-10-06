/**
 * ESLint Rule: no-data-calls-in-operator
 *
 * Operators (Op*.vue) wire Presenters. They may use app composables that ENCAPSULATE data access
 * (useProductList, useCartItems …) — that is the pattern — but must not reach for the raw
 * data primitives themselves. A bare $fetch in an Operator bypasses the shared data cache
 * (no dedupe, no invalidation, no SSR payload) and buries a request one layer below where it
 * can be reused or tested.
 *
 * Targets: app/components/**\/Op*.vue
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */
import { docsUrl } from './docs.js'

const DOCS_URL = docsUrl('no-data-calls-in-operator')

// Raw data primitives: Nuxt fetch composables, Pinia Colada and TanStack Query. App composables (use*) are not
// listed on purpose — wrapping the primitive in a composable is the fix this rule asks for.
const DATA_CALLS = new Set([
  '$fetch',
  'useFetch',
  'useLazyFetch',
  'useAsyncData',
  'useLazyAsyncData',
  'useQuery',
  'useMutation',
  'useQueryCache',
  'useQueryClient',
  'useInfiniteQuery'
])

/** @param {string} name */
const message = name => [
  `❌ ${name}() — raw data access in an Operator`,
  `💡 An Operator wires Presenters; it doesn't talk to the network or the cache.`,
  `   A raw call bypasses the shared data layer (dedupe, invalidation, SSR payload).`,
  `🛠 Move the call into a composable (composables/use*.ts) and call that composable,`,
  `   or let the Orchestrator (Orc*.vue) load the data and pass it down through props.`,
  `📖 ${DOCS_URL}`
].join('\n')

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw data-access calls ($fetch, useFetch, query primitives) in Operator components',
      category: 'Architecture',
      url: DOCS_URL
    },
    schema: []
  },

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        // Direct calls: $fetch(...), useQuery(...)
        if (callee.type === 'Identifier' && DATA_CALLS.has(callee.name)) {
          context.report({ node, message: message(callee.name) })
          return
        }
        // Member calls on a primitive: $fetch.raw(...)
        if (
          callee.type === 'MemberExpression'
          && callee.object.type === 'Identifier'
          && DATA_CALLS.has(callee.object.name)
        ) {
          context.report({ node, message: message(callee.object.name) })
        }
      }
    }
  }
}
