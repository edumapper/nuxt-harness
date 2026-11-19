// @ts-check
/**
 * ESLint Rule: no-locale-format-in-render
 *
 * Flags locale formatting in the render path with no locale argument: Node formats with the
 * server's default locale, the browser with the user's, so the two renders differ.
 *
 * A date without a `timeZone` is reported by `date-format-needs-time-zone`, in every file and not
 * only in the render path.
 *
 * A number formatted with an explicit locale (`n.toLocaleString(locale)`,
 * `new Intl.NumberFormat('fr-FR')`) is deterministic: Node and browsers ship the same CLDR
 * data, so it is not reported.
 *
 * The render path is a template expression (event handlers excluded), a top-level setup
 * statement, or a `computed` callback. Other functions (handlers, `onMounted`, actions) run
 * in the browser after hydration and are not reported. Production Vue does not warn about a
 * hydrated text mismatch, which is why this needs a rule.
 */

import { docsUrl } from './docs.js'

const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])
const INTL = new Set(['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'PluralRules', 'ListFormat'])
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

/** @param {any} node */
const isUndefined = node => !node || (node.type === 'Identifier' && node.name === 'undefined')

/**
 * The formatting call `node` makes, or undefined when it is not one.
 * @param {any} node @returns {{ what: string, args: any[] } | undefined}
 */
function formatting (node) {
  const callee = node.callee
  if (node.type === 'CallExpression' && callee?.type === 'MemberExpression') {
    const method = callee.property?.name
    if (LOCALE_METHODS.has(method)) return { what: method, args: node.arguments }
  }
  // new Intl.X(locale, options) and Intl.X(locale, options)
  if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier' && callee.object.name === 'Intl') {
    const name = callee.property?.name
    if (INTL.has(name)) return { what: `Intl.${name}`, args: node.arguments }
  }
  return undefined
}

/** @param {{ args: any[] }} call @returns {'noLocale' | undefined} */
const divergence = ({ args }) => isUndefined(args[0]) ? 'noLocale' : undefined

/** A `computed(() => …)` callback runs during render. @param {any} fn */
const isComputedCallback = fn =>
  fn.parent?.type === 'CallExpression' && fn.parent.callee?.type === 'Identifier' && fn.parent.callee.name === 'computed' && fn.parent.arguments[0] === fn

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow machine-dependent locale formatting in the render path' },
    schema: [],
    messages: {
      noLocale: [
        '❌ {{what}} without a locale in the render path',
        '💡 The server formats with its own default locale and the browser with the user\'s, so the SSR text and the hydrated text differ, and production Vue does not warn about it.',
        '🛠 Pass the app locale: value.toLocaleString(locale.value), new Intl.NumberFormat(locale.value). Or format after mount if the value is client-only.',
        '📖 ' + docsUrl('no-locale-format-in-render')
      ].join('\n')
    }
  },
  create (context) {
    const { sourceCode } = context
    /** @param {any} node */
    function check (node) {
      const call = formatting(node)
      const messageId = call && divergence(call)
      if (messageId && call) context.report({ node, messageId, data: { what: call.what } })
    }

    const scriptVisitor = {
      /** @param {any} node */
      'CallExpression, NewExpression' (node) {
        const functions = sourceCode.getAncestors(node).filter(a => FUNCTION_TYPES.has(a.type))
        if (functions.every(isComputedCallback)) check(node)
      }
    }

    const services = sourceCode.parserServices
    if (!services?.defineTemplateBodyVisitor) return scriptVisitor
    return services.defineTemplateBodyVisitor({
      /** @param {any} node */
      'CallExpression, NewExpression' (node) {
        // v-on handlers run on user events, in the browser.
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type === 'VAttribute') {
            if (parent.directive && parent.key?.name?.name === 'on') return
            break
          }
        }
        check(node)
      }
    }, scriptVisitor)
  }
}
