import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import vueParser from 'vue-eslint-parser'

import maxBooleanProps from '../src/rules/max-boolean-props.js'
import noDataCallsInOperator from '../src/rules/no-data-calls-in-operator.js'
import noHardcodedColor from '../src/rules/no-hardcoded-color.js'
import noOffPaletteColorClass from '../src/rules/no-off-palette-color-class.js'
import noPresenterInPage from '../src/rules/no-presenter-in-page.js'
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
