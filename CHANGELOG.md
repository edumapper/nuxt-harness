# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may break).

## [Unreleased]

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
