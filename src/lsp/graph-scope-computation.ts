import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeComputation,
  LangiumDocument,
  MultiMap,
  PrecomputedScopes,
} from 'langium';

import { Model, isElement, isGraph, isModel } from '../language/generated/ast.js';

// Adjust the import path

export class GraphScopeComputation extends DefaultScopeComputation {
  override async computeExports(document: LangiumDocument): Promise<AstNodeDescription[]> {
    const exportedDescriptions: AstNodeDescription[] = [];
    for (const childNode of AstUtils.streamAllContents(document.parseResult.value)) {
      if (isElement(childNode) && (childNode.id ?? '') != '') {
        const d = this.descriptions.createDescription(childNode, childNode.id, document);
        exportedDescriptions.push(d);
      }
    }
    return Promise.resolve(exportedDescriptions);
  }

  override async computeLocalScopes(document: LangiumDocument): Promise<PrecomputedScopes> {
    const model = document.parseResult.value as Model;
    const scopes = new MultiMap<AstNode, AstNodeDescription>();
    this.processContainer(model, scopes, document, []);
    return Promise.resolve(scopes);
  }

  private processContainer(
    container: AstNode,
    scopes: PrecomputedScopes,
    document: LangiumDocument,
    parentScopes: AstNodeDescription[][],
  ): void {
    const localDescriptions: AstNodeDescription[] = [];

    if (isModel(container) || isGraph(container)) {
      for (const style of container.styles) {
        if (style.id !== '') {
          const description = this.descriptions.createDescription(style, style.id, document);
          localDescriptions.push(description);
        }
      }

      for (const element of container.elements) {
        this.processContainer(element, scopes, document, [...parentScopes, localDescriptions]);
      }
    }

    scopes.addAll(container, localDescriptions);
    parentScopes.forEach((parentScope) => scopes.addAll(container, parentScope));
  }
}
