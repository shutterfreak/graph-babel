import { AstNode, DefaultNameProvider, isNamed } from 'langium';

import { isElement, isStyle } from '../language/generated/ast.js';

// Adjust the import path

export class GraphNameProvider extends DefaultNameProvider {
  override getName(node: AstNode): string | undefined {
    if (isElement(node) && isNamed(node) && node.name.length > 0) {
      // Link can have undefined 'name'
      //console.log(`GraphNameProvider.getName(type: ${node.$type}) - name = "${node.name ?? ''}"`);
      return node.name;
    }
    if (isStyle(node) && node.name.length > 0) {
      //console.log(`GraphNameProvider.getName(type: ${node.$type}) - name = "${node.name}"`);
      return node.name;
    }

    //console.warn(`GraphNameProvider.getName(type: ${node.$type}) - WILL NEVE RETURN A NAME`);
    return undefined;
  }
}
