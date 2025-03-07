import { AstNode, DefaultNameProvider, isNamed } from 'langium';

import { isElement, isStyle } from '../language/generated/ast.js';

export class GraphNameProvider extends DefaultNameProvider {
  override getName(node: AstNode): string | undefined {
    if (isNamed(node) && node.name.length > 0) {
      // Non-empty name
      if (isElement(node)) {
        return node.name;
      }
      if (isStyle(node)) {
        return node.name;
      }
    }

    //console.warn(`GraphNameProvider.getName(type: ${node.$type}) - no name or empty name found`);
    return undefined;
  }
}
