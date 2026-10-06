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
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

const DOCS_URL = '/docs/architecture-en-couches'

// ─── Contextual Messages ──────────────────────────────────────────────────────
// Each violation type gets a message tailored to its context.
// Format: ❌ What → 💡 Why → 🛠 What to do → 📖 Docs

/** @param {string} name */
const MESSAGES = {
  store: name => [
    `❌ ${name}() — accès store interdit dans un Presenter`,
    `💡 Les Presenters sont bêtes : ils ne savent pas que les stores existent.`,
    `   Un store crée une dépendance invisible qui casse la testabilité.`,
    `🛠 Déplacez dans un Operator (Op*.vue) ou un composable (composables/use*.ts).`,
    `   Passez le résultat au Presenter via props.`,
    `📖 ${DOCS_URL}#stores`
  ].join('\n'),

  navigation: name => [
    `❌ ${name}() — navigation interdite dans un Presenter`,
    `💡 Un Presenter ne décide pas où aller. Il émet un event,`,
    `   et l'Operator (Op*.vue) ou l'Orchestrator (Orc*.vue) décide quoi en faire.`,
    `🛠 Remplacez par : emit('navigate', { to: '...' })`,
    `   Puis dans le Op*.vue : @navigate="router.push($event.to)"`,
    `📖 ${DOCS_URL}#regles`
  ].join('\n'),

  fetch: name => [
    `❌ ${name}() — data fetching interdit dans un Presenter`,
    `💡 Le Presenter reçoit des données prêtes via props.`,
    `   Le fetching appartient à l'Orchestrator (Orc*.vue) ou à un composable.`,
    `🛠 Déplacez l'appel dans l'Orchestrator ou un composable,`,
    `   puis passez le résultat via Orchestrator → Operator → props.`,
    `📖 ${DOCS_URL}#nuxt`
  ].join('\n')
}

// ─── Pattern Matchers ─────────────────────────────────────────────────────────
// Pinia store convention: use*Store()
const STORE_PATTERN = /^use\w+Store$/

// Navigation composables (Nuxt auto-imports)
const NAV_CALLS = new Set(['useRouter', 'navigateTo', 'useRoute'])

// Data fetching composables — Nuxt auto-imports, Pinia Colada primitives, and the app's own
// data-layer composables (cache reads, optimistic writes, prefetch). A Presenter touching any of
// them owns data access it cannot be tested without.
const FETCH_CALLS = new Set([
  // Nuxt
  'useFetch', 'useLazyFetch', 'useAsyncData', 'useLazyAsyncData', '$fetch',
  // Pinia Colada
  'useQuery', 'useMutation', 'useQueryCache',
  // App data layer (app/composables)
  'useApiQuery', 'useOptimisticListMutation', 'useOptimisticSave', 'usePrefetch'
])

/** @param {string} name */
function classifyCall(name) {
  if (STORE_PATTERN.test(name)) return 'store'
  if (NAV_CALLS.has(name)) return 'navigation'
  if (FETCH_CALLS.has(name)) return 'fetch'
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
    schema: []
  },

  create(context) {
    return {
      CallExpression(node) {
        // Handle direct calls: useFetch(...), navigateTo(...)
        if (node.callee.type === 'Identifier') {
          const type = classifyCall(node.callee.name)
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
