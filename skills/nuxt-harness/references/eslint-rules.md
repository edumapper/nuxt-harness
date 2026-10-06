# ESLint rules — `@edumapper/nuxt-harness/eslint`

Source of truth: `packages/nuxt-harness/src/eslint.js`. This page explains why each rule exists.
All rules are `error` unless noted. Messages follow ❌ what → 💡 why → 🛠 fix → 📖 doc.

## Entry points

| Export | Used by | Contents |
|---|---|---|
| `harness()` | the app's `eslint.config.mjs`, spread into `withNuxt(...)` | every rule below except the type-aware ones. It does not redefine the `vue`/`@typescript-eslint` plugins that Nuxt registers. |
| `typeAware(rootDir)` | the app's `eslint.config.mjs` (full gate only) | rules that need the TypeScript program (`projectService`). They need `.nuxt/` to be meaningful. |
| `standalone()` | `nuxt-harness fast` | parsers and plugins from the package's own dependencies, plus `harness()`. No `.nuxt/`, no app install. |

## Architecture: the 5-layer model

| Rule | Files | Forbids |
|---|---|---|
| `arch/no-presenter-in-page` (R0) | `app/pages/**/*.vue` | rendering anything but `Orc*`/`Op*`, HTML, Nuxt built-ins (`Nuxt*`) and NuxtUI atoms (`U*`) |
| `arch/no-smart-calls` (R1/R2) | Presenters | `useFetch`, `$fetch`, `useQuery`, stores, `useRouter`, `navigateTo`, … |
| `arch/no-data-calls-in-operator` (R3) | `Op*.vue` | raw data primitives (`$fetch`, `useFetch`, Colada). Call a composable. |
| `arch/no-reverse-layer` (R4) | components | upward imports: Presenter → Op/Orc, Op → Orc |
| `arch/no-server-ui-import` | `server/**` | importing Vue components or pages |

Template rules must use `context.sourceCode.parserServices.defineTemplateBodyVisitor`. A top-level
`VElement`/`VAttribute` visitor is never called. Three rules shipped that way and silently passed
every file (see `test/rules.test.ts`).

## Locality

| Rule | Files | Forbids |
|---|---|---|
| `@typescript-eslint/no-restricted-imports` | `app/**` | `~~/server/**` except `~~/server/utils/validators/**` (type imports allowed) |
| | `server/**` | `~/**`, `~~/app/**`, `#app`, `#components` |
| | `shared/**` | app and server code: `shared/` stays isomorphic |
| | all | event buses: `mitt`, `tiny-emitter`, `eventemitter3`, `events` |
| `no-restricted-syntax` | `app/**` | `navigateTo('/…')` / `` navigateTo(`/…`) ``. Use `localePath({ name })`. |
| `arch/no-provide-inject` <a id="no-provide-inject"></a> | `app/**` | Vue `provide()`/`inject()`/`vueApp.provide`. Pass props down or share a composable. Nuxt plugin `provide` stays allowed. |
| `arch/no-auth-gate-outside-middleware` <a id="no-auth-gate-outside-middleware"></a> | components, pages, layouts | a branch that tests `useSupabaseUser()`/`useSupabaseSession()` and redirects. Access policy lives in `app/middleware`. Displaying the user is fine. |
| `arch/no-bare-navigate` | `app/**` | `navigateTo()` that is not awaited or returned, unless a comment on the line above (or at the end of the line) explains why; `router.push/replace/go` |

## Structural invariants & illegal states

| Rule | Why |
|---|---|
| `@typescript-eslint/no-explicit-any` | `any` switches the compiler off for everything it touches |
| `vue/define-props-declaration: type-based`, `vue/define-emits-declaration: type-based` | runtime declarations lose literal and union types |
| `vue/require-typed-ref` | `ref()` without a value or type parameter is `Ref<any>` |
| `vue/no-setup-props-reactivity-loss` | destructuring `props` at setup root freezes the value |
| `arch/max-boolean-props` <a id="max-boolean-props"></a> | 3+ boolean props encode 2^N states, most of them illegal. Use one discriminated union prop. |
| `@typescript-eslint/switch-exhaustiveness-check` (type-aware) | adding a union member must break every switch that forgot it |
| `@typescript-eslint/no-unnecessary-condition` (type-aware) | a condition the types prove constant is dead code or a lying type |
| `@typescript-eslint/no-unsafe-return` (type-aware) | returning `any` leaks it into every caller |

## Guards & reactivity

Principle: use early returns for states that really happen. Don't check states the types or another layer already rule out.

| # | Rule | Enforced by |
|---|---|---|
| R1 | No checks for impossible states (`?.`, `??`, `if (!x)` on a non-nullable). If the type is wrong, fix the type. | `@typescript-eslint/no-unnecessary-condition`, `no-unnecessary-type-assertion` (type-aware) |
| R2 | A guard with more than 2 operands goes into a named `computed` or function, ideally one returning the blocking reason (`submitBlock`). | `arch/max-condition-operands` <a id="max-condition-operands"></a> (counts every `&&`/`||` leaf, including right-nested `a \|\| (b && c)`; `??` is not counted) |
| R3 | Exit early. No `else` after a return, no deep nesting. | `no-else-return` (`allowElseIf: false`), `max-depth: 2` |
| R4 | Gates live with their owner: auth checks and redirects go in `app/middleware`. | `arch/no-auth-gate-outside-middleware` |
| R5 | A `v-if`/`v-else-if`/`v-show` with more than 2 operands becomes a computed. | `arch/max-condition-operands` |
| R6 | Async handlers set the lock before the first `await`. | code review, not lintable |
| | No more than 3 watchers per file. Derived state is a `computed`; a reaction to a user action goes in that handler; prop sync uses `defineModel`. | `arch/max-watchers` <a id="max-watchers"></a> |
| | Every `<ClientOnly>` is directly preceded by an HTML comment (4+ words) saying why the subtree can't render on the server. | `arch/client-only-needs-reason` <a id="client-only-needs-reason"></a> |

## Control flow & size

| Rule | Why |
|---|---|
| `no-unsafe-finally` | `return`/`throw` in `finally` silently discards the in-flight error |
| `no-empty` (incl. catch) | `catch {}` swallows errors |
| `complexity: 20` | the C in CRAP. Above it, split the function. |
| `max-params: 4` | the cheapest SRP smell to detect (off in tests) |

## Design system (`app/**/*.vue`)

| Rule | Forbids |
|---|---|
| `arch/no-hardcoded-color` | hex/rgb/hsl in templates, `style` or string literals. Use palette classes or `var(--color-*)`. |
| `arch/no-off-palette-color-class` | Tailwind palettes outside `app/assets/css/main.css` (`gray`, `neutral`, `sky`, …) |
| `arch/no-nested-border-box` (warn) | bordered, rounded boxes inside other bordered surfaces |
| `arch/no-figma-asset-url` | expiring Figma MCP asset URLs |

## Considered and not adopted (yet)

These were measured on a production Nuxt app:

- `exactOptionalPropertyTypes`: 144 type errors. Too many to fix in the harness PR, and TS errors can't be bulk-suppressed.
- `experimental.typedPages`: 3 errors, two of them `NuxtLinkLocale` receiving an already-localized path. Fix those first.
- `strict-boolean-expressions`: 338 hits, mostly style. `no-unsafe-assignment/call/member-access`: about 250 hits, dominated by "type could not be resolved" noise from auto-imports.
- dependency-cruiser: Nuxt auto-imports components and composables, so the import graph it sees is incomplete. The layer and locality rules above cover the edges that exist as imports.
- openapi-typescript: the API contract here is Zod + `z.infer`, not OpenAPI.

## Error Message Rights Matrix

What ESLint guarantees:

| Action                         | Presenter | Operator | Orchestrator | Page     |
|-------------------------------|-----------|----------|--------------|----------|
| Import a store                | ✕ R1      | ✓        | ✓            | ✓ read   |
| Call `useRouter()`/`navigateTo()` | ✕ R4  | ✓        | ✓            | ✓        |
| Call `useFetch()`/`useAsyncData()` | ✕ R4  | ✕ R3     | ✓            | ✕        |
| Access `localStorage`          | ✕ R2      | ✓        | ✓            | ✕        |
| Render a Presenter directly    | ✓         | ✓        | ✓            | ✕ R0     |
| `defineProps` + `defineEmits`  | ✓ only    | ✓        | ✓            | ✓        |
