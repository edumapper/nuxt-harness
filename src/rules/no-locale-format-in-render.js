// @ts-check
/**
 * ESLint Rule: no-locale-format-in-render
 *
 * Flags locale formatting in the render path whose output depends on the machine:
 *   - no locale argument: Node formats with the server's default locale, the browser with the
 *     user's, so the two renders differ;
 *   - a date or time without a `timeZone` option: the server usually runs in UTC and the user
 *     does not, so the hour (and near midnight, the day) differs between the two renders.
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
const INTL_DATE = new Set(['DateTimeFormat'])
const INTL_OTHER = new Set(['NumberFormat', 'RelativeTimeFormat', 'PluralRules', 'ListFormat'])
const DATE_OPTIONS = new Set(['dateStyle', 'timeStyle', 'year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'era', 'timeZoneName'])
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

/** @param {any} node */
const keysOf = node => node?.type === 'ObjectExpression'
  ? node.properties.map((/** @type {any} */ p) => p.key?.name ?? p.key?.value).filter(Boolean)
  : []

/** @param {any} node */
const isUndefined = node => !node || (node.type === 'Identifier' && node.name === 'undefined')

/**
 * The formatting call `node` makes, or undefined when it is not one.
 * @param {any} node @returns {{ what: string, date: boolean, args: any[] } | undefined}
 */
function formatting (node) {
  const callee = node.callee
  if (node.type === 'CallExpression' && callee?.type === 'MemberExpression') {
    const method = callee.property?.name
    if (LOCALE_METHODS.has(method)) {
      const isNewDate = callee.object?.type === 'NewExpression' && callee.object.callee?.name === 'Date'
      const date = method !== 'toLocaleString' || isNewDate || keysOf(node.arguments[1]).some((/** @type {string} */ k) => DATE_OPTIONS.has(k))
      return { what: method, date, args: node.arguments }
    }
  }
  // new Intl.X(locale, options) and Intl.X(locale, options)
  if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier' && callee.object.name === 'Intl') {
    const name = callee.property?.name
    if (INTL_DATE.has(name) || INTL_OTHER.has(name)) return { what: `Intl.${name}`, date: INTL_DATE.has(name), args: node.arguments }
  }
  return undefined
}

/** @param {{ date: boolean, args: any[] }} call @returns {'noLocale' | 'noTimeZone' | undefined} */
function divergence ({ date, args }) {
  if (isUndefined(args[0])) return 'noLocale'
  if (date && !keysOf(args[1]).includes('timeZone')) return 'noTimeZone'
  return undefined
}

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
      ].join('\n'),
      noTimeZone: [
        '❌ {{what}} formats a date without a timeZone in the render path',
        '💡 The server usually runs in UTC and the user does not: the hour, and near midnight the day, differ between the SSR text and the hydrated text.',
        '🛠 Pass the zone the date belongs to: { timeZone: \'Europe/Paris\' }, or format after mount for the user\'s local time.',
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
