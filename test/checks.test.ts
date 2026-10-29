import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { consoleHygiene, escapeHatches, i18nKeys, importHygiene, todoMarkers } from '../src/checks.js'
import { applyBaseline } from '../src/baseline.js'

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

describe('baseline ratchet', () => {
  it('lets legacy hits pass but reports all of a file\'s hits once a new one appears', () => {
    const hit = (file: string) => ({ check: 'Console hygiene', file, line: 1, message: '', severity: 'error' as const })
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

  it('ignores imports in comments', () => {
    expect(importHygiene.run(fixture({ 'app/x.ts': '// import { a } from \'../../a\'\nexport {}\n' }))).toEqual([])
  })

  it('keeps reading comments where comments are the point', () => {
    const ctx = fixture({ 'app/x.ts': '// TODO: remove\n/* eslint-disable */\n' })
    expect(todoMarkers.run(ctx)).toHaveLength(1)
    expect(escapeHatches.run(ctx)).toHaveLength(1)
  })
})
