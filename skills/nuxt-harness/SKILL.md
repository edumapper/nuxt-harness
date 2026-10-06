---
name: nuxt-harness
description: This skill should be used when developing Nuxt 4 / Vue 3 applications. It enforces a 5-layer component architecture (Page → Orchestrator → Operator → Presenter → Composable), provides ESLint rules that mechanically enforce layer boundaries, a validation gate script, and TypeScript strict conventions. Use when creating or reviewing components, setting up a new Nuxt project, running code quality checks, or auditing an existing codebase for architectural violations.
---

# Nuxt Harness (`@edumapper/nuxt-harness`)

Opinionated development harness for Nuxt 4 / Vue 3 with strict 5-layer architecture enforcement.

## Core Principle

Build features by assembling simple, testable layers — never with monolithic smart components.
Each layer has clearly defined rights. ESLint enforces those rights mechanically, turning every
violation into an onboarding moment.

---

## The 5-Layer Model

```
pages/**/*.vue          → Page         (assembler — no business logic, no direct Presenters)
components/Orc*.vue     → Orchestrator (smartest — fetch, stores, complex logic)
components/Op*.vue      → Operator     (smart, focused — wires Presenters together)
components/*.vue        → Presenter    (dumb — props in, events out, nothing else)
composables/use*.ts     → Composable   (pure reactive logic, reusable across layers)
```

**Data flow**: props flow down (Page → Orchestrator → Operator → Presenter), events bubble up.

See `references/architecture.md` for the full model, 8 rules, store access matrix, and audit signals.

---

## Naming Convention → Rights

| File pattern              | Layer        | Can fetch? | Can use stores? | Can navigate? |
|---------------------------|--------------|------------|-----------------|---------------|
| `pages/**/*.vue`          | Page         | No         | Read only       | Yes           |
| `components/Orc*.vue`     | Orchestrator | Yes        | Yes             | Yes           |
| `components/Op*.vue`      | Operator     | No         | Yes             | Yes           |
| `components/*.vue`        | Presenter    | No         | No              | No            |
| `composables/use*.ts`     | Composable   | Yes        | Yes             | —             |

The file prefix determines what ESLint allows. No discipline required — the build breaks.

---

## The gate — run it, never suppress it

The rules, static checks and CLI ship as the `@edumapper/nuxt-harness` package
([edumapper/nuxt-harness](https://github.com/edumapper/nuxt-harness), installed from GitHub by release tag). Two modes:

| Command | When | What | Needs |
|---|---|---|---|
| `nuxt-harness fast` (`bun run check:fast`) | after every edit — the Claude Code PostToolUse hook runs it on the edited file | static checks + harness ESLint rules on changed files (~1 s) | nothing: no app `node_modules`, no `.nuxt/` |
| `nuxt-harness full` (`bun run check`) | before declaring done, and in CI | fast checks on every file + `nuxt typecheck`, type-aware ESLint, knip, cspell, jscpd, vitest + CRAP | `bun install` |

Both print `❌ what → 💡 why → 🛠 fix → 📖 doc` findings and write `.harness/report.json`
(`--json` prints it). Exit code is non-zero on any error.

**Fix every error. Do not suppress.** The gate bans its own escape hatches: `@ts-ignore`,
`@ts-nocheck`, `@ts-expect-error`, blanket `eslint-disable`, any `eslint-disable` of a
harness rule, and any other `eslint-disable` without a `-- reason`.

Legacy violations live in two ratchet files. A file passes while its count for a rule is at or
below the recorded count. One more violation and all of them report. These files only shrink:

- `eslint-suppressions.json`: ESLint bulk suppressions. Prune with `eslint . --prune-suppressions`.
- `nuxt-harness-baseline.json`: CRAP hits per file. Rewrite with `nuxt-harness full --update-baseline`
  after fixing some, never to absorb new ones.

### Principle → deterministic check

| Principle | Enforced by |
|---|---|
| Structural invariants | `strict` + `noUncheckedIndexedAccess` (Nuxt 4 default), `@typescript-eslint/no-explicit-any`, `vue/define-props-declaration`/`define-emits-declaration: type-based`, `vue/require-typed-ref`, `nuxt typecheck` |
| Single source of truth | Zod schemas + `z.infer` (no OpenAPI here), `vue/no-setup-props-reactivity-loss`, i18n key check (every static `t('…')` key exists in every locale), jscpd, knip |
| Illegal states | `arch/max-boolean-props` (3+ boolean props), `switch-exhaustiveness-check`, `no-unnecessary-condition` / `no-unnecessary-type-assertion` (type-aware, full gate) |
| Guards | named compound conditions (`arch/max-condition-operands`, max 2 operands in `if`/`v-if`/`v-show`), `no-else-return`, `max-depth: 2`, auth gates only in middleware, lock before the first `await` (review) |
| Reactivity & SSR | `arch/max-watchers` (≤ 3 per file), no `provide`/`inject`, `navigateTo` awaited/returned or commented, `<ClientOnly>` preceded by a comment explaining why SSR isn't used |
| Locality | R0–R4 layer rules, import boundaries (`app` ↛ `server` except validators/types, `server` ↛ `app`, `shared` ↛ both), no event bus (`mitt`…), no `provide`/`inject`, no `navigateTo('/…')` string paths |
| CRAP | `complexity` ≤ 20 everywhere; CRAP = c² × (1 − cov)³ + c ≤ 30 per function in `.ts` (full gate, vitest coverage) |
| SOLID | `max-params` ≤ 4 as a weak proxy; the rest is review work |

### Layer rules (R0–R4)

- **R0 `arch/no-presenter-in-page`**: `pages/**/*.vue` render only `Orc*`/`Op*` (plus HTML, Nuxt built-ins, NuxtUI atoms).
- **R1/R2 `arch/no-smart-calls`**: Presenters do no fetch, use no store, router or Colada.
- **R3 `arch/no-data-calls-in-operator`**: Operators do no `$fetch`/`useFetch`/`useQuery`. They call composables.
- **R4 `arch/no-reverse-layer`**: no upward imports (Presenter ↛ Op/Orc, Op ↛ Orc).

See `references/eslint-rules.md` for every rule and its rationale.

### Consuming the package in a Nuxt repo

```bash
bun add -d github:edumapper/nuxt-harness#v<version> @vitest/coverage-v8
```

```js
// eslint.config.mjs
import withNuxt from './.nuxt/eslint.config.mjs'
import { harness, typeAware } from '@edumapper/nuxt-harness/eslint'

export default withNuxt(...harness(), ...typeAware(import.meta.dirname))
```

```json
{ "scripts": { "check": "nuxt-harness full", "check:fast": "nuxt-harness fast" } }
```

Agents in a fresh checkout can skip the install entirely:
`bunx --package github:edumapper/nuxt-harness#v<version> nuxt-harness fast`.

---

## Decision Framework Before Creating a Component

Answer these 3 questions before creating any `.vue` file:
1. What concerns does this component have?
2. Does it fetch data? → Orchestrator. Does it wire Presenters? → Operator. Pure display? → Presenter.
3. Can a Presenter suffice, or is smart wiring needed?

If combining fetch + store + template → Orchestrator.
If wiring Presenters + local state, no fetch → Operator.
If props in, events out, zero deps → Presenter.

---

## NuxtUI as Primitive Building Blocks

**NuxtUI components are the atom layer of the UI.** They sit _below_ Presenters in the composition
hierarchy. Treat them like HTML elements — use them directly rather than re-wrapping them.

### Core Rule

> Never create a custom wrapper component around a NuxtUI primitive.
> `components/Button.vue` wrapping `UButton` is dead weight — use `UButton` directly.

### Where Each Layer Uses NuxtUI

| Layer        | NuxtUI usage |
|--------------|--------------|
| Presenter    | Renders NuxtUI atoms (`UButton`, `UBadge`, `UAvatar`, `UCard`, `UIcon`, …) |
| Operator     | Composes structural NuxtUI blocks (`UModal`, `USlideover`, `UTabs`, `UAccordion`) |
| Orchestrator | Wires NuxtUI forms (`UForm`, `UFormField`) with Zod schema validation |
| Page         | Uses layout-level primitives (`UContainer`, `USkeleton`, top-level `UCard`) if needed |

### Key Component Families

```
Atoms         UButton, UBadge, UAvatar, UIcon, UChip, UKbd, USeparator
Inputs        UInput, UTextarea, USelect, UCheckbox, URadioGroup, USwitch, USlider
Forms         UForm, UFormField  (validation via the Zod schema prop)
Layout        UCard, UContainer, USeparator
Overlays      UModal, USlideover, UDrawer, UPopover, UTooltip
Navigation    UTabs, UNavigationMenu, UCommandPalette, UBreadcrumb
Feedback      USkeleton, UAlert, UProgress, toasts via useToast()
Data          UTable (pass :data + :columns, never build a table manually)
```

### Prop Conventions

```vue
<!-- color / variant / size — always use NuxtUI's own props, not raw Tailwind classes -->
<UButton color="primary" variant="soft" size="sm" />

<!-- ui prop — fine-grained class overrides per slot, only when needed -->
<UCard :ui="{ body: 'p-0' }" />

<!-- icon — use the project's Iconify collection (the host app: i-tabler-*), not custom SVG components -->
<UButton icon="i-tabler-plus" />
<UIcon name="i-tabler-circle-check" class="text-green-500" />
```

### Do / Don't

```vue
<!-- ✅ Presenter uses UButton directly -->
<template>
  <UButton :label="label" color="primary" @click="emit('click')" />
</template>

<!-- ❌ Never wrap NuxtUI in a thin custom component -->
<!-- components/AppButton.vue — unnecessary indirection -->
<template>
  <UButton v-bind="$attrs" />
</template>
```

```vue
<!-- ✅ UForm + UFormField in an Orchestrator, with a Zod schema -->
<script setup lang="ts">
import { z } from 'zod'
const schema = z.object({ email: z.email() })
const state = reactive({ email: '' })
async function onSubmit() { /* $fetch call */ }
</script>
<template>
  <UForm :schema="schema" :state="state" @submit="onSubmit">
    <UFormField name="email" label="Email">
      <UInput v-model="state.email" type="email" />
    </UFormField>
    <UButton type="submit" label="Submit" />
  </UForm>
</template>

<!-- ❌ Never build a raw <form> with manual error divs — UForm handles it -->
```

```vue
<!-- ✅ UTable in a Presenter — columns declared once, no manual <tr> -->
<template>
  <UTable :data="rows" :columns="columns" @select="(row) => emit('select', row.original)" />
</template>

<!-- ❌ Never hand-write <table><thead><tr> when UTable exists -->
```

### Notifications

```ts
// In an Orchestrator or composable — never directly in a Presenter
const toast = useToast()
toast.add({ title: 'Saved', icon: 'i-tabler-circle-check', color: 'success' })
```

### Anti-patterns to Avoid

| Anti-pattern | Fix |
|---|---|
| `<button class="bg-primary-500 ...">` | `<UButton color="primary">` |
| `<input class="border rounded ...">` | `<UInput>` |
| Custom `AppModal.vue` wrapping `UModal` | Use `UModal` directly in the Operator |
| Manual `<table>` markup | `<UTable :data :columns>` |
| Custom `AppCard.vue` | `<UCard>` with `ui` prop overrides |
| Raw `<select>` | `<USelect :items>` |

See `references/gold-standards.md` for complete examples using NuxtUI primitives in each layer.

---

## Gold Standards

See `references/gold-standards.md` for complete reference implementations of each layer.

---

## Audit Checklist

To audit an existing codebase, load `references/architecture.md` and apply the 7-signal methodology
(S1–S6 + S1b) with scoring (max 11.5 pts). Top 5 components by score = refactoring backlog.
