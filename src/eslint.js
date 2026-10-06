// @ts-check
/**
 * @edumapper/nuxt-harness — ESLint flat config.
 *
 * Two entry points:
 *   - `harness()`        rule blocks only. Spread into `withNuxt(...)` — the
 *                        Nuxt config already registers the `vue` and
 *                        `@typescript-eslint` plugins, so they are not redefined here.
 *   - `standalone()`     parsers + plugins + `harness()`. Used by `nuxt-harness fast`,
 *                        which lints without `.nuxt/` or the app's node_modules.
 *   - `typeAware()`      rules that need the TypeScript program. Full gate only:
 *                        they need `nuxt prepare` (auto-import types) to be meaningful.
 */
import clientOnlyNeedsReason from './rules/client-only-needs-reason.js'
import maxBooleanProps from './rules/max-boolean-props.js'
import maxConditionOperands from './rules/max-condition-operands.js'
import maxWatchers from './rules/max-watchers.js'
import noAuthGateOutsideMiddleware from './rules/no-auth-gate-outside-middleware.js'
import noBareNavigate from './rules/no-bare-navigate.js'
import noDataCallsInOperator from './rules/no-data-calls-in-operator.js'
import noFigmaAssetUrl from './rules/no-figma-asset-url.js'
import noHardcodedColor from './rules/no-hardcoded-color.js'
import noNestedBorderBox from './rules/no-nested-border-box.js'
import noOffPaletteColorClass from './rules/no-off-palette-color-class.js'
import noPresenterInPage from './rules/no-presenter-in-page.js'
import noProvideInject from './rules/no-provide-inject.js'
import noReverseLayerImport from './rules/no-reverse-layer-import.js'
import noServerUiImport from './rules/no-server-ui-import.js'
import noSmartCallsInPresenter from './rules/no-smart-calls-in-presenter.js'

// ESLint flat config requires plugin objects to be referentially identical
// across config blocks — every block shares this instance.
export const arch = {
  meta: { name: '@edumapper/nuxt-harness' },
  rules: {
    'client-only-needs-reason': clientOnlyNeedsReason,
    'max-boolean-props': maxBooleanProps,
    'max-condition-operands': maxConditionOperands,
    'max-watchers': maxWatchers,
    'no-auth-gate-outside-middleware': noAuthGateOutsideMiddleware,
    'no-bare-navigate': noBareNavigate,
    'no-data-calls-in-operator': noDataCallsInOperator,
    'no-figma-asset-url': noFigmaAssetUrl,
    'no-hardcoded-color': noHardcodedColor,
    'no-nested-border-box': noNestedBorderBox,
    'no-off-palette-color-class': noOffPaletteColorClass,
    'no-presenter-in-page': noPresenterInPage,
    'no-provide-inject': noProvideInject,
    'no-smart-calls': noSmartCallsInPresenter,
    'no-server-ui-import': noServerUiImport,
    'no-reverse-layer': noReverseLayerImport
  }
}

/** Nuxt source globs the harness owns. */
export const SOURCE_FILES = ['app/**/*.{vue,ts,js}', 'server/**/*.{ts,js}', 'shared/**/*.{ts,js}', 'modules/**/*.{vue,ts,js}']

/** Layer-locality boundaries: which top-level dirs may import which. */
const EVENT_BUS = {
  paths: ['mitt', 'tiny-emitter', 'eventemitter3', 'events'].map(name => ({
    name,
    message: '❌ Event bus. 💡 Hidden, untyped coupling across the tree. 🛠 Props down / emits up, or a composable with shared state.'
  }))
}

/** @param {{ group: string[], message: string }[]} patterns */
function restrictedImports(patterns) {
  return ['error', {
    ...EVENT_BUS,
    patterns: patterns.map(p => ({ ...p, allowTypeImports: true }))
  }]
}

const NAVIGATE_LITERAL = {
  selector: 'CallExpression[callee.name=\'navigateTo\'] > Literal.arguments:first-child[value=/^\\//]',
  message: '❌ navigateTo(\'/…\') string path. 💡 Bypasses i18n prefixes and typed routes. 🛠 navigateTo(localePath({ name: \'…\' })).'
}
const NAVIGATE_TEMPLATE = {
  selector: 'CallExpression[callee.name=\'navigateTo\'] > TemplateLiteral.arguments:first-child[quasis.0.value.raw=/^\\//]',
  message: NAVIGATE_LITERAL.message
}

/** Rule blocks — no parser/plugin definitions besides `arch`. */
export function harness() {
  return [
    // ── Control flow & complexity ────────────────────────────────────────────
    {
      name: 'nuxt-harness/base',
      files: SOURCE_FILES,
      plugins: { arch },
      rules: {
        // A control-flow statement in finally silently discards the in-flight throw/return.
        'no-unsafe-finally': 'error',
        // `catch (e) {}` swallows errors — re-throw, log, or comment why silence is intended.
        'no-empty': ['error', { allowEmptyCatch: false }],
        // Cyclomatic complexity: the C in CRAP. Above this, split the function.
        'complexity': ['error', 20],
        // Long positional parameter lists are the cheapest SRP smell to detect.
        'max-params': ['error', 4],
        '@typescript-eslint/no-explicit-any': 'error',
        'arch/no-figma-asset-url': 'error',
        // ── Guards: early return for real states, named compound conditions ──
        // Exit early instead of else/else-if after a return.
        'no-else-return': ['error', { allowElseIf: false }],
        // Deep nesting is the shape of missing early returns.
        'max-depth': ['error', 2],
        // A guard with 3+ operands has a meaning — name it (computed / function).
        'arch/max-condition-operands': 'error'
      }
    },
    {
      // Test helpers mirror the signatures they exercise; table-driven tests branch on purpose.
      name: 'nuxt-harness/tests',
      files: ['**/*.{test,spec}.{ts,js}'],
      rules: { 'complexity': 'off', 'max-params': 'off' }
    },

    // ── Vue: type-based contracts ────────────────────────────────────────────
    {
      name: 'nuxt-harness/vue-contracts',
      files: ['app/**/*.vue', 'modules/**/*.vue'],
      rules: {
        'vue/define-props-declaration': ['error', 'type-based'],
        'vue/define-emits-declaration': ['error', 'type-based'],
        'vue/require-typed-ref': 'error',
        'vue/no-setup-props-reactivity-loss': 'error',
        // Dropping SSR must be a written decision, not a hydration-warning silencer.
        'arch/client-only-needs-reason': 'error'
      }
    },

    // ── Design system (app only — modules/design-system showcases raw values) ─
    {
      name: 'nuxt-harness/design-system',
      files: ['app/**/*.vue'],
      rules: {
        'arch/no-hardcoded-color': 'error',
        'arch/no-off-palette-color-class': 'error',
        'arch/no-nested-border-box': 'warn'
      }
    },

    // ── Locality: import boundaries between app / server / shared ────────────
    {
      name: 'nuxt-harness/locality-app',
      files: ['app/**/*.{vue,ts,js}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': restrictedImports([{
          group: ['~~/server/**', '!~~/server/utils/validators/**'],
          message: '❌ app/ imports server code. 💡 Server modules pull DB/secrets into the client bundle. 🛠 Import the Zod schema from ~~/server/utils/validators/ or a type from #shared.'
        }]),
        'no-restricted-syntax': ['error', NAVIGATE_LITERAL, NAVIGATE_TEMPLATE],
        'arch/no-bare-navigate': 'error',
        // Untyped, invisible dependencies — props down or a shared composable instead.
        'arch/no-provide-inject': 'error',
        // Watchers are hidden control flow; most are a computed or an event handler.
        'arch/max-watchers': 'error'
      }
    },
    {
      name: 'nuxt-harness/locality-ui',
      files: ['app/components/**/*.vue', 'app/pages/**/*.vue', 'app/layouts/**/*.vue'],
      rules: {
        // Access policy lives in app/middleware, not in what it protects.
        'arch/no-auth-gate-outside-middleware': 'error'
      }
    },
    {
      name: 'nuxt-harness/locality-server',
      files: ['server/**/*.{ts,js}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': restrictedImports([{
          group: ['~/**', '@/**', '~~/app/**', '#app', '#components'],
          message: '❌ server/ imports app code. 💡 Couples the Worker bundle to the Vue runtime. 🛠 Move the logic to shared/ or server/utils/.'
        }]),
        'arch/no-server-ui-import': 'error'
      }
    },
    {
      name: 'nuxt-harness/locality-shared',
      files: ['shared/**/*.{ts,js}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': restrictedImports([{
          group: ['~/**', '@/**', '~~/app/**', '~~/server/**', '#app', '#components'],
          message: '❌ shared/ imports app or server code. 💡 shared/ must stay isomorphic and dependency-free. 🛠 Move the code into shared/ or invert the dependency.'
        }])
      }
    },

    // ── Architecture: the 5-layer model (R0–R4) ──────────────────────────────
    {
      name: 'nuxt-harness/layer-pages',
      files: ['app/pages/**/*.vue'],
      rules: { 'arch/no-presenter-in-page': 'error' }
    },
    {
      name: 'nuxt-harness/layer-presenters',
      files: ['app/components/**/*.vue'],
      ignores: ['app/components/**/Orc*.vue', 'app/components/**/Op*.vue'],
      rules: {
        'arch/no-smart-calls': 'error',
        'arch/no-reverse-layer': 'error'
      }
    },
    {
      name: 'nuxt-harness/layer-operators',
      files: ['app/components/**/Op*.vue'],
      rules: {
        'arch/no-reverse-layer': 'error',
        'arch/no-data-calls-in-operator': 'error'
      }
    },
    {
      name: 'nuxt-harness/illegal-states',
      files: ['app/components/**/*.vue'],
      rules: { 'arch/max-boolean-props': 'error' }
    }
  ]
}

/** Rules that need type information (`parserOptions.projectService`). Full gate only. */
export function typeAware(tsconfigRootDir = process.cwd()) {
  return [{
    name: 'nuxt-harness/type-aware',
    files: ['app/**/*.{vue,ts}', 'server/**/*.ts', 'shared/**/*.ts'],
    // Nuxt's root tsconfig is solution-style (references into .nuxt/); the project
    // service resolves each file to the referenced project that owns it.
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
    rules: {
      // Adding a union member must break every switch that forgot it.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      // A condition the types prove constant is either dead code or a lying type.
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      // A cast the types already satisfy hides the real type from the next reader.
      '@typescript-eslint/no-unnecessary-type-assertion': 'error'
    }
  }]
}

/**
 * Self-contained config for `nuxt-harness fast`: no `.nuxt/`, no app node_modules.
 * Resolves parsers/plugins from the harness package's own dependencies.
 */
export async function standalone() {
  const [{ default: vue }, { default: vueParser }, { default: tsPlugin }, { default: tsParser }] = await Promise.all([
    import('eslint-plugin-vue'),
    import('vue-eslint-parser'),
    import('@typescript-eslint/eslint-plugin'),
    import('@typescript-eslint/parser')
  ])
  return [
    { ignores: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/dist/**', '**/*.d.ts'] },
    {
      files: ['**/*.{ts,js}'],
      languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' }
    },
    {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module', extraFileExtensions: ['.vue'] }
      }
    },
    // Keep the problem reports even when a file carries a disable comment —
    // escape hatches are reported separately by the static checks.
    // Disable comments for rules outside the harness set would otherwise be reported as unused.
    { linterOptions: { reportUnusedDisableDirectives: 'off' } },
    { plugins: { 'vue': vue, '@typescript-eslint': tsPlugin, arch } },
    ...harness()
  ]
}
