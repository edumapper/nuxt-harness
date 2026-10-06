# Example: basic Nuxt 4 app

A minimal Nuxt 4 app laid out the way the harness expects: a Page that assembles an
Orchestrator, a domain composable over `useFetch`, a Presenter, and a typed server route that
shares its type through `shared/`.

CI runs the fast gate on it (it must pass) — from the repository root:

```bash
node bin/nuxt-harness.js fast --all   # run inside examples/basic as its own git repo, see .github/workflows/ci.yml
```

To try the full gate, copy this folder out of the repository, `git init`, install, and run
`npm run check`.
