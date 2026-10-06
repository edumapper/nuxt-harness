/**
 * ESLint Rule: no-reverse-layer-import
 *
 * Enforces the one-way data flow: Orc → Op → Presenter.
 * Prevents components from importing "upward" through the layer stack:
 *   - Presenters (plain *.vue) must not import Op*.vue or Orc*.vue
 *   - Operators (Op*.vue) must not import Orc*.vue
 *
 * Why this matters for AI-generated code:
 *   AI models often reach for the nearest component that has the data or
 *   behaviour needed, regardless of direction. A Presenter importing an
 *   Operator to "reuse its logic" breaks the contract: Presenters are
 *   stateless display units whose only inputs are props. An Operator
 *   importing an Orchestrator creates a circular dependency risk and hides
 *   fetch/store logic one layer below where it belongs.
 *
 *   The correct fix is always to move shared logic into a composable
 *   (composables/use*.ts) and let both layers consume it independently.
 *
 * Targets: app/components/**\/*.vue
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

/** @param {string} filename */
function basename(filename) {
  return filename.split('/').pop() ?? filename
}

/** @param {string} name */
function isOrc(name) {
  return name.startsWith('Orc') && name.endsWith('.vue')
}

/** @param {string} name */
function isOp(name) {
  return name.startsWith('Op') && name.endsWith('.vue')
}

/** @param {string} name */
function isPresenter(name) {
  return name.endsWith('.vue') && !isOrc(name) && !isOp(name)
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce one-way Orc → Op → Presenter layer flow; no upward imports',
      category: 'Architecture'
    },
    schema: [],
    messages: {
      presenterImportsOp: [
        '❌ <{{file}}> importe {{imported}} — un Presenter ne peut pas importer un Operator',
        '💡 Les Presenters reçoivent des données via props uniquement.',
        '   Importer un Op introduit une dépendance à la logique de câblage',
        '   et casse la testabilité du composant.',
        '🛠 Extrayez la logique partagée dans composables/use*.ts',
        '   et consommez-la dans l\'Operator. Passez le résultat au Presenter via props.'
      ].join('\n'),

      presenterImportsOrc: [
        '❌ <{{file}}> importe {{imported}} — un Presenter ne peut pas importer un Orchestrator',
        '💡 Les Presenters sont des afficheurs purs. Un Orchestrator contient',
        '   du fetch, des stores et de la logique métier — tout ce qu\'un Presenter',
        '   ne doit pas voir.',
        '🛠 Faites remonter la donnée via la chaîne Orc → Op → props.'
      ].join('\n'),

      opImportsOrc: [
        '❌ <{{file}}> importe {{imported}} — un Operator ne peut pas importer un Orchestrator',
        '💡 Le flux est unidirectionnel : Orc orchestre Op, pas l\'inverse.',
        '   Un Op qui importe un Orc crée un couplage circulaire potentiel',
        '   et cache du fetch/store logic là où ça ne devrait pas être.',
        '🛠 Extrayez la logique partagée dans composables/use*.ts.'
      ].join('\n')
    }
  },

  create(context) {
    const filename = basename(context.filename ?? context.getFilename?.() ?? '')

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return
        const imported = basename(source)

        if (isPresenter(filename)) {
          if (isOp(imported)) {
            context.report({ node, messageId: 'presenterImportsOp', data: { file: filename, imported } })
          } else if (isOrc(imported)) {
            context.report({ node, messageId: 'presenterImportsOrc', data: { file: filename, imported } })
          }
        } else if (isOp(filename) && isOrc(imported)) {
          context.report({ node, messageId: 'opImportsOrc', data: { file: filename, imported } })
        }
      }
    }
  }
}
