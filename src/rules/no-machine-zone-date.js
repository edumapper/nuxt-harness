// @ts-check
/**
 * ESLint Rule: no-machine-zone-date
 *
 * Flags date logic that silently uses the zone of the machine it runs on - UTC on the server, the
 * device's zone in the browser - to decide a day, an hour or a boundary:
 *
 *   - local parts: `d.getHours()`, `d.getDate()`, `d.getDay()`, `d.getMonth()`, `d.getFullYear()`,
 *     `d.getMinutes()`, and `d.setHours(…)`, `d.setDate(…)`, `d.setMonth(…)`, …
 *   - a UTC day or clock cut out of an ISO string: `d.toISOString().slice(0, 10)`;
 *   - a date built from local parts: `new Date(2026, 9, 12)`;
 *   - a wall-clock string with no offset: `new Date('2026-10-12T18:00')`, `new Date(`${day}T${time}`)`;
 *   - a zone-dependent date-fns function without the `in` option: `format(d, 'HH:mm')`,
 *     `startOfDay(d)`, `isSameDay(a, b)`, `isToday(d)`.
 *
 * "Today", "this week" and "18:00" then mean something else on the server, in Paris and in
 * Montreal. The fix is to name the zone: `{ in: tz('Europe/Paris') }` from `@date-fns/tz` for
 * logic, `<NuxtTime time-zone>` for display.
 *
 * Not reported: instants and durations (`getTime()`, `Date.now()`, `toISOString()` as a whole,
 * `addHours`, `isBefore`, `differenceInMinutes`), the UTC accessors (`getUTCHours()` says which
 * zone it reads), a date-fns call that receives a `TZDate`, and a call whose options the rule
 * cannot read.
 */

import { docsUrl } from './docs.js'

const LOCAL_GETTERS = new Set(['getHours', 'getMinutes', 'getDate', 'getDay', 'getMonth', 'getFullYear', 'getYear', 'getTimezoneOffset'])
const LOCAL_SETTERS = new Set(['setHours', 'setMinutes', 'setDate', 'setMonth', 'setFullYear'])
const STRING_CUTS = new Set(['slice', 'substring', 'substr', 'split'])
// date-fns functions whose result depends on the zone the calendar is read in.
const DATE_FNS = new Set([
  'format', 'formatISO', 'formatRFC3339', 'formatRelative', 'parse', 'parseISO',
  'startOfDay', 'endOfDay', 'startOfWeek', 'endOfWeek', 'startOfISOWeek', 'endOfISOWeek', 'startOfMonth', 'endOfMonth',
  'startOfQuarter', 'endOfQuarter', 'startOfYear', 'endOfYear', 'startOfToday', 'endOfToday', 'startOfTomorrow', 'startOfYesterday',
  'isSameDay', 'isSameWeek', 'isSameISOWeek', 'isSameMonth', 'isSameQuarter', 'isSameYear',
  'isToday', 'isTomorrow', 'isYesterday', 'isThisWeek', 'isThisISOWeek', 'isThisMonth', 'isThisYear', 'isWeekend',
  'getHours', 'getMinutes', 'getDate', 'getDay', 'getISODay', 'getDayOfYear', 'getMonth', 'getYear', 'getWeek', 'getISOWeek', 'getISOWeekYear',
  'setHours', 'setMinutes', 'setDate', 'setDay', 'setMonth', 'setYear', 'set',
  'differenceInCalendarDays', 'differenceInCalendarWeeks', 'differenceInCalendarMonths', 'differenceInCalendarYears',
  'eachDayOfInterval', 'eachWeekOfInterval', 'eachMonthOfInterval'
])
const ZONED = new Set(['TZDate', 'TZDateMini', 'tz'])
const OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/
const WALL_CLOCK = /T(?:\d{2}:\d{2}|\u0000)/

/** @param {any} node @returns {string | undefined} the string, with `\0` for each `${…}` */
function textOf (node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral') return node.quasis.map((/** @type {any} */ q) => q.value.cooked ?? '').join('\u0000')
  return undefined
}

/** `new TZDate(…)`, `TZDate.tz(…)`, `tz('…')(…)`: the value carries its zone. @param {any} node */
function zoned (node) {
  if (node?.type === 'NewExpression') return ZONED.has(node.callee?.name)
  if (node?.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee?.type === 'MemberExpression') return ZONED.has(callee.object?.name)
  return ZONED.has(callee?.name) || (callee?.type === 'CallExpression' && ZONED.has(callee.callee?.name))
}

/** The options name the zone, or cannot be read. @param {any[]} args */
function namesZone (args) {
  return args.some(arg => {
    if (zoned(arg) || arg.type === 'SpreadElement') return true
    if (arg.type !== 'ObjectExpression') return false
    return arg.properties.some((/** @type {any} */ p) => p.type !== 'Property' || (p.key?.name ?? p.key?.value) === 'in')
  })
}

const HINT = '🛠 Name the zone: date-fns with { in: tz(\'Europe/Paris\') } from @date-fns/tz for logic, <NuxtTime time-zone="Europe/Paris"> for display.'

/** @param {string} title @param {string} why @param {string} [fix] */
const message = (title, why, fix = HINT) => [`❌ ${title}`, `💡 ${why}`, fix, '📖 ' + docsUrl('no-machine-zone-date')].join('\n')

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow date logic that depends on the machine\'s time zone' },
    schema: [],
    messages: {
      localPart: message(
        '.{{name}}() uses the machine\'s time zone',
        'It is UTC on the server and the device\'s zone in the browser, so the hour, the day or the month it works with depends on where the code runs.'
      ),
      utcCut: message(
        '.toISOString().{{name}}(…) cuts a UTC day or clock out of an instant',
        'The UTC day is not the app\'s day: between midnight and 01:00 or 02:00 in Paris it is still yesterday.',
        '🛠 format(date, \'yyyy-MM-dd\', { in: tz(\'Europe/Paris\') }) from date-fns and @date-fns/tz. Keep toISOString() whole for storage.'
      ),
      localConstructor: message(
        'new Date(year, month, …) builds a date in the machine\'s time zone',
        'The same call is a different instant on the server and on each device.',
        '🛠 new TZDate(year, month, day, \'Europe/Paris\') from @date-fns/tz, or Date.UTC(…) for a date with no time.'
      ),
      localParse: message(
        'new Date(\'…T…\') with no offset is read in the machine\'s time zone',
        'A time typed as 18:00 is stored as 18:00 wherever the browser is: an admin abroad saves another instant than the one meant.',
        '🛠 new TZDate(\'2026-10-12T18:00\', \'Europe/Paris\') from @date-fns/tz, or parse(…, { in: tz(\'Europe/Paris\') }).'
      ),
      dateFns: message(
        'date-fns {{name}}() without the `in` option uses the machine\'s time zone',
        'It is UTC on the server and the device\'s zone in the browser, so the day, the week or the hour it works with depends on where the code runs.',
        '🛠 {{name}}(…, { in: tz(\'Europe/Paris\') }) from @date-fns/tz, or pass a TZDate.'
      )
    }
  },
  create (context) {
    /** Local names of the zone-dependent date-fns functions this file imports. @type {Map<string, string>} */
    const dateFns = new Map()

    const visitor = {
      /** @param {any} node */
      CallExpression (node) {
        const callee = node.callee
        if (callee.type === 'Identifier') {
          const name = dateFns.get(callee.name)
          if (name && !namesZone(node.arguments)) context.report({ node, messageId: 'dateFns', data: { name } })
          return
        }
        if (callee.type !== 'MemberExpression' || callee.computed) return
        const name = callee.property?.name
        if ((LOCAL_GETTERS.has(name) && node.arguments.length === 0) || (LOCAL_SETTERS.has(name) && node.arguments.length > 0)) {
          context.report({ node: callee.property, messageId: 'localPart', data: { name } })
          return
        }
        const receiver = callee.object
        if (STRING_CUTS.has(name) && receiver?.type === 'CallExpression' && receiver.callee?.property?.name === 'toISOString') {
          context.report({ node, messageId: 'utcCut', data: { name } })
        }
      },
      /** @param {any} node */
      NewExpression (node) {
        if (node.callee?.name !== 'Date') return
        if (node.arguments.length >= 2) {
          context.report({ node, messageId: 'localConstructor' })
          return
        }
        const text = textOf(node.arguments[0])
        if (text !== undefined && WALL_CLOCK.test(text) && !OFFSET.test(text)) context.report({ node, messageId: 'localParse' })
      }
    }

    const script = {
      ...visitor,
      /** @param {any} node */
      ImportDeclaration (node) {
        const source = String(node.source.value)
        if (source !== 'date-fns' && !source.startsWith('date-fns/')) return
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          const imported = specifier.imported.name ?? specifier.imported.value
          if (DATE_FNS.has(imported)) dateFns.set(specifier.local.name, imported)
        }
      }
    }
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.(visitor, script) ?? script
  }
}
