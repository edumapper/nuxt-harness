// @ts-check
/**
 * ESLint Rule: date-format-needs-time-zone
 *
 * Flags a date formatted with `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString` or
 * `Intl.DateTimeFormat` without a `timeZone` option - anywhere, not only in the render path.
 *
 * Without the option the runtime uses the zone of the machine: UTC on the server, the device's
 * zone in the browser. A helper in `utils/` called from a template, a label built for a chart, a
 * date written into an e-mail or a prompt all show a different hour depending on where they run,
 * and near midnight a different day.
 *
 * In template text (`{{ … }}`), the rule asks for `<NuxtTime>` instead: it takes the same options
 * as props, renders a `<time>` element and is covered by `nuxt-time-needs-time-zone`.
 *
 * Not reported:
 *   - a number (`total.toLocaleString(locale)`): it has no zone;
 *   - `Intl.DateTimeFormat().resolvedOptions()`: reading the device's zone is the point;
 *   - options the rule cannot read (a parameter, an imported object, an object spread).
 *
 * With the `timeZones` option, a literal zone must be one of the listed ones.
 */

import { docsUrl } from './docs.js'

const DATE_METHODS = new Set(['toLocaleDateString', 'toLocaleTimeString'])
const DATE_OPTIONS = new Set(['dateStyle', 'timeStyle', 'year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'era', 'timeZoneName', 'timeZone'])
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])

/** @param {any} node */
const unwrap = node => {
  while (node && WRAPPERS.has(node.type)) node = node.expression
  return node
}

/** @param {any} property @returns {string | undefined} */
const keyOf = property => property.type === 'Property' ? (property.key?.name ?? property.key?.value) : undefined

/** @param {any} node */
const isNewDate = node => node?.type === 'NewExpression' && node.callee?.name === 'Date'

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require a time zone when formatting a date' },
    schema: [{
      type: 'object',
      properties: { timeZones: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
      additionalProperties: false
    }],
    messages: {
      missing: [
        '❌ {{what}} formats a date without a timeZone',
        '💡 The runtime then uses the machine\'s zone: UTC on the server, the device\'s zone in the browser. The hour, and near midnight the day, depend on where the code runs.',
        '🛠 Pass the zone the date is meant in: { timeZone: \'{{example}}\' }. In a template, use <NuxtTime time-zone="{{example}}">. For a date with no time ("2026-10-12"), use \'UTC\'.',
        '📖 ' + docsUrl('date-format-needs-time-zone')
      ].join('\n'),
      notAllowed: [
        '❌ {{what}} formats a date in "{{zone}}", which is not a zone this app displays',
        '💡 The app shows time in {{allowed}}, so every screen agrees on the hour and the day.',
        '🛠 Use one of: {{allowed}}.',
        '📖 ' + docsUrl('date-format-needs-time-zone')
      ].join('\n'),
      useNuxtTime: [
        '❌ {{what}} formats a date in template text',
        '💡 <NuxtTime> takes the same options as props, renders a <time> element, and the gate checks its time zone.',
        '🛠 <NuxtTime :datetime="value" time-zone="{{example}}" day="numeric" month="long" />.',
        '📖 ' + docsUrl('date-format-needs-time-zone')
      ].join('\n')
    }
  },
  create (context) {
    const { sourceCode } = context
    /** @type {string[]} */
    const timeZones = context.options[0]?.timeZones ?? []
    const example = timeZones[0] ?? 'Europe/Paris'

    /**
     * The object literal behind `node`: itself, or the `const` it names. Undefined when the rule
     * cannot read it (a parameter, an import, a call).
     * @param {any} node @returns {any}
     */
    function objectOf (node) {
      node = unwrap(node)
      if (node?.type === 'ObjectExpression') return node
      if (node?.type !== 'Identifier') return undefined
      try {
        for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
          const variable = scope.set.get(node.name)
          if (!variable) continue
          const def = variable.defs[0]
          const init = def?.type === 'Variable' && def.parent?.kind === 'const' ? unwrap(def.node.init) : undefined
          return init?.type === 'ObjectExpression' ? init : undefined
        }
      } catch {
        // a template expression has no scope: the options stay unread
      }
      return undefined
    }

    /**
     * What the options say about the zone.
     * @param {any} node the options argument
     * @returns {{ known: boolean, date: boolean, zone?: any }}
     */
    function read (node) {
      if (!node || (node.type === 'Identifier' && node.name === 'undefined')) return { known: true, date: false }
      const object = objectOf(node)
      if (!object) return { known: false, date: false }
      const keys = object.properties.map(keyOf)
      const zone = object.properties.find((/** @type {any} */ p) => keyOf(p) === 'timeZone')
      return { known: !keys.includes(undefined), date: keys.some((/** @type {any} */ k) => DATE_OPTIONS.has(k)), zone }
    }

    /**
     * The date formatting `node` does, or undefined.
     * @param {any} node @returns {{ what: string, options: any } | undefined}
     */
    function formatting (node) {
      const callee = node.callee
      if (callee?.type !== 'MemberExpression') return undefined
      const name = callee.property?.name
      if (callee.object?.type === 'Identifier' && callee.object.name === 'Intl' && name === 'DateTimeFormat') {
        const parent = node.parent
        if (parent?.type === 'MemberExpression' && parent.property?.name === 'resolvedOptions') return undefined
        return { what: 'Intl.DateTimeFormat', options: node.arguments[1] }
      }
      if (node.type !== 'CallExpression') return undefined
      if (DATE_METHODS.has(name)) return { what: name, options: node.arguments[1] }
      // toLocaleString is also a number method: a date when called on `new Date()` or with date options
      if (name === 'toLocaleString' && (isNewDate(callee.object) || read(node.arguments[1]).date)) return { what: name, options: node.arguments[1] }
      return undefined
    }

    /** `{{ … }}` as an element's text, not an attribute value. @param {any} node */
    function inTemplateText (node) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'VExpressionContainer') return parent.parent?.type === 'VElement'
      }
      return false
    }

    /** @param {any} node */
    function check (node) {
      const call = formatting(node)
      if (!call) return
      if (inTemplateText(node)) {
        context.report({ node, messageId: 'useNuxtTime', data: { what: call.what, example } })
        return
      }
      const { known, zone } = read(call.options)
      if (!zone) {
        if (known) context.report({ node, messageId: 'missing', data: { what: call.what, example } })
        return
      }
      const value = unwrap(zone.value)
      if (timeZones.length > 0 && value?.type === 'Literal' && typeof value.value === 'string' && !timeZones.includes(value.value)) {
        context.report({ node: zone, messageId: 'notAllowed', data: { what: call.what, zone: value.value, allowed: timeZones.join(', ') } })
      }
    }

    const visitor = { 'CallExpression, NewExpression': check }
    return sourceCode.parserServices?.defineTemplateBodyVisitor?.(visitor, visitor) ?? visitor
  }
}
