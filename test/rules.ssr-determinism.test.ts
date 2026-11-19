import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import vueParser from 'vue-eslint-parser'

import dateFormatNeedsTimeZone from '../src/rules/date-format-needs-time-zone.js'
import noMachineZoneDate from '../src/rules/no-machine-zone-date.js'
import asyncDataNeedsKey from '../src/rules/async-data-needs-key.js'
import noBrowserApiInSetup from '../src/rules/no-browser-api-in-setup.js'
import noLocaleFormatInRender from '../src/rules/no-locale-format-in-render.js'
import noModuleMutableState from '../src/rules/no-module-mutable-state.js'
import nuxtTimeNeedsTimeZone from '../src/rules/nuxt-time-needs-time-zone.js'
import noNondeterministicKey from '../src/rules/no-nondeterministic-key.js'
import noReservedItemValue from '../src/rules/no-reserved-item-value.js'
import timerNeedsScopeDispose from '../src/rules/timer-needs-scope-dispose.js'

// Every rule below exists because a real application shipped the bug it prevents, and because
// SSR HTML + curl + `nuxt typecheck` all stayed green while the browser did not. Each rule has a
// positive and a negative fixture, so the gate is guarded against silent regressions.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } })
const tsTester = new RuleTester({ languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' } })
const vueTester = new RuleTester({
  languageOptions: { parser: vueParser, parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' } }
})
const sfc = (script: string, template = '<div />') => `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  ${template}\n</template>\n`

// The empty string is reserved by select-like components (Reka UI): rendering such an item throws
// during hydration. SSR, curl and typecheck cannot see it - the browser gets an error page.
ruleTester.run('no-reserved-item-value', noReservedItemValue, {
  valid: [
    { filename: 'app/pages/index.vue', code: 'const ALL = \'all\'; const items = [{ label: \'All\', value: ALL }]' },
    { filename: 'app/components/List.vue', code: 'const rows = [{ id: 1, value: 0 }]' },
    // not a list a select renders: a form model, a prop default, a computed view model
    { filename: 'app/components/Gauge.vue', code: 'const gauge = computed(() => ({ ratio: null, value: \'\', caption: \'\' }))' },
    { filename: 'app/components/Tabs.vue', code: 'withDefaults(defineProps(), { item: () => ({ label: \'Label\', value: \'\' }) })' },
    // a blank new row (label '' too) is data, not an option
    { filename: 'app/components/Facts.vue', code: 'const facts = [...rows, { emoji: \'\', value: \'\', label: \'\' }]' }
  ],
  invalid: [
    { filename: 'app/pages/index.vue', code: 'const items = [{ label: \'All\', value: \'\' }]', errors: 1 },
    { filename: 'app/pages/index.vue', code: 'const items = [{ value: \'a\' }, { value: \'\' }]', errors: 1 }
  ]
})

// A native <option value=""> is legitimate, so template-side literals must stay clean.
vueTester.run('no-reserved-item-value (template)', noReservedItemValue, {
  valid: [{ filename: 'app/components/Select.vue', code: sfc('', '<select><option value="">All</option></select>') }],
  invalid: []
})

// Server and client must compute the same request key, or hydration misses the payload entry.
ruleTester.run('no-nondeterministic-key', noNondeterministicKey, {
  valid: [
    { filename: 'app/composables/useSearch.ts', code: 'useFetch(\'/api/s\', { key: () => `s:${q.value}`, query: { q } })' },
    { filename: 'app/composables/useSearch.ts', code: 'useAsyncData(() => `s:${id.value}`, () => $fetch(\'/api/s\'))' }
  ],
  invalid: [
    { filename: 'app/composables/useSearch.ts', code: 'useFetch(\'/api/s\', { key: () => `s:${Date.now()}` })', errors: 1 },
    { filename: 'app/composables/useSearch.ts', code: 'useAsyncData(() => `s:${new Date().getTime()}`, () => $fetch(\'/api/s\'), { key: () => String(Math.random()) })', errors: 2 }
  ]
})

// A keyless useAsyncData is keyed by its call site: two instances with different props share one
// payload entry. useFetch is not concerned: its key already includes the URL, query and body.
ruleTester.run('async-data-needs-key', asyncDataNeedsKey, {
  valid: [
    { filename: 'app/components/ProgramCard.vue', code: 'useAsyncData(() => `program:${props.id}`, () => $fetch(`/api/programs/${props.id}`))' },
    { filename: 'app/components/ProgramCard.vue', code: 'useAsyncData(\'stats\', () => $fetch(\'/api/stats\'))' },
    // no instance input: every instance fetches the same thing anyway
    { filename: 'app/pages/index.vue', code: 'useAsyncData(() => $fetch(\'/api/stats\'))' },
    { filename: 'app/composables/useSearch.ts', code: 'useFetch(\'/api/s\', { query: { q } })' }
  ],
  invalid: [
    { filename: 'app/components/ProgramCard.vue', code: 'useAsyncData(() => $fetch(`/api/programs/${props.id}`))', errors: 1 },
    { filename: 'app/pages/program/[id].vue', code: 'useLazyAsyncData(async () => { const route = useRoute(); return $fetch(`/api/p/${route.params.id}`) })', errors: 1 }
  ]
})

// Node and the browser ship different ICU data: a locale-formatted value in the render path can
// differ between renders, and production Vue does not warn about a hydrated text mismatch.
ruleTester.run('no-locale-format-in-render (script)', noLocaleFormatInRender, {
  valid: [
    { filename: 'app/pages/index.vue', code: 'const label = computed(() => String(total.value))' },
    { filename: 'app/pages/index.vue', code: 'function onClick () { return total.value.toLocaleString() }' },
    // an explicit locale makes a number deterministic: Node and browsers share CLDR data
    { filename: 'app/pages/index.vue', code: 'const label = computed(() => total.value.toLocaleString(locale.value))' },
    { filename: 'app/pages/index.vue', code: 'const fmt = computed(() => new Intl.NumberFormat(locale.value, { style: \'percent\' }))' },
    // a date without a zone is date-format-needs-time-zone's finding, not this rule's
    { filename: 'app/pages/index.vue', code: 'const day = computed(() => d.toLocaleDateString(\'fr-FR\'))' },
    { filename: 'app/pages/index.vue', code: 'const day = computed(() => d.toLocaleDateString(\'fr-FR\', { timeZone: \'Europe/Paris\' }))' },
    // after mount: browser only
    { filename: 'app/pages/index.vue', code: 'onMounted(() => { label.value = new Date().toLocaleDateString() })' }
  ],
  invalid: [
    { filename: 'app/pages/index.vue', code: 'const label = total.value.toLocaleString()', errors: [{ messageId: 'noLocale' }] },
    { filename: 'app/pages/index.vue', code: 'const day = computed(() => new Date(at).toLocaleDateString())', errors: [{ messageId: 'noLocale' }] },
    { filename: 'app/pages/index.vue', code: 'const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: \'long\' })', errors: [{ messageId: 'noLocale' }] }
  ]
})

vueTester.run('no-locale-format-in-render (template)', noLocaleFormatInRender, {
  valid: [
    { filename: 'app/pages/index.vue', code: sfc('const total = ref(0)', '<p>{{ total }}</p>') },
    { filename: 'app/pages/index.vue', code: sfc('const total = ref(0)', '<p>{{ total.toLocaleString(locale) }}</p>') },
    { filename: 'app/pages/index.vue', code: sfc('const total = ref(0)', '<button @click="copy(total.toLocaleString())">x</button>') }
  ],
  invalid: [{ filename: 'app/pages/index.vue', code: sfc('const total = ref(0)', '<p>{{ total.toLocaleString() }}</p>'), errors: 1 }]
})

// <NuxtTime> formats in the zone of the machine that renders it. Without a zone, an event at
// 18:00 in Paris reads 16:00 in the server's HTML and 12:00 on a phone in Montreal.
const time = (attrs: string) => ({ filename: 'app/components/EventCard.vue', code: sfc('', `<NuxtTime :datetime="at" ${attrs} />`) })
vueTester.run('nuxt-time-needs-time-zone', nuxtTimeNeedsTimeZone, {
  valid: [
    time('hour="2-digit" time-zone="Europe/Paris"'),
    time('hour="2-digit" timeZone="Europe/Paris"'),
    time('hour="2-digit" :time-zone="event.timezone"'),
    time('hour="2-digit" :timeZone="zone"'),
    // a distance between two instants has no zone
    time('relative'),
    time(':relative="true"'),
    // the zone may be in the spread
    time('v-bind="format"'),
    { filename: 'app/components/EventCard.vue', code: sfc('', '<nuxt-time :datetime="at" time-zone="UTC" />') },
    { filename: 'app/components/EventCard.vue', code: sfc('', '<time :datetime="at">x</time>') },
    { ...time('time-zone="UTC"'), options: [{ timeZones: ['Europe/Paris', 'UTC'] }] },
    { ...time(':time-zone="zone"'), options: [{ timeZones: ['Europe/Paris'] }] }
  ],
  invalid: [
    { ...time('hour="2-digit" minute="2-digit"'), errors: [{ messageId: 'missing' }] },
    { ...time('month="long" day="numeric"'), errors: [{ messageId: 'missing' }] },
    { ...time(':relative="false"'), errors: [{ messageId: 'missing' }] },
    // time-zone-name prints the zone's name: it does not choose the zone
    { ...time('time-zone-name="short"'), errors: [{ messageId: 'missing' }] },
    { filename: 'app/components/EventCard.vue', code: sfc('', '<nuxt-time :datetime="at" />'), errors: [{ messageId: 'missing' }] },
    { ...time('time-zone="America/New_York"'), options: [{ timeZones: ['Europe/Paris', 'UTC'] }], errors: [{ messageId: 'notAllowed' }] },
    { ...time(':time-zone="\'Asia/Tokyo\'"'), options: [{ timeZones: ['Europe/Paris'] }], errors: [{ messageId: 'notAllowed' }] }
  ]
})

// A helper that formats without a zone gives the server's hour on the server and the device's in
// the browser. It is the same bug in `utils/`, in a handler and in the render path.
const util = (code: string) => ({ filename: 'app/utils/format.ts', code })
tsTester.run('date-format-needs-time-zone', dateFormatNeedsTimeZone, {
  valid: [
    util('export const day = (d: Date) => d.toLocaleDateString(\'fr-FR\', { timeZone: \'Europe/Paris\' })'),
    util('const fmt = new Intl.DateTimeFormat(\'fr-FR\', { hour: \'2-digit\', timeZone: \'Europe/Paris\' })'),
    // options in a const of the same file are read
    util('const OPTIONS = { dateStyle: \'long\', timeZone: \'UTC\' } as const\nconst fmt = new Intl.DateTimeFormat(\'fr-FR\', OPTIONS)'),
    // a number has no zone
    util('export const count = (n: number) => n.toLocaleString(\'fr-FR\')'),
    util('export const pct = (n: number) => n.toLocaleString(\'fr-FR\', { style: \'percent\' })'),
    // reading the device's zone is the point
    util('export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone'),
    // options the rule cannot read: a parameter, a spread
    util('export const fmt = (d: Date, options: Intl.DateTimeFormatOptions) => d.toLocaleDateString(\'fr-FR\', options)'),
    util('export const fmt = (d: Date, base: object) => d.toLocaleDateString(\'fr-FR\', { ...base, day: \'numeric\' })'),
    { ...util('const fmt = new Intl.DateTimeFormat(\'fr-FR\', { timeZone: \'UTC\' })'), options: [{ timeZones: ['Europe/Paris', 'UTC'] }] },
    { ...util('const fmt = new Intl.DateTimeFormat(\'fr-FR\', { timeZone: zone })'), options: [{ timeZones: ['Europe/Paris'] }] }
  ],
  invalid: [
    { ...util('export const day = (d: Date) => d.toLocaleDateString(\'fr-FR\')'), errors: [{ messageId: 'missing' }] },
    { ...util('export const time = (d: Date) => d.toLocaleTimeString(\'fr-FR\', { hour: \'2-digit\' })'), errors: [{ messageId: 'missing' }] },
    { ...util('export const at = (v: string) => new Date(v).toLocaleString(\'fr-FR\')'), errors: [{ messageId: 'missing' }] },
    { ...util('export const at = (d: Date) => d.toLocaleString(\'fr-FR\', { day: \'numeric\', hour: \'2-digit\' })'), errors: [{ messageId: 'missing' }] },
    { ...util('const fmt = new Intl.DateTimeFormat(\'fr-FR\', { dateStyle: \'long\' })'), errors: [{ messageId: 'missing' }] },
    { ...util('const fmt = Intl.DateTimeFormat(\'fr-FR\')'), errors: [{ messageId: 'missing' }] },
    { ...util('const OPTIONS = { dateStyle: \'long\' } as const\nconst fmt = new Intl.DateTimeFormat(\'fr-FR\', OPTIONS)'), errors: [{ messageId: 'missing' }] },
    // in a handler too: the browser's zone is not the app's
    { filename: 'app/pages/index.vue', code: 'onMounted(() => { label.value = new Date().toLocaleDateString(\'fr-FR\') })', errors: [{ messageId: 'missing' }] },
    { filename: 'server/utils/prompt.ts', code: 'export const today = () => new Date().toLocaleDateString(\'fr-FR\')', errors: [{ messageId: 'missing' }] },
    { ...util('const fmt = new Intl.DateTimeFormat(\'fr-FR\', { timeZone: \'America/New_York\' })'), options: [{ timeZones: ['Europe/Paris', 'UTC'] }], errors: [{ messageId: 'notAllowed' }] }
  ]
})

vueTester.run('date-format-needs-time-zone (template)', dateFormatNeedsTimeZone, {
  valid: [
    { filename: 'app/pages/index.vue', code: sfc('', '<p>{{ total.toLocaleString(locale) }}</p>') },
    // an attribute cannot hold a <NuxtTime>: a zone is enough
    { filename: 'app/pages/index.vue', code: sfc('', '<button :aria-label="at.toLocaleDateString(locale, { timeZone: \'Europe/Paris\' })">x</button>') }
  ],
  invalid: [
    // template text: <NuxtTime> does it, with or without a zone
    { filename: 'app/pages/index.vue', code: sfc('', '<p>{{ at.toLocaleDateString(locale) }}</p>'), errors: [{ messageId: 'useNuxtTime' }] },
    { filename: 'app/pages/index.vue', code: sfc('', '<p>{{ at.toLocaleTimeString(locale, { timeZone: \'Europe/Paris\' }) }}</p>'), errors: [{ messageId: 'useNuxtTime' }] },
    { filename: 'app/pages/index.vue', code: sfc('', '<button :aria-label="at.toLocaleDateString(locale)">x</button>'), errors: [{ messageId: 'missing' }] },
    { filename: 'app/pages/index.vue', code: sfc('const day = computed(() => at.value.toLocaleDateString(\'fr-FR\'))'), errors: [{ messageId: 'missing' }] }
  ]
})

// "Today", "this week" and "18:00" mean something else on the server (UTC), in Paris and in
// Montreal when the code lets the machine pick the zone.
tsTester.run('no-machine-zone-date', noMachineZoneDate, {
  valid: [
    // instants and durations have no zone
    util('export const age = (d: Date) => Date.now() - d.getTime()'),
    util('export const stamp = () => new Date().toISOString()'),
    util('export const later = (d: Date) => new Date(d.getTime() + 3_600_000)'),
    util('import { addHours, isBefore, differenceInMinutes } from \'date-fns\'\nexport const soon = (d: Date) => isBefore(d, addHours(new Date(), 2))'),
    // the UTC accessors say which zone they read
    util('export const utcHour = (d: Date) => d.getUTCHours()'),
    util('export const midnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))'),
    // an offset or Z makes the string an instant
    util('export const close = new Date(\'2027-03-11T23:59:00+01:00\')'),
    util('export const at = new Date(\'2026-10-12T18:00:00Z\')'),
    util('export const day = new Date(\'2026-10-12\')'),
    // date-fns with the zone named
    util('import { format, startOfDay, isSameDay } from \'date-fns\'\nimport { tz } from \'@date-fns/tz\'\nconst paris = tz(\'Europe/Paris\')\nexport const clock = (d: Date) => format(d, \'HH:mm\', { in: paris })\nexport const start = (d: Date) => startOfDay(d, { in: paris })\nexport const same = (a: Date, b: Date) => isSameDay(a, b, { in: tz(\'Europe/Paris\') })'),
    util('import { format } from \'date-fns\'\nimport { TZDate } from \'@date-fns/tz\'\nexport const clock = (iso: string) => format(new TZDate(iso, \'Europe/Paris\'), \'HH:mm\')'),
    // a local function that only shares the name
    util('const format = (n: number) => String(n)\nexport const label = format(3)'),
    util('import { format } from \'./money\'\nexport const label = format(3)'),
    util('export const first = (s: string) => s.slice(0, 10)')
  ],
  invalid: [
    { ...util('export const hour = (d: Date) => d.getHours()'), errors: [{ messageId: 'localPart' }] },
    { ...util('export const key = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`'), errors: 3 },
    { ...util('export function startOfToday () { const d = new Date(); d.setHours(0, 0, 0, 0); return d }'), errors: [{ messageId: 'localPart' }] },
    { ...util('export const tomorrow = (d: Date) => { d.setDate(d.getDate() + 1) }'), errors: 2 },
    { ...util('export const today = () => new Date().toISOString().slice(0, 10)'), errors: [{ messageId: 'utcCut' }] },
    { ...util('export const today = () => new Date().toISOString().split(\'T\')[0]'), errors: [{ messageId: 'utcCut' }] },
    { ...util('export const clock = (d: Date) => d.toISOString().slice(11, 19)'), errors: [{ messageId: 'utcCut' }] },
    { ...util('export const day = new Date(2026, 9, 12)'), errors: [{ messageId: 'localConstructor' }] },
    { ...util('export const at = new Date(\'2026-10-12T18:00\')'), errors: [{ messageId: 'localParse' }] },
    { ...util('export const toIso = (day: string, time: string) => new Date(`${day}T${time}`).toISOString()'), errors: [{ messageId: 'localParse' }] },
    { ...util('export const midnight = (day: string) => new Date(`${day}T00:00:00`)'), errors: [{ messageId: 'localParse' }] },
    { ...util('import { format } from \'date-fns\'\nexport const clock = (d: Date) => format(d, \'HH:mm\')'), errors: [{ messageId: 'dateFns' }] },
    { ...util('import { format } from \'date-fns\'\nimport { fr } from \'date-fns/locale\'\nexport const day = (d: Date) => format(d, \'EEEE d MMMM\', { locale: fr })'), errors: [{ messageId: 'dateFns' }] },
    { ...util('import { startOfWeek, isSameDay, isToday as today } from \'date-fns\'\nexport const a = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })\nexport const b = (x: Date, y: Date) => isSameDay(x, y)\nexport const c = (d: Date) => today(d)'), errors: 3 },
    { filename: 'server/utils/prompt.ts', code: 'export const today = () => new Date().toISOString().slice(0, 10)', errors: [{ messageId: 'utcCut' }] }
  ]
})

vueTester.run('no-machine-zone-date (template)', noMachineZoneDate, {
  valid: [{ filename: 'app/pages/index.vue', code: sfc('', '<p>{{ at.getTime() }}</p>') }],
  invalid: [
    { filename: 'app/pages/index.vue', code: sfc('', '<p>{{ at.getHours() }}h</p>'), errors: [{ messageId: 'localPart' }] },
    { filename: 'app/pages/index.vue', code: sfc('import { format } from \'date-fns\'', '<p>{{ format(at, \'HH:mm\') }}</p>'), errors: [{ messageId: 'dateFns' }] }
  ]
})

// Setup runs on the server: a top-level browser read throws (500 for every visitor) or mismatches.
tsTester.run('no-browser-api-in-setup (types)', noBrowserApiInSetup, {
  valid: [{ filename: 'app/types/search.ts', code: 'interface Hit { document: { id: string } }\nexport type Doc = Hit[\'document\']' }],
  invalid: [{ filename: 'app/utils/env.ts', code: 'export const isMobile: boolean = window.innerWidth < 768', errors: 1 }]
})

vueTester.run('no-browser-api-in-setup (template)', noBrowserApiInSetup, {
  valid: [{ filename: 'app/components/Hits.vue', code: sfc('const hits = ref([])', '<p v-for="hit in hits">{{ hit.document.title }}</p>') }],
  invalid: [{ filename: 'app/components/Size.vue', code: sfc('const w = window.innerWidth'), errors: 1 }]
})

ruleTester.run('no-browser-api-in-setup', noBrowserApiInSetup, {
  valid: [
    { filename: 'app/pages/index.vue', code: 'onMounted(() => { const w = window.innerWidth })' },
    { filename: 'app/pages/index.vue', code: 'if (import.meta.client) { localStorage.setItem(\'a\', \'1\') }' },
    { filename: 'app/pages/index.vue', code: 'const theme = useCookie(\'theme\')' },
    // a property named like a global is not the global
    { filename: 'app/pages/index.vue', code: 'const title = hit.document.title' },
    { filename: 'app/pages/index.vue', code: 'const hit = { document: { id: 1 } }' },
    // a local that shadows the name
    { filename: 'app/pages/index.vue', code: 'const document = useContent()\nconst title = document.title' },
    // guarded reads
    { filename: 'app/pages/index.vue', code: 'const w = typeof window !== \'undefined\' ? window.innerWidth : 0' },
    { filename: 'app/pages/index.vue', code: 'const lang = import.meta.client && navigator.language' }
  ],
  invalid: [
    { filename: 'app/pages/index.vue', code: 'const w = window.innerWidth', errors: 1 },
    { filename: 'app/pages/index.vue', code: 'const saved = localStorage.getItem(\'a\')', errors: 1 }
  ]
})

// A timer without scope-aware cleanup outlives the component that created it.
ruleTester.run('timer-needs-scope-dispose', timerNeedsScopeDispose, {
  valid: [
    { filename: 'app/composables/usePoll.ts', code: 'const id = setInterval(tick, 1000); tryOnScopeDispose(() => clearInterval(id))' },
    { filename: 'app/composables/useSearch.ts', code: 'const run = useDebounceFn(search, 120)' },
    { filename: 'app/composables/useSearch.ts', code: 'useEventListener(window, \'resize\', onResize)' },
    // a one-shot listener removes itself on the first event
    { filename: 'app/components/Pill.vue', code: 'function press (btn) { btn.addEventListener(\'animationend\', reset, { once: true }) }' },
    // a timer cleared in the same function's finally cannot outlive the call (request timeout)
    { filename: 'app/composables/useUpload.ts', code: 'async function del () { const timer = setTimeout(() => c.abort(), 10000); try { await go() } finally { clearTimeout(timer) } }' }
  ],
  invalid: [
    { filename: 'app/composables/usePoll.ts', code: 'const id = setInterval(tick, 1000)', errors: 1 },
    // clearing the previous handle is a debounce, not a cleanup: the last timer outlives the component
    { filename: 'app/pages/index.vue', code: 'let t; watch(q, () => { clearTimeout(t); t = setTimeout(run, 120) })', errors: 1 },
    // a finally in another function does not bound this timer
    { filename: 'app/composables/useUpload.ts', code: 'function start () { const timer = setTimeout(run, 10) }\nfunction stop () { try { x() } finally { clearTimeout(timer) } }', errors: 1 },
    { filename: 'app/components/Flash.vue', code: 'el.addEventListener(\'click\', onClick, { once: false })', errors: 1 }
  ]
})

// Under SSR a module is one instance per process: reactive singletons are cross-request state.
ruleTester.run('no-module-mutable-state', noModuleMutableState, {
  valid: [
    // an immutable cache written once is fine - this is the harness's own dataset pattern
    { filename: 'server/utils/rome.ts', code: 'let rows = null\nexport function get () { if (!rows) rows = load(); return rows }' },
    // a client-side lazy cache: every write is behind import.meta.client
    { filename: 'app/composables/useClient.ts', code: 'let client = null\nexport function use () { if (import.meta.client) { if (!client) client = make(); client.catch(() => { client = null }) } return client }' }
  ],
  invalid: [
    { filename: 'app/composables/useFilters.ts', code: 'export const filters = ref({ q: \'\' })', errors: 1 },
    // a computed derives from the singleton: one singleton, one finding
    { filename: 'app/composables/useRuns.ts', code: 'const runs = ref([])\nconst active = computed(() => runs.value.filter(Boolean))\nconst busy = computed(() => active.value.length > 0)', errors: 1 },
    { filename: 'server/utils/session.ts', code: 'let user = null\nfunction setUser (u) { user = u }\nfunction clear () { user = null }', errors: 1 }
  ]
})

// A <script setup> body is setup scope (one per instance), not module scope.
vueTester.run('no-module-mutable-state (sfc skipped)', noModuleMutableState, {
  valid: [{ filename: 'app/pages/index.vue', code: sfc('const q = ref(\'\'); const total = computed(() => q.value.length)') }],
  invalid: []
})
