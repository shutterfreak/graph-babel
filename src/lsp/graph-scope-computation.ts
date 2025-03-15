import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  Cancellation,
  DefaultScopeComputation,
  LangiumDocument,
  MultiMap,
  PrecomputedScopes,
  interruptAndCheck,
} from 'langium';

import { isNodeAlias, isStyle } from '../language/generated/ast.js';

/**
 * Computes the scope for the Graph language, including file-global and local scopes.
 *
 * This class extends the default Langium scope computation to handle `NodeAlias` nodes
 * and provides a file-global scope for cross-reference resolution. It separates
 * document-level and style-specific scopes for more efficient lookups.
 */
export class GraphScopeComputation extends DefaultScopeComputation {
  private documentScopes = new Map<string, MultiMap<AstNode, AstNodeDescription>>();
  private styleScopes = new Map<string, MultiMap<AstNode, AstNodeDescription>>();

  /**
   * Computes the local scopes for a given document.
   *
   * This method iterates through all nodes in the document, collecting named elements
   * to build file-global scopes (document-level and style-specific). It then processes
   * each node to compute local scopes based on container relationships.
   *
   * @param document The Langium document.
   * @param cancelToken Optional cancellation token.
   * @returns A promise that resolves to the precomputed scopes for the document.
   */
  override async computeLocalScopes(
    document: LangiumDocument,
    cancelToken = Cancellation.CancellationToken.None,
  ): Promise<PrecomputedScopes> {
    const rootNode = document.parseResult.value;
    const documentUri = document.uri.toString();
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    //const elementScope = new MultiMap<AstNode, AstNodeDescription>();
    const documentScope = new MultiMap<AstNode, AstNodeDescription>();
    const styleScope = new MultiMap<AstNode, AstNodeDescription>();

    this.documentScopes.set(documentUri, documentScope);
    this.styleScopes.set(documentUri, styleScope);

    // Build file-global scopes for document elements and styles
    for (const node of AstUtils.streamAllContents(rootNode)) {
      await interruptAndCheck(cancelToken);

      const name = this.nameProvider.getName(node) ?? '';
      if (name.length > 0) {
        const description = this.descriptions.createDescription(node, name, document);
        documentScope.add(document.parseResult.value, description);
        if (isStyle(node)) {
          styleScope.add(document.parseResult.value, description);
        }
      }
    }

    document.precomputedScopes = scopes;
    document.precomputedScopes.addAll(document.parseResult.value, documentScope.values());
    // Style scope is not added to precomputedScopes here, as it's handled separately

    // Process each node to compute local scopes based on containers
    for (const node of AstUtils.streamAllContents(rootNode)) {
      await interruptAndCheck(cancelToken);
      this.processNode(node, document, scopes);
    }

    return scopes;
  }

  /**
   * Retrieves the document-level scope for a given document URI.
   *
   * This scope contains descriptions of all named elements within the document.
   *
   * @param documentUri The URI of the document.
   * @returns The document-level scope or undefined if not found.
   */
  getDocumentScope(documentUri: string): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.documentScopes.get(documentUri);
  }

  /**
   * Retrieves the style-specific scope for a given document URI.
   *
   * This scope contains descriptions of all `Style` elements within the document.
   *
   * @param documentUri The URI of the document.
   * @returns The style-specific scope or undefined if not found.
   */
  getStyleScope(documentUri: string): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.styleScopes.get(documentUri);
  }

  /**
   * Processes a single node during scope computation, adding it to the
   * appropriate local scope.
   *
   * This method handles adding named elements to their container's local scope
   * and specifically adds `NodeAlias` nodes to the document-level scope.
   *
   * @param node The AST node to process.
   * @param document The Langium document.
   * @param scopes The precomputed scopes MultiMap.
   */
  protected override processNode(
    node: AstNode,
    document: LangiumDocument,
    scopes: PrecomputedScopes,
  ): void {
    const container = node.$container;
    const name = this.nameProvider.getName(node) ?? '';

    // Add named element to its container's local scope
    if (name.length > 0 && container) {
      scopes.add(container, this.descriptions.createDescription(node, name, document));
    }

    // Handle NodeAlias: add it to the document-level scope
    if (isNodeAlias(node)) {
      scopes.add(
        document.parseResult.value,
        this.descriptions.createDescription(node, node.name, document),
      );
    }
  }
}
