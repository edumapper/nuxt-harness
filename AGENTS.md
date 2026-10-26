# AGENTS.md

nuxt-harness is the nuxt-harness CLI.

## Tooling

- **Package manager**: Bun 1.4.4 (`packageManager` in `package.json`). Use `bun install`, `bun run <script>` and `bunx`, never `npm`, `yarn` or `pnpm`: the lockfile is `bun.lock`.
- **Node**: 24.22.1, pinned in `.nvmrc` / `.node-version` and read by CI (`node-version-file`). Bump it there only.
