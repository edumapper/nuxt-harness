import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { escapeHatches, i18nKeys, unvalidatedReadBody } from '../src/checks.js'
import { applyBaseline, crap, functionCoverage } from '../src/crap.js'

let root: string | undefined

function fixture(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'nuxt-harness-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return { root, files: Object.keys(files) }
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

describe('unvalidatedReadBody', () => {
  it('flags readJsonBody whose result is never parsed — the body stays untrusted `unknown`', () => {
    const findings = unvalidatedReadBody.run(fixture({ 'server/api/x.patch.ts': 'const body = await readJsonBody(event)\n\nreturn save(body)\n' }))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('readJsonBody()')
  })

  it('flags the two-line form when a different variable is parsed', () => {
    const findings = unvalidatedReadBody.run(fixture({ 'server/api/x.patch.ts': 'const body = await readJsonBody(event)\nconst parsed = schema.safeParse(other)\n' }))
    expect(findings).toHaveLength(1)
  })

  it('accepts the body parsed on the next line', () => {
    const findings = unvalidatedReadBody.run(fixture({ 'server/api/x.patch.ts': 'const body = await readBody(event)\nconst parsed = schema.safeParse(body)\n' }))
    expect(findings).toEqual([])
  })
})

describe('escapeHatches — a gate the agent can switch off is not a gate', () => {
  const run = (code: string) => escapeHatches.run(fixture({ 'app/x.ts': code }))

  it('bans every TS suppression, including @ts-expect-error', () => {
    expect(run('// @ts-ignore\n// @ts-nocheck\n// @ts-expect-error\n')).toHaveLength(3)
  })

  it('bans blanket eslint-disable', () => {
    expect(run('/* eslint-disable */\n')[0]?.message).toContain('blanket')
  })

  it('bans disabling a harness-owned rule even with a reason', () => {
    expect(run('// eslint-disable-next-line @typescript-eslint/no-explicit-any -- emblaApi untyped\n')[0]?.message).toContain('harness rule')
  })

  it('requires a reason for third-party rules', () => {
    expect(run('// eslint-disable-next-line vue/no-v-html\n')[0]?.message).toContain('without a reason')
  })

  it('accepts a named, explained disable of a non-harness rule (template comment form)', () => {
    expect(run('<!-- eslint-disable vue/no-v-html -- sanitized via $sanitize -->\n')).toEqual([])
  })
})

describe('i18nKeys', () => {
  it('flags a static key missing from one locale — the other locale renders the raw key', () => {
    const ctx = fixture({
      'i18n/locales/fr.json': '{"home":{"title":"Accueil"}}',
      'i18n/locales/en.json': '{"home":{}}',
      'app/pages/home.vue': '<template>{{ t(\'home.title\') }} {{ $t(\'home.title\') }}</template>'
    })
    const findings = i18nKeys.run({ ...ctx, files: ['app/pages/home.vue'] })
    expect(findings).toHaveLength(2)
    expect(findings[0]?.message).toContain('en.json')
  })
})

describe('CRAP', () => {
  it('equals complexity when fully covered, complexity² + complexity when untested', () => {
    expect(crap(6, 1)).toBe(6)
    expect(crap(6, 0)).toBe(42)
  })

  it('measures statement coverage inside the function that starts on the reported line', () => {
    const loc = (l1: number, l2: number) => ({ start: { line: l1, column: 0 }, end: { line: l2, column: 1 } })
    const cov = {
      fnMap: { 0: { loc: loc(1, 10) } },
      statementMap: { 0: loc(2, 2), 1: loc(3, 3), 2: loc(20, 20) },
      s: { 0: 1, 1: 0, 2: 5 }
    }
    expect(functionCoverage(cov, 1)).toBe(0.5)
    expect(functionCoverage(undefined, 1)).toBe(0)
  })

  it('baseline lets legacy hits pass but reports all of a file\'s hits once a new one appears', () => {
    const hit = (file: string) => ({ check: 'CRAP', file, line: 1, message: '', severity: 'error' as const })
    expect(applyBaseline([hit('a.ts'), hit('a.ts')], { 'a.ts': 2 })).toEqual([])
    expect(applyBaseline([hit('a.ts'), hit('a.ts'), hit('a.ts')], { 'a.ts': 2 })).toHaveLength(3)
    expect(applyBaseline([hit('b.ts')], { 'a.ts': 2 })).toHaveLength(1)
  })
})
