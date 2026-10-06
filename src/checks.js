// @ts-check
/**
 * Static checks — pure file scans, no dependencies, no `.nuxt/`.
 *
 * Each check takes `{ root, files, options }` (paths relative to root) and returns findings.
 * Checks that ESLint already enforces (layers, empty catch) are not duplicated here.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {{ check: string, file: string, line: number, rule?: string, message: string, severity: 'error' | 'warning' }} Finding
 * @typedef {{ root: string, files: string[], options?: import('./config.js').HarnessOptions }} CheckContext
 * @typedef {{ name: string, run: (ctx: CheckContext) => Finding[] }} Check
 */

/** @param {CheckContext} ctx @param {string} file */
function read(ctx, file) {
  try {
    return readFileSync(join(ctx.root, file), 'utf8')
  } catch {
    return '' // deleted since the file list was built
  }
}

/** Raw source lines, comments included. @param {CheckContext} ctx @param {string} file */
const lines = (ctx, file) => read(ctx, file).split('\n')

// A `/` after one of these (or after a keyword below) starts a regex literal, not a division.
const BEFORE_REGEX = new Set([...'(,=:[!&|?{};+-*%<>~^'])
const KEYWORD_BEFORE_REGEX = /\b(?:return|typeof|case|void|in|of|delete|throw|new|yield|await)$/

/**
 * Blanks JS comments (`//`, `/* *\/`) with spaces, keeping newlines so line numbers hold.
 * Strings, template literals and regex literals are code: the `//` in 'https://…' or in
 * /^https?:\/\//.test(url) is not a comment.
 * @param {string} src
 */
function blankJsComments(src) {
  let out = ''
  /** @type {'code' | 'line' | 'block' | 'regex' | "'" | '"' | '`'} */
  let state = 'code'
  let inClass = false // inside a regex character class: `/` doesn't end the regex there
  let last = '' // last non-blank character of code, to tell a regex from a division
  for (let i = 0; i < src.length; i++) {
    const c = /** @type {string} */ (src[i]), next = src[i + 1]
    if (state === 'code') {
      if (c === '/' && next === '/') state = 'line'
      else if (c === '/' && next === '*') state = 'block'
      else if (c === '\'' || c === '"' || c === '`') state = c
      else if (c === '/' && (last === '' || BEFORE_REGEX.has(last) || KEYWORD_BEFORE_REGEX.test(out.slice(-16).trimEnd()))) state = 'regex'
      if (state === 'code' && c.trim()) last = c
    } else if (state === 'line') {
      if (c === '\n') state = 'code'
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        out += '  '
        i++
        state = 'code'
        continue
      }
    } else if (c === '\\') {
      out += c + (next ?? '') // escaped character inside a string or regex
      i++
      continue
    } else if (state === 'regex') {
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if ((c === '/' && !inClass) || c === '\n') {
        state = 'code'
        inClass = false
        last = c
      }
    } else if (c === state || (c === '\n' && state !== '`')) {
      state = 'code' // closing quote (an unterminated '/" string ends at the line)
      last = c
      out += c
      continue
    }
    const inComment = state === 'line' || state === 'block'
    out += inComment && c !== '\n' ? ' ' : c
  }
  return out
}

/** Blanks `<!-- … -->` comments, keeping newlines. @param {string} src */
const blankHtmlComments = src => src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))

/**
 * Source lines with comments blanked: what the code checks scan. In a `.vue` file JS comments
 * are only recognized inside `<script>` blocks — template text (`see https://…`) is not a comment.
 * @param {CheckContext} ctx @param {string} file
 */
function codeLines(ctx, file) {
  const src = read(ctx, file)
  if (!file.endsWith('.vue')) return blankJsComments(src).split('\n')
  const SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g
  let out = '', last = 0
  for (const m of src.matchAll(SCRIPT)) {
    const start = /** @type {number} */ (m.index)
    out += blankHtmlComments(src.slice(last, start)) + m[1] + blankJsComments(/** @type {string} */ (m[2])) + m[3]
    last = start + m[0].length
  }
  return (out + blankHtmlComments(src.slice(last))).split('\n')
}

const isTest = (/** @type {string} */ f) => /\.(test|spec)\.[jt]s$/.test(f)
const SERVER_SIDE = /^(?:layers\/[^/]+\/)?(?:server|shared|modules)\//

/**
 * @param {string} name
 * @param {(ctx: CheckContext) => Iterable<Omit<Finding, 'check'>>} scan
 * @returns {Check}
 */
function check(name, scan) {
  return { name, run: ctx => [...scan(ctx)].map(f => ({ check: name, ...f })) }
}

// ─── Import hygiene ─────────────────────────────────────────────────────────
const DEEP_RELATIVE = /from ['"]\.\.\/\.\.\//
const BARREL_IMPORT = /from ['"]\.\.?\/?index['"]/

export const importHygiene = check('Import hygiene', function* (ctx) {
  for (const file of ctx.files) {
    for (const [i, line] of codeLines(ctx, file).entries()) {
      if (DEEP_RELATIVE.test(line)) yield { file, line: i + 1, severity: 'error', message: `deep relative import — use an alias (~/, ~~/, #shared): ${line.trim()}` }
      if (BARREL_IMPORT.test(line)) yield { file, line: i + 1, severity: 'error', message: `barrel import — import the module directly: ${line.trim()}` }
    }
  }
})

// ─── Escape hatches ─────────────────────────────────────────────────────────
// A gate the agent can switch off is not a gate. TS suppressions are banned
// outright; an eslint-disable must name its rules, give a `-- reason`, and may
// never target a rule the harness owns.
const TS_SUPPRESSION = /@ts-(ignore|nocheck|expect-error)\b/
const ESLINT_DISABLE = /eslint-disable(?:-next-line|-line)?(?=\s|\*\/|-->|$)(.*)/
const HARNESS_OWNED = /^(arch\/|complexity$|max-params$|max-depth$|no-else-return$|no-empty$|no-unsafe-finally$|no-restricted-(syntax|imports)$|@typescript-eslint\/(no-explicit-any|no-restricted-imports|switch-exhaustiveness-check|no-unnecessary-condition|no-unnecessary-type-assertion|no-unsafe-return)$|vue\/(define-props-declaration|define-emits-declaration|require-typed-ref|no-setup-props-reactivity-loss)$)/

export const escapeHatches = check('Escape hatches', function* (ctx) {
  for (const file of ctx.files) {
    for (const [i, line] of lines(ctx, file).entries()) {
      const ts = TS_SUPPRESSION.exec(line)
      if (ts) {
        yield { file, line: i + 1, severity: 'error', message: `@ts-${ts[1]} — fix the type instead of silencing the compiler` }
        continue
      }
      const disable = ESLINT_DISABLE.exec(line)
      if (!disable) continue
      const [rulesPart = '', reason] = (disable[1] ?? '').replace(/\*\/|-->/, '').split(/\s--\s/)
      const rules = rulesPart.split(',').map(r => r.trim()).filter(Boolean)
      if (rules.length === 0) {
        yield { file, line: i + 1, severity: 'error', message: 'blanket eslint-disable — name the rule(s) and give a `-- reason`' }
      } else if (rules.some(r => HARNESS_OWNED.test(r))) {
        yield { file, line: i + 1, severity: 'error', message: `eslint-disable of a harness rule (${rules.filter(r => HARNESS_OWNED.test(r)).join(', ')}) — fix the code` }
      } else if (!reason?.trim()) {
        yield { file, line: i + 1, severity: 'error', message: `eslint-disable ${rules.join(', ')} without a reason — append \` -- why this is safe\`` }
      }
    }
  }
})

// ─── Console hygiene ────────────────────────────────────────────────────────
const CONSOLE = /console\.(log|debug|info)\s*\(/

export const consoleHygiene = check('Console hygiene', function* (ctx) {
  for (const file of ctx.files) {
    if (isTest(file)) continue
    for (const [i, line] of codeLines(ctx, file).entries()) {
      if (CONSOLE.test(line)) {
        yield { file, line: i + 1, severity: 'error', message: `${line.trim()} — remove it, or log through the app's logger (console.warn/error stay allowed)` }
      }
    }
  }
})

// ─── Secret scan ────────────────────────────────────────────────────────────
// cspell:ignore apikey
const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/, label: 'Stripe live key' },
  { pattern: /sk_test_[a-zA-Z0-9]{20,}/, label: 'Stripe test key' },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Hardcoded password' },
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{16,}['"]/i, label: 'Hardcoded API key' },
  { pattern: /(?:secret|token)\s*[:=]\s*['"][^'"]{20,}['"]/i, label: 'Hardcoded secret/token' },
  { pattern: /['"][a-zA-Z0-9+/]{40,}={0,2}['"]/, label: 'Potential base64 secret (40+ chars)' }
]

export const secretScan = check('Secret scan', function* (ctx) {
  for (const file of ctx.files) {
    for (const [i, line] of codeLines(ctx, file).entries()) {
      const trimmed = line.trim()
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(line)) yield { file, line: i + 1, severity: 'error', message: `${label}: ${trimmed.slice(0, 60)} — read it from runtimeConfig / an environment variable` }
      }
    }
  }
})

// ─── Unvalidated readBody ───────────────────────────────────────────────────
// Every readBody() result — or one of the app's own `bodyReaders` — must reach
// .safeParse()/.parse() on the same line or within the next few lines, otherwise the server
// trusts `any`. h3's readValidatedBody(event, schema.parse) validates in one call and is never flagged.
const BODY_PARSE_LOOKAHEAD = 3
const PARSED = /safeParse\s*\(|\.parse\s*\(/

export const unvalidatedReadBody = check('Unvalidated readBody', function* (ctx) {
  const readers = ['readBody', ...(ctx.options?.bodyReaders ?? [])].join('|')
  // `readJsonBody<Input>(event)`: an optional type argument sits between the name and the call
  const call = `(?:<[^>]*>)?\\s*\\(`
  // the reader's own definition (`function readJsonBody<T>(`) is not a call
  const READ_BODY = new RegExp(`(?<!function\\s+)\\b(${readers})\\s*${call}`)
  const ASSIGNED = new RegExp(`\\b(?:const|let)\\s+(\\w+)\\s*=\\s*await\\s+(?:${readers})\\s*${call}`)
  for (const file of ctx.files) {
    if (!/(?:^|\/)server\//.test(file) || !file.endsWith('.ts')) continue
    // comments are blanked both ways: a commented-out call is not a read, a commented-out .parse() is not validation
    const src = codeLines(ctx, file)
    for (const [i, line] of src.entries()) {
      const call = READ_BODY.exec(line)
      if (!call || PARSED.test(line)) continue
      const variable = ASSIGNED.exec(line)?.[1]
      if (variable) {
        const parsesVariable = new RegExp(`(?:safeParse|\\.parse)\\s*\\(\\s*${variable}\\s*[,)]`)
        if (src.slice(i + 1, i + 1 + BODY_PARSE_LOOKAHEAD).some(l => parsesVariable.test(l))) continue
      }
      yield { file, line: i + 1, severity: 'error', message: `${call[1]}() not wrapped in .safeParse()/.parse() — use readValidatedBody(event, schema.parse): ${line.trim()}` }
    }
  }
})

// ─── i18n keys ──────────────────────────────────────────────────────────────
// Static `t('a.b')` / `$t('a.b')` keys must exist in every JSON locale file
// (`i18n/locales/` — the @nuxtjs/i18n v9+ default — or a root `locales/`).
const T_CALL = /(?<![\w.])\$?t\(\s*['"]([\w-]+(?:\.[\w-]+)+)['"]/g

/** @param {any} obj @param {string} key */
function hasKey(obj, key) {
  let node = obj
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false
    node = node[part]
  }
  return true
}

export const i18nKeys = check('i18n keys', function* (ctx) {
  const dir = [join(ctx.root, 'i18n', 'locales'), join(ctx.root, 'locales')].find(existsSync)
  if (!dir) return
  const locales = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => ({ name: f, messages: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
  for (const file of ctx.files) {
    if (SERVER_SIDE.test(file) || isTest(file)) continue
    for (const [i, line] of codeLines(ctx, file).entries()) {
      for (const match of line.matchAll(T_CALL)) {
        const key = /** @type {string} */ (match[1])
        const missing = locales.filter(l => !hasKey(l.messages, key)).map(l => l.name)
        if (missing.length > 0) yield { file, line: i + 1, severity: 'error', message: `i18n key '${key}' missing in ${missing.join(', ')}` }
      }
    }
  }
})

// ─── TODO / FIXME / HACK (warning only) ─────────────────────────────────────
const MARKER = /\/\/\s*(TODO|FIXME|HACK)\b/i

export const todoMarkers = check('TODO markers', function* (ctx) {
  for (const file of ctx.files) {
    for (const [i, line] of lines(ctx, file).entries()) {
      if (MARKER.test(line)) yield { file, line: i + 1, severity: 'warning', message: line.trim() }
    }
  }
})

/** @type {Check[]} */
export const STATIC_CHECKS = [importHygiene, escapeHatches, consoleHygiene, secretScan, unvalidatedReadBody, i18nKeys, todoMarkers]
