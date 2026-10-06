// @ts-check
/**
 * Fast ESLint pass: the harness rules only, parsed with the harness's own
 * dependencies. No `.nuxt/`, no type information, no app node_modules.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ESLint } from 'eslint'

import { standalone } from './eslint.js'

/** @typedef {import('./checks.js').Finding} Finding */

const UNKNOWN_RULE = /^Definition for rule '.+' was not found\.?$/

/**
 * Bulk suppressions (`eslint --suppress-all`) are a CLI feature; apply the same
 * file → rule → count ratchet here so the fast gate agrees with `eslint .`:
 * a rule is suppressed in a file only while its error count stays ≤ the recorded count.
 *
 * @param {string} root
 * @returns {Record<string, Record<string, { count: number }>>}
 */
function loadSuppressions(root) {
  const path = join(root, 'eslint-suppressions.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

/**
 * @param {string} root
 * @param {string[]} files relative to root
 * @param {import('eslint').Linter.RulesRecord} [extraRules]
 */
export async function lintFiles(root, files, extraRules) {
  /** @type {import('eslint').Linter.Config[]} */
  const config = /** @type {any} */ (await standalone())
  if (extraRules) config.push({ files: ['**/*.{ts,js,vue}'], rules: extraRules })
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config, errorOnUnmatchedPattern: false })
  return eslint.lintFiles(files)
}

/**
 * @param {string} root
 * @param {string[]} files relative to root
 * @returns {Promise<Finding[]>}
 */
export async function lint(root, files) {
  if (files.length === 0) return []
  const results = await lintFiles(root, files)
  const suppressions = loadSuppressions(root)
  /** @type {Finding[]} */
  const findings = []
  for (const result of results) {
    const file = result.filePath.slice(root.length + 1)
    const suppressed = suppressions[file] ?? {}
    /** @type {Record<string, number>} */
    const errorsByRule = {}
    for (const m of result.messages) {
      if (m.severity === 2 && m.ruleId) errorsByRule[m.ruleId] = (errorsByRule[m.ruleId] ?? 0) + 1
    }
    for (const m of result.messages) {
      // Disable comments may name rules from the app's full config (e.g. @stylistic/*),
      // which the standalone config does not load — not a problem in the file.
      if (UNKNOWN_RULE.test(m.message)) continue
      const rule = m.ruleId ?? 'parse'
      const budget = suppressed[rule]?.count
      if (m.severity === 2 && budget !== undefined && (errorsByRule[rule] ?? 0) <= budget) continue
      findings.push({
        check: 'ESLint (harness rules)',
        file,
        line: m.line,
        rule,
        message: m.message,
        severity: m.severity === 2 ? 'error' : 'warning'
      })
    }
  }
  return findings
}
