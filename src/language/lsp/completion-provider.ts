import { type MaybePromise, isNamed } from 'langium';
import {
  CompletionAcceptor,
  CompletionContext,
  DefaultCompletionProvider,
  NextFeature,
} from 'langium/lsp';
import { CompletionItemKind, Range } from 'vscode-languageserver';

import * as ast from '../generated/ast.js';
import { positionToString } from '../graph-util.js';
import {
  Label_get_label,
  NAMED_COLORS,
  NAMED_SHAPES,
  STYLE_TOPICS,
  color_name_to_hex,
} from '../model-helpers.js';

/**
 * Custom completion provider for Graph DSL.
 *
 * This provider enhances completion suggestions in various scenarios:
 *
 * - **StyleDefinition Nodes**: Suggests style topics and shape names where applicable.
 * - **TextColorDefinition Nodes**: Provides CSS color name completions.
 * - **Link Nodes (Cross-references)**: Suggests named Element nodes for properties like `src` and `dst`.
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

    // Handle cross-reference completions for Link nodes
    // Check if the container is a Link and the expected property is one of its reference properties.
    if (context.node?.$type === 'Link' && (next.property === 'src' || next.property === 'dst')) {
      // Process cross-reference completions for Link
      return this.completionForLinkReference(context, next, acceptor);
    }

    // Delegate to the default completion provider for any other context.
    return super.completionFor(context, next, acceptor);
  }

  /**
   * Provides completions for the topic property using predefined style topics (STYLE_TOPICS).
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

  /**
   * Provides completions for cross-references in Link nodes.
   * Filters candidates to only include named Element nodes and, if available, adds the node's label in the detail.
   *
   * @param context - The completion context.
   * @param next - The next expected feature.
   * @param acceptor - The completion acceptor callback.
   */
  protected completionForLinkReference(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor,
  ): MaybePromise<void> {
    const node = context.node!;
    const property = next.property!;

    const range: Range = {
      start: context.textDocument.positionAt(context.tokenOffset),
      end: context.textDocument.positionAt(context.offset),
    };

    const currentWord = context.textDocument.getText(range);
    const refInfo = {
      reference: { $refText: currentWord },
      container: node,
      property,
    };
    console.log(
      `GraphCompletionProvider:completionForLinkReference(): Processing Link reference completion for '${property}', typed text: '${currentWord}'`,
    );

    const candidatesStream = this.getReferenceCandidates(refInfo, context).toArray();

    for (const candidate of candidatesStream) {
      if (
        ast.isElement(candidate.node) &&
        isNamed(candidate.node) &&
        candidate.node.name.length > 0
      ) {
        const candidateName = this.nameProvider.getName(candidate.node);
        const detail = candidate.node.label ? Label_get_label(candidate.node.label) : undefined;

        acceptor(context, {
          label: candidateName,
          kind: CompletionItemKind.Variable,
          detail,
          insertText: candidateName,
          sortText: '0',
        });
      }
    }
  }
}
