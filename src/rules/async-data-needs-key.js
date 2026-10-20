// @ts-check
/**
 * ESLint Rule: async-data-needs-key
 *
 * Flags `useAsyncData(handler)` / `useLazyAsyncData(handler)` without a key when the handler
 * reads the component's props or the route.
 *
 * Without a key, Nuxt derives one from the call site (file and line). Every instance of the
 * component then shares one payload entry: a component rendered twice with different props
 * (two cards, a list) shows the first instance's data, and hydration replays it. The key must
 * carry what the handler depends on.
 *
 * `useFetch` is not concerned: Nuxt builds its key from the method, the URL, `query`/`params`
 * and the body, so two calls with different arguments already get different keys.
 */

import { docsUrl } from './docs.js'

const ASYNC_DATA = new Set(['useAsyncData', 'useLazyAsyncData'])
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression'])
// What makes two instances of the same call site fetch different data.
const INSTANCE_INPUT = /\b(props|route)\b|\buseRoute\s*\(|\$route\b/

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a key on useAsyncData calls that depend on props or the route' },
    schema: [],
    messages: {
      needsKey: [
        '❌ {{callee}}(handler) reads {{input}} but has no key',
        '💡 Without a key, Nuxt keys the call by its file and line: every instance of this component shares one payload entry, so two instances with different {{input}} show the same data.',
        '🛠 Pass a key built from what the handler reads: {{callee}}(() => `program:${props.id}`, () => …). useFetch does not need this: its key already includes the URL and query.',
        '📖 ' + docsUrl('async-data-needs-key')
      ].join('\n')
    }
  },
  create (context) {
    return {
      /** @param {any} node */
      CallExpression (node) {
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined
        if (!callee || !ASYNC_DATA.has(callee)) return
        // useAsyncData(key, handler, options): the key is a string or, since Nuxt 4, a getter; only
        // a lone function is a keyless handler.
        const [handler, second] = node.arguments
        if (!handler || !FUNCTION_TYPES.has(handler.type) || FUNCTION_TYPES.has(second?.type)) return
        const input = context.sourceCode.getText(handler.body).match(INSTANCE_INPUT)?.[0]
        if (!input) return
        context.report({ node, messageId: 'needsKey', data: { callee, input: input.startsWith('props') ? 'props' : 'route' } })
      }
    }
  }
}
