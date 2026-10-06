# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/edumapper/nuxt-harness/security/advisories/new),
not in a public issue. We aim to acknowledge reports within a week.

nuxt-harness runs locally on your code and executes the tools your project configures
(`nuxt`, `eslint`, `vitest`, …) from its own `node_modules`. Reports about that boundary —
for example a file in a scanned repository that makes the gate execute unexpected code — are
in scope.
