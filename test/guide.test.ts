import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { explainRule, guideFor, layerOf, ruleIds } from '../src/guide.js'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nuxt-harness.js')

describe('layerOf — the guide names the layer before the agent writes', () => {
  it('maps each app path to its layer', () => {
    expect(layerOf('app/pages/index.vue')?.id).toBe('page')
    expect(layerOf('app/components/OrcUserList.vue')?.id).toBe('orchestrator')
    expect(layerOf('app/components/users/OrcList.vue')?.id).toBe('orchestrator')
    expect(layerOf('app/components/OpFilterableUserList.vue')?.id).toBe('operator')
    expect(layerOf('app/components/UserList.vue')?.id).toBe('presenter')
    expect(layerOf('app/composables/useUserList.ts')?.id).toBe('composable')
    expect(layerOf('server/api/users.get.ts')?.id).toBe('server')
    expect(layerOf('shared/types/user.ts')?.id).toBe('shared')
    expect(layerOf('app/middleware/auth.ts')?.id).toBe('middleware')
    expect(layerOf('app/app.vue')?.id).toBe('app')
    expect(layerOf('app/error.vue')?.id).toBe('app')
  })

  it('handles the Nuxt 3 layout and Nuxt layers', () => {
    expect(layerOf('pages/index.vue')?.id).toBe('page')
    expect(layerOf('components/UserList.vue')?.id).toBe('presenter')
    expect(layerOf('app.vue')?.id).toBe('app')
    expect(layerOf('error.vue')?.id).toBe('app')
    expect(layerOf('layers/shop/app/components/OrcCart.vue')?.id).toBe('orchestrator')
    expect(layerOf('layers/shop/server/api/cart.get.ts')?.id).toBe('server')
  })

  it('leaves tests, config and scripts outside the gate', () => {
    expect(layerOf('test/rules.test.ts')).toBeUndefined()
    expect(layerOf('nuxt.config.ts')).toBeUndefined()
  })
})

describe('guideFor — the contract and the rules that will judge the file', () => {
  const options = { root: process.cwd(), i18n: false }

  it('gives a Presenter its contract and its key rule', () => {
    const text = guideFor('app/components/UserList.vue', options)
    expect(text).toContain('Presenter')
    expect(text).toContain('Props in, events out')
    expect(text).toContain('arch/no-smart-calls')
    expect(text).toContain('Static checks: import hygiene, escape hatches')
    expect(text).toContain('Explain one: nuxt-harness explain arch/no-smart-calls')
    expect(text).toContain('Run: nuxt-harness fast app/components/UserList.vue')
  })

  it('gives a Page the assembler contract', () => {
    const text = guideFor('app/pages/index.vue', options)
    expect(text).toContain('Page (assembler)')
    expect(text).toContain('arch/no-presenter-in-page')
  })

  it('gives a server route the validated-input rule', () => {
    const text = guideFor('server/api/users.get.ts', options)
    expect(text).toContain('Server')
    expect(text).toContain('arch/no-raw-request-input')
  })

  it('recognizes the app shell', () => {
    expect(guideFor('app/app.vue', options)).toContain('App root')
  })

  it('shows type-aware rules as full-gate only', () => {
    const text = guideFor('app/composables/useX.ts', options)
    expect(text).toContain('type-aware (full)')
    expect(text).toContain('switch-exhaustiveness-check')
  })

  it('says when a file is outside the gate instead of inventing a layer', () => {
    expect(guideFor('test/rules.test.ts', options)).toContain('not in a layer the harness judges')
  })
})

describe('explainRule — why the rule exists', () => {
  it('reads the rule doc and links to it', () => {
    const text = explainRule('arch/no-smart-calls')
    expect(text).toContain('no-smart-calls')
    expect(text).toContain('Applies to: Presenters')
    expect(text).toContain('eslint-rules.md#no-smart-calls')
  })

  it('accepts the rule without the arch/ prefix', () => {
    expect(explainRule('no-smart-calls')).toContain('Applies to: Presenters')
  })

  it('returns undefined for an unknown rule', () => {
    expect(explainRule('arch/not-a-rule')).toBeUndefined()
  })

  it('lists arch rules and the core rules the harness enables', () => {
    expect(ruleIds()).toContain('arch/no-smart-calls')
    expect(ruleIds()).toContain('complexity')
  })

  it('explains a core rule from the same docs', () => {
    const text = explainRule('complexity')
    expect(text).toContain('complexity')
    expect(text).toContain('Why:')
    expect(text).toContain('eslint-rules.md')
  })

  it('explains rules whose doc row is in the guard tables', () => {
    for (const id of ['arch/max-condition-operands', 'arch/max-watchers', 'arch/client-only-needs-reason', 'arch/client-file-needs-reason']) {
      expect(explainRule(id)).toContain('Why:')
    }
  })
})

describe('CLI', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })

  it('guide with no argument prints the layer table and the workflow', () => {
    const r = run('guide')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Choose the layer')
    expect(r.stdout).toContain('Orchestrator (Orc*)')
  })

  it('guide <file> prints the contract', () => {
    const r = run('guide', 'app/components/UserList.vue')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Presenter')
  })

  it('explain <rule> prints why and how to fix it', () => {
    const r = run('explain', 'arch/no-smart-calls')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Applies to: Presenters')
  })

  it('explain without a rule lists the rules', () => {
    const r = run('explain')
    expect(r.status).toBe(64)
    expect(r.stderr).toContain('arch/no-smart-calls')
  })
})
