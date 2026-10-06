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
import { docsUrl } from './docs.js'

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

/** `orc-user-list` / `orcUserList` → `OrcUserList` @param {string} name */
function toPascalCase(name) {
  return name.replace(/(?:^|[-_])(\w)/g, (_, c) => c.toUpperCase())
}

// Nuxt prefixes nested components with their directory (components/users/OrcList.vue →
// <UsersOrcList>) and lazy ones with `Lazy`, so the layer prefix can follow a PascalCase segment.
const SMART_COMPONENT = /(?:^|[a-z0-9])(?:Orc|Op)[A-Z]/

/** @param {string} name */
function isAllowedInPage(name) {
  const pascal = toPascalCase(name).replace(/^Lazy(?=[A-Z])/, '')
  if (NATIVE_ELEMENTS.has(name)) return true
  if (VUE_NUXT_BUILTINS.has(name) || VUE_NUXT_BUILTINS.has(pascal)) return true
  if (/^Nuxt[A-Z]/.test(pascal)) return true // NuxtLinkLocale, NuxtTime, NuxtImg…
  // Nuxt UI is the atom layer — treated like native HTML elements (see skills/nuxt-harness/SKILL.md)
  if (/^U[A-Z]/.test(pascal)) return true
  // Orchestrators and Operators — allowed
  return SMART_COMPONENT.test(pascal)
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
        '❌ <{{name}}> — Presenter rendered directly in a Page',
        '💡 Pages are assemblers: they compose Orchestrators (Orc*) and Operators (Op*).',
        '   A Presenter used directly in a Page has no smart component to own its data contract.',
        '🛠 Create an Op{{name}}.vue that wires this Presenter, and use it in the Page.',
        '   If the component also needs to fetch data, create an Orc{{name}}.vue.',
        '📖 ' + docsUrl('no-presenter-in-page')
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
