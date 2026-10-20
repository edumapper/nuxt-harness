// @ts-check
/**
 * Findings for the project's own ESLint step in `full`.
 *
 * The step runs the app's ESLint config, which includes the harness rules, so the same problem
 * would otherwise be reported twice: once by "ESLint (harness rules)", once here. And reading the
 * text output line by line made every line an error — file headers and the summary included —
 * with no file, line or rule. Here the step's JSON output becomes one finding per message, and the
 * ones the harness step already reported (same file, line and rule) are dropped.
 */

import { relative } from 'node:path'

/** @typedef {import('./checks.js').Finding} Finding */

/**
 * @param {string} stdout `eslint --format json` output
 * @param {string} root the app root (ESLint reports absolute paths)
 * @param {string} check the step name
 * @returns {Finding[] | undefined} undefined when the output is not ESLint JSON (a crash, a config error)
 */
export function eslintFindings (stdout, root, check) {
  /** @type {any} */
  let results
  try {
    results = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!Array.isArray(results)) return undefined
  /** @type {Finding[]} */
  const findings = []
  for (const result of results) {
    const file = relative(root, result.filePath)
    for (const m of result.messages ?? []) {
      const error = m.severity === 2 || m.fatal === true
      findings.push({
        check,
        file,
        line: m.line ?? 0,
        rule: m.ruleId ?? 'parse',
        // The step runs with --max-warnings 0: the app's own warnings fail it, so they stay errors.
        message: error ? m.message : `${m.message} (warning; the project ESLint step runs with --max-warnings 0)`,
        severity: 'error'
      })
    }
  }
  return findings
}

/**
 * Drop the findings another check already reported (same file, line and rule).
 * @param {Finding[]} findings
 * @param {Finding[]} reported
 * @returns {Finding[]}
 */
export function withoutDuplicates (findings, reported) {
  const key = (/** @type {Finding} */ f) => `${f.file}:${f.line}:${f.rule ?? ''}`
  const seen = new Set(reported.map(key))
  return findings.filter(f => !seen.has(key(f)))
}
