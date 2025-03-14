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

import { isNodeAlias } from '../language/generated/ast.js';

/**
 * Computes the scope for the Graph language, including file-global and local scopes.
 * Extends the default Langium scope computation to handle 'NodeAlias' nodes and
 * provide a file-global scope for cross-reference resolution.
 */
export class GraphScopeComputation extends DefaultScopeComputation {
  /**
   * Stores descriptions of all named elements in the document, making them
   * accessible throughout the file.
   */
  private fileGlobalScope: MultiMap<AstNode, AstNodeDescription> | undefined = undefined;

  /**
   * Retrieves the file-global scope.
   *
   * @returns The MultiMap containing descriptions of named elements, or undefined if not initialized.
   */
  getFileGlobalScope(): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.fileGlobalScope;
  }

  /**
   * Computes local scopes and initializes the file-global scope for a given
   * Langium document.
   *
   * @param document The Langium document for which to compute scopes.
   * @param cancelToken Optional cancellation token.
   * @returns A promise that resolves to the precomputed scopes.
   */
  override async computeLocalScopes(
    document: LangiumDocument,
    cancelToken = Cancellation.CancellationToken.None,
  ): Promise<PrecomputedScopes> {
    const rootNode = document.parseResult.value;
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    // Store the file-global scope in precomputedScopes for the root node
    const fileGlobalScope = new MultiMap<AstNode, AstNodeDescription>();
    // Initialize the file-global scope if it doesn't exist
    if (!this.fileGlobalScope) {
      this.fileGlobalScope = new MultiMap<AstNode, AstNodeDescription>();
      // Collect all named elements (Graphs, Nodes, Links) into the file-global scope
      for (const node of AstUtils.streamAllContents(rootNode)) {
        await interruptAndCheck(cancelToken);

        const name = this.nameProvider.getName(node) ?? '';
        if (name.length > 0) {
          // Add the description to the file-global scope
          this.fileGlobalScope.add(
            document.parseResult.value,
            this.descriptions.createDescription(node, name, document),
          );
        }
      }
    }

    for (const node of AstUtils.streamAllContents(rootNode)) {
      await interruptAndCheck(cancelToken);

      const name = this.nameProvider.getName(node) ?? '';
      if (name.length > 0) {
        fileGlobalScope.add(
          document.parseResult.value,
          this.descriptions.createDescription(node, name, document),
        );
      }
    }
    document.precomputedScopes = scopes;
    document.precomputedScopes.addAll(document.parseResult.value, fileGlobalScope.values());

    // Process each node to compute local scopes
    for (const node of AstUtils.streamAllContents(rootNode)) {
      await interruptAndCheck(cancelToken);

      this.processNode(node, document, scopes);
    }

    return scopes;
  }

  /**
   * Processes a single node during scope computation, adding it to the
   * appropriate local scope.
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

    // Handle KeywordAlias
    if (isNodeAlias(node)) {
      scopes.add(
        document.parseResult.value,
        this.descriptions.createDescription(node, node.name, document),
      ); // Add to file-global scope
    }
  }
}
