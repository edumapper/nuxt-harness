// @ts-check
/**
 * ESLint Rule: no-raw-request-input
 *
 * Server code reads request input only through a schema. A raw reader — h3's `readBody`,
 * `getQuery`, `getRouterParam(s)`, or one of the app's own `bodyReaders` — is allowed only
 * when its result goes straight into a schema parse:
 *
 *   await readValidatedBody(event, schema)        // h3 / nuxt/server validated readers
 *   schema.safeParse(await readJsonBody(event))   // the raw value never exists unvalidated
 *   v.parse(schema, getQuery(event))              // valibot style
 *
 * The rule decides from the code's structure, not from how close a `.parse(` is: a value
 * assigned to a variable is unvalidated, whatever happens to it later. `JSON.parse` is not a
 * schema. Readers with no validated form (`readRawBody`, `readMultipartFormData`, `readFormData`)
 * are not reported, and `getQuery` imported from `ufo` (which parses a URL) is not a request read.
 */

import { docsUrl } from './docs.js'

/** Raw h3 reader → the validated replacement. */
const RAW = new Map([
  ['readBody', 'readValidatedBody(event, schema)'],
  ['getQuery', 'getValidatedQuery(event, schema)'],
  ['getRouterParam', 'getValidatedRouterParams(event, schema)'],
  ['getRouterParams', 'getValidatedRouterParams(event, schema)']
])
const PARSERS = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync'])
// Objects whose `.parse` is not a schema.
const NOT_SCHEMAS = new Set(['JSON', 'Date', 'URL', 'Number', 'path', 'qs', 'querystring'])
// Where the h3 readers come from: auto-imported (no import), or imported from these.
const H3_SOURCES = new Set(['h3', 'nuxt/server', '#imports', 'nitropack/runtime'])
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

/** @param {any} callee */
function isSchemaParse (callee) {
  const name = callee?.type === 'Identifier' ? callee.name : callee?.property?.name
  if (!PARSERS.has(name)) return false
  return !(callee.type === 'MemberExpression' && callee.object?.type === 'Identifier' && NOT_SCHEMAS.has(callee.object.name))
}

/** The read is an argument of a schema parse, possibly through `await`. @param {any} node */
function consumedByParse (node) {
  const child = node.parent?.type === 'AwaitExpression' ? node.parent : node
  const call = child.parent
  return call?.type === 'CallExpression' && call.arguments.includes(child) && isSchemaParse(call.callee)
}

/** @param {any} fn */
const functionName = fn => fn.id?.name ?? (fn.parent?.type === 'VariableDeclarator' ? fn.parent.id?.name : undefined)

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require server request input to go through a schema' },
    schema: [{
      type: 'object',
      properties: { readers: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false
    }],
    messages: {
      raw: [
        '❌ {{name}}() outside a schema parse',
        '💡 Request input is untrusted: a repeated query key arrives as an array, a number as a string, a body as anything. A raw value stored in a variable is unvalidated wherever it flows next.',
        '🛠 {{fix}} — or pass the read straight into the schema: schema.parse(await {{name}}(event)).',
        '📖 ' + docsUrl('no-raw-request-input')
      ].join('\n')
    }
  },
  create (context) {
    const readers = new Set(context.options[0]?.readers ?? [])
    /** Local names of the raw readers imported from somewhere else than h3 (e.g. ufo's getQuery). */
    const foreign = new Set()
    return {
      /** @param {any} node */
      ImportDeclaration (node) {
        if (H3_SOURCES.has(node.source.value)) return
        for (const s of node.specifiers) if (RAW.has(s.imported?.name ?? '')) foreign.add(s.local.name)
      },
      /** @param {any} node */
      CallExpression (node) {
        const name = node.callee?.type === 'Identifier' ? node.callee.name : undefined
        if (!name || foreign.has(name) || (!RAW.has(name) && !readers.has(name))) return
        if (consumedByParse(node)) return
        // An app reader's own implementation reads the request to build the value it returns.
        const owners = context.sourceCode.getAncestors(node).filter(a => FUNCTION_TYPES.has(a.type))
        if (owners.some(fn => readers.has(functionName(fn) ?? ''))) return
        const fix = RAW.get(name) ?? `schema.parse(await ${name}(event))`
        context.report({ node, messageId: 'raw', data: { name, fix } })
      }
    }
  }
}
