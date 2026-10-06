import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { consoleHygiene, escapeHatches, i18nKeys, importHygiene, todoMarkers, unvalidatedReadBody } from '../src/checks.js'
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
  it('flags readBody whose result is never parsed — the body stays untrusted `any`', () => {
    const findings = unvalidatedReadBody.run(fixture({ 'server/api/x.patch.ts': 'const body = await readBody(event)\n\nreturn save(body)\n' }))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('readValidatedBody')
  })

  it('flags the two-line form when a different variable is parsed', () => {
    const findings = unvalidatedReadBody.run(fixture({ 'server/api/x.patch.ts': 'const body = await readBody(event)\nconst parsed = schema.safeParse(other)\n' }))
    expect(findings).toHaveLength(1)
  })

  it('checks the app\'s own body readers', () => {
    const ctx = { ...fixture({ 'server/api/x.post.ts': 'const body = await readJsonBody<Input>(event)\nreturn save(body)\n' }), options: { bodyReaders: ['readJsonBody'] } }
    expect(unvalidatedReadBody.run(ctx)).toHaveLength(1)
    expect(unvalidatedReadBody.run({ ...ctx, options: {} })).toEqual([])
    const definition = { ...fixture({ 'server/utils/read-json-body.ts': 'export async function readJsonBody<T>(event: H3Event): Promise<T> {\n' }), options: { bodyReaders: ['readJsonBody'] } }
    expect(unvalidatedReadBody.run(definition)).toEqual([])
  })

  it('accepts readValidatedBody and checks server routes inside layers', () => {
    expect(unvalidatedReadBody.run(fixture({ 'server/api/x.post.ts': 'const body = await readValidatedBody(event, schema.parse)\n' }))).toEqual([])
    expect(unvalidatedReadBody.run(fixture({ 'layers/base/server/api/x.post.ts': 'const body = await readBody(event)\n' }))).toHaveLength(1)
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

// Code checks see code and strings only; a comment mentioning console.log or readBody is not a call.
describe('comments are not code', () => {
  const lineNumbers = (findings: { line: number }[]) => findings.map(f => f.line)

  it('ignores console calls in line, block, JSDoc, trailing and HTML comments', () => {
    const ctx = fixture({
      'app/composables/useX.ts': '/* console.log("a") */\nexport const x = 1 // console.info(x)\n/**\n * console.debug(x)\n */\nconsole.log(x)\n',
      'app/components/A.vue': '<script setup lang="ts">\n// console.log("script comment")\n</script>\n\n<template>\n  <!-- console.log("template comment") -->\n  <div />\n</template>\n'
    })
    const findings = consoleHygiene.run(ctx)
    expect(findings.map(f => `${f.file}:${f.line}`)).toEqual(['app/composables/useX.ts:6'])
  })

  it('treats strings as code: `//` in a URL does not hide the rest of the line', () => {
    expect(lineNumbers(consoleHygiene.run(fixture({ 'app/x.ts': 'const u = \'https://a.b\'; console.log(u)\n' })))).toEqual([1])
  })

  it('treats regex literals as code: a trailing `\\//` is not a comment', () => {
    const code = 'const isUrl = (s: string) => /^https?:\\/\\//i.test(s); console.log(isUrl)\nconst half = total / 2 // console.log(half)\nconst r = [/a\\/b/, /[/]/]; console.log(r)\n'
    expect(lineNumbers(consoleHygiene.run(fixture({ 'app/x.ts': code })))).toEqual([1, 3])
  })

  it('reads template text as text, not as a JS comment', () => {
    const ctx = fixture({ 'app/components/A.vue': '<template>\n  <p>See https://example.com — {{ t(\'missing.key\') }}</p>\n</template>\n', 'i18n/locales/en.json': '{}' })
    expect(lineNumbers(i18nKeys.run(ctx))).toEqual([2])
  })

  it('ignores readBody in comments, and a commented-out .parse() is not validation', () => {
    const ctx = fixture({
      'server/api/x.post.ts': '/**\n * Never call readBody(event) directly.\n */\n// const body = await readBody(event)\nconst body = await readBody(event)\n// const parsed = schema.parse(body)\n'
    })
    expect(lineNumbers(unvalidatedReadBody.run(ctx))).toEqual([5])
  })

  it('ignores imports in comments', () => {
    expect(importHygiene.run(fixture({ 'app/x.ts': '// import { a } from \'../../a\'\nexport {}\n' }))).toEqual([])
  })

  it('keeps reading comments where comments are the point', () => {
    const ctx = fixture({ 'app/x.ts': '// TODO: remove\n/* eslint-disable */\n' })
    expect(todoMarkers.run(ctx)).toHaveLength(1)
    expect(escapeHatches.run(ctx)).toHaveLength(1)
  })
})
