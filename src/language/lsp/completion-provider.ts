import { type MaybePromise } from 'langium';
import {
  CompletionAcceptor,
  CompletionContext,
  DefaultCompletionProvider,
  LangiumServices,
  NextFeature,
} from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';

import * as ast from '../generated/ast.js';
import { positionToString } from '../graph-util.js';
import { NAMED_SHAPES, STYLE_TOPICS } from '../model-helpers.js';

/**
 * Custom completion provider for Graph DSL.
 *
 * This provider handles completions for StyleDefinition nodes:
 *
 * - For any StyleDefinition node, when the expected property is the first property (i.e., `topic`),
 *   `next.property` is undefined. In that case, it provides completions using the STYLE_TOPICS list.
 *
 * - For a ShapeStyleDefinition node, when the expected property is 'value', it provides completions
 *   using the NAMED_SHAPES list.
 *
 * In all other cases, it delegates to the default completion behavior.
 */
export class GraphCompletionProvider extends DefaultCompletionProvider {
  /** can be deleted (debugging only) */
  constructor(services: LangiumServices) {
    super(services);
    console.log('GraphCompletionProvider instantiated');
  }

  /**
   * Provides completion items based on the current completion context.
   *
   * @param context - The current completion context, including the document, cursor position, and AST node.
   * @param next - The next expected feature (e.g., the property being completed).
   * @param acceptor - A callback function to accept completion items.
   * @returns A MaybePromise that resolves when completion items are provided.
   */
  protected override completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor,
  ): MaybePromise<void> {
    console.log(
      `GraphCompletionProvider.completionFor(${positionToString(context.position)}), ` +
        `node type: ${context.node ? context.node.$type : '(none)'}, ` +
        `next.property: ${next.property ?? '?'}`,
    );

    const node = context.node;
    if (!node) return;

    // Handle completions for StyleDefinition nodes.
    if (ast.isStyleDefinition(node)) {
      // When the expected property is undefined, we interpret it as the first property ("topic").
      if (next.property === undefined) {
        console.log(
          `GraphCompletionProvider: Detected undefined next.property for ${node.$type}, ` +
            `interpreting as 'topic' property. Providing STYLE_TOPICS completions.`,
        );
        for (const topic of STYLE_TOPICS) {
          acceptor(context, {
            label: topic,
            kind: CompletionItemKind.EnumMember,
            detail: 'Style Topic',
            insertText: topic,
          });
        }
        // Prevent further (default) completions.
        return;
      }
      // For ShapeStyleDefinition nodes, when completing the 'value' property, provide shape names.
      if (next.property === 'value') {
        console.log(
          `GraphCompletionProvider.completionFor(${positionToString(context.position)}): type: '${node.$type}' (is StyleDefinition) - next.property === ${next.property} -- PROCEED`,
        );
        if (ast.isShapeStyleDefinition(node)) {
          console.log(
            `GraphCompletionProvider: Detected 'value' property for ShapeStyleDefinition. ` +
              `Providing NAMED_SHAPES completions.`,
          );
          for (const shape of NAMED_SHAPES) {
            acceptor(context, {
              label: shape,
              kind: CompletionItemKind.EnumMember,
              detail: 'Named Shape',
              insertText: shape,
            });
          }
          // Prevent further (default) completions.
          return;
        }
      }
    }

    /*
    console.log(
      render_text(
        inspect(context),
        `GraphCompletionProvider.completionFor(${positionToString(context.position)}): context`,
      ),
    );
    console.log(
      render_text(
        inspect(next),
        `GraphCompletionProvider.completionFor(${positionToString(context.position)}): next`,
      ),
    );
    */

    // Delegate to the default completion provider for any other context.
    return super.completionFor(context, next, acceptor);
  }
}
