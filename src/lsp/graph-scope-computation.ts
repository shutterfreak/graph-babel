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
  isNamed,
} from 'langium';

import { isModel } from '../language/generated/ast.js';

/**
 * Custom scope computation class extending the default Langium scope computation.
 * Provides a global scope for all named elements, ensuring they are visible at all levels of the AST.
 */
export class GraphScopeComputation extends DefaultScopeComputation {
  private globalScope: MultiMap<AstNode, AstNodeDescription> | undefined = undefined;
  private processedContainers = new Set<AstNode | LangiumDocument>(); // Track processed containers

  /**
   * Computes the local scopes for a given Langium document.
   *
   * @param document The Langium document for which to compute scopes.
   * @param _cancelToken Optional cancellation token.
   * @returns A promise that resolves to the precomputed scopes.
   */
  override async computeLocalScopes(
    document: LangiumDocument,

    cancelToken = Cancellation.CancellationToken.None,
  ): Promise<PrecomputedScopes> {
    const rootNode = document.parseResult.value;
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    // Create global scope if it doesn't exist
    if (!this.globalScope) {
      this.globalScope = new MultiMap<AstNode, AstNodeDescription>();
      // Collect all named elements into the global scope
      for (const node of AstUtils.streamAllContents(rootNode)) {
        await interruptAndCheck(cancelToken);

        const name = this.nameProvider.getName(node) ?? '';
        if (name.length > 0) {
          if (this.globalScope.has(node)) {
            // globalScope already contains node, skip
          } else {
            // Add node to globalScope
            this.globalScope.add(
              document.parseResult.value,
              this.descriptions.createDescription(node, name, document),
            );
          }
        }
      }
    }

    // Process each node and add the global scope to containers
    for (const node of AstUtils.streamAllContents(rootNode)) {
      this.processNode(node, document, scopes);
    }

    return scopes;
  }

  /**
   * Processes a single node during scope computation, adding it to the appropriate scopes.
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

    // Add named element to the container scope
    if (name.length > 0 && container) {
      scopes.add(container, this.descriptions.createDescription(node, name, document));
    }

    // Add global scope to every container (including the root model) only once
    if (container || isModel(document.parseResult.value)) {
      const target = container || document; // Use document for root
      if (!this.processedContainers.has(target)) {
        this.globalScope!.values().forEach((description) => {
          if (description.node && isNamed(description.node)) {
            // Add named node to scope
            if (container) {
              // Add the description to the parent container
              scopes.add(container, description);
            } else {
              // Add the description to the document root
              scopes.add(document.parseResult.value, description);
            }
          } else {
            // Skip non-named nodes
          }
        });
        this.processedContainers.add(target);
      }
    }
  }
}
