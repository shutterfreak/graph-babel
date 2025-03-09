import { AstNode, CstNode, CstUtils } from 'langium';
import { AbstractFormatter, Formatting } from 'langium/lsp';

import * as ast from '../language/generated/ast.js';
import { render_text } from './graph-lsp-util.js';

/**
 * GraphFormatter provides custom formatting for the Graph language.
 * It extends the AbstractFormatter from Langium to define specific formatting rules.
 */
export class GraphFormatter extends AbstractFormatter {
  /**
   * Formats the given AST node based on its type.
   * Dispatches to specific formatting methods for each node type.
   *
   * @param node The AST node to format.
   */
  protected format(node: AstNode): void {
    console.log(`format(${node.$type})`);
    if (ast.isModel(node)) {
      // Format top-level styles and elements with no indentation.
      node.styles.forEach((style) => {
        const styleFormatter = this.getNodeFormatter(style);
        styleFormatter.node(style).prepend(Formatting.noIndent());
      });
      node.elements.forEach((element) => {
        const elementFormatter = this.getNodeFormatter(element);
        elementFormatter.node(element).prepend(Formatting.noIndent());
      });
      // TODO: Control whitespace between elements and styles (example: add one empty line)
    } else if (ast.isGraph(node)) {
      this.formatGraph(node);
    } else if (ast.isNode(node)) {
      this.formatNode(node);
    } else if (ast.isLink(node)) {
      this.formatLink(node);
    } else if (ast.isStyle(node)) {
      this.formatStyle(node);
    } else if (ast.isStyleBlock(node)) {
      this.formatStyleBlock(node);
    } else if (ast.isStyleDefinition(node)) {
      this.formatStyleDefinition(node);
    }
  }

  /**
   * Formats a Graph node.
   * Adds spacing around the 'graph' keyword, optional StyleRef, name, and label.
   * Indents the content within the graph's braces.
   *
   * @param node The Graph node to format.
   */
  private formatGraph(node: ast.Graph): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('graph').append(Formatting.oneSpace());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    formatter.property('name').append(Formatting.oneSpace());
    if (node.label) {
      formatter.property('label').append(Formatting.oneSpace());
    }

    const bracesOpen = formatter.keyword('{');
    const bracesClose = formatter.keyword('}');

    formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());
    bracesOpen.append(Formatting.newLine());
    bracesClose.prepend(Formatting.newLine());
  }

  /**
   * Formats a Node node.
   * Adds spacing around the 'node' keyword, optional StyleRef, name, and label.
   *
   * @param node The Node node to format.
   */
  private formatNode(node: ast.Node): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('node').append(Formatting.oneSpace());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    formatter.property('name').append(Formatting.oneSpace());
    if (node.label) {
      formatter.property('label').append(Formatting.oneSpace());
    }
  }

  /**
   * Formats a Link node.
   * Adds spacing around the 'link' keyword, optional StyleRef, name, source, destination, and label.
   * Handles spacing around commas and colons.
   *
   * @param node The Link node to format.
   */
  private formatLink(node: ast.Link): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('link').append(Formatting.oneSpace());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    if (node.name !== undefined) {
      formatter.keyword('(').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
      formatter.property('name').surround(Formatting.noSpace());
      formatter.keyword(')').surround(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    formatter.property('src').append(Formatting.oneSpace());
    if (node.src_arrowhead !== undefined) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('src_arrowhead').append(Formatting.oneSpace());
    }

    formatter.property('link').append(Formatting.oneSpace());
    formatter.property('relation').append(Formatting.oneSpace());

    formatter.property('dst').append(Formatting.oneSpace());
    if (node.dst_arrowhead !== undefined) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('dst_arrowhead').append(Formatting.oneSpace());
    }

    if (node.label) {
      formatter.property('label').append(Formatting.oneSpace());
    }

    // Add whitespace around commas (no space before, one space after)
    formatter.keyword(',').append(Formatting.oneSpace());
  }

  /**
   * Formats a Style node.
   * Adds spacing around the 'style' keyword, optional StyleRef, and name.
   *
   * @param node The Style node to format.
   */
  private formatStyle(node: ast.Style): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('style').append(Formatting.oneSpace()); // Add space after 'style'

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace()); // No space around colon
      formatter.property('styleref').append(Formatting.oneSpace()); // Add space after styleref
    }

    formatter.property('name').append(Formatting.oneSpace()); // Add space after name
  }

  private formatStyleBlock(node: ast.StyleBlock): void {
    console.log(
      `formatStyleBlock()\n${render_text(node.$cstNode?.text, `StyleBlock text`, '\\n', node.$cstNode?.range.start.line)}`,
    );
    const formatter = this.getNodeFormatter(node);
    const bracesOpen = formatter.keyword('{');
    const bracesClose = formatter.keyword('}');
    formatter
      .interior(bracesOpen, bracesClose)
      .prepend(Formatting.indent())
      .surround(Formatting.noSpace());
    // Only add newline after opening brace if the first item is on a different line
    if (node.items.length > 0 && node.$cstNode) {
      const firstItem = node.items[0];
      if (
        firstItem.$cstNode &&
        firstItem.$cstNode.range.start.line !== node.$cstNode.range.start.line
      ) {
        bracesOpen.append(Formatting.newLine());
      }
    } else {
      bracesOpen.append(Formatting.newLine());
    }
    bracesClose.prepend(Formatting.newLine());

    if (node.$cstNode) {
      // DEBUG
      const startLineNode = CstUtils.getStartlineNode(node.$cstNode);
      for (
        let n: CstNode | undefined = startLineNode, i = 1;
        n !== undefined;
        n = CstUtils.getNextNode(n, true)
      ) {
        console.log(
          `formatStyleBlock() DBG ${i++}: [type "${n.grammarSource?.$type}", containerProperty "${n.grammarSource?.$containerProperty}", containerIndex "${n.grammarSource?.$containerIndex}"]${n.hidden ? ' -- HIDDEN' : ''}\n${render_text(n.text, `startLineNode`, '\\n', n.range.start.line)}`,
        );
      }
      CstUtils.streamCst(node.$cstNode).forEach((cstNode, index) => {
        console.log(
          `formatStyleBlock() CST node ${index} grammarSource: [type "${cstNode.grammarSource?.$type}", containerProperty "${cstNode.grammarSource?.$containerProperty}", containerIndex "${cstNode.grammarSource?.$containerIndex}"]`,
        );
      });
      // Format each StyleDefinition item within the StyleBlock
      if (node.items.length > 0) {
        node.items.forEach((item) => {
          const itemFormatter = this.getNodeFormatter(item);
          itemFormatter
            .property('topic')
            .prepend(Formatting.newLine())
            .prepend(Formatting.indent());
        });
      }

      // Handle semicolons
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();
      const semicolonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ';');
      formatter.cst(semicolonNodes).prepend(Formatting.oneSpace());

      // TODO: Add semicolon after the last StyleDefinition if missing
    }
  }

  private formatStyleDefinition(node: ast.StyleDefinition): void {
    console.log(
      `formatStyleDefinition()\n${render_text(node.$cstNode?.text, `StyleDefinition text`, '\\n', node.$cstNode?.range.start.line)}`,
    );
    const formatter = this.getNodeFormatter(node);
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();

      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');

      if (colonNodes.length > 0) {
        formatter.cst(colonNodes).append(Formatting.oneSpace()).prepend(Formatting.noSpace());
      }
    }
  }
}
