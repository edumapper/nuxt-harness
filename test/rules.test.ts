import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import vueParser from 'vue-eslint-parser'

import clientFileNeedsReason from '../src/rules/client-file-needs-reason.js'
import clientOnlyNeedsReason from '../src/rules/client-only-needs-reason.js'
import linkNeedsLocalePath from '../src/rules/link-needs-locale-path.js'
import maxBooleanProps from '../src/rules/max-boolean-props.js'
import maxConditionOperands from '../src/rules/max-condition-operands.js'
import maxWatchers from '../src/rules/max-watchers.js'
import noAuthGateOutsideMiddleware from '../src/rules/no-auth-gate-outside-middleware.js'
import noBareNavigate from '../src/rules/no-bare-navigate.js'
import noContextAfterAwait from '../src/rules/no-context-after-await.js'
import noRawRequestInput from '../src/rules/no-raw-request-input.js'
import noDataCallsInOperator from '../src/rules/no-data-calls-in-operator.js'
import noHardcodedColor from '../src/rules/no-hardcoded-color.js'
import noNestedBorderBox from '../src/rules/no-nested-border-box.js'
import noOffPaletteColorClass from '../src/rules/no-off-palette-color-class.js'
import noPresenterInPage from '../src/rules/no-presenter-in-page.js'
import noProvideInject from '../src/rules/no-provide-inject.js'
import noSmartCallsInPresenter from '../src/rules/no-smart-calls-in-presenter.js'

// RuleTester drives vitest's own describe/it so each case is a reported test.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

// The rules visit CallExpression nodes only, so the SFC <script setup> body is tested as plain
// module code (vue-eslint-parser yields the same Program for it in real lint runs).
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' }
})

// Presenters receive data via props: query primitives and the app's data-layer composables give
// them hidden data access that bypasses the Orchestrator → Operator → props flow.
ruleTester.run('no-smart-calls-in-presenter', noSmartCallsInPresenter, {
  valid: [
    // app composables are unknown to the harness until the app lists them
    { filename: 'PostTile.vue', code: 'const { data } = useApiQuery(key)' }
  ],
  invalid: [
    { filename: 'PostTile.vue', code: 'const { data } = useQuery({ key: [\'x\'], query: load })', errors: 1 },
    { filename: 'PostTile.vue', code: 'const cart = useCartStore(); const r = useRouter()', errors: 2 },
    { filename: 'PostTile.vue', code: 'const { data } = useApiQuery(key)', options: [{ dataComposables: ['useApiQuery'] }], errors: 1 }
  ]
})

// Operators wire Presenters; raw data primitives there bypass the shared cache.
ruleTester.run('no-data-calls-in-operator', noDataCallsInOperator, {
  valid: [],
  invalid: [
    { filename: 'OpFeedbackModal.vue', code: 'await $fetch(\'/api/feedback\', { method: \'POST\' })', errors: 1 },
    { filename: 'OpX.vue', code: 'const res = await $fetch.raw(\'/api/x\')', errors: 1 }
  ]
})

// Real SFC parsing: template rules only run through vue-eslint-parser's template visitor.
const vueTester = new RuleTester({
  languageOptions: { parser: vueParser, parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' } }
})

const sfc = (template: string, script = '') => `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  ${template}\n</template>\n`

// These three rules registered top-level VElement/VAttribute visitors, which ESLint never calls for
// SFC templates — they passed every file for months. Each invalid case guards against that regression.
vueTester.run('no-presenter-in-page', noPresenterInPage, {
  valid: [
    // Pages assemble Orchestrators/Operators; NuxtUI atoms and Nuxt built-ins are treated like HTML.
    { filename: 'app/pages/x.vue', code: sfc('<div><OrcProductList /><OpFilters /><UButton label="a" /><NuxtLinkLocale to="/" /></div>') },
    // Nuxt names: lazy prefix, directory prefix (components/shop/OrcCart.vue), kebab-case tags
    { filename: 'app/pages/x.vue', code: sfc('<div><LazyOrcProductList /><ShopOrcCart /><orc-product-list /><shop-op-filters /></div>') }
  ],
  invalid: [
    { filename: 'app/pages/x.vue', code: sfc('<div><ComingSoon /></div>'), errors: 1 },
    // `Op` inside a word is not a layer prefix
    { filename: 'app/pages/x.vue', code: sfc('<div><ShopItem /><DropdownOptions /></div>'), errors: 2 }
  ]
})

// The harness ships no palette: the app lists the palettes it allows.
const palettes = [{ palettes: ['zinc', 'blue', 'brand'] }]
vueTester.run('no-off-palette-color-class', noOffPaletteColorClass, {
  valid: [
    // no palette configured: nothing to enforce
    { filename: 'app/components/X.vue', code: sfc('<div class="text-gray-500" />') },
    { filename: 'app/components/X.vue', code: sfc('<div class="text-zinc-500 hover:bg-blue-500/50 bg-brand-100" />'), options: palettes },
    // custom palettes and non-color utilities never match a built-in palette
    { filename: 'app/components/X.vue', code: sfc('<div class="bg-accent-pink-100 text-sm rounded-lg" />'), options: palettes }
  ],
  invalid: [
    { filename: 'app/components/X.vue', code: sfc('<div class="text-neutral-500" />'), options: palettes, errors: 1 },
    { filename: 'app/components/X.vue', code: sfc('<div class="dark:hover:bg-sky-500 !border-t-gray-200" />'), options: palettes, errors: 2 }
  ]
})

vueTester.run('no-nested-border-box', noNestedBorderBox, {
  valid: [
    { filename: 'app/components/X.vue', code: sfc('<div class="border rounded-lg"><div class="border-b" /></div>') },
    { filename: 'app/components/X.vue', code: sfc('<UCard><div class="border rounded" /></UCard>'), options: [{ surfaceComponents: ['AppPanel'] }] }
  ],
  invalid: [
    { filename: 'app/components/X.vue', code: sfc('<UCard><div class="border rounded" /></UCard>'), errors: 1 },
    { filename: 'app/components/X.vue', code: sfc('<AppPanel><div class="border rounded" /></AppPanel>'), options: [{ surfaceComponents: ['AppPanel'] }], errors: 1 }
  ]
})

vueTester.run('no-hardcoded-color', noHardcodedColor, {
  valid: [{ filename: 'app/components/X.vue', code: sfc('<div class="text-zinc-500" />') }],
  invalid: [
    { filename: 'app/components/X.vue', code: sfc('<div style="color: #ff0000" />'), errors: 1 },
    { filename: 'app/components/X.vue', code: sfc('<div />', 'const c = \'#ff0000\''), errors: 1 }
  ]
})

// Three flags encode eight states, most illegal — a discriminated union keeps them unrepresentable.
vueTester.run('max-boolean-props', maxBooleanProps, {
  valid: [
    { filename: 'X.vue', code: sfc('<div />', 'defineProps<{ open: boolean, saving: boolean, status: \'idle\' | \'error\' }>()') }
  ],
  invalid: [
    { filename: 'X.vue', code: sfc('<div />', 'defineProps<{ a: boolean, b?: boolean, c: boolean | undefined }>()'), errors: 1 },
    // Interface declared after the call still counts — the rule resolves names at Program:exit.
    { filename: 'X.vue', code: sfc('<div />', 'withDefaults(defineProps<Props>(), {})\ninterface Props { a: boolean, b: boolean, c: boolean }'), errors: 1 }
  ]
})

// Guards: a compound condition has a meaning that deserves a name (canSubmit, submitBlock).
vueTester.run('max-condition-operands', maxConditionOperands, {
  valid: [
    { filename: 'X.vue', code: sfc('<button v-if="open && canSubmit" />', 'if (!canSubmit.value || busy) return') },
    // `??` is a value fallback, not a condition
    { filename: 'X.vue', code: sfc('<div />', 'if ((a ?? b) && c) go()') }
  ],
  invalid: [
    { filename: 'X.vue', code: sfc('<div />', 'if (props.publishing || submitting.value || !editDirty.value) return'), errors: 1 },
    // right-nested trees count too — a left-only selector would miss this one
    { filename: 'X.vue', code: sfc('<div />', 'if (a || (b && c)) go()'), errors: 1 },
    { filename: 'X.vue', code: sfc('<p v-if="a && b && !c" /><p v-show="x || y || z" />'), errors: 2 }
  ]
})

// Watchers are hidden control flow — past the budget, derive (computed) or act in the handler.
ruleTester.run('max-watchers', maxWatchers, {
  valid: [{ code: 'watch(a, f); watchEffect(g); watchDebounced(h, i)' }],
  invalid: [{ code: 'watch(a, f); watch(b, f); watchEffect(g); whenever(c, h)', errors: 1 }]
})

// provide/inject is an invisible dependency; Nuxt plugin `provide` (a typed global) stays allowed.
ruleTester.run('no-provide-inject', noProvideInject, {
  valid: [{ code: 'nuxtApp.provide(\'x\', 1); export default defineNuxtPlugin(() => ({ provide: { x: 1 } }))' }],
  invalid: [
    { code: 'provide(KEY, value)', errors: 1 },
    { code: 'const v = inject(KEY)', errors: 1 },
    { code: 'nuxtApp.vueApp.provide(KEY, value)', errors: 1 }
  ]
})

// Access policy lives in middleware: a component that checks the user and redirects is a scattered gate.
ruleTester.run('no-auth-gate-outside-middleware', noAuthGateOutsideMiddleware, {
  valid: [
    // reading the user for display is fine
    { code: 'const { user } = useUserSession(); const email = computed(() => user.value?.email)' },
    // redirects unrelated to auth are fine
    { code: 'if (saved) await navigateTo(next)' },
    // composables outside the configured list are not auth state
    { code: 'const session = useUserSession()\nif (!session.loggedIn.value) await navigateTo(login)', options: [{ composables: ['useMyAuth'] }] }
  ],
  invalid: [
    { code: 'const session = useUserSession()\nif (!session.loggedIn.value) await navigateTo(login)', errors: 1 },
    { code: 'watch(useSupabaseSession(), s => { if (!useSupabaseSession().value) navigateTo(home) })', errors: 1 },
    { code: 'const me = useMyAuth()\nif (!me.value) await navigateTo(login)', options: [{ composables: ['useMyAuth'] }], errors: 1 }
  ]
})

// navigateTo: await/return by default; a deliberate fire-and-forget must say why.
ruleTester.run('no-bare-navigate', noBareNavigate, {
  valid: [
    { code: 'async function f() { await navigateTo(x) }' },
    { code: 'function m() { return navigateTo(x) }' },
    { code: 'const go = () => navigateTo(x)' },
    { code: 'function f() { return Promise.resolve(navigateTo(x)) }' },
    { code: 'function f() {\n  // not awaited: the drawer closes immediately, navigation continues in the background\n  void navigateTo(x)\n}' },
    { code: 'function f() {\n  navigateTo(x) // fire-and-forget: unmounting this component cancels nothing\n}' }
  ],
  invalid: [
    { code: 'function f() { navigateTo(x) }', errors: 1 },
    { code: 'function f() { void navigateTo(x) }', errors: 1 },
    { code: 'function f() { navigateTo(x).then(done) }', errors: 1 },
    { code: 'router.push(x)', errors: 1 }
  ]
})

// Dropping SSR must be a written decision, not a reflex to silence a hydration warning.
vueTester.run('client-only-needs-reason', clientOnlyNeedsReason, {
  valid: [
    { filename: 'X.vue', code: sfc('<div>\n    <!-- ClientOnly: vaul drawer touches document on setup -->\n    <ClientOnly><Drawer /></ClientOnly>\n  </div>') }
  ],
  invalid: [
    { filename: 'X.vue', code: sfc('<div><ClientOnly><Drawer /></ClientOnly></div>'), errors: 1 },
    // a comment separated by other markup does not explain this element
    { filename: 'X.vue', code: sfc('<div>\n    <!-- ClientOnly: vaul drawer touches document -->\n    <span />\n    <ClientOnly><Drawer /></ClientOnly>\n  </div>'), errors: 1 },
    // a token comment is not an explanation
    { filename: 'X.vue', code: sfc('<div>\n    <!-- client only -->\n    <client-only><Drawer /></client-only>\n  </div>'), errors: 1 },
    // a section label says what, not why
    { filename: 'X.vue', code: sfc('<div>\n    <!-- Bookmark and Avatar (only shown when logged in) -->\n    <ClientOnly><Drawer /></ClientOnly>\n  </div>'), errors: 1 },
    // the prefix alone is not a reason
    { filename: 'X.vue', code: sfc('<div>\n    <!-- ClientOnly: drawer -->\n    <ClientOnly><Drawer /></ClientOnly>\n  </div>'), errors: 1 }
  ]
})

// A .client file drops SSR for everything in it: it opens with the same written reason.
const editor = '<template>\n  <div ref="el" />\n</template>\n'
vueTester.run('client-file-needs-reason (vue)', clientFileNeedsReason, {
  valid: [
    { filename: 'app/components/RichTextEditor.client.vue', code: `<!-- ClientOnly: TipTap needs the DOM, the editor only exists in the browser -->\n${editor}` },
    // a .client file is the only one concerned
    { filename: 'app/components/RichTextEditor.vue', code: editor }
  ],
  invalid: [
    { filename: 'app/components/RichTextEditor.client.vue', code: editor, errors: [{ messageId: 'missingReason' }] },
    // a description of the component is not the reason it skips SSR
    { filename: 'app/components/StickerPeel.client.vue', code: `<!-- Full-viewport transparent WebGL canvas that renders stickers -->\n${editor}`, errors: 1 },
    // the reason belongs at the top, not inside the template
    { filename: 'app/components/RichTextEditor.client.vue', code: '<template>\n  <!-- ClientOnly: TipTap needs the DOM in the browser -->\n  <div />\n</template>\n', errors: 1 }
  ]
})

ruleTester.run('client-file-needs-reason (script)', clientFileNeedsReason, {
  valid: [
    { filename: 'app/plugins/unload-guard.client.ts', code: '// ClientOnly: beforeunload only exists in the browser,\n// and uploads only run there.\nexport default defineNuxtPlugin(() => {})' },
    { filename: 'app/plugins/unload-guard.client.ts', code: '/**\n * ClientOnly: warns before a reload while an upload runs in this tab.\n */\nexport default defineNuxtPlugin(() => {})' },
    // after the imports is where a script's header usually sits
    { filename: 'app/plugins/unload-guard.client.ts', code: 'import { guard } from \'~/utils/guard\'\n\n// ClientOnly: beforeunload only fires in a browser tab\nexport default defineNuxtPlugin(() => guard())' }
  ],
  invalid: [
    { filename: 'app/plugins/unload-guard.client.ts', code: 'export default defineNuxtPlugin(() => {})', errors: 1 },
    // a comment after the first statement is not the file's header
    { filename: 'app/plugins/unload-guard.client.ts', code: 'export default defineNuxtPlugin(() => {})\n// ClientOnly: beforeunload only exists in the browser', errors: 1 }
  ]
})

// On the server the Nuxt/Vue context is per request, and an await ends it. Only code that runs
// during SSR is checked: a composable body, a useAsyncData / callOnce handler, a Colada query.
ruleTester.run('no-context-after-await', noContextAfterAwait, {
  valid: [
    // context read before the first await, kept for later
    { filename: 'app/composables/useProgram.ts', code: 'export async function useProgram () { const config = useRuntimeConfig(); const data = await load(); return { data, config } }' },
    // calls inside the awaited expression run before the function suspends
    { filename: 'app/composables/useLists.ts', code: 'export async function useLists () { const [a, b] = await Promise.all([useFetch(\'/a\'), useFetch(\'/b\')]); return { a, b } }' },
    // an action a composable returns runs on a user event in the browser, where the context stays set
    { filename: 'app/composables/useLogout.ts', code: 'export function useLogout () { return async () => { await signOut(); await navigateTo(\'/\') } }' },
    // runWithContext restores it
    { filename: 'app/composables/useClient.ts', code: 'export async function useClient () { const nuxtApp = useNuxtApp(); await load(); return nuxtApp.runWithContext(() => useRuntimeConfig()) }' },
    // Nuxt rewrites the awaits of plugins, middleware and <script setup>
    { filename: 'app/plugins/init.ts', code: 'export default defineNuxtPlugin(async () => { await load(); useState(\'x\') })' },
    { filename: 'app/components/Card.vue', code: 'const data = await load(); const route = useRoute()' }
  ],
  invalid: [
    { filename: 'app/composables/useProgram.ts', code: 'export async function useProgram () { const data = await load(); const config = useRuntimeConfig(); return { data, config } }', errors: [{ messageId: 'afterAwait' }] },
    { filename: 'app/composables/useProgram.ts', code: 'export const useProgram = async () => { await load(); return useI18n() }', errors: 1 },
    { filename: 'app/composables/useStats.ts', code: 'useAsyncData(\'stats\', async () => { const raw = await $fetch(\'/api\'); return useState(\'s\', () => raw) })', errors: 1 },
    { filename: 'app/composables/useStats.ts', code: 'const q = useQuery({ key: [\'s\'], query: async () => { await tick(); return useRoute().params.id } })', errors: 1 },
    // the app's data-layer wrappers need the context too
    { filename: 'app/composables/useProgram.ts', code: 'export async function useProgram () { await load(); return useApiQuery(\'/p\') }', options: [{ composables: ['useApiQuery'] }], errors: 1 }
  ]
})

// A literal path skips the i18n locale prefix; <NuxtLinkLocale> and localePath() do not.
vueTester.run('link-needs-locale-path', linkNeedsLocalePath, {
  valid: [
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLink :to="localePath(\'/\')">Home</NuxtLink>') },
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLinkLocale to="/about">About</NuxtLinkLocale>') },
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLink to="https://edumapper.com">Site</NuxtLink>') },
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLink :to="item.to">x</NuxtLink>') }
  ],
  invalid: [
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLink to="/" class="logo">Home</NuxtLink>'), errors: [{ messageId: 'literalPath' }] },
    { filename: 'app/components/Header.vue', code: sfc('<NuxtLink :to="\'/about\'">About</NuxtLink>'), errors: 1 },
    { filename: 'app/components/Header.vue', code: sfc('<nuxt-link :to="`/programs/${id}`">x</nuxt-link>'), errors: 1 }
  ]
})

// Request input reaches server code only through a schema. The rule reads the structure: a raw
// value stored in a variable is unvalidated, however close the next .parse( is.
ruleTester.run('no-raw-request-input', noRawRequestInput, {
  valid: [
    { filename: 'server/api/a.post.ts', code: 'const body = await readValidatedBody(event, schema.parse)' },
    { filename: 'server/api/a.get.ts', code: 'const query = await getValidatedQuery(event, schema)' },
    { filename: 'server/api/a/[id].get.ts', code: 'const { id } = await getValidatedRouterParams(event, params.parse)' },
    // straight into a schema: the raw value never exists
    { filename: 'server/api/a.post.ts', code: 'const parsed = schema.safeParse(await readBody(event))' },
    { filename: 'server/api/a.get.ts', code: 'const query = v.parse(querySchema, getQuery(event))' },
    { filename: 'server/utils/ids.ts', code: 'export const id = event => z.uuid().safeParse(getRouterParam(event, \'id\'))' },
    // the app's reader: its own body reads the request, its call sites go through a schema
    { filename: 'server/utils/read-json-body.ts', code: 'export async function readJsonBody (event) { return readBody(event) }', options: [{ readers: ['readJsonBody'] }] },
    { filename: 'server/api/a.post.ts', code: 'const parsed = schema.safeParse(await readJsonBody(event))', options: [{ readers: ['readJsonBody'] }] },
    // ufo's getQuery parses a URL the app built
    { filename: 'server/utils/links.ts', code: 'import { getQuery } from \'ufo\'\nconst params = getQuery(link.href)' },
    // no validated form exists for these
    { filename: 'server/api/webhook.post.ts', code: 'const raw = await readRawBody(event)' }
  ],
  invalid: [
    { filename: 'server/api/a.post.ts', code: 'const body = await readBody(event)\nawait save(schema.parse(body))', errors: [{ messageId: 'raw' }] },
    // the probe cases the line heuristic got wrong
    { filename: 'server/api/a.post.ts', code: 'const body = JSON.parse(await readBody(event))', errors: 1 },
    { filename: 'server/api/a.get.ts', code: 'const query = getQuery(event)\nawait db.delete(query.id)\nconst parsed = schema.parse(query)', errors: 1 },
    { filename: 'server/api/a/[id].get.ts', code: 'const id = getRouterParam(event, \'id\')', errors: 1 },
    { filename: 'server/api/a.get.ts', code: 'import { getQuery } from \'h3\'\nconst q = getQuery(event)', errors: 1 },
    { filename: 'server/api/a.post.ts', code: 'const body = await readJsonBody(event)', options: [{ readers: ['readJsonBody'] }], errors: 1 }
  ]
})
