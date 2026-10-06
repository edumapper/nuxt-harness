# @edumapper/nuxt-harness

Deterministic quality gate for Nuxt 4 apps: the 5-layer architecture rules (Page → Orc → Op →
Presenter → Composable), locality and illegal-state rules, static checks, and CRAP. One command,
two outputs: human text on stdout, `.harness/report.json` for agents and CI.

## Commands

```bash
nuxt-harness fast [files…] [--all] [--json]   # changed files (vs origin/HEAD merge-base + untracked), ~1 s
nuxt-harness full [--update-baseline] [--json] # everything; needs the app installed
nuxt-harness hook                              # Claude Code PostToolUse adapter (stdin JSON → exit 2 + stderr)
```

`fast` needs neither the app's `node_modules` nor `.nuxt/`. It parses with its own dependencies
(eslint, vue-eslint-parser, typescript-eslint), so an agent in a fresh worktree runs:

```bash
bunx @edumapper/nuxt-harness fast
```

| Check | fast | full |
|---|---|---|
| Import hygiene, escape hatches, console, secrets, unvalidated `readBody`, i18n keys, TODO (warn) | ✓ | ✓ |
| Harness ESLint rules (layers, locality, Vue contracts, design system, complexity) | ✓ | ✓ |
| `nuxt typecheck`, type-aware ESLint (app config), knip, cspell, jscpd, vitest + coverage | | ✓ |
| CRAP ≤ 30 per `.ts` function | | ✓ |

Rules and their rationale: [`skill/references/eslint-rules.md`](skill/references/eslint-rules.md).
The agent skill lives in [`skill/`](skill/SKILL.md). Symlink it into `.claude/skills/nuxt-harness`.

## Adopting in a Nuxt repo

```bash
bun add -d @edumapper/nuxt-harness @vitest/coverage-v8
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
  { "type": "command", "command": "bunx @edumapper/nuxt-harness hook", "timeout": 60 }
] }] } }
```

Add `.harness` to `.gitignore`. Existing violations: record them once, then they can only shrink:

```bash
bunx eslint . --suppress-all              # → eslint-suppressions.json (read by both eslint and `fast`)
bunx nuxt-harness full --update-baseline  # → nuxt-harness-baseline.json (CRAP)
```

Bun's `minimumReleaseAge` also applies to this package. To pick up a fresh harness release
immediately, add `minimumReleaseAgeExcludes = ["@edumapper/nuxt-harness"]` under `[install]` in `bunfig.toml`.

## Installing from GitHub Packages

The package is published to `npm.pkg.github.com` (org-private). Consumers need a token with
`read:packages`:

```toml
# bunfig.toml
[install.scopes]
"@edumapper" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }
```

Locally, run `gh auth refresh -s read:packages` once, then `export GITHUB_TOKEN=$(gh auth token)`.

## Releasing

1. Bump `version` in `packages/nuxt-harness/package.json`.
2. Push a tag `nuxt-harness-v<version>`. `.github/workflows/publish-nuxt-harness.yml` checks the
   tag, smoke-tests the packed tarball with no app install (`npx … fast --all`), and publishes.

## Developing

Tests run from the the host app root (`bun run test`) under `packages/nuxt-harness/test/`. The source
is plain ESM JavaScript with JSDoc types: there is no build step, and it runs on Node ≥ 22 and Bun.
