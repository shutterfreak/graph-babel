import { AstNode, DefaultNameProvider } from 'langium';

import { isElement, isStyle } from '../language/generated/ast.js';

// Adjust the import path

export class GraphNameProvider extends DefaultNameProvider {
  override getName(node: AstNode): string | undefined {
    if (isElement(node) && (node.id ?? '').length > 0) {
      // Link can have undefined 'id'
      return node.id;
    }
    if (isStyle(node) && node.id.length > 0) {
      return node.id;
    }
    return undefined;
  }
}
