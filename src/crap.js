// @ts-check
/**
 * CRAP score per function: complexity² × (1 − coverage)³ + complexity.
 *
 * Complexity comes from ESLint's `complexity` rule at threshold 0 (every function
 * reports its score); coverage from vitest's istanbul `coverage-final.json`.
 * A function absent from coverage counts as 0 % covered.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { lintFiles } from './lint.js'

/** @typedef {import('./checks.js').Finding} Finding */
/** @typedef {{ start: { line: number, column: number }, end: { line: number, column: number } }} Range */
/** @typedef {{ statementMap: Record<string, Range>, s: Record<string, number>, fnMap: Record<string, { loc: Range }> }} FileCoverage */

export const CRAP_THRESHOLD = 30
const COMPLEXITY_MESSAGE = /has a complexity of (\d+)/

/** @param {number} complexity @param {number} coverage 0..1 */
export function crap(complexity, coverage) {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity
}

/** @param {Range} outer @param {Range} inner */
function contains(outer, inner) {
  const after = inner.start.line > outer.start.line || (inner.start.line === outer.start.line && inner.start.column >= outer.start.column)
  const before = inner.end.line < outer.end.line || (inner.end.line === outer.end.line && inner.end.column <= outer.end.column)
  return after && before
}

/**
 * Statement coverage of the function starting at `line` (ESLint reports the function node's start).
 * @param {FileCoverage | undefined} cov @param {number} line
 */
export function functionCoverage(cov, line) {
  if (!cov) return 0
  const fn = Object.values(cov.fnMap).find(f => f.loc.start.line === line)
  if (!fn) return 0
  const ids = Object.keys(cov.statementMap).filter(id => contains(fn.loc, /** @type {Range} */ (cov.statementMap[id])))
  if (ids.length === 0) return 0
  return ids.filter(id => (cov.s[id] ?? 0) > 0).length / ids.length
}

/**
 * @param {string} root
 * @param {string[]} files relative paths (.ts/.js only — components are covered by the layer rules, not unit tests)
 * @param {import('./config.js').HarnessOptions} [options]
 * @param {string} [coverageFile]
 * @returns {Promise<Finding[]>}
 */
export async function crapFindings(root, files, options, coverageFile = join(root, '.harness', 'coverage', 'coverage-final.json')) {
  /** @type {Record<string, FileCoverage>} */
  const coverage = existsSync(coverageFile) ? JSON.parse(readFileSync(coverageFile, 'utf8')) : {}
  const targets = files.filter(f => /\.[jt]s$/.test(f) && !/\.(test|spec)\.[jt]s$/.test(f))
  const results = await lintFiles(root, targets, { options, extraRules: { complexity: ['error', 0] } })
  /** @type {Finding[]} */
  const findings = []
  for (const result of results) {
    const file = result.filePath.slice(root.length + 1)
    for (const m of result.messages) {
      const c = m.ruleId === 'complexity' ? COMPLEXITY_MESSAGE.exec(m.message) : null
      if (!c) continue
      const complexity = Number(c[1])
      const cov = functionCoverage(coverage[result.filePath], m.line)
      const score = crap(complexity, cov)
      if (score <= CRAP_THRESHOLD) continue
      findings.push({
        check: 'CRAP',
        file,
        line: m.line,
        rule: 'crap',
        severity: 'error',
        message: `CRAP ${score.toFixed(0)} > ${CRAP_THRESHOLD} (complexity ${complexity}, coverage ${(cov * 100).toFixed(0)} %) — add tests or split the function`
      })
    }
  }
  return findings
}

/**
 * Ratchet for legacy code, same semantics as ESLint bulk suppressions: a file's CRAP
 * findings pass while their count stays ≤ the recorded count; one more and all report.
 *
 * @param {Finding[]} findings
 * @param {Record<string, number>} baseline file → allowed count
 */
export function applyBaseline(findings, baseline) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const f of findings) counts[f.file] = (counts[f.file] ?? 0) + 1
  return findings.filter(f => (counts[f.file] ?? 0) > (baseline[f.file] ?? 0))
}

/** @param {Finding[]} findings @returns {Record<string, number>} */
export function baselineFrom(findings) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const f of [...findings].sort((a, b) => a.file.localeCompare(b.file))) counts[f.file] = (counts[f.file] ?? 0) + 1
  return counts
}
