# Contributing

Thanks for helping improve nuxt-harness. Bug reports, false positives, rule proposals and
pull requests are all welcome.

## Setup

```bash
git clone https://github.com/edumapper/nuxt-harness.git
cd nuxt-harness
bun install        # npm install works too
bun run test
```

The source is plain ESM JavaScript with JSDoc types (`// @ts-check`), Node ≥ 22. There is no
build step: what's in `src/` is what ships.

## Layout

```
bin/nuxt-harness.js     CLI entry
src/run.js              gate orchestration: fast, full, hook, stop
src/config.js           options, defaults, auto-detection, nuxt-harness.config loading
src/eslint.js           flat config: harness(), typeAware(), standalone()
src/rules/              custom ESLint rules (the `arch/` plugin)
src/checks.js           static checks (plain file scans)
src/crap.js             CRAP score from complexity × vitest coverage
skills/nuxt-harness/    agent skill + reference docs (shipped in the package)
examples/basic/         minimal Nuxt 4 app that must pass the gate
test/                   vitest: rules (RuleTester), checks, config, CLI hooks, docs
```

## Adding or changing a rule

1. Write the rule in `src/rules/<name>.js`. Messages follow `❌ what → 💡 why → 🛠 fix → 📖 doc`
   and link to its section in `skills/nuxt-harness/references/eslint-rules.md` (`docsUrl()`).
2. Template rules must go through `context.sourceCode.parserServices.defineTemplateBodyVisitor`
   — a top-level `VElement`/`VAttribute` visitor is never called.
3. Register it in `src/eslint.js`. Rules under `arch/` can't be disabled with `eslint-disable`;
   a core or plugin rule the harness turns on must be added to `HARNESS_OWNED` in `src/checks.js`.
4. Add valid **and** invalid cases to `test/rules.test.ts`. Every template rule needs at least
   one invalid case, so a visitor that never runs fails the suite.
5. Document it in `eslint-rules.md`. If it is stack-specific (an i18n module, an auth library, a
   design system), make it opt-in through an option in `src/config.js`: the defaults must pass
   any plain Nuxt 4 app (`test/hooks.test.ts` checks this).

Examples in `gold-standards.md` and `architecture.md` are linted by `test/docs.test.ts`; keep
them passing.

## Pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for titles (`feat:`, `fix:`, `docs:` …).
- Add a line to `CHANGELOG.md` under *Unreleased*.
- `bun run test` must pass.

## Releasing (maintainers)

1. Move *Unreleased* in `CHANGELOG.md` under the new version and bump `version` in `package.json`.
2. Merge to `main`, then push the tag `v<version>`. CI checks that the tag matches the version.
