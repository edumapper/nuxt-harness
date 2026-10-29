import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { AGENTS_END, AGENTS_START, initProject } from '../src/init.js'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nuxt-harness.js')
let root: string | undefined

function project(files: Record<string, string> = {}) {
  root = mkdtempSync(join(tmpdir(), 'nuxt-harness-init-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const read = (path: string) => readFileSync(join(/** @type {string} */ (root), path), 'utf8')

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

describe('init — the agent-facing files', () => {
  it('writes a short AGENTS.md block and ignores .harness/', () => {
    const dir = project()
    const actions = initProject(dir)
    expect(actions.map(a => `${a.file}:${a.status}`)).toEqual(['AGENTS.md:added', '.gitignore:added'])

    const agents = read('AGENTS.md')
    expect(agents).toContain(AGENTS_START)
    expect(agents).toContain(AGENTS_END)
    expect(agents).toContain('nuxt-harness guide <path>')
    expect(agents).toContain('nuxt-harness fast <path>')
    expect(agents).toContain('nuxt-harness full')
    expect(agents).toContain('never runs the test suite')
    // Claude Code and Codex both ask for short, command-first instruction files.
    expect(agents.split('\n').length).toBeLessThan(40)
    expect(read('.gitignore')).toBe('.harness/\n')
  })

  it('warns when a CLAUDE.md would shadow AGENTS.md', () => {
    const dir = project({ 'CLAUDE.md': '# old instructions\n' })
    const actions = initProject(dir)
    expect(actions.find(a => a.file === 'CLAUDE.md')?.status).toBe('skipped')
    expect(read('CLAUDE.md')).toBe('# old instructions\n')
  })

  it('warns for the other files Claude Code counts instead of AGENTS.md', () => {
    const dir = project({ '.claude/CLAUDE.md': '# old\n', 'CLAUDE.local.md': '# local\n' })
    const actions = initProject(dir)
    expect(actions.filter(a => a.status === 'skipped').map(a => a.file)).toEqual(['.claude/CLAUDE.md', 'CLAUDE.local.md'])
  })

  it('keeps existing AGENTS.md content and is idempotent', () => {
    const dir = project({ 'AGENTS.md': '# My project\n\nRun `pnpm test`.\n' })
    initProject(dir)
    const first = read('AGENTS.md')
    expect(first).toContain('# My project')
    expect(first).toContain('Run `pnpm test`.')

    initProject(dir)
    expect(read('AGENTS.md')).toBe(first)
    expect(first.match(new RegExp(AGENTS_START, 'g'))).toHaveLength(1)
  })

  it('replaces the managed block without touching the rest', () => {
    const dir = project({ 'AGENTS.md': `before\n${AGENTS_START}\nold\n${AGENTS_END}\nafter\n` })
    initProject(dir)
    const agents = read('AGENTS.md')
    expect(agents.startsWith('before\n')).toBe(true)
    expect(agents.endsWith('after\n')).toBe(true)
    expect(agents).not.toContain('\nold\n')
  })

  it('does not duplicate the .gitignore entry', () => {
    const dir = project({ '.gitignore': 'node_modules\n.harness/\n' })
    initProject(dir)
    expect(read('.gitignore')).toBe('node_modules\n.harness/\n')
  })

  it('--claude adds the path-scoped rule and the hooks', () => {
    const dir = project()
    initProject(dir, { claude: true })

    const rule = read('.claude/rules/nuxt-harness.md')
    expect(rule).toContain('paths:')
    expect(rule).toContain('app/**/*.{vue,ts,js}')
    // srcDir: '.' keeps pages/ and components/ at the root.
    expect(rule).toContain('pages/**/*.vue')
    expect(rule).toContain('components/**/*.vue')
    expect(rule).toContain('error.vue')
    expect(rule).toContain('nuxt-harness guide <path>')

    const settings = JSON.parse(read('.claude/settings.json'))
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain('nuxt-harness hook')
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('nuxt-harness stop')
  })

  it('merges hooks into existing settings and leaves other keys alone', () => {
    const dir = project({ '.claude/settings.json': '{"model":"opus","hooks":{"PreToolUse":[{"hooks":[]}]}}' })
    initProject(dir, { claude: true })
    const settings = JSON.parse(read('.claude/settings.json'))
    expect(settings.model).toBe('opus')
    expect(settings.hooks.PreToolUse).toHaveLength(1)
    expect(settings.hooks.PostToolUse).toHaveLength(1)

    initProject(dir, { claude: true })
    const again = JSON.parse(read('.claude/settings.json'))
    expect(again.hooks.PostToolUse).toHaveLength(1)
    expect(again.hooks.Stop).toHaveLength(1)
  })

  it('never overwrites settings.json it cannot parse', () => {
    const dir = project({ '.claude/settings.json': '{ not json' })
    const actions = initProject(dir, { claude: true })
    expect(read('.claude/settings.json')).toBe('{ not json')
    expect(actions.find(a => a.file === '.claude/settings.json')?.status).toBe('skipped')
  })

  it('never overwrites a settings.json whose hooks have an unexpected shape', () => {
    const dir = project({ '.claude/settings.json': '{"hooks":[]}' })
    const actions = initProject(dir, { claude: true })
    expect(read('.claude/settings.json')).toBe('{"hooks":[]}')
    expect(actions.find(a => a.file === '.claude/settings.json')?.status).toBe('skipped')
  })

  it('links the shipped skill when the package is installed', () => {
    const dir = project({ 'node_modules/@edumapper/nuxt-harness/skills/nuxt-harness/SKILL.md': '# skill\n' })
    const actions = initProject(dir, { claude: true })
    expect(actions.find(a => a.file === '.claude/skills/nuxt-harness')?.status).toBe('added')
    expect(existsSync(join(dir, '.claude/skills/nuxt-harness/SKILL.md'))).toBe(true)
  })

  it('--dry-run writes nothing', () => {
    const dir = project()
    initProject(dir, { claude: true, dryRun: true })
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(dir, '.gitignore'))).toBe(false)
    expect(existsSync(join(dir, '.claude'))).toBe(false)
  })
})

describe('CLI init', () => {
  it('runs with --dry-run and reports the plan', () => {
    const dir = project()
    const r = spawnSync(process.execPath, [BIN, 'init', '--dry-run'], { cwd: dir, encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('AGENTS.md')
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false)
  })
})
