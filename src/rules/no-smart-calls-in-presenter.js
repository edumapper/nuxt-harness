/**
 * ESLint Rule: no-smart-calls-in-presenter
 *
 * Prevents "smart" composable calls in Presenter components. In Nuxt, composables
 * like useRouter(), navigateTo(), useFetch(), useAsyncData() are auto-imported —
 * they generate no import statement, so no-restricted-imports cannot catch them.
 * This AST rule detects the CallExpression directly.
 *
 * Targets: components/**\/*.vue excluding Orc*.vue and Op*.vue
 *
 *
 * Options: `{ dataComposables: string[] }` — the app's own data-layer composables
 * (e.g. a `useApiQuery` wrapper), reported like `useFetch`.
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */
import { docsUrl } from './docs.js'

const DOCS_URL = docsUrl('no-smart-calls')

// ─── Contextual Messages ──────────────────────────────────────────────────────
// Each violation type gets a message tailored to its context.
// Format: ❌ What → 💡 Why → 🛠 What to do → 📖 Docs

const MESSAGES = {
  /** @param {string} name */
  store: name => [
    `❌ ${name}() — store access in a Presenter`,
    `💡 Presenters are dumb: they don't know stores exist.`,
    `   A store is an invisible dependency that breaks testability.`,
    `🛠 Move the call to an Operator (Op*.vue) or a composable (composables/use*.ts)`,
    `   and pass the result to the Presenter through props.`,
    `📖 ${DOCS_URL}`
  ].join('\n'),

  /** @param {string} name */
  navigation: name => [
    `❌ ${name}() — navigation in a Presenter`,
    `💡 A Presenter doesn't decide where to go. It emits an event,`,
    `   and the Operator (Op*.vue) or Orchestrator (Orc*.vue) decides what to do.`,
    `🛠 Replace with: emit('select', item)`,
    `   then in the Op*.vue: @select="handleSelect" → await navigateTo(…)`,
    `📖 ${DOCS_URL}`
  ].join('\n'),

  /** @param {string} name */
  fetch: name => [
    `❌ ${name}() — data fetching in a Presenter`,
    `💡 A Presenter receives ready-to-display data through props.`,
    `   Fetching belongs to the Orchestrator (Orc*.vue) or a composable.`,
    `🛠 Move the call to the Orchestrator or a composable,`,
    `   then pass the result down: Orchestrator → Operator → props.`,
    `📖 ${DOCS_URL}`
  ].join('\n')
}

// ─── Pattern Matchers ─────────────────────────────────────────────────────────
// Pinia store convention: use*Store()
const STORE_PATTERN = /^use\w+Store$/

// Navigation composables (Nuxt auto-imports)
const NAV_CALLS = new Set(['useRouter', 'navigateTo', 'useRoute'])

// Data fetching primitives — Nuxt auto-imports and Pinia Colada / TanStack Query. The app adds
// its own data-layer composables through the `dataComposables` option. A Presenter touching any
// of them owns data access it cannot be tested without.
const FETCH_CALLS = [
  // Nuxt
  'useFetch', 'useLazyFetch', 'useAsyncData', 'useLazyAsyncData', '$fetch',
  // Pinia Colada, TanStack Query
  'useQuery', 'useMutation', 'useQueryCache', 'useQueryClient', 'useInfiniteQuery'
]

/** @param {string} name @param {Set<string>} fetchCalls */
function classifyCall(name, fetchCalls) {
  if (STORE_PATTERN.test(name)) return 'store'
  if (NAV_CALLS.has(name)) return 'navigation'
  if (fetchCalls.has(name)) return 'fetch'
  return null
}

// ─── Rule ─────────────────────────────────────────────────────────────────────
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow smart composable calls (store, navigation, fetch) in Presenter components',
      category: 'Architecture',
      url: DOCS_URL
    },
    schema: [{ type: 'object', properties: { dataComposables: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }]
  },

  create(context) {
    const fetchCalls = new Set([...FETCH_CALLS, ...(context.options[0]?.dataComposables ?? [])])
    return {
      CallExpression(node) {
        // Handle direct calls: useFetch(...), navigateTo(...)
        if (node.callee.type === 'Identifier') {
          const type = classifyCall(node.callee.name, fetchCalls)
          if (!type) return

          context.report({
            node,
            message: MESSAGES[type](node.callee.name)
          })
          return
        }

        // Handle member calls: this.$store.dispatch(...) — legacy Options API
        if (
          node.callee.type === 'MemberExpression'
          && node.callee.object.type === 'ThisExpression'
          && node.callee.property.type === 'Identifier'
          && node.callee.property.name === '$store'
        ) {
          context.report({
            node,
            message: MESSAGES.store('this.$store')
          })
        }
      }
    }
  }
}
