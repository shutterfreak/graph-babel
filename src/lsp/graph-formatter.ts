import { AstNode, CstNode, CstUtils } from 'langium';
import { AbstractFormatter, Formatting, NodeFormatter } from 'langium/lsp';
import { inspect } from 'util';

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
    console.log(
      `format(${node.$type}) - Grammar source: type "${node.$cstNode?.grammarSource?.$type}"\n${render_text(inspect(node.$cstNode?.grammarSource), `${node.$type}: node.$cstNode?.grammarSource`)}"`,
    );
    if (ast.isModel(node)) {
      this.formatModel(node);
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

  private formatModel(node: ast.Model): void {
    node.styles.forEach((style) => {
      const styleFormatter = this.getNodeFormatter(style);
      styleFormatter.node(style).prepend(Formatting.noIndent());
    });
    node.elements.forEach((element) => {
      const elementFormatter = this.getNodeFormatter(element);
      elementFormatter.node(element).prepend(Formatting.noIndent());
    });
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
    formatter.keyword('graph').surround(Formatting.noSpace()).prepend(Formatting.newLine());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    formatter.property('name').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
    if (node.label) {
      formatter.property('label').surround(Formatting.oneSpace());
    }

    // Format braces
    this.formatBracesWithIndent(formatter);
  }

  /**
   * Formats a Node node.
   * Adds spacing around the 'node' keyword, optional StyleRef, name, and label.
   *
   * @param node The Node node to format.
   */
  private formatNode(node: ast.Node): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('node').surround(Formatting.noSpace()).prepend(Formatting.newLine());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    formatter.property('name').surround(Formatting.oneSpace());
    /*
    if (node.label) {
      formatter.property('label').append(Formatting.oneSpace());
    }
    */
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
    formatter.keyword('link').surround(Formatting.noSpace()).prepend(Formatting.newLine());
    formatter.keyword(':').surround(Formatting.noSpace());

    if (node.styleref) {
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    if (node.name !== undefined) {
      formatter.keyword('(').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
      formatter.property('name').surround(Formatting.noSpace());
      formatter.keyword(')').surround(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    formatter.property('src').prepend(Formatting.oneSpace());
    if (node.src_arrowhead !== undefined) {
      formatter.property('src_arrowhead').surround(Formatting.noSpace());
    }

    if (node.relation !== undefined) {
      formatter.property('relation').surround(Formatting.oneSpace());
    }
    if (node.link !== undefined) {
      formatter.property('link').surround(Formatting.oneSpace());
    }

    formatter.property('dst').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
    if (node.dst_arrowhead !== undefined) {
      formatter.property('dst_arrowhead').surround(Formatting.noSpace());
    }

    if (node.label) {
      formatter.property('label').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
    }

    // Handle commas (no space before, one space after)
    formatter.keyword(',').surround(Formatting.noSpace()).append(Formatting.oneSpace());
  }

  /**
   * Formats a Style node.
   * Adds spacing around the 'style' keyword, optional StyleRef, and name.
   *
   * @param node The Style node to format.
   */
  private formatStyle(node: ast.Style): void {
    const formatter = this.getNodeFormatter(node);
    formatter.keyword('style').surround(Formatting.noSpace()).prepend(Formatting.newLine());

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').surround(Formatting.noSpace());
    }

    formatter.property('name').surround(Formatting.oneSpace());
  }

  private formatStyleBlock(node: ast.StyleBlock): void {
    const formatter = this.getNodeFormatter(node);

    this.formatBracesWithIndent(formatter);

    node.items.forEach((item) => {
      const itemFormatter = this.getNodeFormatter(item);
      itemFormatter.property('topic').prepend(Formatting.newLine()).prepend(Formatting.indent());
    });

    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();
      // Handle semicolons
      const semicolonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ';');
      formatter.cst(semicolonNodes).prepend(Formatting.oneSpace());
      // Handle colons
      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');
      formatter.cst(colonNodes).surround(Formatting.noSpace());
    }
  }

  private formatStyleDefinition(node: ast.StyleDefinition): void {
    const formatter = this.getNodeFormatter(node);
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();

      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');

      if (colonNodes.length > 0) {
        formatter.cst(colonNodes).append(Formatting.oneSpace()).prepend(Formatting.noSpace());
      }
    }
  }

  private formatBracesWithIndent(formatter: NodeFormatter<AstNode>) {
    const bracesOpen = formatter.keyword('{');
    const bracesClose = formatter.keyword('}');
    formatter
      .interior(bracesOpen, bracesClose)
      .prepend(Formatting.indent())
      .surround(Formatting.noSpace());

    bracesOpen.append(Formatting.newLine());
    bracesClose.prepend(Formatting.newLine());
  }
}
