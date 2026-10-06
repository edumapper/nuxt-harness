/**
 * ESLint Rule: max-boolean-props
 *
 * Flags `defineProps<…>()` declarations with 3+ boolean props.
 *
 * Why: N boolean flags encode 2^N states, most of them illegal
 * (`loading && error && empty`). The component then guards every combination
 * with `v-if` chains that drift. A single discriminated union
 * (`status: 'idle' | 'loading' | 'error'`) makes the illegal states
 * unrepresentable and lets the compiler check exhaustiveness.
 *
 * Covers the type-literal form and a same-file interface / type alias:
 *   defineProps<{ a: boolean, b: boolean, c: boolean }>()
 *   interface Props { … }  defineProps<Props>()
 */

const DEFAULT_MAX = 2

/** @param {any} member */
function isBooleanMember(member) {
  if (member.type !== 'TSPropertySignature') return false
  const type = member.typeAnnotation?.typeAnnotation
  if (!type) return false
  if (type.type === 'TSBooleanKeyword') return true
  // `boolean | undefined` still counts as a flag
  return type.type === 'TSUnionType'
    && type.types.some((/** @type {any} */ t) => t.type === 'TSBooleanKeyword')
    && type.types.every((/** @type {any} */ t) => ['TSBooleanKeyword', 'TSUndefinedKeyword', 'TSNullKeyword'].includes(t.type))
}

/**
 * @param {any} typeNode
 * @param {Map<string, any[]>} localTypes
 * @returns {any[] | undefined}
 */
function membersOf(typeNode, localTypes) {
  if (typeNode.type === 'TSTypeLiteral') return typeNode.members
  if (typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier') {
    return localTypes.get(typeNode.typeName.name)
  }
  return undefined
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow components with too many boolean props (illegal-state smell)' },
    schema: [{ type: 'object', properties: { max: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
    messages: {
      tooManyBooleans: [
        '❌ defineProps declares {{count}} boolean props ({{names}}) — max {{max}}',
        '💡 {{count}} flags encode 2^{{count}} states; most combinations are illegal and every template branch must guard them.',
        '🛠 Replace the flags with one discriminated union prop, e.g. `status: \'idle\' | \'loading\' | \'error\'`.',
        '📖 https://github.com/edumapper/nuxt-harness/blob/main/skills/nuxt-harness/references/eslint-rules.md#max-boolean-props'
      ].join('\n')
    }
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX
    /** @type {Map<string, any[]>} */
    const localTypes = new Map()

    return {
      TSInterfaceDeclaration(/** @type {any} */ node) {
        localTypes.set(node.id.name, node.body.body)
      },
      TSTypeAliasDeclaration(/** @type {any} */ node) {
        if (node.typeAnnotation.type === 'TSTypeLiteral') localTypes.set(node.id.name, node.typeAnnotation.members)
      },
      // Declarations are hoisted in the source, but the call may come first —
      // so evaluate defineProps calls once the whole program has been visited.
      'Program:exit'(/** @type {any} */ program) {
        /** @type {any[]} */
        const calls = []
        /** @param {any} node */
        const visit = (node) => {
          if (!node || typeof node.type !== 'string') return
          if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'defineProps') calls.push(node)
          for (const key of Object.keys(node)) {
            if (key === 'parent') continue
            const child = node[key]
            if (Array.isArray(child)) child.forEach(visit)
            else if (child && typeof child === 'object') visit(child)
          }
        }
        visit(program)

        for (const call of calls) {
          const typeArg = (call.typeArguments ?? call.typeParameters)?.params?.[0]
          if (!typeArg) continue
          const members = membersOf(typeArg, localTypes)
          if (!members) continue
          const booleans = members.filter(isBooleanMember)
          if (booleans.length <= max) continue
          context.report({
            node: call,
            messageId: 'tooManyBooleans',
            data: {
              count: String(booleans.length),
              max: String(max),
              names: booleans.map((/** @type {any} */ m) => m.key?.name ?? '?').join(', ')
            }
          })
        }
      }
    }
  }
}
