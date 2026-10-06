# @edumapper/nuxt-harness

Deterministic quality gate for Nuxt 4 apps. It covers the 5-layer architecture rules (Page → Orc → Op →
Presenter → Composable), locality, guard and illegal-state rules, static checks, and CRAP. One command
gives two outputs: human text on stdout, and `.harness/report.json` for agents and CI.

## Commands

```bash
nuxt-harness fast [files…] [--all] [--json]    # changed files (vs origin/HEAD merge-base + untracked), ~1 s
nuxt-harness full [--update-baseline] [--json] # everything; needs the app installed
nuxt-harness hook                              # Claude Code PostToolUse adapter (stdin JSON → exit 2 + stderr)
```

`fast` needs neither the app's `node_modules` nor `.nuxt/`. It parses with its own dependencies
(eslint, vue-eslint-parser, typescript-eslint), so an agent in a fresh worktree runs:

```bash
bunx --package github:edumapper/nuxt-harness#v<version> nuxt-harness fast
```

| Check | fast | full |
|---|---|---|
| Import hygiene, escape hatches, console, secrets, unvalidated `readBody`, i18n keys, TODO (warn) | ✓ | ✓ |
| Harness ESLint rules (layers, locality, guards, Vue contracts, design system, complexity) | ✓ | ✓ |
| `nuxt typecheck`, type-aware ESLint (app config), knip, cspell, jscpd, vitest + coverage | | ✓ |
| CRAP ≤ 30 per `.ts` function | | ✓ |

Rules and their rationale: [`skills/nuxt-harness/references/eslint-rules.md`](skills/nuxt-harness/references/eslint-rules.md).
The agent skill is [`skills/nuxt-harness/`](skills/nuxt-harness/SKILL.md). Consumers symlink it from
`node_modules/@edumapper/nuxt-harness/skills/nuxt-harness`, so it always matches the installed version.

## Adopting in a Nuxt repo

```bash
bun add -d github:edumapper/nuxt-harness#v<version> @vitest/coverage-v8
```

```js
// eslint.config.mjs
import withNuxt from './.nuxt/eslint.config.mjs'
import { harness, typeAware } from '@edumapper/nuxt-harness/eslint'

export default withNuxt(...harness(), ...typeAware(import.meta.dirname))
```

```jsonc
// package.json
{ "scripts": { "check": "nuxt-harness full", "check:fast": "nuxt-harness fast" } }
```

```jsonc
// .claude/settings.json: feedback lands before the agent moves on
{ "hooks": { "PostToolUse": [{ "matcher": "Edit|Write|MultiEdit", "hooks": [
  { "type": "command", "command": "node_modules/.bin/nuxt-harness hook", "timeout": 60 }
] }] } }
```

Add `.harness` to `.gitignore`. Record existing violations once. After that the counts can only go down:

```bash
bunx eslint . --suppress-all              # → eslint-suppressions.json (read by both eslint and `fast`)
bunx nuxt-harness full --update-baseline  # → nuxt-harness-baseline.json (CRAP)
```

## Releasing

1. Bump `version` in `package.json` and commit to `main`.
2. Push the tag `v<version>`. CI checks that the tag matches the version and runs the tests.
3. Consumers pin the tag (`github:edumapper/nuxt-harness#v<version>`). In the host app, the
   `update-nuxt-harness` workflow picks up a new tag, bumps the dependency, runs the full gate, and opens a PR.

## Developing

```bash
bun install
bun run test   # vitest: rule tests (RuleTester) + static checks + CRAP
```

The source is plain ESM JavaScript with JSDoc types. There is no build step, and it runs on Node ≥ 22 and Bun.
