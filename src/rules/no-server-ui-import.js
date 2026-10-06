/**
 * ESLint Rule: no-server-ui-import
 *
 * Prevents server-side code (server/ routes, middleware, utils) from importing
 * Vue components or Nuxt pages. Server code is pure business logic — it must
 * never depend on rendering concerns.
 *
 * Why this matters for AI-generated code:
 *   AI models frequently "reuse" a formatting or validation helper that happens
 *   to live inside a Vue component, importing it directly from server/ code.
 *   This silently couples the server bundle to the Vue runtime, bloats the
 *   worker bundle, and breaks SSR isolation. The fix is always to extract the
 *   shared logic into server/utils/ or a plain composable that works isomorphically.
 *
 * Targets: server/**\/*.ts
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

const UI_PATTERNS = [
  /^~\/components\//,
  /^~\/pages\//,
  /^@\/components\//,
  /^@\/pages\//,
  /\/app\/components\//,
  /\/app\/pages\//
]

/** @param {string} source */
function isUiImport(source) {
  return UI_PATTERNS.some(p => p.test(source))
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow imports of Vue components or pages from server-side code',
      category: 'Architecture'
    },
    schema: [],
    messages: {
      serverUiImport: [
        '❌ Import UI interdit dans server/ : "{{source}}"',
        '💡 Le code serveur est de la logique métier pure — il ne connaît pas Vue.',
        '   Importer un composant couple le bundle Workers au runtime Vue et',
        '   peut provoquer des erreurs SSR difficiles à diagnostiquer.',
        '🛠 Extrayez la logique partagée dans server/utils/ ou un composable',
        '   isomorphique (pas de ref(), pas de onMounted()) que les deux côtés',
        '   peuvent importer indépendamment.'
      ].join('\n')
    }
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source === 'string' && isUiImport(source)) {
          context.report({
            node,
            messageId: 'serverUiImport',
            data: { source }
          })
        }
      }
    }
  }
}
