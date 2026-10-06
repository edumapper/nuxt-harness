import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import vueParser from 'vue-eslint-parser'

import clientOnlyNeedsReason from '../src/rules/client-only-needs-reason.js'
import maxBooleanProps from '../src/rules/max-boolean-props.js'
import maxConditionOperands from '../src/rules/max-condition-operands.js'
import maxWatchers from '../src/rules/max-watchers.js'
import noAuthGateOutsideMiddleware from '../src/rules/no-auth-gate-outside-middleware.js'
import noBareNavigate from '../src/rules/no-bare-navigate.js'
import noDataCallsInOperator from '../src/rules/no-data-calls-in-operator.js'
import noHardcodedColor from '../src/rules/no-hardcoded-color.js'
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

// Presenters receive data via props: Colada and app data-layer calls give them hidden data access
// that bypasses the Orchestrator → Operator → props flow.
ruleTester.run('no-smart-calls-in-presenter', noSmartCallsInPresenter, {
  valid: [],
  invalid: [
    { filename: 'PostTile.vue', code: 'const { data } = useApiQuery({ key: () => [\'x\'], url: () => \'/api/x\' })', errors: 1 }
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
    { filename: 'app/pages/x.vue', code: sfc('<div><OrcSchoolList /><OpFilters /><UButton label="a" /><NuxtLinkLocale to="/" /></div>') }
  ],
  invalid: [
    { filename: 'app/pages/x.vue', code: sfc('<div><ComingSoon /></div>'), errors: 1 }
  ]
})

vueTester.run('no-off-palette-color-class', noOffPaletteColorClass, {
  valid: [{ filename: 'app/components/X.vue', code: sfc('<div class="text-zinc-500 bg-accent-pink-100" />') }],
  // Tailwind defaults bypass the design-system palette (use zinc, not neutral/gray).
  invalid: [{ filename: 'app/components/X.vue', code: sfc('<div class="text-neutral-500" />'), errors: 1 }]
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
    { code: 'const user = useSupabaseUser(); const email = computed(() => user.value?.email)' },
    // redirects unrelated to auth are fine
    { code: 'if (saved) await navigateTo(next)' }
  ],
  invalid: [
    { code: 'const user = useSupabaseUser()\nif (!user.value) await navigateTo(login)', errors: 1 },
    { code: 'watch(useSupabaseSession(), s => { if (!useSupabaseSession().value) navigateTo(home) })', errors: 1 }
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
    { filename: 'X.vue', code: sfc('<div>\n    <!-- client only -->\n    <client-only><Drawer /></client-only>\n  </div>'), errors: 1 }
  ]
})
