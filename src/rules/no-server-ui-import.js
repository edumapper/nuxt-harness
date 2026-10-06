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
 *   server bundle, and breaks SSR isolation. The fix is always to extract the
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
        '❌ UI import in server/: "{{source}}"',
        '💡 Server code is pure business logic — it doesn\'t know about Vue.',
        '   Importing a component couples the server bundle to the Vue runtime and',
        '   can cause SSR errors that are hard to diagnose.',
        '🛠 Extract the shared logic into server/utils/ or shared/ (no ref(), no',
        '   onMounted()) so both sides can import it independently.'
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
