import { AstNodeDescription, GrammarAST, type MaybePromise, isNamed } from 'langium';
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
 * Custom completion provider for the Graph DSL.
 *
 * This class extends the default completion provider to implement DSL-specific
 * behavior. It provides:
 *
 * - Customized candidate filtering using a prefix-match generation (via {@link generateFilterText}).
 * - Deduplication of completions via a map (using {@link addUnique}).
 * - Custom handling of alias completions (e.g. for node/graph/link aliases) via {@link getAliasCompletions}.
 * - Special processing for style definitions and text color definitions.
 *
 * The provider builds up a set of unique completion suggestions and then passes them to the
 * language client through the acceptor callback.
 */
export class GraphCompletionProvider extends DefaultCompletionProvider {
  // Debug flag: set to true to output extensive logging.
  private readonly DEBUG = true;

  /**
   * Logs a message to the console if debugging is enabled.
   *
   * @param message - The debug message to log.
   */
  private log(message: string): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.DEBUG) {
      console.log(message);
    }
  }

  /**
   * Generates a filter text for a candidate based on the typed text.
   *
   * This is used to force LSP’s matching algorithm (which normally uses prefix matching)
   * to behave more like a “contains” match. The method extracts the substring of the candidate
   * that starts with the typed text (if found).
   *
   * @param candidateLabel - The candidate's label.
   * @param typedText - The text that the user has typed.
   * @returns A string to be used as filterText.
   */
  private generateFilterText(candidateLabel: string, typedText: string): string {
    const index = candidateLabel.toLowerCase().indexOf(typedText.toLowerCase());
    // If typedText is found later in candidateLabel, slice candidateLabel from that point.
    return index > 0 ? candidateLabel.slice(index) : candidateLabel;
  }

  /**
   * Invokes the completion acceptor with a given candidate item and logs the details.
   *
   * This method enriches the candidate with a filterText (using {@link generateFilterText})
   * and ensures that the sortText is set (defaulting to "0" if not provided).
   *
   * @param acceptor - The callback to accept a completion item.
   * @param context - The current completion context.
   * @param item - The completion candidate item.
   */
  private createAcceptor(
    acceptor: CompletionAcceptor,
    context: CompletionContext,
    item: CompletionValueItem,
  ): void {
    // For debugging: report the item and the typed text.
    const tokenStart = context.textDocument.positionAt(context.tokenOffset);
    const tokenEnd = context.textDocument.positionAt(context.offset);
    const typedText = context.textDocument.getText({
      start: tokenStart,
      end: tokenEnd,
    });
    console.log(
      `✅ createAcceptor() context: "${typedText}", kind: ${item.kind}, label: "${item.label}", detail: "${item.detail}", insertText: "${item.insertText}"`,
    );
    if (item.sortText === undefined) {
      item.sortText = '0';
    }
    // Set filterText to drive LSP matching (using our custom prefix match)
    item.filterText = this.generateFilterText(item.label!, typedText);
    acceptor(context, item);
  }

  /**
   * Main entry point for providing completion items.
   *
   * Langium calls this method once per grammar alternative (each candidate feature is in `context.features`).
   * This implementation uses the information in the `next` feature to determine which completions to propose.
   * The method registers unique candidates into a map and then calls the acceptor callback for each.
   *
   * @param context - The current completion context, containing document, position, and candidate features.
   * @param next - The next expected feature (grammar alternative) for this invocation.
   * @param acceptor - The callback used to register completion items.
   * @returns A promise or undefined.
   */
  protected override completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor,
  ): MaybePromise<void> {
    this.log(
      `🟠 1 🟠 GraphCompletionProvider.completionFor(${positionToString(context.position)}), node type: ${context.node ? context.node.$type : '(none)'}, name: ${
        context.node && isNamed(context.node) ? context.node.name : '<no name>'
      }, Features: ${context.features
        .filter((f) => f.property !== undefined)
        .map((f) => `${f.type}.${f.property} (${f.feature.$type})`)
        .join(', ')}; next: ${next.type}.${next.property} (${next.feature.$type})`,
    );

    const node = context.node;
    if (!node) return;

    // Get the text that the user has typed so far.
    const tokenStart = context.textDocument.positionAt(context.tokenOffset);
    const tokenEnd = context.textDocument.positionAt(context.offset);
    const typedText = context.textDocument.getText({ start: tokenStart, end: tokenEnd });

    this.log(
      `🟠 Before Scenarios: Typed text: "${typedText}" -- NEXT candidate: target: ${next.type}.${next.property} (Feature: ${next.feature.$type}), node context: ${node.$type} ${isNamed(node) ? `"${node.name}"` : '<no name>'}`,
    );

    if (next.property === 'keyword' && next.type !== undefined) {
      // NOTE: Our grammar defines 'keyword' for Element (Graph, Node, Link), ElementAlias (GraphAlias, NodeAlias, LinkAlias) and Style
      const candidate: string = (next.feature as GrammarAST.Keyword).value;
      const match: string | undefined = candidate.includes(typedText.toLowerCase())
        ? candidate
        : undefined;

      if (match !== undefined) {
        this.log(
          `🟠 Scenario A-1: "${typedText}" -- NEXT candidate: target: ${next.type}.${next.property} (Feature: ${next.feature.$type}) -- "${typedText}" in "${candidate}" ? 🟢 MATCH`,
        );
        // Do not add any keywords (they are automatically added elsewhere)
      } else {
        this.log(
          `🟠 Scenario A-1: "${typedText}" -- NEXT candidate: target: ${next.type}.${next.property} (Feature: ${next.feature.$type}) -- "${typedText}" in "${candidate}" ? 🔴 NO MATCH`,
        );
      }
    } // else if (next.property === 'alias') -- DO NOTHING -- handled by createReferenceCompletionItem()

    // --- Other Cases: StyleDefinition, TextColorDefinition etc.
    if (ast.isStyleDefinition(node)) {
      // When the expected property is undefined, we interpret it as the first property ("topic").
      if (next.property === undefined) {
        // Provide completions for the topic property.
        this.provideTopicCompletions(context, acceptor, typedText);
        return;
      }
      if (ast.isShapeStyleDefinition(node) && next.property === 'value') {
        // Provide shape completions for the value property of a ShapeStyleDefinition.
        this.provideShapeCompletions(context, acceptor, typedText);
        return;
      }
    } else if (ast.isTextColorDefinition(node)) {
      // Provide completions for CSS color names for a TextColorDefinition.
      this.provideColorCompletions(context, acceptor, typedText);
      return;
    }

    this.log(
      `GraphCompletionProvider.completionFor(${positionToString(context.position)}): No custom completions found for node type "${node.$type}", property "${next.property}".`,
    );
    // Delegate to the default completion provider for any other context.
    // If no completions were found for the current feature, delegate to the default provider.
    return super.completionFor(context, next, acceptor);
  }

  /**
   * Provides completions for the topic property of a style definition.
   *
   * @param context - The current completion context.
   * @param acceptor - The callback to register completions.
   * @param typedText - The text typed by the user, used for filtering.
   */
  protected provideTopicCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
    typedText: string,
  ): void {
    this.log(
      `GraphCompletionProvider: Providing topic completions at ${positionToString(context.position)}.`,
    );
    for (const topic of STYLE_TOPICS) {
      this.createAcceptor(acceptor, context, {
        label: topic,
        kind: CompletionItemKind.EnumMember,
        detail: 'Style Topic',
        insertText: topic,
        filterText: this.generateFilterText(topic.toLowerCase(), typedText),
      });
    }
  }

  /**
   * Provides shape completions for a shape style definition.
   *
   * @param context - The current completion context.
   * @param acceptor - The callback to register completions.
   * @param filterText - The text used to filter shape suggestions.
   */
  protected provideShapeCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
    filterText: string,
  ): void {
    for (const shape of NAMED_SHAPES) {
      this.createAcceptor(acceptor, context, {
        label: shape,
        kind: CompletionItemKind.EnumMember,
        detail: 'Named Shape',
        insertText: shape,
        filterText: this.generateFilterText(shape.toLowerCase(), filterText),
      });
    }
  }

  /**
   * Provides CSS color completions for a text color definition.
   *
   * @param context - The current completion context.
   * @param acceptor - The callback to register completions.
   * @param filterText - The text used to filter color suggestions.
   */
  protected provideColorCompletions(
    context: CompletionContext,
    acceptor: CompletionAcceptor,
    filterText: string,
  ): void {
    for (const color of NAMED_COLORS) {
      this.createAcceptor(acceptor, context, {
        label: color,
        documentation: `(${color_name_to_hex(color)})`,
        kind: CompletionItemKind.EnumMember,
        detail: 'CSS Color Name',
        insertText: color,
        filterText: this.generateFilterText(color.toLowerCase(), filterText),
      });
    }
  }

  /**
   * Override this method to change how reference completion items are created.
   *
   * This method is used when converting a candidate from the scope provider into a
   * completion suggestion. It uses the candidate’s name and type, and adds context
   * such as location in the AST.
   *
   * @param nodeDescription - The description of the reference candidate.
   * @returns A partial completion item containing candidate information.
   */
  protected override createReferenceCompletionItem(
    nodeDescription: AstNodeDescription,
  ): CompletionValueItem {
    const kind = this.nodeKindProvider.getCompletionItemKind(nodeDescription);
    const documentation = this.getReferenceDocumentation(nodeDescription);
    const ancestry = nodeDescription.node ? getNodeAncestry(nodeDescription.node) : '';
    const label = ast.isElement(nodeDescription.node)
      ? Label_get_label(nodeDescription.node.label)
      : '';

    return {
      label: `${nodeDescription.name} (${nodeDescription.type})`,
      insertText: nodeDescription.name,
      nodeDescription,
      kind,
      documentation,
      detail: `${nodeDescription.type}, ${ancestry.length === 0 ? 'at top level' : `in ${ancestry}`}${label.length === 0 ? '' : `: ${label}`}`,
      sortText: '0',
    };
  }
}
