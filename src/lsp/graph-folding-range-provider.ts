import { AstNode, LangiumDocument } from 'langium';
import { DefaultFoldingRangeProvider, FoldingRangeAcceptor, LangiumServices } from 'langium/lsp';

import { isGraph, isStyle } from '../language/generated/ast.js';

/**
 * Custom folding range provider for the Graph language.
 * Provides folding capabilities for Graph and Style nodes, using curly brace delimiters.
 */
export class GraphFoldingProvider extends DefaultFoldingRangeProvider {
  /**
   * Constructs a new GraphFoldingProvider.
   *
   * @param services The Langium services.
   */
  constructor(services: LangiumServices) {
    super(services);
  }

  /**
   * Overrides the default collectObjectFolding method to provide custom folding for Graph and Style nodes.
   *
   * @param document The Langium document.
   * @param node The AST node being processed.
   * @param acceptor The folding range acceptor.
   */
  protected override collectObjectFolding(
    document: LangiumDocument,
    node: AstNode,
    acceptor: FoldingRangeAcceptor,
  ): void {
    if (isGraph(node) || isStyle(node)) {
      this.collectCustomFolding(document, node, acceptor);
    }
  }

  /**
   * Collects folding ranges for Graph and Style nodes using curly brace delimiters.
   *
   * @param document The Langium document.
   * @param node The AST node being processed.
   * @param acceptor The folding range acceptor.
   */
  protected collectCustomFolding(
    document: LangiumDocument,
    node: AstNode,
    acceptor: FoldingRangeAcceptor,
  ): void {
    const cstNode = node.$cstNode;
    if (cstNode) {
      const foldingRange = this.toFoldingRange(document, cstNode);
      if (foldingRange) {
        acceptor(foldingRange);
      }
    }
  }
}
