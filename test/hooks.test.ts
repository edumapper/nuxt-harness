import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nuxt-harness.js')
let root: string | undefined

function repo(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'nuxt-harness-hooks-'))
  spawnSync('git', ['init', '-q'], { cwd: root })
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

function run(command: string, input: object, cwd: string) {
  return spawnSync(process.execPath, [BIN, command], { cwd, input: JSON.stringify(input), encoding: 'utf8' })
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

const BAD = { 'app/components/Bad.vue': '<script setup lang="ts">\nconst v: any = 1\n</script>\n' }
const GOOD = { 'app/components/Good.vue': '<script setup lang="ts">\nconst v: number = 1\n</script>\n' }

describe('stop — the turn cannot end on a failing branch', () => {
  // Files written through Bash never reach the PostToolUse hook; the Stop gate still sees them.
  it('blocks (exit 2) with the findings on stderr while a changed file fails', () => {
    const cwd = repo(BAD)
    const r = run('stop', { session_id: 's1', cwd }, cwd)
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('app/components/Bad.vue:2')
    expect(r.stderr).toContain('no-explicit-any')
  })

  it('lets a clean branch finish', () => {
    const cwd = repo(GOOD)
    expect(run('stop', { session_id: 's1', cwd }, cwd).status).toBe(0)
  })

  // An error the agent cannot fix must not trap it in an endless stop loop.
  it('gives up after 3 blocks in a session and warns the user instead', () => {
    const cwd = repo(BAD)
    for (let i = 0; i < 3; i++) expect(run('stop', { session_id: 's1', cwd }, cwd).status).toBe(2)
    const r = run('stop', { session_id: 's1', cwd }, cwd)
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout).systemMessage).toContain('1 error(s) remain')
    // a new session starts counting again
    expect(run('stop', { session_id: 's2', cwd }, cwd).status).toBe(2)
  })
})

describe('hook — feedback right after an edit', () => {
  it('reports only the edited file and ignores files outside app/server/shared/modules', () => {
    const cwd = repo({ ...BAD, 'scripts/x.ts': 'const v: any = 1\n' })
    expect(run('hook', { tool_input: { file_path: join(cwd, 'app/components/Bad.vue') } }, cwd).status).toBe(2)
    expect(run('hook', { tool_input: { file_path: join(cwd, 'scripts/x.ts') } }, cwd).status).toBe(0)
  })
})

describe('fast — works on any Nuxt 4 app out of the box', () => {
  // Default Tailwind palettes, string navigation without i18n, console.warn: none of these are
  // the harness's business until the app opts in.
  const PLAIN_APP = {
    'package.json': '{"name":"plain"}',
    'app/pages/index.vue': '<script setup lang="ts">\nasync function go(): Promise<void> {\n  await navigateTo(\'/about\')\n}\n</script>\n\n<template>\n  <div class="text-gray-700 bg-slate-50">\n    <OrcHome @go="go" />\n  </div>\n</template>\n',
    'app/components/OrcHome.vue': '<script setup lang="ts">\nconst emit = defineEmits<{ go: [] }>()\nconst { data } = await useFetch(\'/api/hello\')\n</script>\n\n<template>\n  <button class="text-sky-600" @click="emit(\'go\')">{{ data }}</button>\n</template>\n'
  }

  it('passes a plain app with default Tailwind colors and no i18n', () => {
    const cwd = repo(PLAIN_APP)
    const r = spawnSync(process.execPath, [BIN, 'fast', '--all'], { cwd, encoding: 'utf8' })
    expect(r.stdout).toContain('passed')
    expect(r.status).toBe(0)
  })

  it('applies the design system declared in nuxt-harness.config.mjs', () => {
    const cwd = repo({ ...PLAIN_APP, 'nuxt-harness.config.mjs': 'export default { designSystem: { palettes: [\'zinc\'] } }\n' })
    const r = spawnSync(process.execPath, [BIN, 'fast', '--all'], { cwd, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('no-off-palette-color-class')
  })
})

describe('baseline — legacy static-check errors are recorded once, then can only go down', () => {
  const gate = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [BIN, ...args, '--json'], { cwd, encoding: 'utf8' })
  const consoleErrors = (r: ReturnType<typeof gate>) =>
    (JSON.parse(r.stdout).checks as { name: string, findings: { line: number }[] }[]).find(c => c.name === 'Console hygiene')?.findings.map(f => f.line)

  it('full --update-baseline records them; fast passes until a file gets one more', () => {
    const cwd = repo({ 'package.json': '{}', 'app/utils/legacy.ts': 'console.log(1)\nconsole.log(2)\nexport {}\n' })
    gate(cwd, 'full', '--update-baseline')
    const baseline = JSON.parse(readFileSync(join(cwd, 'nuxt-harness-baseline.json'), 'utf8'))
    expect(baseline.checks['Console hygiene']).toEqual({ 'app/utils/legacy.ts': 2 })

    expect(gate(cwd, 'fast', '--all').status).toBe(0)

    // one more in the same file: every error in it reports again
    writeFileSync(join(cwd, 'app/utils/legacy.ts'), 'console.log(1)\nconsole.log(2)\nconsole.log(3)\nexport {}\n')
    const r = gate(cwd, 'fast', '--all')
    expect(r.status).toBe(1)
    expect(consoleErrors(r)).toEqual([1, 2, 3])
  })

  it('reads a baseline written before static checks were recorded (CRAP only)', () => {
    const cwd = repo({ 'nuxt-harness-baseline.json': '{ "crap": {} }', 'app/utils/x.ts': 'console.log(1)\n' })
    expect(consoleErrors(gate(cwd, 'fast', '--all'))).toEqual([1])
  })
})
