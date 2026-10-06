// @ts-check
/**
 * ESLint Rule: no-auth-gate-outside-middleware
 *
 * Auth checks that redirect belong in route middleware. In pages, components and
 * layouts, flags a branch whose condition reads the auth state (a value from one of
 * the configured auth composables, or the call itself) and whose body navigates away.
 *
 * Options: `{ composables: string[] }`. Defaults cover nuxt-auth-utils (useUserSession),
 * @sidebase/nuxt-auth (useAuth) and @nuxtjs/supabase (useSupabaseUser, useSupabaseSession).
 *
 * A gate scattered in a component runs after the page has started rendering,
 * is skipped on routes that don't mount that component, and duplicates the
 * policy. Reading the user to *display* it is fine — only gate + redirect is flagged.
 */

import { DEFAULT_AUTH_COMPOSABLES } from '../config.js'
import { docsUrl } from './docs.js'

const REDIRECTS = new Set(['navigateTo', 'abortNavigation'])

/** @param {any} node @param {(n: any) => boolean} predicate @returns {boolean} */
function some(node, predicate) {
  if (!node || typeof node.type !== 'string') return false
  if (predicate(node)) return true
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child) ? child.some(c => some(c, predicate)) : (child && typeof child === 'object' && some(child, predicate))) return true
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Keep auth gating (check + redirect) in route middleware' },
    schema: [{ type: 'object', properties: { composables: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
    messages: {
      authGate: [
        '❌ Auth check + redirect outside route middleware',
        '💡 A gate in a page/component runs after rendering starts, is skipped on routes that don\'t mount it, and duplicates the access policy.',
        '🛠 Move the check into app/middleware (defineNuxtRouteMiddleware) and `return navigateTo(…)` there; keep the component for display.',
        `📖 ${docsUrl('no-auth-gate-outside-middleware')}`
      ].join('\n')
    }
  },
  create(context) {
    const composables = new Set(context.options[0]?.composables ?? DEFAULT_AUTH_COMPOSABLES)
    /** @type {Set<string>} */
    const authVars = new Set()

    /** @param {any} n */
    const isAuthCall = n => n.type === 'CallExpression' && n.callee.type === 'Identifier' && composables.has(n.callee.name)
    /** @param {any} n */
    const readsAuth = n => some(n, x => isAuthCall(x) || (x.type === 'Identifier' && authVars.has(x.name)))
    /** @param {any} n */
    const redirects = n => some(n, x => x.type === 'CallExpression' && x.callee.type === 'Identifier' && REDIRECTS.has(x.callee.name))

    return {
      /** @param {any} node */
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.init && isAuthCall(node.init)) authVars.add(node.id.name)
      },
      /** @param {any} node */
      'IfStatement, ConditionalExpression'(node) {
        if (readsAuth(node.test) && (redirects(node.consequent) || redirects(node.alternate))) {
          context.report({ node: node.test, messageId: 'authGate' })
        }
      }
    }
  }
}
