/**
 * ESLint Rule: no-presenter-in-page
 *
 * Prevents Presenter components from being used directly in Nuxt page files.
 * Pages (pages/**\/*.vue) are assemblers — they may only compose Orchestrators
 * (Orc*.vue) and Operators (Op*.vue).
 *
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

// Native HTML/SVG elements that should always be allowed
const NATIVE_ELEMENTS = new Set([
  'div', 'span', 'main', 'section', 'article', 'header', 'footer', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
  'a', 'button', 'input', 'form', 'label', 'select', 'textarea',
  'img', 'video', 'audio', 'canvas', 'svg', 'path',
  'table', 'thead', 'tbody', 'tr', 'th', 'td'
])

// Vue / Nuxt built-in components that are always allowed in pages
const VUE_NUXT_BUILTINS = new Set([
  'template', 'slot', 'component',
  'Teleport', 'Transition', 'TransitionGroup', 'KeepAlive', 'Suspense',
  'NuxtLayout', 'NuxtPage', 'NuxtLink', 'NuxtLoadingIndicator',
  'ClientOnly', 'DevOnly', 'NuxtErrorBoundary'
])

/** @param {string} name */
function toPascalCase(name) {
  return name.replace(/^./, c => c.toUpperCase())
}

/** @param {string} name */
function isAllowedInPage(name) {
  const pascal = toPascalCase(name)
  if (NATIVE_ELEMENTS.has(name)) return true
  if (VUE_NUXT_BUILTINS.has(name) || VUE_NUXT_BUILTINS.has(pascal)) return true
  if (/^Nuxt[A-Z]/.test(pascal)) return true // NuxtLinkLocale, NuxtTime, NuxtImg…
  // NuxtUI is the atom layer — treated like native HTML elements (see skills/nuxt-harness/SKILL.md)
  if (/^U[A-Z]/.test(pascal)) return true
  if (pascal.startsWith('Orc')) return true // Orchestrators — allowed
  if (pascal.startsWith('Op')) return true // Operators — allowed
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Presenter components in Nuxt page files',
      category: 'Architecture'
    },
    schema: [],
    messages: {
      presenterInPage: [
        '❌ <{{name}}> — Presenter interdit dans une Page',
        '💡 Les Pages sont des assembleurs : elles composent des Orchestrators (Orc*) et des Operators (Op*).',
        '   Un Presenter utilisé directement dans la Page n\'a aucun composant smart pour gérer son contrat de données.',
        '🛠 Créez un Op{{name}}.vue qui câble ce Presenter, puis utilisez-le dans la Page.',
        '   Si ce composant doit aussi faire du fetch, créez un Orc{{name}}.vue.'
      ].join('\n')
    }
  },

  create(context) {
    // Template nodes are only walked through vue-eslint-parser's template visitor —
    // a top-level `VElement` key is silently never called.
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      // Vue SFC template AST — VElement nodes represent component usages
      VElement(node) {
        const { name } = node.rawName !== undefined
          ? { name: node.rawName }
          : node

        if (!name || typeof name !== 'string') return
        if (isAllowedInPage(name)) return

        context.report({
          node,
          messageId: 'presenterInPage',
          data: { name: toPascalCase(name) }
        })
      }
    }) ?? {}
  }
}
