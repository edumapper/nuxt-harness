// @ts-check
/**
 * ESLint Rule: link-needs-locale-path
 *
 * Flags a `<NuxtLink>` whose `to` is a literal path (`to="/"`, `:to="'/about'"`, a template
 * string starting with `/`) in an app that uses @nuxtjs/i18n.
 *
 * A literal path skips the locale prefix: a visitor on `/en/…` who clicks it lands on the
 * default-locale page. It is the template side of the `navigateTo('/…')` restriction.
 * `<NuxtLinkLocale>` localizes its `to` and is not reported; external URLs never start with `/`.
 */

import { docsUrl } from './docs.js'

const LINKS = new Set(['NuxtLink', 'nuxt-link'])

/** @param {any} node @returns {boolean} */
function literalPath (node) {
  if (node?.type === 'Literal') return typeof node.value === 'string' && node.value.startsWith('/')
  if (node?.type === 'TemplateLiteral') return String(node.quasis[0]?.value.raw ?? '').startsWith('/')
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require localized paths on NuxtLink in i18n apps' },
    schema: [],
    messages: {
      literalPath: [
        '❌ <NuxtLink to="{{path}}"> literal path',
        '💡 A literal path skips the i18n locale prefix: a visitor on another locale lands on the default-locale page.',
        '🛠 :to="localePath(\'{{path}}\')" (or localePath({ name: \'…\' })), or use <NuxtLinkLocale>.',
        '📖 ' + docsUrl('link-needs-locale-path')
      ].join('\n')
    }
  },
  create (context) {
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      /** @param {any} node */
      VAttribute (node) {
        if (!LINKS.has(node.parent?.parent?.rawName)) return
        if (!node.directive) {
          const path = node.key?.name === 'to' ? node.value?.value : undefined
          if (typeof path === 'string' && path.startsWith('/')) context.report({ node, messageId: 'literalPath', data: { path } })
          return
        }
        const isTo = node.key?.name?.name === 'bind' && node.key.argument?.name === 'to'
        const expression = node.value?.expression
        if (isTo && literalPath(expression)) {
          context.report({ node, messageId: 'literalPath', data: { path: context.sourceCode.getText(expression).slice(1, -1) } })
        }
      }
    }) ?? {}
  }
}
