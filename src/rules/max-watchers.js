// @ts-check
/**
 * ESLint Rule: max-watchers
 *
 * Caps the number of watchers (watch, watchEffect, VueUse watch* helpers) per file.
 *
 * Watchers are hidden control flow: a change somewhere triggers code somewhere
 * else, ordering depends on flush timing, and chains of watchers feeding refs
 * that other watchers observe are the classic source of loops and stale state.
 * Most watchers are one of:
 *   - derived state      → `computed`
 *   - a reaction to a user action → do it in the event handler that caused it
 *   - syncing a prop into local state → `useVModel`/`defineModel` or a computed get/set
 */

const DEFAULT_MAX = 3
// cspell:ignore Triggerable — VueUse watchTriggerable
const WATCHERS = new Set([
  'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect',
  'watchDebounced', 'watchThrottled', 'watchOnce', 'watchImmediate', 'watchDeep',
  'watchPausable', 'watchIgnorable', 'watchTriggerable', 'watchAtMost', 'watchWithFilter', 'whenever'
])

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Limit the number of watchers per file' },
    schema: [{ type: 'object', properties: { max: { type: 'integer', minimum: 0 } }, additionalProperties: false }],
    messages: {
      tooManyWatchers: [
        '❌ {{count}} watchers in this file — max {{max}}',
        '💡 Watchers are hidden control flow: effects fire away from their cause, and watcher chains loop or go stale.',
        '🛠 Derived state → computed. Reaction to a user action → do it in that event handler. Prop sync → defineModel / computed get-set.',
        '📖 https://github.com/edumapper/nuxt-harness/blob/main/skills/nuxt-harness/references/eslint-rules.md#max-watchers'
      ].join('\n')
    }
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX
    /** @type {any[]} */
    const calls = []
    return {
      /** @param {any} node */
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && WATCHERS.has(node.callee.name)) calls.push(node)
      },
      'Program:exit'() {
        if (calls.length <= max) return
        // Report the first watcher over budget so the location points at the excess.
        context.report({ node: calls[max], messageId: 'tooManyWatchers', data: { count: String(calls.length), max: String(max) } })
      }
    }
  }
}
