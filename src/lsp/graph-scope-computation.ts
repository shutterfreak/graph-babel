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
 * Extends the default Langium scope computation to handle 'NodeAlias' nodes and
 * provide a file-global scope for cross-reference resolution.
 */
export class GraphScopeComputation extends DefaultScopeComputation {
  //private elementScope: MultiMap<AstNode, AstNodeDescription> | undefined = undefined;
  //private styleScope: MultiMap<AstNode, AstNodeDescription> | undefined = undefined;
  private documentScopes = new Map<string, MultiMap<AstNode, AstNodeDescription>>();
  private styleScopes = new Map<string, MultiMap<AstNode, AstNodeDescription>>();

  /*** 
  getElementScope(): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.elementScope;
  }

  getStyleScope(): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.styleScope;
  }
  ***/

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

    /***
    if (!this.elementScope) {
      this.elementScope = new MultiMap<AstNode, AstNodeDescription>();
      this.styleScope = new MultiMap<AstNode, AstNodeDescription>();

      for (const node of AstUtils.streamAllContents(rootNode)) {
        await interruptAndCheck(cancelToken);

        const name = this.nameProvider.getName(node) ?? '';
        if (name.length > 0) {
          const description = this.descriptions.createDescription(node, name, document);
          if (isStyle(node)) {
            this.styleScope.add(document.parseResult.value, description);
          } else if (isElement(node) || isNodeAlias(node)) {
            this.elementScope.add(document.parseResult.value, description);
          }
        }
      }
    }
    ***/

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
    // Do NOT add styleScope to precomputedScopes here

    //document.precomputedScopes.addAll(document.parseResult.value, elementScope.values());
    //document.precomputedScopes.addAll(document.parseResult.value, styleScope.values()); // Add style scope as well

    // Process each node to compute local scopes
    for (const node of AstUtils.streamAllContents(rootNode)) {
      await interruptAndCheck(cancelToken);
      this.processNode(node, document, scopes);
    }

    return scopes;
  }

  getDocumentScope(documentUri: string): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.documentScopes.get(documentUri);
  }

  getStyleScope(documentUri: string): MultiMap<AstNode, AstNodeDescription> | undefined {
    return this.styleScopes.get(documentUri);
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
      );
    }
  }
}
