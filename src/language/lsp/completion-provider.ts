import type { AstNode, MaybePromise } from 'langium';
import {
  CompletionAcceptor,
  CompletionContext,
  DefaultCompletionProvider,
  NextFeature,
} from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';

import { STYLE_TOPICS } from '../model-helpers.js';

export class GraphCompletionProvider extends DefaultCompletionProvider {
  protected override completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor,
  ): MaybePromise<void> {
    // Check if the current context is a StyleDefinition and the expected feature is for the 'topic'
    if (this.isStyleTopicContext(context, next)) {
      // Provide all style topics from your helper array
      for (const topic of STYLE_TOPICS) {
        acceptor(context, {
          label: topic,
          kind: CompletionItemKind.EnumMember,
          detail: 'Style Topic',
          insertText: topic,
        });
      }
      // Do not call super if we've already provided the completions
      return;
    }
    // Otherwise, delegate to the default behavior.
    return super.completionFor(context, next, acceptor);
  }

  /**
   * Determine if the current context expects a style topic.
   * This could be refined by checking the AST node type, or by comparing the next feature against expected terminal values.
   */
  protected isStyleTopicContext(context: CompletionContext, next: NextFeature): boolean {
    // Check that we have a valid node. For instance, you might expect the node to be one of your style definitions.
    const node: AstNode | undefined = context.node;
    if (!node) {
      return false;
    }
    // Here, you might check if the node's type is one of your StyleDefinition subtypes.
    // For example, if your AST defines 'ColorStyleDefinition', 'LabelStyleDefinition', etc.
    if (!STYLE_TOPICS.includes(node.$type)) {
      return false;
    }
    // Additionally, you might check if the next feature is a terminal (keyword) that corresponds to a topic.
    // For instance, if the feature is a keyword whose value (or its name) ends with '_TOPIC'
    if (typeof next.feature === 'object' && 'value' in next.feature) {
      // const keywordValue = next.feature.value as string;
      // You can decide on a condition – for example, if the keywordValue is empty or doesn't match any other valid token
      // In many cases, you might simply decide that if you are in a style definition, the 'topic' completion should be used.
      return true;
    }
    return false;
  }
}
