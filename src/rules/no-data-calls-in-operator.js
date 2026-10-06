/**
 * ESLint Rule: no-data-calls-in-operator
 *
 * Operators (Op*.vue) wire Presenters. They may use app composables that ENCAPSULATE data access
 * (useEntityPosts, usePostsOrder, useFeedback …) — that is the pattern — but must not reach for
 * the raw data primitives themselves. A bare $fetch in an Operator bypasses the shared Colada
 * cache (no dedupe, no invalidation, no SSR cookie propagation) and buries a request one layer
 * below where it can be reused or tested.
 *
 * Targets: app/components/**\/Op*.vue
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

const DOCS_URL = '/docs/architecture-en-couches'

// Raw data primitives: Nuxt fetch composables and Pinia Colada. App composables (use*) are not
// listed on purpose — wrapping the primitive in a composable is the fix this rule asks for.
const DATA_CALLS = new Set([
  '$fetch',
  'useFetch',
  'useLazyFetch',
  'useAsyncData',
  'useLazyAsyncData',
  'useQuery',
  'useMutation',
  'useQueryCache'
])

/** @param {string} name */
const message = name => [
  `❌ ${name}() — accès données direct interdit dans un Operator`,
  `💡 Un Operator câble des Presenters ; il ne parle pas au réseau ni au cache.`,
  `   Un appel brut contourne le cache Colada partagé (dédoublonnage, invalidation, cookies SSR).`,
  `🛠 Déplacez l'appel dans un composable (composables/use*.ts) et appelez ce composable,`,
  `   ou laissez l'Orchestrator (Orc*.vue) charger et passer les données via props.`,
  `📖 ${DOCS_URL}#nuxt`
].join('\n')

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw data-access calls ($fetch, useFetch, Colada primitives) in Operator components',
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
