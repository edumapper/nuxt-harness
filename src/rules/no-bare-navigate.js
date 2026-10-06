/**
 * ESLint Rule: no-bare-navigate
 *
 * Enforces correct navigation patterns in Nuxt:
 *   1. navigateTo() must always be awaited or returned — never called bare.
 *   2. router.push() / router.replace() / router.go() are banned — use navigateTo().
 *
 * ─── Why this matters for AI-generated code ────────────────────────────────
 *
 * HOW ESLint CUSTOM RULES WORK (tutorial summary):
 *   An ESLint rule exports a `create(context)` function that returns an object
 *   mapping AST node types to visitor functions. ESLint walks the AST of each
 *   file and calls your visitors when it encounters a matching node. The
 *   `context.report()` call emits a lint error at that node. No dependencies,
 *   no runtime — just AST pattern matching.
 *
 * WHY navigateTo() MUST BE AWAITED OR RETURNED:
 *   navigateTo() returns a Promise<void | NavigationFailure | false>. On the
 *   server side (Cloudflare Workers / SSR), the redirect is only sent to the
 *   client when the Promise resolves. If you drop the Promise, the server
 *   continues executing the current handler, possibly sending a response before
 *   the redirect can fire — or silently skipping the redirect entirely.
 *
 *   In route middleware the situation is worse: without `return navigateTo()`,
 *   the middleware chain continues executing after the call. The next middleware
 *   and the page component both run, potentially causing double renders, data
 *   fetches for a page the user shouldn't see, and security holes (a guard that
 *   doesn't actually guard).
 *
 *   Classic AI pattern that breaks silently:
 *
 *     // ❌ Broken — redirect is never awaited; page keeps loading
 *     async function checkAccess() {
 *       if (!user.value) navigateTo('/login')   // Promise dropped
 *       loadSensitiveData()                     // runs even when unauthenticated
 *     }
 *
 *     // ✅ Correct — execution stops until redirect resolves
 *     async function checkAccess() {
 *       if (!user.value) return await navigateTo('/login')
 *       loadSensitiveData()
 *     }
 *
 * WHY router.push() / router.replace() ARE BANNED:
 *   Vue Router's push/replace are client-side only. On the server they may
 *   throw, silently no-op, or (in some Nuxt versions) cause a hydration
 *   mismatch. navigateTo() is Nuxt's isomorphic navigation primitive — it
 *   calls the right mechanism on each side (H3's sendRedirect on server,
 *   Vue Router on client) and handles SSR status codes correctly.
 *
 *   Additionally, router.push() has no built-in `external` support, no
 *   `redirectCode` for HTTP 301/302, and no `open` for new tabs — all of
 *   which navigateTo() provides natively.
 *
 *   Updating only the query string of the current route: use
 *   navigateTo({ query: {...} }, { replace: true }) — the harness bans
 *   eslint-disable on its own rules.
 *
 * Targets: app/**\/*.vue, app/**\/*.ts, app/middleware/**\/*.ts
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the node IS the navigateTo() call itself (not wrapped in await). */
function isNavigateToCall(node) {
  return (
    node.type === 'CallExpression'
    && node.callee.type === 'Identifier'
    && node.callee.name === 'navigateTo'
  )
}

/**
 * True when the CallExpression's value is discarded — i.e. the expression is
 * used as a statement rather than as a value passed somewhere.
 *
 * Safe (not bare):
 *   await navigateTo(...)          — AwaitExpression, parent may be anything
 *   return navigateTo(...)         — ReturnStatement child
 *   return await navigateTo(...)   — ReturnStatement > AwaitExpression
 *   const x = navigateTo(...)      — VariableDeclarator / AssignmentExpression
 *   () => navigateTo(...)          — ArrowFunctionExpression implicit return
 *
 * Bare (value dropped):
 *   navigateTo(...)                — ExpressionStatement direct child
 */
function isBareCall(node, parent) {
  // Direct ExpressionStatement → the return value is thrown away
  if (parent.type === 'ExpressionStatement') return true

  // Comma expression: (a, navigateTo(...)) — uncommon but possible
  if (parent.type === 'SequenceExpression') {
    const last = parent.expressions[parent.expressions.length - 1]
    return last === node
  }

  return false
}

/** True when the node is a router.push/replace/go call. */
function isRouterMethodCall(node) {
  if (node.type !== 'CallExpression') return false
  const { callee } = node
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed) return false

  const methodName = callee.property.name
  if (!['push', 'replace', 'go'].includes(methodName)) return false

  // Match: router.push / $router.push / anyIdentifier named like a router
  if (callee.object.type === 'Identifier') {
    const name = callee.object.name.toLowerCase()
    return name === 'router' || name === '$router'
  }

  // Match: this.$router.push (Options API)
  if (
    callee.object.type === 'MemberExpression'
    && callee.object.object.type === 'ThisExpression'
    && callee.object.property.name === '$router'
  ) {
    return true
  }

  return false
}

// ─── Rule ─────────────────────────────────────────────────────────────────────

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require await/return on navigateTo(); ban router.push/replace/go',
      category: 'Best Practices'
    },
    schema: [],
    messages: {
      bareNavigateTo: [
        '❌ navigateTo() called without await or return — the redirect will be silently dropped.',
        '💡 navigateTo() returns a Promise. On the server side, the redirect is only sent when',
        '   the Promise resolves. Dropping it means the handler continues executing and the',
        '   redirect may never fire. In middleware, a bare call lets the chain keep running',
        '   past the guard — a security hole.',
        '🛠 In async functions:  return await navigateTo(...)',
        '   In middleware:       return navigateTo(...)',
        '   In arrow functions:  () => navigateTo(...) (implicit return is fine)'
      ].join('\n'),

      routerDirectCall: [
        '❌ router.{{method}}() — use navigateTo() instead.',
        '💡 Vue Router\'s push/replace/go are client-side only. On the server they may',
        '   silently no-op or throw, causing SSR/hydration mismatches.',
        '   navigateTo() is Nuxt\'s isomorphic navigation primitive: it calls',
        '   sendRedirect() on the server and Vue Router on the client, and it',
        '   handles HTTP status codes (301/302), external URLs, and new-tab opens.',
        '🛠 Replace with:',
        '   router.push(to)              → await navigateTo(to)',
        '   router.replace(to)           → await navigateTo(to, { replace: true })',
        '   router.replace({ query:…})   → await navigateTo({ query:… }, { replace: true })'
      ].join('\n')
    }
  },

  create(context) {
    return {
      // Check for bare navigateTo() calls
      CallExpression(node) {
        if (!isNavigateToCall(node)) return

        const parent = node.parent
        if (!parent) return

        // If the parent is an AwaitExpression, it's always safe
        if (parent.type === 'AwaitExpression') return

        if (isBareCall(node, parent)) {
          context.report({ node, messageId: 'bareNavigateTo' })
        }
      },

      // Check for router.push / router.replace / router.go
      'CallExpression:exit'(node) {
        if (!isRouterMethodCall(node)) return

        const method = node.callee.property.name
        context.report({ node, messageId: 'routerDirectCall', data: { method } })
      }
    }
  }
}
