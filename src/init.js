// @ts-check
/**
 * Install the agent-facing half of the harness.
 *
 * Claude Code and Codex both read `AGENTS.md`; Claude Code also reads `.claude/rules/*.md`
 * (path-scoped), `.claude/skills/`, and hooks. The split follows their guidance:
 *   - AGENTS.md / .claude/rules: short, command-first, non-inferable context
 *   - skills: procedures, loaded on demand
 *   - hooks: the deterministic gate, which the model cannot skip
 *
 * Everything here is idempotent: the managed AGENTS.md block is replaced in place, hooks are
 * only added when absent, and `.gitignore` gets one entry.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export const AGENTS_START = '<!-- nuxt-harness:start -->'
export const AGENTS_END = '<!-- nuxt-harness:end -->'

const AGENTS_BODY = `## Nuxt harness

This app is guarded by \`@edumapper/nuxt-harness\`. The gate judges code with rules and static
analysis; it never runs the test suite.

Before writing or rewriting a file:
- \`npx nuxt-harness guide <path>\` — the layer contract and the rules that will judge it.
- \`npx nuxt-harness explain <rule>\` — why a rule exists and how to fix it.

After each edit to a file the gate owns:
- \`npx nuxt-harness fast <path>\` — static checks + harness ESLint rules on that file (~1 s).

Before declaring done:
- \`npx nuxt-harness full\` — every file + typecheck + the app's configured tools.

Fix every error. Do not add \`@ts-ignore\`, \`@ts-nocheck\`, \`@ts-expect-error\`, blanket
\`eslint-disable\`, or an \`eslint-disable\` of a harness rule: the gate fails on them. Legacy
violations are recorded in \`eslint-suppressions.json\` and \`nuxt-harness-baseline.json\`; never
rewrite those to absorb new ones.

Reference: \`node_modules/@edumapper/nuxt-harness/skills/nuxt-harness/SKILL.md\`.`

/** The managed block written into AGENTS.md. */
export const agentsBlock = () => `${AGENTS_START}\n${AGENTS_BODY}\n${AGENTS_END}`

/** Path-scoped Claude rule: it loads only when Claude touches a file the gate owns. */
export const claudeRule = () => `---
paths:
  - "app/**/*.{vue,ts,js}"
  - "pages/**/*.vue"
  - "components/**/*.vue"
  - "composables/**/*.{ts,js}"
  - "layouts/**/*.vue"
  - "middleware/**/*.{ts,js}"
  - "plugins/**/*.{ts,js}"
  - "utils/**/*.{ts,js}"
  - "app.vue"
  - "error.vue"
  - "server/**/*.{ts,js}"
  - "shared/**/*.{ts,js}"
  - "modules/**/*.{ts,js,vue}"
  - "layers/**/*.{vue,ts,js}"
---

# Nuxt harness

Before writing or rewriting a matching file, run \`npx nuxt-harness guide <path>\`: it names the
layer (Page → Orchestrator → Operator → Presenter → Composable), what that layer may do, and the
rules that will judge it.

After each edit, run \`npx nuxt-harness fast <path>\`. Before finishing, run \`npx nuxt-harness full\`.
Fix every finding; the gate rejects its own escape hatches (\`@ts-ignore\`, blanket
\`eslint-disable\`, disabling a harness rule).

When a finding is unclear, \`npx nuxt-harness explain <rule>\` prints the reason, the fix and the doc.
`

/**
 * @typedef {{ file: string, status: 'added' | 'updated' | 'unchanged' | 'skipped', detail?: string }} InitAction
 */

/** @param {string} path @param {string} content */
function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** @param {string} path @param {string} content @param {boolean} dryRun */
function write(path, content, dryRun) {
  if (dryRun) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** @param {string} existing @param {string} block */
function upsertBlock(existing, block) {
  const start = existing.indexOf(AGENTS_START)
  const end = existing.indexOf(AGENTS_END)
  if (start !== -1 && end > start) {
    const next = `${existing.slice(0, start)}${block}${existing.slice(end + AGENTS_END.length)}`
    return { content: next, status: next === existing ? 'unchanged' : 'updated' }
  }
  const separator = existing.trim() ? '\n\n' : ''
  return { content: `${existing.trimEnd()}${separator}${block}\n`, status: 'added' }
}

/** @param {string} existing */
function addGitignoreEntry(existing) {
  const lines = existing.split('\n').map(line => line.trim())
  if (lines.includes('.harness/') || lines.includes('.harness')) return { content: existing, status: 'unchanged' }
  return { content: `${existing.trimEnd()}${existing.trim() ? '\n' : ''}.harness/\n`, status: 'added' }
}

/**
 * Merge the two Claude Code hooks without touching anything else in settings.json.
 * @param {any} settings
 */
function mergeHooks(settings) {
  const hooks = (settings.hooks ??= {})
  /** @param {string} event @param {any} entry @param {string} marker */
  const add = (event, entry, marker) => {
    const list = (hooks[event] ??= [])
    if (list.some((e) => JSON.stringify(e).includes(marker))) return false
    list.push(entry)
    return true
  }
  const post = add('PostToolUse', {
    matcher: 'Edit|Write|MultiEdit',
    hooks: [{ type: 'command', command: 'node_modules/.bin/nuxt-harness hook', timeout: 60 }]
  }, 'nuxt-harness hook')
  const stop = add('Stop', {
    hooks: [{ type: 'command', command: 'node_modules/.bin/nuxt-harness stop', timeout: 120 }]
  }, 'nuxt-harness stop')
  return post || stop
}

/**
 * @param {string} root
 * @param {{ claude?: boolean, dryRun?: boolean }} [options]
 * @returns {InitAction[]}
 */
export function initProject(root, { claude = false, dryRun = false } = {}) {
  /** @type {InitAction[]} */
  const actions = []

  // 1. AGENTS.md — the one file Codex and Claude both read.
  const agentsPath = join(root, 'AGENTS.md')
  const agents = upsertBlock(readIfExists(agentsPath) ?? '', agentsBlock())
  write(agentsPath, agents.content, dryRun)
  actions.push({ file: 'AGENTS.md', status: agents.status })

  // Claude Code reads AGENTS.md only when no CLAUDE.md exists above the working directory.
  for (const shadow of ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md']) {
    if (existsSync(join(root, shadow))) {
      actions.push({ file: shadow, status: 'skipped', detail: 'Claude Code prefers it over AGENTS.md — move its instructions to AGENTS.md' })
    }
  }

  // 2. .gitignore — the gate writes .harness/report.json on every run.
  const ignorePath = join(root, '.gitignore')
  const ignore = addGitignoreEntry(readIfExists(ignorePath) ?? '')
  write(ignorePath, ignore.content, dryRun)
  actions.push({ file: '.gitignore', status: ignore.status, detail: '.harness/' })

  if (!claude) return actions

  // 3. Path-scoped Claude rule: loads when Claude touches a file the gate owns.
  const rulePath = join(root, '.claude', 'rules', 'nuxt-harness.md')
  const rule = claudeRule()
  const existingRule = readIfExists(rulePath)
  write(rulePath, rule, dryRun)
  actions.push({ file: '.claude/rules/nuxt-harness.md', status: existingRule === undefined ? 'added' : existingRule === rule ? 'unchanged' : 'updated' })

  // 4. Skill: link the shipped skill so it always matches the installed version.
  const skillTarget = join(root, 'node_modules', '@edumapper', 'nuxt-harness', 'skills', 'nuxt-harness')
  const skillLink = join(root, '.claude', 'skills', 'nuxt-harness')
  if (existsSync(skillLink)) {
    actions.push({ file: '.claude/skills/nuxt-harness', status: 'unchanged' })
  } else if (!existsSync(skillTarget)) {
    actions.push({ file: '.claude/skills/nuxt-harness', status: 'skipped', detail: 'package not installed' })
  } else if (!dryRun) {
    mkdirSync(dirname(skillLink), { recursive: true })
    try {
      symlinkSync(relative(dirname(skillLink), skillTarget), skillLink, 'dir')
      actions.push({ file: '.claude/skills/nuxt-harness', status: 'added', detail: 'symlink' })
    } catch {
      cpSync(skillTarget, skillLink, { recursive: true })
      actions.push({ file: '.claude/skills/nuxt-harness', status: 'added', detail: 'copy' })
    }
  } else {
    actions.push({ file: '.claude/skills/nuxt-harness', status: 'added', detail: 'symlink' })
  }

  // 5. Hooks: the deterministic gate, the part the model cannot skip.
  const settingsPath = join(root, '.claude', 'settings.json')
  const raw = readIfExists(settingsPath)
  /** @type {any} */
  let settings = {}
  if (raw !== undefined) {
    try {
      settings = JSON.parse(raw)
    } catch {
      actions.push({ file: '.claude/settings.json', status: 'skipped', detail: 'invalid JSON — add the hooks from the README' })
      return actions
    }
  }
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    actions.push({ file: '.claude/settings.json', status: 'skipped', detail: 'not a JSON object — add the hooks from the README' })
    return actions
  }
  const hooks = settings.hooks
  if (hooks !== undefined && (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks))) {
    actions.push({ file: '.claude/settings.json', status: 'skipped', detail: '"hooks" is not an object — add the hooks from the README' })
    return actions
  }
  for (const event of ['PostToolUse', 'Stop']) {
    if (hooks?.[event] !== undefined && !Array.isArray(hooks[event])) {
      actions.push({ file: '.claude/settings.json', status: 'skipped', detail: `"hooks.${event}" is not an array — add the hooks from the README` })
      return actions
    }
  }
  const changed = mergeHooks(settings)
  const next = `${JSON.stringify(settings, null, 2)}\n`
  write(settingsPath, next, dryRun)
  actions.push({ file: '.claude/settings.json', status: raw === undefined ? 'added' : changed ? 'updated' : 'unchanged' })

  return actions
}
