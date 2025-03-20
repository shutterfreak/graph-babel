import { type MaybePromise } from 'langium';
import {
  CompletionAcceptor,
  CompletionContext,
  DefaultCompletionProvider,
  NextFeature,
} from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';

import * as ast from '../generated/ast.js';
import { positionToString } from '../graph-util.js';
import { NAMED_COLORS, NAMED_SHAPES, STYLE_TOPICS, color_name_to_hex } from '../model-helpers.js';

/**
 * Custom completion provider for Graph DSL.
 *
 * This provider handles completions for StyleDefinition nodes:
 *
 * - If the expected property is undefined, it provides completions for the `topic` property using STYLE_TOPICS.
 * - For a ShapeStyleDefinition node with expected property 'value', it provides shape name completions using NAMED_SHAPES.
 * - For a TextColorDefinition node, it provides CSS color name completions from NAMED_COLORS.
 *
 * In all other cases, it delegates to the default completion behavior.
 */
export class GraphCompletionProvider extends DefaultCompletionProvider {
  /**
   * Main entry point for providing completion items.
   *
   * @param context - The current completion context.
   * @param next - The next expected feature.
   * @param acceptor - Callback function to accept completion items.
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
        // Provide completions for the topic property.
        this.provideTopicCompletions(context, acceptor);
        return;
      }
      if (next.property === 'value' && ast.isShapeStyleDefinition(node)) {
        // Provide shape completions for the value property of a ShapeStyleDefinition.
        this.provideShapeCompletions(context, acceptor);
        return;
      }
    } else if (ast.isTextColorDefinition(node)) {
      // Provide completions for CSS color names for a TextColorDefinition.
      this.provideColorCompletions(context, acceptor);
      return;
    }

    // Delegate to the default completion provider for any other context.
    return super.completionFor(context, next, acceptor);
  }

  /**
   * Provides completions for the topic property using STYLE_TOPICS.
   *
   * @param context - The completion context.
   * @param acceptor - The completion acceptor callback.
   */
  protected provideTopicCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
  ): void {
    console.log(
      `GraphCompletionProvider: Providing topic completions at ${positionToString(context.position)}.`,
    );
    for (const topic of STYLE_TOPICS) {
      acceptor(context, {
        label: topic,
        kind: CompletionItemKind.EnumMember,
        detail: 'Style Topic',
        insertText: topic,
      });
    }
  }

  /**
   * Provides shape completions for a ShapeStyleDefinition node.
   *
   * @param context - The completion context.
   * @param acceptor - The completion acceptor callback.
   */
  protected provideShapeCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
  ): void {
    console.log(
      `GraphCompletionProvider: Providing shape completions at ${positionToString(context.position)}.`,
    );
    for (const shape of NAMED_SHAPES) {
      acceptor(context, {
        label: shape,
        kind: CompletionItemKind.EnumMember,
        detail: 'Named Shape',
        insertText: shape,
      });
    }
  }

  /**
   * Provides CSS color completions for a TextColorDefinition node.
   *
   * @param context - The completion context.
   * @param acceptor - The completion acceptor callback.
   */
  protected provideColorCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
  ): void {
    console.log(
      `GraphCompletionProvider: Providing color completions at ${positionToString(context.position)}.`,
    );
    for (const color of NAMED_COLORS) {
      acceptor(context, {
        label: color,
        documentation: `(${color_name_to_hex(color)})`,
        kind: CompletionItemKind.EnumMember,
        detail: 'CSS Color Name',
        insertText: color,
      });
    }
  }
}
