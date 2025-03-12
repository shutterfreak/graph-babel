import {
  AstNode,
  CstNode,
  CstUtils,
  // TextDocument,
  isLeafCstNode,
  isNamed,
} from 'langium';
import {
  AbstractFormatter,
  Formatting,
  FormattingAction,
  FormattingContext,
  NodeFormatter,
} from 'langium/lsp';
import { rangeToString } from 'langium/test';
import { inspect } from 'util';
import type { Range, TextEdit } from 'vscode-languageserver-protocol';

import * as ast from '../language/generated/ast.js';

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
      `format(${node.$type}) - Grammar source: type "${node.$cstNode?.grammarSource?.$type}"` +
        // + '\n' + render_text(inspect(node.$cstNode?.grammarSource), `${node.$type}: node.$cstNode?.grammarSource`)
        ` ${node.$type}: node.$cstNode?.grammarSource: { $type "${node.$cstNode?.grammarSource?.$type}", $containerProperty "${node.$cstNode?.grammarSource?.$containerProperty ?? '<N/A>'}", $containerIndex "${node.$cstNode?.grammarSource?.$containerIndex ?? '<N/A>'}" }`,
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

  /**
   * Formats a Model node.
   * Adds newlines between styles and elements.
   *
   * @param node The Model node to format.
   */
  private formatModel(node: ast.Model): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    // Add newline between each style definition
    node.styles.forEach((style) => {
      const styleFormatter = this.getNodeFormatter(style);
      styleFormatter.node(style).prepend(Formatting.newLine());
    });

    // Add newline between each element (graph, node, link)
    node.elements.forEach((element, index) => {
      const elementFormatter = this.getNodeFormatter(element);
      if (index > 0) {
        elementFormatter.node(element).prepend(Formatting.newLine());
      }
    });
  }

  /**
   * Formats a Graph node.
   * Adds spacing around keywords, optional StyleRef, name, and label.
   * Indents the content within the graph's braces.
   *
   * @param node The Graph node to format.
   */
  private formatGraph(node: ast.Graph): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    const formatter = this.getNodeFormatter(node);

    // Format 'graph' keyword and optional style reference
    formatter.keyword('graph').surround(Formatting.noSpace()).prepend(Formatting.newLine());
    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    // Format graph name and optional label
    formatter.property('name').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
    if (node.label) {
      formatter.property('label').surround(Formatting.oneSpace());
    }

    // Indent content within braces
    formatter.keyword('{').prepend(Formatting.newLine());
    this.formatBracesWithIndent(formatter);

    // Indent elements and styles within the graph
    node.elements.forEach((element) => {
      const elementFormatter = this.getNodeFormatter(element);
      elementFormatter.node(element).prepend(Formatting.indent());
    });
    node.styles.forEach((style) => {
      const styleFormatter = this.getNodeFormatter(style);
      styleFormatter.node(style).prepend(Formatting.indent());
    });
  }

  /**
   * Formats a Node node.
   * Adds spacing around the 'node' keyword, optional StyleRef, name, and label.
   *
   * @param node The Node node to format.
   */
  private formatNode(node: ast.Node): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    const formatter = this.getNodeFormatter(node);

    // Format 'node' keyword and optional style reference
    formatter.keyword('node').surround(Formatting.noSpace()).prepend(Formatting.newLine());

    // Apply indent based on the container type
    if (node.$container.$type === 'Model') {
      formatter.keyword('node').append(Formatting.newLine()).append(Formatting.indent());
    } else {
      formatter.node(node).prepend(Formatting.indent());
    }

    if (node.styleref) {
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.oneSpace());
    }

    // Format node name and optional label
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
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    const formatter = this.getNodeFormatter(node);
    // Format 'link' keyword and optional style reference
    formatter.keyword('link').surround(Formatting.noSpace()).prepend(Formatting.newLine());

    // Apply indent based on the container type
    if (node.$container.$type === 'Model') {
      formatter.keyword('link').append(Formatting.newLine()).append(Formatting.indent());
    } else {
      // node.$container.$type === 'Graph'
      formatter.node(node).prepend(Formatting.indent());
    }

    formatter.keyword(':').surround(Formatting.noSpace());

    if (node.styleref) {
      formatter.property('styleref').surround(Formatting.noSpace());
    }

    // Format optional link name
    if (node.name !== undefined) {
      formatter.keyword('(').surround(Formatting.noSpace()).prepend(Formatting.oneSpace());
      formatter.property('name').surround(Formatting.noSpace());
      formatter.keyword(')').surround(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    // Format source, relation, link, destination, and label
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
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();
      const commaNodes = cstNodes.filter((cstNode) => cstNode.text === ',');
      formatter.cst(commaNodes).surround(Formatting.noSpace()).append(Formatting.oneSpace());
    }
  }

  /**
   * Formats a Style node.
   * Adds spacing around the 'style' keyword, optional StyleRef, and name.
   *
   * @param node The Style node to format.
   */
  private formatStyle(node: ast.Style): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    const formatter = this.getNodeFormatter(node);
    console.log(`formatStyle() Formatting style: "${node.name}"`);
    console.log(
      `format${node.$type}() Before formatting: [[${(node.$cstNode?.text ?? '<CST node undefined>').replaceAll('\r', '\\r').replaceAll('\n', '\\n')}]]`,
    );

    // Format 'style' keyword and optional style reference
    if (node.styleref) {
      formatter.keyword('style').append(Formatting.noSpace());
      formatter.keyword(':').surround(Formatting.noSpace());
      formatter.property('styleref').append(Formatting.noSpace());
    } else {
      formatter.keyword('style').append(Formatting.oneSpace());
    }
    // Format style name and add newline
    formatter.property('name').surround(Formatting.oneSpace());
    if (node.$cstNode) {
      formatter.cst([node.$cstNode]).append(Formatting.newLine());
      console.log(
        `format${node.$type}() appended newline to: [[${node.$cstNode.text.replaceAll('\r', '\\r').replaceAll('\n', '\\n')}]]`,
      );
    }
  }

  /**
   * Formats a StyleBlock node.
   * Adds indentation and newlines within the style block.
   * Handles spacing around semicolons and colons.
   *
   * @param node The StyleBlock node to format.
   */
  private formatStyleBlock(node: ast.StyleBlock): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${isNamed(node) ? `"${node.name}"` : '(unnamed)'}`,
    );

    const formatter = this.getNodeFormatter(node);

    // Format braces with indentation
    this.formatBracesWithIndent(formatter);

    // Format style definitions within the block
    node.items.forEach((item) => {
      const itemFormatter = this.getNodeFormatter(item);
      itemFormatter.node(item).prepend(Formatting.newLine()).prepend(Formatting.indent());
    });

    // Handle spacing around semicolons and colons
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();
      const semicolonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ';');
      formatter.cst(semicolonNodes).prepend(Formatting.oneSpace());
      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');
      formatter.cst(colonNodes).surround(Formatting.noSpace());
    }
  }

  /**
   * Formats a StyleDefinition node.
   * Adds indentation and spacing around the colon.
   *
   * @param node The StyleDefinition node to format.
   */
  private formatStyleDefinition(node: ast.StyleDefinition): void {
    console.log(
      `format${node.$type}() -- ${node.$type} ${node.topic} : ${inspect(node.value, false, 1).replaceAll('\r', '\\r').replaceAll('\n', '\\n')}`,
    );

    const formatter = this.getNodeFormatter(node);

    // Add indentation
    formatter.node(node).prepend(Formatting.indent());

    // Handle spacing around the colon and semicolon
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();
      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');

      if (colonNodes.length > 0) {
        formatter.cst(colonNodes).prepend(Formatting.oneSpace()).append(Formatting.oneSpace());
      }
      const semicolonNodes = cstNodes.filter((cstNode) => cstNode.text === ';');
      formatter.cst(semicolonNodes).prepend(Formatting.oneSpace());
    }
  }

  /**
   * Formats braces with indentation.
   * Ensures opening and closing braces are on new lines and indents the content.
   *
   * @param formatter The NodeFormatter to use.
   */
  private formatBracesWithIndent(formatter: NodeFormatter<AstNode>) {
    console.log(`formatBracesWithIndent()`);

    const bracesOpen = formatter.keyword('{');
    const bracesClose = formatter.keyword('}');

    // Ensure opening brace is on a new line
    bracesOpen.prepend(Formatting.newLine());

    // Format content inside the braces
    formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());

    // Ensure closing brace is on a new line
    bracesClose.prepend(Formatting.newLine());
  }

  /**
   * Creates hidden text edits for single-line comments after an opening brace.
   * Adjusts indentation and adds newlines as needed.
   *
   * @param previous The previous CST node.
   * @param hidden The hidden CST node (single-line comment).
   * @param formatting The formatting action.
   * @param context The formatting context.
   * @returns An array of TextEdit objects.
   */
  protected override createHiddenTextEdits(
    previous: CstNode | undefined,
    hidden: CstNode,
    formatting: FormattingAction | undefined,
    context: FormattingContext,
  ): TextEdit[] {
    console.log(`createHiddenTextEdits("${hidden.text}")`);

    if (
      isLeafCstNode(hidden) &&
      hidden.tokenType.name === 'SL_COMMENT' &&
      isLeafCstNode(previous) &&
      previous.tokenType.name === '{'
    ) {
      // Custom logic for SL_COMMENT comments after '{'
      const startLine = hidden.range.start.line;

      // Calculate the start range for the new text edit
      let startRange: Range | undefined = undefined;
      if (isLeafCstNode(previous) && previous.range.end.line === startLine) {
        // Hidden node is on the same line as its previous node

        startRange = {
          start: previous.range.end,
          end: hidden.range.start,
        };
      } else {
        // Not on same line
        startRange = {
          start: {
            character: 0,
            line: startLine,
          },
          end: hidden.range.start,
        };
      }

      const edits: TextEdit[] = [];

      // Calculate the expected indentation
      const hiddenStartText = context.document.getText(startRange);
      const move = this.findFittingMove(startRange, formatting?.moves ?? [], context);
      const hiddenStartChar = this.getExistingIndentationCharacterCount(hiddenStartText, context);
      const expectedStartChar = this.getIndentationCharacterCount(context, move);

      const characterIncrease = expectedStartChar - hiddenStartChar;

      if (characterIncrease === 0) {
        return [];
      }

      let newText = '\n';
      if (characterIncrease > 0) {
        newText = newText + (context.options.insertSpaces ? ' ' : '\t').repeat(characterIncrease);
      }

      const lines = hidden.text.split('\n');
      lines[0] = hiddenStartText + lines[0];
      for (let i = 0; i < lines.length; i++) {
        const currentLine = startLine + i;
        if (characterIncrease > 0) {
          const textEdit: TextEdit = {
            newText,
            range: {
              start: startRange.start,
              end: startRange.end,
            },
          };
          console.log(
            `createHiddenTextEdits("${hidden.text}") -- SL_COMMENT after '{' token -- characterIncrease: ${characterIncrease} > 0 -- textEdit: range: ${rangeToString(textEdit.range)}, newText: ${JSON.stringify(textEdit.newText)}`,
          );

          edits.push(textEdit);
        } else {
          const currentText = lines[i];
          let j = 0;
          for (; j < currentText.length; j++) {
            const char = currentText.charAt(j);
            if (char !== ' ' && char !== '\t') {
              break;
            }
          }

          const textEdit: TextEdit = {
            newText: '\n',
            range: {
              start: {
                character: startRange.start.character, // Was 0
                line: currentLine,
              },
              end: {
                line: currentLine,
                // Remove as much whitespace characters as necessary
                // In some cases `characterIncrease` is actually larger than the amount of whitespace available
                // So we simply remove all whitespace characters `j`
                character: startRange.start.character + Math.min(j, Math.abs(characterIncrease)),
              },
            },
          };
          console.log(
            `createHiddenTextEdits("${hidden.text}") -- SL_COMMENT after '{' token -- characterIncrease: ${characterIncrease} < 0 -- textEdit: range: ${rangeToString(textEdit.range)}, newText: ${JSON.stringify(textEdit.newText)}`,
          );
          edits.push(textEdit);
        }
      }

      return edits;
    }
    console.log(
      `createHiddenTextEdits("${hidden.text}") -- NOT [ SL_COMMENT after '{' token ] -- will call super.createHiddenTextEdits()`,
    );

    // Call the default implementation for other cases
    return super.createHiddenTextEdits(previous, hidden, formatting, context);
  }
}
