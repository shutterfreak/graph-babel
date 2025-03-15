import { AstNode, GrammarUtils, isNamed } from 'langium';
import {
  AbstractSemanticTokenProvider,
  SemanticTokenAcceptor,
  SemanticTokenAcceptorOptions,
} from 'langium/lsp';

import {
  isBracketedLabel,
  isElement,
  isLink,
  isNode,
  isNodeAlias,
  isStyle,
  isStyleDefinition,
} from '../generated/ast.js';

/**
 * Available Semantic Token Types (as string values):

namespace	For identifiers that declare or reference a namespace, module, or package.
 * class            For identifiers that declare or reference a class type.
 * enum             For identifiers that declare or reference an enumeration type.
 * interface        For identifiers that declare or reference an interface type.
 * struct           For identifiers that declare or reference a struct type.
 * typeParameter    For identifiers that declare or reference a type parameter.
 * type             For identifiers that declare or reference a type that is not covered above.
 * parameter        For identifiers that declare or reference a function or method parameters.
 * variable         For identifiers that declare or reference a local or global variable.
 * property         For identifiers that declare or reference a member property, member field, or member variable.
 * enumMember       For identifiers that declare or reference an enumeration property, constant, or member.
 * decorator        For identifiers that declare or reference decorators and annotations.
 * event            For identifiers that declare an event property.
 * function         For identifiers that declare a function.
 * method           For identifiers that declare a member function or method.
 * macro            For identifiers that declare a macro.
 * label            For identifiers that declare a label.
 * comment          For tokens that represent a comment.
 * string           For tokens that represent a string literal.
 * keyword          For tokens that represent a language keyword.
 * number           For tokens that represent a number literal.
 * regexp           For tokens that represent a regular expression literal.
 * operator         For tokens that represent an operator.
 *
 * @see https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
 *
 * These token types are mapped to numeric indices via the token legend defined in your extension.
 */

/**
 * Custom semantic token provider for the Graph language.
 *
 * This provider extends the Langium AbstractSemanticTokenProvider and overrides
 * the `highlightElement` method. It uses the provided token acceptor to push semantic tokens
 * for various features:
 *
 * - **NodeAlias nodes:** The "name" property is highlighted as a token of type "macro".
 * - **Named Element nodes:** The "name" property is highlighted as "property".
 * - **Link nodes:** In addition to their "name" property (if available),
 *   each element in the "src" and "dst" arrays is highlighted as "property".
 *   Also, arrowhead properties ("src_arrowhead", "dst_arrowhead") are highlighted as "enumMember".
 * - **Nodes with an alias:** For Nodes (of type "Node") that have an alias (i.e. not declared with the keyword 'node'),
 *   the "alias" property is highlighted as type "type".
 * - **BracketedLabel nodes:** Their "label_bracketed" property is rendered as "string".
 * - **Style definitions:** The "topic" property is rendered as "property", and for Style nodes,
 *   the "name" property is rendered as "class".
 * - **Style references:** For Elements, Styles, or NodeAliases that have a style reference, the "styleref"
 *   property is rendered as "class".
 */
export class GraphSemanticTokenProvider extends AbstractSemanticTokenProvider {
  /**
   * Called for every AST node during semantic highlighting.
   *
   * This method examines the node and, if it matches a case of interest,
   * uses the token acceptor to push a semantic token. It supports:
   * - NodeAlias nodes: highlighting the "name" property as "variable".
   * - Link nodes: highlighting the "name" property as "property" plus each element
   *   in the "src" and "dst" arrays as "property".
   * - Node tokens (of $type "Node") that have an alias reference: highlighting the "alias"
   *   property as "type".
   *
   * @param node The current AST node.
   * @param acceptor A function to accept semantic tokens.
   * @returns Optionally, 'prune' to skip processing children.
   */
  protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void | 'prune' {
    // --- NodeAlias: Highlight the "name" property as "macro"
    if (isNodeAlias(node)) {
      const cstName = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
      if (cstName) {
        acceptor({
          cst: cstName,
          type: 'macro',
        } as SemanticTokenAcceptorOptions);
      }
    }

    // --- Named Elements: Highlight the "name" property as "property"
    if (isElement(node)) {
      if (isNamed(node)) {
        const cstName = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
        if (cstName) {
          acceptor({
            cst: cstName,
            type: 'property',
          } as SemanticTokenAcceptorOptions);
        }
      }

      // --- Link Nodes: Highlight "src" and "dst" properties as "property"
      if (isLink(node)) {
        // Highlight each element in the "src" property array as "property"
        const cstSrcNodes = GrammarUtils.findNodesForProperty(node.$cstNode, 'src');
        for (const srcNode of cstSrcNodes) {
          acceptor({
            cst: srcNode,
            type: 'property',
          } as SemanticTokenAcceptorOptions);
        }
        // Highlight each element in the "dst" property array as "property"
        const cstDstNodes = GrammarUtils.findNodesForProperty(node.$cstNode, 'dst');
        for (const dstNode of cstDstNodes) {
          acceptor({
            cst: dstNode,
            type: 'property',
          } as SemanticTokenAcceptorOptions);
        }
        // Highlight arrowhead properties if they exist, as "enumMember"
        if ((node.src_arrowhead ?? '').length > 0) {
          const cstArrowHead = GrammarUtils.findNodeForProperty(node.$cstNode, 'src_arrowhead');
          if (cstArrowHead) {
            acceptor({
              cst: cstArrowHead,
              type: 'enumMember',
            } as SemanticTokenAcceptorOptions);
          }
        }
        if ((node.dst_arrowhead ?? '').length > 0) {
          const cstArrowHead = GrammarUtils.findNodeForProperty(node.$cstNode, 'dst_arrowhead');
          if (cstArrowHead) {
            acceptor({
              cst: cstArrowHead,
              type: 'enumMember',
            } as SemanticTokenAcceptorOptions);
          }
        }
      }
    }

    // --- Node Alias Property: For Nodes (type "Node") that have an alias, highlight the "alias" property as "type"
    if (isNode(node) && node.alias) {
      const cstAlias = GrammarUtils.findNodeForProperty(node.$cstNode, 'alias');
      if (cstAlias) {
        acceptor({
          cst: cstAlias,
          type: 'macro',
        } as SemanticTokenAcceptorOptions);
      }
    }

    if (isBracketedLabel(node)) {
      const cstLabel = GrammarUtils.findNodeForProperty(node.$cstNode, 'label_bracketed');
      if (cstLabel) {
        acceptor({
          cst: cstLabel,
          type: 'string',
        } as SemanticTokenAcceptorOptions);
      }
    }

    if (isStyleDefinition(node)) {
      const cstTopic = GrammarUtils.findNodeForProperty(node.$cstNode, 'topic');
      if (cstTopic) {
        acceptor({
          cst: cstTopic,
          type: 'property',
        } as SemanticTokenAcceptorOptions);
      }
      /*
      const cstValue = GrammarUtils.findNodeForProperty(node.$cstNode, 'value');
      if (cstValue) {
        acceptor({
          cst: cstValue,
          type: 'variable',
        } as SemanticTokenAcceptorOptions);
      }
      */
    }

    // --- Style and StyleReference: Highlight the "styleref" property as "class"
    if (isElement(node) || isStyle(node) || (isNodeAlias(node) && node.styleref)) {
      const cstStyleRef = GrammarUtils.findNodeForProperty(node.$cstNode, 'styleref');
      if (cstStyleRef) {
        acceptor({
          cst: cstStyleRef,
          type: 'class',
        } as SemanticTokenAcceptorOptions);
      }
    }
    if (isStyle(node)) {
      const cstName = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
      if (cstName) {
        acceptor({
          cst: cstName,
          type: 'class',
        } as SemanticTokenAcceptorOptions);
      }
    }

    // Process additional nodes if needed.
  }
}
