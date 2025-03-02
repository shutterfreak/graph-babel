import {
  AstNode,
  AstUtils,
  DefaultScopeProvider,
  EMPTY_SCOPE,
  LangiumCoreServices,
  ReferenceInfo,
  Scope,
  ScopeComputation,
  StreamScope,
} from 'langium';

import { isStyle } from '../language/generated/ast.js';

export class GraphScopeProvider extends DefaultScopeProvider {
  protected readonly scopeComputation: ScopeComputation;

  constructor(services: LangiumCoreServices) {
    super(services);
    this.scopeComputation = services.references.ScopeComputation;
  }

  override getScope(context: ReferenceInfo): Scope {
    if (isStyle(context.container) && context.property === 'extends') {
      const scopes = this.getContainerScopes(context.container);
      return this.createScopeFromContainers(scopes);
    }
    return super.getScope(context);
  }

  private getContainerScopes(node: AstNode): Scope[] {
    const scopes: Scope[] = [];
    let current: AstNode | undefined = node;
    while (current) {
      const localScope = this.getScopeForNode(current);
      if (localScope) {
        scopes.push(localScope);
      }
      current = current.$container;
    }
    return scopes; // Return the array of scopes.
  }

  private getScopeForNode(node: AstNode): Scope | undefined {
    let document = undefined;
    try {
      document = AstUtils.getDocument(node);
    } catch (err) {
      console.error('An error occurred:', err);
      return undefined;
    }

    // Properly handle the Promise returned by computeLocalScopes.
    this.scopeComputation
      .computeLocalScopes(document)
      .then((localScopes) => {
        const descriptions = localScopes.get(node);
        if (descriptions.length > 0) {
          // Log the descriptions
          console.log('Found descriptions for node:', descriptions);
        }
      })
      .catch((err) => {
        console.error('Error computing local scopes:', err);
      });

    // return undefined because this function is not async, and therefore cannot return a scope.
    return undefined;
  }

  private createScopeFromContainers(scopes: Scope[]): Scope {
    if (scopes.length === 0) {
      return EMPTY_SCOPE;
    }
    let combinedElements = scopes[0].getAllElements();
    for (let i = 1; i < scopes.length; i++) {
      combinedElements = combinedElements.concat(scopes[i].getAllElements());
    }

    return new StreamScope(combinedElements);
  }
}
