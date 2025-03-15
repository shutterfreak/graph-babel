import { AstNode, DefaultNameProvider, isNamed } from 'langium';

import { isElement, isNodeAlias, isStyle } from '../generated/ast.js';

/**
 * Provides names for AST nodes in the Graph language.
 *
 * This provider extends the default Langium name provider to customize how names
 * are retrieved for specific types of AST nodes within the Graph language.
 * It ensures that only elements, styles, and node aliases with non-empty names
 * are considered to have a name.
 */
export class GraphNameProvider extends DefaultNameProvider {
  /**
   * Retrieves the name of an AST node.
   *
   * This method checks if the given node is a named element (i.e., has a 'name'
   * property) and if that name is not empty. If both conditions are met, and
   * the node is an `Element`, `Style`, or `NodeAlias`, the name is returned.
   * Otherwise, `undefined` is returned, indicating that the node does not have a
   * meaningful name according to the rules of the Graph language.
   *
   * @param node The AST node for which to retrieve the name.
   * @returns The name of the node if it has one, otherwise `undefined`.
   */
  override getName(node: AstNode): string | undefined {
    // Check if the node is named and has a non-empty name
    if (isNamed(node) && node.name.length > 0) {
      // Return the name if the node is an Element, Style, or NodeAlias
      if (isElement(node)) {
        return node.name;
      }
      if (isStyle(node)) {
        return node.name;
      }
      if (isNodeAlias(node)) {
        return node.name;
      }
    }

    // If the node doesn't meet the criteria, return undefined
    // console.warn(`GraphNameProvider.getName(type: ${node.$type}) - no name or empty name found`);
    return undefined;
  }
}
