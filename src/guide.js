// @ts-check
/**
 * Pre-writing guidance.
 *
 * The gate judges what the agent already wrote. `guide` and `explain` help before:
 *   - guide <file>  → the layer contract for that path, and the rules that will judge it
 *   - explain <rule> → why the rule exists, what it forbids, and the doc link
 *
 * The rule list is read from the same `harness()` config the gate uses, so it cannot drift.
 */
import { readFileSync } from 'node:fs'

import { arch, harness, typeAware } from './eslint.js'
import { docsUrl, RULES_DOC_URL } from './rules/docs.js'

const RULES_DOC = new URL('../skills/nuxt-harness/references/eslint-rules.md', import.meta.url)

/**
 * @typedef {object} Layer
 * @property {string} id
 * @property {string} name
 * @property {string} glob human-readable path pattern
 * @property {RegExp} match
 * @property {string} summary
 * @property {string[]} yes
 * @property {string[]} no
 * @property {string} keyRule the rule that most shapes this layer
 * @property {string} reference
 */

/** @type {Layer[]} */
export const LAYERS = [
  {
    id: 'app',
    name: 'App root',
    glob: 'app/app.vue, app/error.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/(?:app|error)\.vue|(?:app|error)\.vue)$/,
    summary: 'The Nuxt app shell and error page.',
    yes: ['<NuxtLayout>, <NuxtPage>, global providers', 'app-wide error handling'],
    no: ['feature data fetching', 'business logic that belongs in a page or composable'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'page',
    name: 'Page (assembler)',
    glob: 'app/pages/**/*.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?pages\/.+\.vue$/,
    summary: 'Owns route concerns and assembles Orchestrators and Operators.',
    yes: [
      'definePageMeta, useSeoMeta, route middleware',
      'reading route params/query and passing them down as props',
      'Orc*/Op* components, HTML, Vue/Nuxt built-ins, U* atoms'
    ],
    no: ['rendering a Presenter directly', 'data fetching, stores, business logic'],
    keyRule: 'arch/no-presenter-in-page',
    reference: 'architecture.md#page-assembler'
  },
  {
    id: 'orchestrator',
    name: 'Orchestrator (Orc*)',
    glob: 'app/components/**/Orc*.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?components\/(?:.+\/)?Orc[^/]*\.vue$/,
    summary: 'The feature brain: data through composables, business logic, navigation.',
    yes: [
      'domain query/mutation composables',
      'stores, navigation, business rules',
      'distributing ready-to-display data to Operators and Presenters through props'
    ],
    no: [
      'raw $fetch/useFetch/useAsyncData/useQuery — call a composable',
      'growing past 3–4 concerns without splitting'
    ],
    keyRule: 'arch/no-reverse-layer',
    reference: 'architecture.md#orchestrator-smartest'
  },
  {
    id: 'operator',
    name: 'Operator (Op*)',
    glob: 'app/components/**/Op*.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?components\/(?:.+\/)?Op[^/]*\.vue$/,
    summary: 'Wires Presenters together and owns local UI state.',
    yes: ['wiring Presenters', 'local UI state', 'navigation, stores, domain composables'],
    no: ['raw data primitives ($fetch, useFetch, useAsyncData, useQuery) — data arrives as props or through a composable'],
    keyRule: 'arch/no-data-calls-in-operator',
    reference: 'architecture.md#operator-smart'
  },
  {
    id: 'presenter',
    name: 'Presenter',
    glob: 'app/components/**/*.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?components\/.+\.vue$/,
    summary: 'Props in, events out. It renders what it is given and emits what happened.',
    yes: ['props, emits, computed over props, slots', 'Nuxt UI atoms (UButton, UCard, …)'],
    no: [
      'stores, router/navigation, data fetching',
      'raw $fetch/useFetch/useQuery, business logic'
    ],
    keyRule: 'arch/no-smart-calls',
    reference: 'architecture.md#presenter-dumb'
  },
  {
    id: 'composable',
    name: 'Composable (use*)',
    glob: 'app/composables/use*.ts',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?composables\/use[^/]*\.ts$/,
    summary: 'Reusable reactive logic: data access, caching, side effects.',
    yes: ['reactive state and side effects', 'data access, caching, WebSockets, transformations'],
    no: ['module-scope mutable state (one instance per server process)', 'Vue/Nuxt context after an await outside setup'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#composable-pure-logic'
  },
  {
    id: 'server',
    name: 'Server',
    glob: 'server/**/*.ts',
    match: /^(?:layers\/[^/]+\/)?server\/.+\.(?:ts|js)$/,
    summary: 'Server routes and utilities. Input is untrusted until a schema parsed it.',
    yes: ['readValidatedBody / getValidatedQuery / getValidatedRouterParams', 'server utils, database access, secrets'],
    no: ['Vue components or pages', 'importing app/ code'],
    keyRule: 'arch/no-raw-request-input',
    reference: 'gold-standards.md#server-routes-every-input-through-a-schema'
  },
  {
    id: 'shared',
    name: 'Shared',
    glob: 'shared/**/*.ts',
    match: /^(?:layers\/[^/]+\/)?shared\/.+\.(?:ts|js)$/,
    summary: 'Isomorphic types and pure helpers used by both app/ and server/.',
    yes: ['types, schemas, pure functions'],
    no: ['app/ or server/ imports', 'module-scope mutable state'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'module',
    name: 'Nuxt module',
    glob: 'modules/**/*.{ts,js,vue}',
    match: /^(?:layers\/[^/]+\/)?modules\/.+\.(?:ts|js|vue)$/,
    summary: 'A Nuxt module: install-time setup and runtime code it registers.',
    yes: ['defineNuxtModule, addPlugin, addComponent', 'module-scoped state only for the module instance'],
    no: ['request state in module scope'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'middleware',
    name: 'Middleware',
    glob: 'app/middleware/**/*.ts',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?middleware\/.+\.(?:ts|js)$/,
    summary: 'Route middleware: the one place an auth check and redirect belong.',
    yes: ['auth checks and redirects', 'route guards'],
    no: ['rendering', 'fetching data for display'],
    keyRule: 'arch/no-auth-gate-outside-middleware',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'plugin',
    name: 'Plugin',
    glob: 'app/plugins/**/*.ts',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?plugins\/.+\.(?:ts|js)$/,
    summary: 'App-wide setup that runs once per Nuxt app.',
    yes: ['app-wide setup, provide(), client singletons'],
    no: ['module-scope mutable state unless it is the plugin instance'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'layout',
    name: 'Layout',
    glob: 'app/layouts/**/*.vue',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?layouts\/.+\.vue$/,
    summary: 'Page chrome around <slot />.',
    yes: ['navigation chrome, slots, layout state'],
    no: ['auth gating (middleware owns it)', 'data fetching for a specific page'],
    keyRule: 'arch/no-auth-gate-outside-middleware',
    reference: 'architecture.md#the-5-layers'
  },
  {
    id: 'util',
    name: 'Util',
    glob: 'app/utils/**/*.ts',
    match: /^(?:layers\/[^/]+\/)?(?:app\/)?utils\/.+\.(?:ts|js)$/,
    summary: 'Small app-side helpers, auto-imported by Nuxt.',
    yes: ['pure helpers'],
    no: ['module-scope mutable state'],
    keyRule: 'arch/no-module-mutable-state',
    reference: 'architecture.md#the-5-layers'
  }
]

/** @param {string} file @returns {Layer | undefined} */
export function layerOf(file) {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '')
  return LAYERS.find(l => l.match.test(normalized))
}

// ─── Rule list from the harness config ──────────────────────────────────────
// `guide` must name the rules that will actually run, not a hand-copied list.
// The config uses a small glob subset: `**`, `*`, `?`, `{a,b}`.
const GLOB_CACHE = new Map()

/** @param {string} s */
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** @param {string} glob @returns {RegExp} */
function globToRegExp(glob) {
  const cached = GLOB_CACHE.get(glob)
  if (cached) return cached
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else {
          re += '.*'
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end === -1) {
        re += '\\{'
        continue
      }
      re += `(?:${glob.slice(i + 1, end).split(',').map(escapeRegExp).join('|')})`
      i = end
    } else {
      re += escapeRegExp(c)
    }
  }
  const rx = new RegExp(`^${re}$`)
  GLOB_CACHE.set(glob, rx)
  return rx
}

/** @param {string} file @param {string[]} globs */
const matchesAny = (file, globs) => globs.some(glob => globToRegExp(glob).test(file))

/**
 * The rule groups that apply to `file`, in the order the config declares them.
 * @param {string} file
 * @param {import('./config.js').HarnessOptions} [options]
 * @returns {{ name: string, rules: string[] }[]}
 */
export function rulesByBlock(file, options = {}) {
  /** @type {{ name: string, rules: string[] }[]} */
  const groups = []
  // Type-aware rules only run in the full gate, but the agent should see them before writing.
  const blocks = [...harness(options), ...typeAware(options.root ?? process.cwd(), options)]
  for (const block of blocks) {
    if (block.files && !matchesAny(file, block.files)) continue
    if (block.ignores && matchesAny(file, block.ignores)) continue
    const rules = Object.entries(block.rules ?? {})
      .filter(([, value]) => value !== 'off' && value !== 0)
      .map(([id]) => id)
    if (rules.length === 0) continue
    const name = block.name === 'nuxt-harness/type-aware'
      ? 'type-aware (full)'
      : (block.name ?? 'rules').replace(/^nuxt-harness\//, '')
    groups.push({ name, rules })
  }
  return groups
}

// ─── Explain ────────────────────────────────────────────────────────────────
/** @param {string} key */
function docEntry(key) {
  let md
  try {
    md = readFileSync(RULES_DOC, 'utf8')
  } catch {
    return undefined
  }
  const exact = `\`${key}\``
  const prefixed = `\`${key}:`
  const arch = `arch/${key}`
  /** @type {{ label?: string, appliesTo?: string, why: string } | undefined} */
  let fallback
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.replace(/<a id="[^"]*"><\/a>/g, '').trim())
    if (cells.length < 2) continue
    const first = cells[0] ?? ''
    const last = cells.at(-1) ?? ''
    // The rule is either the first column, or the last column of the guard tables.
    const inFirst = first.includes(exact) || first.includes(prefixed) || first.includes(arch)
    if (inFirst) return { label: first, appliesTo: cells.length >= 3 ? cells[1] : undefined, why: cells.at(-1) }
    // Guard tables put the rule in the last cell: "`no-else-return`, `max-depth: 2`".
    const token = last.match(new RegExp(`\`(?:arch/)?${escapeRegExp(key)}(?::[^\`]*)?\``))?.[0]
    const lastStyle = { label: token ?? last, appliesTo: undefined, why: cells.slice(1, -1).join(' ') }
    if (last.startsWith(`\`${arch}\``) || last.startsWith(exact)) return lastStyle
    // `max-depth` shares a guard row: "`no-else-return`, `max-depth: 2`".
    if (!fallback && (last.includes(exact) || last.includes(prefixed) || last.includes(arch))) fallback = lastStyle
  }
  return fallback
}

/** Every rule the harness can enable: `arch/` rules plus the core/plugin rules it turns on. */
export function ruleIds() {
  const ids = new Set(Object.keys(arch.rules).map(key => `arch/${key}`))
  // Enable the opt-in blocks so the list also covers i18n and select-component rules.
  for (const block of [...harness({ i18n: true, selectComponents: true }), ...typeAware()]) {
    for (const id of Object.keys(block.rules ?? {})) ids.add(id)
  }
  return [...ids].sort()
}

/**
 * Why a rule exists, what it forbids, and where its doc lives.
 * @param {string} id `arch/no-smart-calls` or `no-smart-calls`
 * @returns {string | undefined}
 */
export function explainRule(id) {
  const key = id.replace(/^arch\//, '')
  const rule = /** @type {any} */ (arch.rules[key])
  const entry = docEntry(key)
  if (!rule && !entry) return undefined
  const description = rule?.meta?.docs?.description
  const url = rule?.meta?.docs?.url ?? RULES_DOC_URL
  return [
    `${rule ? `arch/${key}` : (entry?.label ?? key)}${description ? ` — ${description}` : ''}`,
    '',
    ...(entry?.appliesTo ? [`  Applies to: ${entry.appliesTo}`] : []),
    ...(entry?.why ? [`  ${entry.appliesTo ? 'Forbids' : 'Why'}: ${entry.why}`] : []),
    `  Doc: ${url}`
  ].join('\n')
}

// ─── Guide ──────────────────────────────────────────────────────────────────
/** The layer table and the workflow, printed by `nuxt-harness guide`. */
export function generalGuide() {
  return [
    'nuxt-harness guide — write the smallest layer that fits',
    '',
    'Layers',
    ...LAYERS.map(l => `  ${l.name.padEnd(22)} ${l.glob}`),
    '',
    'Choose the layer',
    '  loads data / owns the feature?   → Orchestrator (Orc*)',
    '  wires Presenters, local state?   → Operator (Op*)',
    '  props in, events out?            → Presenter',
    '',
    'Workflow',
    '  1. nuxt-harness guide <file>   the contract and the rules for the file you are about to write',
    '  2. write the smallest layer that fits',
    '  3. nuxt-harness fast           after each edit (the hooks run it for you)',
    '  4. nuxt-harness full           before declaring done',
    '',
    'Reference: skills/nuxt-harness/references/architecture.md and gold-standards.md',
    'Explain a rule: nuxt-harness explain arch/no-smart-calls'
  ].join('\n')
}

/**
 * The contract for one file, plus the rules that will judge it.
 * @param {string} file repo-relative path
 * @param {import('./config.js').HarnessOptions} [options]
 */
export function guideFor(file, options = {}) {
  const layer = layerOf(file)
  if (!layer) {
    return [
      `${file} — not in a layer the harness judges`,
      '',
      '  The gate covers app/, server/, shared/ and modules/ files. Layers:',
      ...LAYERS.map(l => `    ${l.name.padEnd(22)} ${l.glob}`),
      '',
      '  If this file is a test, config or script, it is outside the gate. tools/ and scripts/',
      '  are typechecked by `full` when they have a tsconfig.json, but the layer rules do not apply.'
    ].join('\n')
  }

  const groups = rulesByBlock(file, options)
  const active = new Set(groups.flatMap(g => g.rules))
  const firstRule = active.has(layer.keyRule) ? layer.keyRule : (groups.flatMap(g => g.rules).find(r => r.startsWith('arch/')) ?? layer.keyRule)
  return [
    `${file} — ${layer.name}`,
    '',
    `  ${layer.summary}`,
    '',
    ...layer.yes.map(y => `  ✅ ${y}`),
    ...layer.no.map(n => `  ❌ ${n}`),
    '',
    '  Rules that judge this file:',
    ...groups.map(g => `    ${g.name.padEnd(20)} ${g.rules.join(', ')}`),
    '',
    '  Static checks: import hygiene, escape hatches, console, secrets, i18n keys, TODO (warn)',
    '',
    `  Reference: skills/nuxt-harness/references/${layer.reference}`,
    `  Explain one: nuxt-harness explain ${firstRule}`,
    `  Run: nuxt-harness fast ${file}`
  ].join('\n')
}
