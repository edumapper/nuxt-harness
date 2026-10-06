import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { lint } from '../src/lint.js'

const REFERENCES = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'nuxt-harness', 'references')
const DOCS = ['gold-standards.md', 'architecture.md']

// Each ```vue block starts with `<!-- path/to/File.vue -->`: lint it at that path, so the
// layer rules for that file apply. Examples that break the rules teach the wrong thing.
const blocks = DOCS.flatMap(doc => [...readFileSync(join(REFERENCES, doc), 'utf8').matchAll(/```vue\n<!-- (\S+\.vue) -->\n([\s\S]*?)```/g)]
  .map(([, path, code]) => ({ doc, path: path as string, code: code as string })))

const root = mkdtempSync(join(tmpdir(), 'nuxt-harness-docs-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('gold standards pass the harness', () => {
  it('has examples to check', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(9)
  })

  it.each(blocks)('$doc: $path', async ({ doc, path, code }) => {
    // one project per doc: both docs may show a file at the same path
    const project = join(root, doc.replace('.md', ''))
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), code)
    const findings = await lint(project, [path], { root: project, i18n: false })
    expect(findings.map(f => `${f.line}: [${f.rule}] ${f.message.split('\n')[0]}`)).toEqual([])
  })
})
