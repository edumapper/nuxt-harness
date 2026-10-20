# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may break).

## [Unreleased]

## [0.7.0]

### Added

- SSR-determinism rules, for bugs that `nuxt typecheck`, SSR HTML and `curl` all miss:
  - `arch/no-browser-api-in-setup`: a top-level read of `window` / `document` / storage /
    `navigator` (scope-aware: `hit.document` and shadowing locals are not the global).
  - `arch/no-locale-format-in-render`: locale formatting in the render path without a locale, or
    a date without a `timeZone`.
  - `arch/no-nondeterministic-key`: a payload key built from the clock or a random value.
  - `arch/no-reserved-item-value`: a `value: ''` select item, which Reka-based selects throw on
    while hydrating. On when `@nuxt/ui`, `reka-ui`, `radix-vue` or `shadcn-nuxt` is installed.
  - `arch/no-module-mutable-state`: module-scope reactive state or a `let` reassigned outside an
    `import.meta.client` branch, i.e. state shared by every request (`app/`, `modules/`,
    `server/`, `shared/`).
  - `arch/async-data-needs-key` (warn): a keyless `useAsyncData(handler)` that reads props or the
    route, so every instance of the component shares one payload entry.
  - `arch/timer-needs-scope-dispose` (warn): a timer or listener with no scope-aware cleanup.
- Options: `clientOnly` (globs of files that never run on the server, e.g. `ssr: false` routes),
  `clientSingletons` (modules that deliberately keep one browser-side instance) and
  `selectComponents`. Test files and `*.client.*` files are exempt from the SSR rules, and
  `plugins/` from the timer rule.

### Changed

- Selecting no file is no longer a pass: `--all` or explicit file arguments that select nothing,
  or a run outside a git repository, fail with `harness/no-files` (`--allow-empty` opts in). In
  the default changed-files mode inside a repository, "nothing changed" still passes, so the Stop
  hook and `check:fast` on a clean branch are unaffected. Outside a repository, `--all` now walks
  the file system instead of selecting nothing.

### Upgrading

The new rules report existing code. Fix real findings; list `ssr: false` pages in `clientOnly`
and deliberate browser-only singletons in `clientSingletons` (with the reason next to each
entry); record the rest with `npx eslint . --suppress-all`.

## [0.6.0]

### Added

- Baseline for the static checks (#5): `nuxt-harness full --update-baseline` records each static
  check's errors per file in `nuxt-harness-baseline.json` (next to CRAP), and `fast`, `full` and the
  hooks apply it with the same ratchet. Existing CRAP-only baselines keep working.

### Fixed

- Static checks no longer report text inside comments (#4). Import hygiene, console, secrets,
  unvalidated `readBody` and i18n keys skip `//`, `/* */`, JSDoc and (in `.vue` templates) HTML
  comments, while strings and regex literals stay code. A commented-out `.parse()` no longer counts as validating a body.

## [0.5.2]

### Fixed

- The lint toolchain (`eslint`, `eslint-plugin-vue`, `vue-eslint-parser`, `@typescript-eslint/*`)
  is declared as `peerDependencies` with ranges instead of pinned `dependencies`. Installing the
  harness no longer adds older copies of these packages to a project, which could replace the
  project's own versions. `typescript` is no longer a dependency (`@typescript-eslint` already
  requires it as a peer).
- CI runs the test suite on the lowest supported peer versions, and checks that installing the
  harness leaves a project's lint packages untouched.

## [0.5.1]

### Added

- `bodyReaders` option: the app's own request-body readers get the unvalidated-body check.

## [0.5.0]

### Breaking

- Design-system rules are opt-in and ship no tokens. `no-hardcoded-color`,
  `no-off-palette-color-class` and `no-nested-border-box` only run with `designSystem` in the
  config; the allowed palettes come from `designSystem.palettes`.
- `navigateTo('/…')` string paths are only reported when i18n is on (auto-detected from
  `@nuxtjs/i18n`).
- `readBody` is the only body reader the static check knows; `readValidatedBody` is the
  recommended fix.

### Added

- `nuxt-harness.config.{mjs,js,json}` and `harness(options)`: `srcDir`, `i18n`,
  `authComposables`, `dataComposables`, `allowServerImportsInApp`, `designSystem`.
- Nuxt layers (`layers/<name>/…`) and the Nuxt 3 layout (`srcDir: '.'`) are covered.
- `no-presenter-in-page` recognizes directory-prefixed (`<ShopOrcCart>`), lazy and kebab-case
  component names.
- `no-auth-gate-outside-middleware` defaults cover nuxt-auth-utils, @sidebase/nuxt-auth and
  @nuxtjs/supabase; TanStack Query primitives are treated like Pinia Colada's.
- `full` runs scripts with the app's package manager and finds `vitest.config.{ts,mts,js,mjs}`.
- `examples/basic`, docs examples linted in CI, contributing guide, security policy.

### Changed

- All rule messages and docs are in English; doc links point to this repository.

## [0.4.0]

- `nuxt-harness stop`: Claude Code Stop hook that gates the end of a turn.

## [0.3.1]

- MIT license.

## [0.3.0]

- Standalone package with its own CI, tests and release tags.
