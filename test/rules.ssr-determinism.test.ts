import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import vueParser from 'vue-eslint-parser'

import asyncDataNeedsKey from '../src/rules/async-data-needs-key.js'
import noBrowserApiInSetup from '../src/rules/no-browser-api-in-setup.js'
import noLocaleFormatInRender from '../src/rules/no-locale-format-in-render.js'
import noModuleMutableState from '../src/rules/no-module-mutable-state.js'
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
    // a date pinned to a zone is the same on both sides
    { filename: 'app/pages/index.vue', code: 'const day = computed(() => d.toLocaleDateString(\'fr-FR\', { timeZone: \'Europe/Paris\' }))' },
    // after mount: browser only
    { filename: 'app/pages/index.vue', code: 'onMounted(() => { label.value = new Date().toLocaleDateString() })' }
  ],
  invalid: [
    { filename: 'app/pages/index.vue', code: 'const label = total.value.toLocaleString()', errors: [{ messageId: 'noLocale' }] },
    { filename: 'app/pages/index.vue', code: 'const day = computed(() => new Date(at).toLocaleDateString(\'fr-FR\'))', errors: [{ messageId: 'noTimeZone' }] },
    { filename: 'app/pages/index.vue', code: 'const at = computed(() => d.toLocaleString(\'fr-FR\', { day: \'numeric\', hour: \'2-digit\' }))', errors: [{ messageId: 'noTimeZone' }] },
    { filename: 'app/pages/index.vue', code: 'const fmt = new Intl.DateTimeFormat(locale.value, { dateStyle: \'long\' })', errors: [{ messageId: 'noTimeZone' }] }
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
