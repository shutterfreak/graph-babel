import { AstNodeDescription, type MaybePromise, stream } from 'langium';
import {
  CompletionAcceptor,
  CompletionContext,
  CompletionValueItem,
  DefaultCompletionProvider,
  NextFeature,
} from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';

import * as ast from '../generated/ast.js';
import { positionToString } from '../model-helpers.js';
import {
  Label_get_label,
  NAMED_COLORS,
  NAMED_SHAPES,
  STYLE_TOPICS,
  color_name_to_hex,
  getNodeAncestry,
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
      if (ast.isShapeStyleDefinition(node) && next.property === 'value') {
        // Provide shape completions for the value property of a ShapeStyleDefinition.
        this.provideShapeCompletions(context, acceptor);
        return;
      }
    } else if (ast.isTextColorDefinition(node)) {
      // Provide completions for CSS color names for a TextColorDefinition.
      this.provideColorCompletions(context, acceptor);
      return;
    } else if (this.isNodeDeclarationContext(context, next)) {
      // Check if we are in a context where a node declaration is allowed.
      console.log(
        'GraphCompletionProvider: In node declaration context. Providing node declaration completions.',
      );
      return this.provideNodeDeclarationKeywordCompletions(context, acceptor);
    }

    console.log(
      `GraphCompletionProvider.completionFor(${positionToString(context.position)}): No custom completions found for node type "${node.$type}", property "${next.property}".`,
    );
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
   * Override this method to change how reference completion items are created.
   *
   * To change the `kind` of a completion item, override the `NodeKindProvider` service instead.
   * To change the `documentation`, override the `DocumentationProvider` service instead.
   *
   * @param nodeDescription The description of a reference candidate
   * @returns A partial completion item
   */
  protected override createReferenceCompletionItem(
    nodeDescription: AstNodeDescription,
  ): CompletionValueItem {
    const kind = this.nodeKindProvider.getCompletionItemKind(nodeDescription);
    const documentation = this.getReferenceDocumentation(nodeDescription);
    const ancestry = nodeDescription.node ? getNodeAncestry(nodeDescription.node) : '';
    const isAlias = ast.isNode(nodeDescription.node) && nodeDescription.node.alias !== undefined;
    const label = ast.isElement(nodeDescription.node)
      ? Label_get_label(nodeDescription.node.label)
      : '';
    return {
      nodeDescription,
      kind,
      documentation,
      detail: `${nodeDescription.type}${isAlias ? ' (alias)' : ''}, ${ancestry.length === 0 ? 'at top level' : `in ${ancestry}`}${label.length === 0 ? '' : `: ${label}`}`,
      sortText: '0',
    };
  }

  /**
   * Determines whether the current context is one where a node declaration is allowed.
   * For our DSL, this is true if:
   * - There is no current node (top-level declaration), or
   * - The container is a Model or Graph (which allow declarations), or
   * - The container is a Node and either:
   *    - The expected property is explicitly 'alias', or
   *    - The expected property is undefined and the already typed text (from tokenOffset to offset)
   *      is non-empty (indicating the user has started typing a new declaration).
   */
  protected isNodeDeclarationContext(context: CompletionContext, next: NextFeature): boolean {
    if (!context.node) {
      console.log(
        '⭐️ isNodeDeclarationContext: No current node – assuming top-level declaration.',
      );
      return true; // Top-level case.
    }
    const type = context.node.$type;
    if (type === 'Model' || type === 'Graph') {
      console.log(`⭐️ isNodeDeclarationContext: Container is ${type} – declaration allowed.`);
      return true;
    }
    if (ast.isNode(context.node)) {
      if (next.property === 'alias') {
        console.log(
          '⭐️ isNodeDeclarationContext: next.property === "alias" – declaration context.',
        );
        return true;
      }
      if (next.property === undefined) {
        // Check if the user has already typed something in this token.
        const tokenStart = context.textDocument.positionAt(context.tokenOffset);
        const tokenEnd = context.textDocument.positionAt(context.offset);
        const tokenText = context.textDocument.getText({ start: tokenStart, end: tokenEnd });
        console.log(
          `⭐️ isNodeDeclarationContext: Container is Node and typed text is "${tokenText}".`,
        );
        if (tokenText.length > 0) {
          return true;
        }
      }
    }
    console.log('⭐️ isNodeDeclarationContext: No match – not a node declaration context.');
    return false;
  }

  protected provideNodeDeclarationKeywordCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
  ): void {
    // Always include the default 'node' keyword.
    acceptor(context, {
      label: 'node',
      kind: CompletionItemKind.Keyword,
      detail: 'Standard node declaration',
      insertText: 'node',
    });

    // Create a dummy ReferenceInfo to query for NodeAlias definitions.
    const tokenStart = context.textDocument.positionAt(context.tokenOffset);
    const tokenEnd = context.textDocument.positionAt(context.offset);
    const refInfo = {
      reference: {
        $refText: context.textDocument.getText({
          start: tokenStart,
          end: tokenEnd,
        }),
      },
      container: context.node ?? { $type: 'Model' },
      property: 'alias',
    };

    const candidates = this.scopeProvider.getScope(refInfo).getAllElements();
    const aliases = stream(candidates)
      .filter((desc) => ast.isNodeAlias(desc.node))
      .toArray();

    // Get the typed text for filtering (e.g. 'd')
    const typedText = context.textDocument
      .getText({
        start: tokenStart,
        end: tokenEnd,
      })
      .toLowerCase();

    console.log(
      `🟠 provideNodeDeclarationKeywordCompletions("${typedText}") - aliases found: "${aliases.length}"`,
    );

    for (const alias of aliases) {
      console.log(
        `🟠 provideNodeDeclarationKeywordCompletions("${typedText}") - checking alias "${alias.name}" at ${alias.path}`,
      );
      if (typedText.length > 0 && !alias.name.toLowerCase().includes(typedText)) {
        continue;
      }
      acceptor(context, {
        label: alias.name,
        kind: CompletionItemKind.Keyword,
        detail: 'Node alias',
        insertText: alias.name,
      });
    }
  }
}
