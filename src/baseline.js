// @ts-check
/**
 * Ratchet for legacy code, same semantics as ESLint bulk suppressions: a file's
 * findings pass while their count stays ≤ the recorded count; one more and all report.
 */
/** @typedef {import('./checks.js').Finding} Finding */

/**
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
