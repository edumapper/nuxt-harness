import { describe, expect, it } from 'vitest'

import { eslintFindings, withoutDuplicates } from '../src/tool-report.js'

const root = '/app'
const json = (results: unknown) => JSON.stringify(results)

// The project ESLint step runs the app's config, which includes the harness rules: each problem
// must be reported once, with its file, line and rule (not one "error" per line of text output).
describe('eslintFindings — the project ESLint step, one finding per message', () => {
  it('reads file, line and rule from the JSON output, relative to the app root', () => {
    const out = json([{ filePath: '/app/app/pages/index.vue', messages: [{ ruleId: 'vue/no-v-html', severity: 2, line: 12, message: 'v-html is risky' }] }])
    expect(eslintFindings(out, root, 'ESLint (project, type-aware)')).toEqual([
      { check: 'ESLint (project, type-aware)', file: 'app/pages/index.vue', line: 12, rule: 'vue/no-v-html', message: 'v-html is risky', severity: 'error' }
    ])
  })

  it('keeps the app\'s own warnings failing, as --max-warnings 0 does, and says why', () => {
    const out = json([{ filePath: '/app/app/a.ts', messages: [{ ruleId: 'perfectionist/sort-imports', severity: 1, line: 3, message: 'Expected sorted imports' }] }])
    const [finding] = eslintFindings(out, root, 'step') ?? []
    expect(finding?.severity).toBe('error')
    expect(finding?.message).toMatch(/--max-warnings 0/)
  })

  it('reports a parse error as rule "parse", like the harness step', () => {
    const out = json([{ filePath: '/app/app/a.ts', messages: [{ ruleId: null, fatal: true, severity: 2, line: 1, message: 'Parsing error' }] }])
    expect(eslintFindings(out, root, 'step')?.[0]?.rule).toBe('parse')
  })

  it('returns undefined for output that is not ESLint JSON, so the text fallback runs', () => {
    expect(eslintFindings('Oops! Something went wrong!', root, 'step')).toBeUndefined()
    expect(eslintFindings('{"not":"an array"}', root, 'step')).toBeUndefined()
  })
})

describe('withoutDuplicates — what the harness step already reported is not counted again', () => {
  const finding = (file: string, line: number, rule: string, severity: 'error' | 'warning' = 'error') =>
    ({ check: 'x', file, line, rule, message: 'm', severity })

  it('drops the same file, line and rule, whatever the severity; keeps the rest', () => {
    const project = [finding('app/a.ts', 4, 'arch/timer-needs-scope-dispose'), finding('app/a.ts', 9, 'vue/no-v-html'), finding('app/b.ts', 4, 'arch/timer-needs-scope-dispose')]
    const harness = [finding('app/a.ts', 4, 'arch/timer-needs-scope-dispose', 'warning')]
    expect(withoutDuplicates(project, harness).map(f => `${f.file}:${f.line}`)).toEqual(['app/a.ts:9', 'app/b.ts:4'])
  })
})
