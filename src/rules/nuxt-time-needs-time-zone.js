// @ts-check
/**
 * ESLint Rule: nuxt-time-needs-time-zone
 *
 * Flags a `<NuxtTime>` that shows a date or a clock time without a `time-zone` prop.
 *
 * Without it, the component formats in the zone of whatever machine renders it: the server
 * (usually UTC) writes one hour into the HTML and each visitor's device shows another. A time
 * the product means in one zone (an event at 18:00 in Paris) is then wrong for everyone
 * elsewhere, and near midnight the day is wrong too.
 *
 * Not reported:
 *   - `relative` or `:relative="true"` ("5 minutes ago"): a distance between two instants has
 *     no zone. A bound `:relative="flag"` is not exempt: when it is false, <NuxtTime> formats an
 *     absolute date, in the machine's zone;
 *   - an object spread (`v-bind="options"`): the zone may be in it.
 *
 * With the `timeZones` option, a literal zone must be one of the listed ones. A bound expression
 * (`:time-zone="event.timezone"`) is accepted: its value is not known statically.
 */

import { docsUrl } from './docs.js'

const TIMES = new Set(['NuxtTime', 'nuxt-time'])
const ZONE_PROPS = new Set(['time-zone', 'timeZone'])

/**
 * The attribute's name as written, with or without `v-bind:`. The parser lowercases `name`
 * (`timeZone` becomes `timezone`), so the raw name is read.
 * @param {any} attribute @returns {string | undefined}
 */
function nameOf (attribute) {
  if (!attribute.directive) return attribute.key?.rawName
  return attribute.key?.name?.name === 'bind' ? attribute.key.argument?.rawName : undefined
}

/** `v-bind="object"`: props the rule cannot see. @param {any} attribute */
const isSpread = attribute => attribute.directive && attribute.key?.name?.name === 'bind' && !attribute.key.argument

/**
 * The value when it is known statically: `time-zone="UTC"`, `:time-zone="'UTC'"`.
 * @param {any} attribute @returns {string | undefined}
 */
function literalOf (attribute) {
  if (!attribute.directive) return attribute.value?.value
  const expression = attribute.value?.expression
  if (expression?.type === 'Literal' && typeof expression.value === 'string') return expression.value
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0) return expression.quasis[0]?.value.cooked
  return undefined
}

/** `relative` or `:relative="true"`: relative whatever happens. A bound flag may be false. @param {any} attribute */
const isAlwaysOn = attribute => !attribute.directive || (attribute.value?.expression?.type === 'Literal' && attribute.value.expression.value === true)

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require a time zone on NuxtTime' },
    schema: [{
      type: 'object',
      properties: { timeZones: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
      additionalProperties: false
    }],
    messages: {
      missing: [
        '❌ <NuxtTime> without time-zone',
        '💡 It formats in the zone of the machine that renders it: the server (UTC) and each visitor\'s device show a different hour, and near midnight a different day.',
        '🛠 Add time-zone="{{example}}". For a date with no time ("2026-10-12"), use time-zone="UTC". For "5 minutes ago", use relative.',
        '📖 ' + docsUrl('nuxt-time-needs-time-zone')
      ].join('\n'),
      notAllowed: [
        '❌ <NuxtTime time-zone="{{zone}}"> is not a zone this app displays',
        '💡 The app shows time in {{allowed}}, so every screen agrees on the hour and the day.',
        '🛠 Use one of: {{allowed}}.',
        '📖 ' + docsUrl('nuxt-time-needs-time-zone')
      ].join('\n')
    }
  },
  create (context) {
    /** @type {string[]} */
    const timeZones = context.options[0]?.timeZones ?? []
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      /** @param {any} node */
      VElement (node) {
        if (!TIMES.has(node.rawName)) return
        /** @type {any[]} */
        const attributes = node.startTag.attributes
        if (attributes.some(isSpread)) return
        if (attributes.some(a => nameOf(a) === 'relative' && isAlwaysOn(a))) return
        const zone = attributes.find(a => ZONE_PROPS.has(nameOf(a) ?? ''))
        if (!zone) {
          context.report({ node: node.startTag, messageId: 'missing', data: { example: timeZones[0] ?? 'Europe/Paris' } })
          return
        }
        const literal = literalOf(zone)
        if (timeZones.length > 0 && literal !== undefined && !timeZones.includes(literal)) {
          context.report({ node: zone, messageId: 'notAllowed', data: { zone: literal, allowed: timeZones.join(', ') } })
        }
      }
    }) ?? {}
  }
}
