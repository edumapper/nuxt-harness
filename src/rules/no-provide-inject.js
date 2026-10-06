// @ts-check
/**
 * ESLint Rule: no-provide-inject
 *
 * Bans Vue's provide()/inject() (and `vueApp.provide`).
 *
 * provide/inject is an untyped, invisible dependency: nothing at the call site
 * says who provides the value, a missing provider fails at runtime, and the
 * data flow skips every layer the 5-layer model makes explicit.
 * Nuxt's plugin `provide` (`return { provide: { … } }` / `nuxtApp.provide`) is
 * a typed global and is not affected.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow Vue provide()/inject()' },
    schema: [],
    messages: {
      provideInject: [
        '❌ {{name}}() — provide/inject is banned',
        '💡 Invisible, untyped dependency: the consumer cannot see its provider, and a missing provider only fails at runtime.',
        '🛠 Pass it down as props (Orc → Op → Presenter), or share state through a composable (useState / module-level ref) that both sides import.',
        '📖 packages/nuxt-harness/skill/references/eslint-rules.md#no-provide-inject'
      ].join('\n')
    }
  },
  create(context) {
    return {
      /** @param {any} node */
      CallExpression(node) {
        const { callee } = node
        if (callee.type === 'Identifier' && (callee.name === 'provide' || callee.name === 'inject')) {
          context.report({ node, messageId: 'provideInject', data: { name: callee.name } })
        }
        // nuxtApp.vueApp.provide(...) / app.provide(...) on a Vue app instance
        if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'provide'
          && callee.object.type === 'MemberExpression' && callee.object.property?.name === 'vueApp') {
          context.report({ node, messageId: 'provideInject', data: { name: 'vueApp.provide' } })
        }
      }
    }
  }
}
