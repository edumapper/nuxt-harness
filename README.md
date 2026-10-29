# nuxt-harness

[![CI](https://github.com/edumapper/nuxt-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/edumapper/nuxt-harness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A deterministic quality gate for **Nuxt 4** apps, built for teams that ship code with AI agents.

- **Architecture rules**: a 5-layer component model (Page → Orchestrator → Operator → Presenter →
  Composable), enforced by ESLint, so smart components can't quietly grow into monoliths.
- **Guard and locality rules**: early returns, named conditions, `app` ↛ `server` imports,
  awaited `navigateTo`, auth gates in middleware, no `provide`/`inject`.
- **SSR-determinism rules**: the bugs typecheck and `curl` can't see — a reserved `''` select
  value that throws while hydrating, request keys the client can't reproduce, cross-request
  module state, locale formatting and browser APIs in the render path.
- **Validated request input**: server code reads the body, query and route params only through a
  schema (`readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`).
- **A gate the agent can't switch off**: `@ts-ignore` and `eslint-disable` of harness rules fail the gate.
- **No test runner, on purpose**: the gate judges the code with rules and static analysis. It never
  runs — or trusts — the app's test suite: a green suite can coexist with broken code.
- **Help before the verdict**: `guide <file>` gives the layer contract and the exact rules that will
  judge it; `explain <rule>` gives the why, the fix and the doc. The agent does not have to guess.
- **Fast mode for agents**: lints changed files in ~1 s, without the app's `node_modules` or `.nuxt/`.
- **Claude Code hooks**: feedback after every edit, and a turn can't end while changed files fail.
- **Ratchets for legacy code**: existing violations are recorded once; the count can only go down.

Every finding explains itself: `❌ what → 💡 why → 🛠 fix → 📖 doc`.

```text
  @edumapper/nuxt-harness 0.11.0 — fast gate, 3 files

  → ESLint (harness rules).......... FAIL 412ms
    ✗ app/components/ProductCard.vue:4 [arch/no-smart-calls] ❌ useRouter() — navigation in a Presenter
      💡 A Presenter doesn't decide where to go. It emits an event,
         and the Operator (Op*.vue) or Orchestrator (Orc*.vue) decides what to do.
      🛠 Replace with: emit('select', item)
```

## Quick start

Try it on any Nuxt 4 repository, with nothing installed:

```bash
npx --package github:edumapper/nuxt-harness#v0.11.0 nuxt-harness fast --all
```

Then adopt it:

```bash
npm i -D github:edumapper/nuxt-harness#v0.11.0   # or pnpm / yarn / bun add -d
```

```js
// eslint.config.mjs (with @nuxt/eslint)
import { harness, typeAware } from '@edumapper/nuxt-harness/eslint'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(...harness(), ...typeAware(import.meta.dirname))
```

```jsonc
// package.json
{ "scripts": { "check": "nuxt-harness full", "check:fast": "nuxt-harness fast" } }
```

Install the agent-facing files — `AGENTS.md` (read by Codex and Claude Code), plus the Claude
rule, skill link and hooks with `--claude`:

```bash
npx nuxt-harness init            # AGENTS.md + .harness/ in .gitignore
npx nuxt-harness init --claude   # + .claude/rules, .claude/skills, .claude/settings.json hooks
```

`init` is idempotent: it replaces its own managed `AGENTS.md` block, adds missing hooks, and never
rewrites a `settings.json` it cannot parse. On an existing app, record current violations once —
after that, the counts can only go down:

```bash
npx eslint . --suppress-all                  # → eslint-suppressions.json (read by eslint and `fast`)
npx nuxt-harness full --update-baseline      # → nuxt-harness-baseline.json (static checks)
```

Requirements: Node ≥ 24, a git repository, Nuxt 4 (the `app/` layout, or `srcDir: '.'`).
Nuxt layers under `layers/` are covered too.

The lint toolchain is a peer dependency, so the harness uses your project's versions and never
installs its own copies: ESLint `^9.24 || ^10`, `eslint-plugin-vue` `^10`, `vue-eslint-parser`
`^10.4` and `@typescript-eslint/*` `^8.24`. `@nuxt/eslint` already brings them; otherwise npm,
pnpm and bun install the missing peers for you (the no-install `npx`/`bunx` mode included).

## Commands

```bash
nuxt-harness fast [files…] [--all] [--json]    # changed files (vs origin/HEAD merge-base + untracked)
nuxt-harness full [--update-baseline] [--json] # every file + the app's toolchain; needs the app installed
nuxt-harness guide [files…]                    # before writing: layer contract + the rules that will judge it
nuxt-harness explain <rule>                    # why a rule exists, what it forbids, its doc
nuxt-harness init [--claude] [--dry-run]       # install AGENTS.md (+ Claude rule, skill, hooks)
nuxt-harness hook                              # Claude Code PostToolUse: gate the edited file
nuxt-harness stop                              # Claude Code Stop: the turn can't end while changed files fail
```

`guide` is the pre-writing half of the harness. Given a path, it names the layer, what that layer
may and may not do, and the rules the gate will apply — read from the same `harness()` config, so
the list cannot drift. With no path it prints the layer table and the workflow.

```text
$ nuxt-harness guide app/components/UserList.vue
app/components/UserList.vue — Presenter

  Props in, events out. It renders what it is given and emits what happened.

  ✅ props, emits, computed over props, slots
  ✅ Nuxt UI atoms (UButton, UCard, …)
  ❌ stores, router/navigation, data fetching
  ❌ raw $fetch/useFetch/useQuery, business logic

  Rules that judge this file:
    layer-presenters     arch/no-smart-calls, arch/no-reverse-layer
    illegal-states       arch/max-boolean-props
    …

  Explain one: nuxt-harness explain arch/no-smart-calls
  Run: nuxt-harness fast app/components/UserList.vue
```

`explain arch/no-smart-calls` prints the rule's scope, what it forbids, and the link to its section
in the rules reference.

| Check | fast | full |
|---|---|---|
| Import hygiene, escape hatches, console, secrets, i18n keys, TODO (warn) | ✓ | ✓ |
| Harness ESLint rules (layers, locality, guards, Vue contracts, complexity, opt-in design system) | ✓ | ✓ |
| `nuxt typecheck` (+ `vue-tsc` for `tools/` and `scripts/` when they have a `tsconfig.json`), the app's ESLint config (type-aware), knip, cspell, jscpd | | ✓ |

`full` runs the optional tools only when the app has configured them (`knip.json`,
`cspell.json`, `.jscpd.json`), through the app's package manager. Both
commands write `.harness/report.json` for agents and CI. Set `NUXT_HARNESS_BASE` to compare
`fast` against another branch than `origin/HEAD`.

## Configuration

None is required. Options cover what depends on your stack — put them in
`nuxt-harness.config.mjs` at the repo root:

```js
/** @type {import('@edumapper/nuxt-harness/eslint').HarnessOptions} */
export default {
  i18n: true,                          // default: on when @nuxtjs/i18n is installed
  authComposables: ['useUserSession'], // checking these + redirecting belongs in middleware
  dataComposables: ['useApiQuery'],    // your data-layer wrappers, banned in Presenters
  designSystem: {                      // opt-in; the harness ships no design tokens
    palettes: ['zinc', 'red', 'green']
  }
}
```

The design-system rules (hardcoded colors, allowed Tailwind palettes, nested bordered boxes)
are **off** until you enable them. See [configuration](skills/nuxt-harness/references/configuration.md)
for every option and how to share tokens from a package.

## Claude Code and Codex

The harness splits its agent integration the way both tools recommend: instructions the model
*should* follow, and checks it *cannot* skip.

| Layer | File | Why |
|---|---|---|
| Instructions | `AGENTS.md` | Both Codex and Claude Code read it — one instruction file, nothing to keep in sync. Kept short and command-first: `guide`, `fast`, `full`, `explain`. |
| Path-scoped rules | `.claude/rules/nuxt-harness.md` | Claude Code loads it only when it touches `app/`, `server/`, `shared/`, `modules/` or `layers/` — no context cost elsewhere. |
| Procedure | `.claude/skills/nuxt-harness` | The architecture, the rules and lint-clean examples, loaded on demand (progressive disclosure). |
| Enforcement | `.claude/settings.json` hooks | The deterministic gate: `PostToolUse` on each edit, `Stop` before the turn ends. The model cannot switch it off. |

`npx nuxt-harness init --claude` writes all four. Without `--claude` it writes only `AGENTS.md`,
which is enough for Codex.

Claude Code reads `AGENTS.md` when there is no `CLAUDE.md` above the working directory
(v2.1.277+). `init` warns if it finds a `CLAUDE.md`; move its instructions into `AGENTS.md` so both
tools read one file.

```jsonc
// .claude/settings.json — what init --claude merges in
{
  "hooks": {
    // after each edit: feedback lands before the agent moves on
    "PostToolUse": [{ "matcher": "Edit|Write|MultiEdit", "hooks": [
      { "type": "command", "command": "node_modules/.bin/nuxt-harness hook", "timeout": 60 }
    ] }],
    // end of turn: every file changed on the branch (Bash edits included) must pass;
    // blocks at most 3 times in a row per session, then warns the user instead
    "Stop": [{ "hooks": [
      { "type": "command", "command": "node_modules/.bin/nuxt-harness stop", "timeout": 120 }
    ] }]
  }
}
```

The skill in [`skills/nuxt-harness/`](skills/nuxt-harness/SKILL.md) is linked from
`node_modules/@edumapper/nuxt-harness/skills/nuxt-harness` so it always matches the installed
version.

Other agents can use the same gate: run `nuxt-harness guide <file>` before writing, `nuxt-harness fast`
after each edit, and read `.harness/report.json`.

## The architecture in one table

| File | Layer | Data access | Stores | Navigation |
|---|---|---|---|---|
| `app/pages/**/*.vue` | Page — assembles Orc/Op | — | read | ✓ |
| `app/components/**/Orc*.vue` | Orchestrator — the feature's brain | via composables | ✓ | ✓ |
| `app/components/**/Op*.vue` | Operator — wires Presenters | composables only | ✓ | ✓ |
| `app/components/**/*.vue` | Presenter — props in, events out | ✕ | ✕ | ✕ |
| `app/composables/use*.ts` | Composable — reusable logic | ✓ | ✓ | — |

- [Architecture](skills/nuxt-harness/references/architecture.md): the model, its rules and an audit method
- [Rules](skills/nuxt-harness/references/eslint-rules.md): every rule and why it exists
- [Gold standards](skills/nuxt-harness/references/gold-standards.md): reference code for each layer
- [Example app](examples/basic): a minimal Nuxt 4 app that passes the gate

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The source is
plain ESM JavaScript with JSDoc types: no build step.

```bash
bun install
bun run test
```

## License

[MIT](LICENSE)
