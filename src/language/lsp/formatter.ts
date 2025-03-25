import {
  AstNode,
  AstUtils,
  CstNode,
  CstUtils,
  TextDocument,
  isLeafCstNode,
  isNamed,
} from 'langium';
import {
  AbstractFormatter,
  Formatting,
  FormattingAction,
  FormattingContext,
  FormattingRegion,
  NodeFormatter,
} from 'langium/lsp';
import { rangeToString } from 'langium/test';
import type { TextEdit } from 'vscode-languageserver-protocol';

import * as ast from '../generated/ast.js';
import { groupAdjacentArrayIndexes, isCommentCstNode } from '../model-helpers.js';
import { previousSiblingHasBlock } from '../model-helpers.js';

/**
 * GraphFormatter provides custom formatting for the Graph language.
 *
 * General Formatting Rules:
 *
 * 1. Overall File Formatting:
 *    - The formatted file must have no leading or trailing blank lines.
 *
 * 2. Nodes with Braces (e.g. Graph, Style):
 *    - Insert a newline before the "graph" or "style" keyword unless that would produce a blank first line.
 *    - The opening "{" and closing "}" braces must each appear on their own line.
 *    - The content between the braces must be uniformly indented.
 *    - Single-line comments (SL_COMMENT) immediately following an opening brace should be moved to a new, indented line.
 *
 * 3. StyleRef Definitions:
 *    - No spaces should surround the colon ":".
 *
 * 4. Link Nodes:
 *    - Items in the "src" or "dst" arrays must be separated by commas with no space before the comma and exactly one space after.
 *    - Arrowhead properties (src_arrowhead, dst_arrowhead) must have no spaces surrounding the colon.
 *
 * 5. StyleBlock Nodes (CSS-like formatting):
 *    - Each StyleDefinition inside a StyleBlock must start on a new line with no extra blank lines.
 *    - In a StyleDefinition, the colon ":" should have no space before it and one space after it.
 *    - Any semicolons appearing before the first StyleDefinition should be removed.
 *    - Consecutive semicolons must be collapsed into a single semicolon.
 *    - A semicolon following a StyleDefinition must have no space before it and be immediately followed by a newline.
 *    - If the last StyleDefinition is not terminated by a semicolon, one must be added.
 *
 * 6. General Whitespace:
 *    - In all other cases, only minimal whitespace (typically a single space) should be used.
 */
export class GraphFormatter extends AbstractFormatter {
  private fmtCnt = 0;
  // Debug flag to control logging.
  private readonly DEBUG = true;

  /**
   * Logs a debug message if DEBUG mode is enabled.
   * @param message The message to log.
   */
  private log(message: string): void {
    if (this.DEBUG) {
      console.log(message);
    }
  }

  /**
   * Main entry for formatting a document.
   * Traverses the AST and dispatches formatting for each node type.
   * @param node The AST node to format.
   */
  protected format(node: AstNode): void {
    this.log(
      `format(${node.$type}) - Grammar source: type "${node.$cstNode?.grammarSource?.$type}"` +
        // + '\n' + render_text(inspect(node.$cstNode?.grammarSource), `${node.$type}: node.$cstNode?.grammarSource`)
        ` ${node.$type}: node.$cstNode?.grammarSource: { $type "${node.$cstNode?.grammarSource?.$type}", $containerProperty "${node.$cstNode?.grammarSource?.$containerProperty ?? '<N/A>'}", $containerIndex "${node.$cstNode?.grammarSource?.$containerIndex ?? '<N/A>'}" }`,
    );

    if (ast.isModel(node)) {
      this.formatModel(node);
    } else if (ast.isElementAlias(node)) {
      this.formatElementAlias(node);
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
    } else if (ast.isLabel(node)) {
      this.formatLabel(node);
    }
  }

  // DEBUG
  protected override avoidOverlappingEdits(
    textDocument: TextDocument,
    textEdits: TextEdit[],
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    this.log(`avoidOverlappingEdits() - BEFORE processing: ${textEdits.length} edits`);
    textEdits.forEach((edit, index) =>
      this.log(
        `avoidOverlappingEdits() - edit [${`   ${index}`.slice(-4)}] at ${rangeToString(edit.range)}: oldText: ${JSON.stringify(textDocument.getText(edit.range))} --> newText: ${JSON.stringify(edit.newText)}`,
      ),
    );
    for (const edit of textEdits) {
      let last = edits[edits.length - 1];
      while (edits.length > 0) {
        const currentStart = textDocument.offsetAt(edit.range.start);
        const lastEnd = textDocument.offsetAt(last.range.end);
        if (currentStart < lastEnd) {
          this.log(
            `avoidOverlappingEdits() - popping edit [${`   ${edits.length - 1}`.slice(-4)}] at ${rangeToString(last.range)}: oldText: ${JSON.stringify(textDocument.getText(last.range))} --> newText: ${JSON.stringify(last.newText)}`,
          );
          edits.pop();
          last = edits[edits.length - 1];
        } else {
          break;
        }
      }
      edits.push(edit);
    }
    this.log(`avoidOverlappingEdits() - AFTER processing: ${edits.length} edits`);
    const filteredEdits = edits.filter((edit) => this.isNecessary(edit, textDocument));
    this.log(`avoidOverlappingEdits() - AFTER filtering: ${edits.length} edits`);
    return filteredEdits;
  }

  // ------------------------------
  // Helper Functions for Formatting
  // ------------------------------

  /**
   * Executes a formatting action on the given FormattingRegion.
   *
   * @param method The name of the calling method (for logging purposes).
   * @param label A label identifying the region (e.g. "keyword(':')").
   * @param region The FormattingRegion to format.
   * @param verb The formatting verb: 'prepend', 'append', or 'surround'.
   * @param action The formatting action to apply (e.g. 'oneSpace').
   * @param count Optional parameter used by actions that require a count.
   */
  private doFmt(
    method: string,
    label: string,
    region: FormattingRegion,
    verb: FormatVerb,
    action: FormatActionType,
    count?: number,
  ): void {
    try {
      const actionFunc = formattingActionMap[action];
      const fmt = actionFunc(count);
      const nodeCount = region.nodes.length;

      if (nodeCount == 0) {
        this.log(
          `${method} FormatActions: 0 [-] ${label} -- ${verb} (${action}) [nodes: ${nodeCount}] -- NOTHING TO DO`,
        );
        return;
      }

      switch (verb) {
        case FormatVerb.Prepend:
          region.prepend(fmt);
          break;
        case FormatVerb.Append:
          region.append(fmt);
          break;
        case FormatVerb.Surround:
          // For surround, apply the same formatting action to both sides.
          region.surround(fmt);
          break;
      }
      // Now generate the debug log statement:

      const cntFormattingActions = verb == FormatVerb.Surround ? nodeCount * 2 : nodeCount;
      let fmtCntRange = `${this.fmtCnt}`;
      for (let j = 1; j < cntFormattingActions; j++) {
        fmtCntRange += `, ${this.fmtCnt + j}`;
      }

      this.log(
        `${method} FormatActions: ${cntFormattingActions} [${fmtCntRange}] ${label} -- ${verb} (${action}) [nodes: ${nodeCount}]`,
      );
      this.fmtCnt += cntFormattingActions;
    } catch (e) {
      this.log(`[ERROR] ${e}`);
    }
  }

  /**
   * Formats braces by ensuring that the opening and closing braces are on new lines,
   * and that the content between them is indented.
   *
   * @param formatter The NodeFormatter for the node with braces.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private formatBracesWithIndent(formatter: NodeFormatter<AstNode>, node: AstNode): void {
    const bracesOpen = formatter.keyword('{');
    const bracesClose = formatter.keyword('}');

    this.doFmt(
      this.formatBracesWithIndent.name,
      'formatter.interior(bracesOpen, bracesClose)',
      formatter.interior(bracesOpen, bracesClose),
      FormatVerb.Prepend,
      FormatActionType.Indent,
    );

    this.doFmt(
      this.formatBracesWithIndent.name,
      'bracesOpen',
      bracesOpen,
      FormatVerb.Prepend,
      FormatActionType.NewLine,
    );

    this.doFmt(
      this.formatBracesWithIndent.name,
      'bracesClose',
      bracesClose,
      FormatVerb.Prepend,
      FormatActionType.NewLine,
    );
  }

  // ------------------------------
  // Formatting Methods for Specific Node Types
  // ------------------------------
  private formatModel(node: ast.Model): void {
    this.log(
      `${this.formatModel.name}() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)}`,
    );

    // TODO
  }

  private formatElementAlias(node: ast.ElementAlias): void {
    this.log(
      `${this.formatElementAlias.name}() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)}`,
    );

    const formatter = this.getNodeFormatter(node);

    this.doFmt(
      this.formatElementAlias.name,
      "keyword('define')",
      formatter.keyword('define'),
      FormatVerb.Prepend,
      FormatActionType.NewLines,
      node.definition || previousSiblingHasBlock(node) ? 2 : 1,
    );

    this.doFmt(
      this.formatElementAlias.name,
      "property('name')",
      formatter.property('name'),
      FormatVerb.Surround,
      FormatActionType.OneSpace,
    );

    if (node.styleref) {
      this.doFmt(
        this.formatElementAlias.name,
        "keyword(':')",
        formatter.keyword(':'),
        FormatVerb.Surround,
        FormatActionType.NoSpace,
      );
    }
  }

  /**
   * Formats a Graph node.
   * Adjusts spacing around keywords, optional StyleRef, name, label, and braces.
   *
   * @param node The Graph node.
   */
  private formatGraph(node: ast.Graph): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatGraph() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)} [container index: ${node.$containerIndex} (${node.$container.$type})]`,
    );

    // Prepend newline
    this.doFmt(
      this.formatGraph.name,
      "keyword('graph')",
      formatter.keyword('graph'),
      FormatVerb.Prepend,
      FormatActionType.NewLines,
      2,
    );

    this.doFmt(
      this.formatGraph.name,
      "keyword('graph')",
      formatter.keyword('graph'),
      FormatVerb.Append,
      FormatActionType.NoSpace,
    );
    if (node.styleref) {
      this.doFmt(
        this.formatGraph.name,
        "keyword(':')",
        formatter.keyword(':'),
        FormatVerb.Surround,
        FormatActionType.NoSpace,
      );
    }
    this.doFmt(
      this.formatGraph.name,
      "property('name')",
      formatter.property('name'),
      FormatVerb.Prepend,
      FormatActionType.OneSpace,
    );

    this.formatBracesWithIndent(formatter, node);
  }

  /**
   * Formats a Node node.
   * Handles the 'node' keyword or alias, optional StyleRef, and name.
   *
   * @param node The Node node.
   */
  private formatNode(node: ast.Node): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatNode() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)} [container index: ${node.$containerIndex} (${node.$container.$type})]`,
    );

    // Prepend extra newline
    this.doFmt(
      this.formatNode.name,
      node.alias ? "property('alias')" : "keyword('node')",
      node.alias ? formatter.property('alias') : formatter.keyword('node'),
      FormatVerb.Prepend,
      FormatActionType.NewLines,
      previousSiblingHasBlock(node) ? 2 : 1,
    );

    this.doFmt(
      this.formatNode.name,
      node.alias ? "property('alias')" : "keyword('node')",
      node.alias ? formatter.property('alias') : formatter.keyword('node'),
      FormatVerb.Append,
      FormatActionType.NoSpace,
    );

    if (node.styleref) {
      this.doFmt(
        this.formatNode.name,
        "keyword(':')",
        formatter.keyword(':'),
        FormatVerb.Surround,
        FormatActionType.NoSpace,
      );
    }

    this.doFmt(
      this.formatNode.name,
      "property('name')",
      formatter.property('name'),
      FormatVerb.Prepend,
      FormatActionType.OneSpace,
    );
  }

  /**
   * Formats a Link node.
   * Adjusts spacing for the 'link' keyword, optional name (within parentheses),
   * arrays for src/dst, arrowhead properties, and label.
   *
   * @param node The Link node.
   */
  private formatLink(node: ast.Link): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatLink() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)} [container index: ${node.$containerIndex} (${node.$container.$type})]`,
    );

    // Prepend extra newline
    this.doFmt(
      this.formatNode.name,
      "keyword('link')",
      formatter.keyword('link'),
      FormatVerb.Prepend,
      FormatActionType.NewLines,
      previousSiblingHasBlock(node) ? 2 : 1,
    );

    this.doFmt(
      this.formatLink.name,
      "keyword('link')",
      formatter.keyword('link'),
      FormatVerb.Append,
      isNamed(node) ? FormatActionType.OneSpace : FormatActionType.NoSpace,
    );

    this.doFmt(
      this.formatLink.name,
      "keyword(':')",
      formatter.keyword(':'),
      FormatVerb.Surround,
      FormatActionType.NoSpace,
    );

    this.doFmt(
      this.formatLink.name,
      "property('src')",
      formatter.property('src'),
      FormatVerb.Prepend,
      FormatActionType.OneSpace,
    );

    this.doFmt(
      this.formatLink.name,
      "property('dst')",
      formatter.property('dst'),
      FormatVerb.Append,
      FormatActionType.NoSpace,
    );

    this.doFmt(
      this.formatLink.name,
      "properties('relation', 'link')",
      formatter.properties('relation', 'link'),
      FormatVerb.Surround,
      FormatActionType.OneSpace,
    );

    const commas = formatter.keyword(',');

    this.doFmt(
      this.formatLink.name,
      'commas',
      commas,
      FormatVerb.Append,
      FormatActionType.OneSpace,
    );

    this.doFmt(
      this.formatLink.name,
      "properties('src_arrowhead','dst_arrowhead')",
      formatter.properties('src_arrowhead', 'dst_arrowhead'),
      FormatVerb.Prepend,
      FormatActionType.NoSpace,
    );
  }

  /**
   * Formats a Style node.
   * Adjusts spacing around the 'style' keyword, optional StyleRef, and name.
   *
   * @param node The Style node.
   */
  private formatStyle(node: ast.Style): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatStyle() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)} [container index: ${node.$containerIndex} (${node.$container.$type})]`,
    );

    // Prepend newline if not first
    this.doFmt(
      this.formatStyle.name,
      "keyword('style')",
      formatter.keyword('style'),
      FormatVerb.Prepend,
      FormatActionType.NewLines,
      (node.$containerIndex ?? 0) > 0 ? 2 : 1, // Add extra blank line if not first Style
    );

    this.doFmt(
      this.formatStyle.name,
      "keyword('style')",
      formatter.keyword('style'),
      FormatVerb.Append,
      FormatActionType.NoSpace,
    );

    if (node.styleref) {
      this.doFmt(
        this.formatStyle.name,
        "keyword(':')",
        formatter.keyword(':'),
        FormatVerb.Surround,
        FormatActionType.NoSpace,
      );
    }

    this.doFmt(
      this.formatStyle.name,
      "property('name')",
      formatter.property('name'),
      FormatVerb.Prepend,
      FormatActionType.OneSpace,
    );
  }

  /**
   * Formats a StyleBlock node.
   * Ensures that the braces are handled via formatBracesWithIndent() and then
   * applies specific formatting to semicolon tokens based on their position relative
   * to StyleDefinition nodes. (The goal is to collapse or reposition semicolons as follows:)
   *
   * - Leading semicolons (before the first StyleDefinition) are moved so that the first one appears on a new indented line.
   * - Semicolons between adjacent StyleDefinition nodes are collapsed so that only the first is preserved,
   *   and if the first follows a SL_COMMENT, it starts on a new indented line.
   * - Trailing semicolons (after the last StyleDefinition) are similarly placed on a new indented line.
   *
   * This implementation reuses the grouping logic similar to checkSpuriousSemicolons().
   *
   * @param node The StyleBlock node to format.
   */
  private formatStyleBlock(node: ast.StyleBlock): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `${this.formatStyleBlock.name}() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)} [container index: ${node.$containerIndex} (${node.$container.$type})]`,
    );

    // Format the braces and indent the interior.
    this.formatBracesWithIndent(formatter, node);

    // Get only the direct child CST nodes of the StyleBlock.
    if (!node.$cstNode) {
      return;
    }
    const cstNode: CstNode = node.$cstNode;
    const directChildren = CstUtils.streamCst(cstNode)
      .filter((child) => CstUtils.isChildNode(child, cstNode))
      .toArray();

    // Compute indexes for semicolon tokens and for StyleDefinition nodes.
    // (We ignore hidden nodes – e.g. comments – in the semicolon list.)
    const semiIndexes: number[] = [];
    const defIndexes: number[] = [];
    directChildren.forEach((child, index) => {
      if (isLeafCstNode(child) && child.text === ';' && !child.hidden) {
        semiIndexes.push(index);
      } else if (ast.isStyleDefinition(child.astNode)) {
        defIndexes.push(index);
      }
    });

    // If no semicolons, nothing to do.
    if (semiIndexes.length === 0) {
      return;
    }
    // Group the semicolon indexes.
    const groups = groupAdjacentArrayIndexes(semiIndexes);

    // Case A: If there are 0 or 1 StyleDefinition nodes, treat all semicolons as redundant.
    if (defIndexes.length <= 1) {
      groups.forEach(([start, end]) => {
        // Indent the first spurious semicolon
        this.doFmt(
          this.formatStyleBlock.name,
          `semicolons[${start}..${end}] (empty block)`,
          formatter.cst([directChildren[start]]),
          FormatVerb.Prepend,
          FormatActionType.Indent,
        );

        // Prepend next redundant semicolons with one space
        this.doFmt(
          this.formatStyleBlock.name,
          `semicolons[${start}..${end}] (empty block)`,
          formatter.cst(directChildren.slice(start + 1, end + 1)),
          FormatVerb.Prepend,
          FormatActionType.OneSpace,
        );
      });
      return;
    }

    // --- Case 2: Multiple StyleDefinition nodes
    const firstDefIdx = defIndexes[0];
    const lastDefIdx = defIndexes[defIndexes.length - 1];

    // (a) Process semicolons that appear before the first StyleDefinition.
    groupAdjacentArrayIndexes(semiIndexes.filter((i) => i < firstDefIdx)).forEach(
      ([start, end]) => {
        // Indent the first redundant semicolon
        this.doFmt(
          this.formatStyleBlock.name,
          `semicolons[${start}] (before first StyleDefinition) - REDUNDANT - indent (newline)`,
          formatter.cst([directChildren[start]]),
          FormatVerb.Prepend,
          FormatActionType.Indent,
        );

        // Prepend next redundant semicolons with one space
        this.doFmt(
          this.formatStyleBlock.name,
          `semicolons[${start + 1}..${end}] (before first StyleDefinition) - REDUNDANT - prepend space (same line)`,
          formatter.cst(directChildren.slice(start + 1, end + 1)),
          FormatVerb.Prepend,
          FormatActionType.OneSpace,
        );
      },
    );

    // (b) Process semicolons that appear after the last StyleDefinition.
    groupAdjacentArrayIndexes(semiIndexes.filter((i) => i > lastDefIdx)).forEach(([start, end]) => {
      // Indent the first redundant semicolon
      this.doFmt(
        this.formatStyleBlock.name,
        `semicolons[${start}] (after last StyleDefinition) - indent (newline) -- REDUNDANT - WATCH OUT FOR FIRST SEMI -- TODO!`,
        formatter.cst([directChildren[start]]),
        FormatVerb.Prepend,
        FormatActionType.Indent,
      );

      // Prepend next redundant semicolons with one space
      this.doFmt(
        this.formatStyleBlock.name,
        `semicolons[${start + 1}..${end}] (after last StyleDefinition) - REDUNDANT - prepend space (same line)`,
        formatter.cst(directChildren.slice(start + 1, end + 1)),
        FormatVerb.Prepend,
        FormatActionType.OneSpace,
      );
    });

    // (c) Process semicolons between adjacent StyleDefinition nodes.
    for (let i = 0; i < defIndexes.length - 1; i++) {
      // Get semicolon indexes between the current and next definition.
      const betweenSemis = semiIndexes.filter((j) => j > defIndexes[i] && j < defIndexes[i + 1]);
      if (betweenSemis.length === 0) {
        // Should not happen
        continue;
      }
      const firstSemi = betweenSemis[0];
      // Keep the first semicolon; all later ones are reduncant.
      this.doFmt(
        this.formatStyleBlock.name,
        `first semicolon after StyleDefinition [${firstSemi}]`,
        formatter.cst([directChildren[firstSemi]]),
        FormatVerb.Prepend,
        FormatActionType.NoSpace,
      );

      if (betweenSemis.length > 1) {
        // Process the redundant semicolons
        const redundant = betweenSemis.slice(1);
        if (redundant.length == 0) {
          // No redundant semicolons
          continue;
        }
        groupAdjacentArrayIndexes(redundant).forEach(([start, end]) => {
          // Indent the first redundant semicolon
          this.doFmt(
            this.formatStyleBlock.name,
            `semicolons[${start}] (between StyleDefinition nodes) - REDUNDANT - indent (newline)`,
            formatter.cst([directChildren[start]]),
            FormatVerb.Prepend,
            FormatActionType.Indent,
          );

          // Prepend next redundant semicolons with one space
          if (start < end) {
            this.doFmt(
              this.formatStyleBlock.name,
              `semicolons[${start + 1}..${end}] (between StyleDefinition nodes) - REDUNDANT - prepend space (same line)`,
              formatter.cst(directChildren.slice(start + 1, end + 1)),
              FormatVerb.Prepend,
              FormatActionType.OneSpace,
            );
          }
        });
      }
    }
  }

  /**
   * Formats a StyleDefinition node.
   * Ensures each definition starts on a new indented line and that a single space surrounds the colon.
   *
   * @param node The StyleDefinition node.
   */
  private formatStyleDefinition(node: ast.StyleDefinition): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatStyleDefinition() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)}`,
    );

    // Each StyleDefinition starts on a new line and is indented.

    this.doFmt(
      this.formatStyleDefinition.name,
      "property('value')",
      formatter.property('value'),
      FormatVerb.Append,
      FormatActionType.NoSpace,
    );

    // Handle spacing around the colon and semicolon
    if (node.$cstNode) {
      const cstNodes = CstUtils.streamCst(node.$cstNode).toArray();

      // Ensure colon has no space before and one space after.
      const colonNodes: CstNode[] = cstNodes.filter((cstNode) => cstNode.text === ':');
      this.log(
        `formatStyleDefinition(${AstUtils.getDocument(node).uri.path}) -- colonNodes: ${colonNodes.length}`,
      );

      if (colonNodes.length > 0) {
        this.doFmt(
          this.formatStyleDefinition.name,
          'cst(colonNodes)',
          formatter.cst(colonNodes),
          FormatVerb.Prepend,
          FormatActionType.NoSpace,
        );
        this.doFmt(
          this.formatStyleDefinition.name,
          'cst(colonNodes)',
          formatter.cst(colonNodes),
          FormatVerb.Append,
          FormatActionType.OneSpace,
        );
      }
    }
  }

  private formatLabel(node: ast.Label): void {
    const formatter = this.getNodeFormatter(node);
    this.log(
      `formatLabel() -- ${node.$cstNode ? rangeToString(node.$cstNode.range) : '?'} text: ${JSON.stringify(node.$cstNode?.text)}`,
    );

    this.doFmt(
      this.formatLabel.name,
      'formatter.node(node)',
      formatter.node(node),
      FormatVerb.Prepend,
      FormatActionType.OneSpace,
    );
  }

  /**
   * Creates text edits for properly indenting comments (SL_COMMENT and ML_COMMENT) in a structured way.
   *
   * This method ensures that:
   * - The first line of a comment (whether single-line or multi-line) follows the expected indentation.
   * - Multi-line comments have their second and subsequent lines reindented with a `*` prefix when necessary.
   * - Whitespace before comments is adjusted to match the expected indentation.
   *
   * @param previous The preceding CST node, used to determine whether the comment is inside a block.
   * @param hidden The comment node that needs to be adjusted.
   * @param formatting The formatting action containing indentation moves.
   * @param context The formatting context, which provides document and indentation settings.
   * @returns An array of `TextEdit` objects to apply the necessary indentation adjustments.
   */
  protected override createHiddenTextEdits(
    previous: CstNode | undefined,
    hidden: CstNode,
    formatting: FormattingAction | undefined,
    context: FormattingContext,
  ): TextEdit[] {
    // Only customize if the hidden token is a comment and the previous token is '{'
    if (
      isLeafCstNode(hidden) &&
      isCommentCstNode(hidden) &&
      previous &&
      isLeafCstNode(previous) &&
      previous.text === '{'
    ) {
      const doc = context.document;
      const startLine = hidden.range.start.line;
      // Compute the whitespace range preceding the comment (for the first line)
      const startRange =
        previous.range.end.line === hidden.range.start.line
          ? { start: previous.range.end, end: hidden.range.start }
          : { start: { line: startLine, character: 0 }, end: hidden.range.start };

      const currentWs = doc.getText(startRange);
      // Determine the correct indentation "move" for the current comment node:
      const move = this.findFittingMove(startRange, formatting?.moves ?? [], context);
      // Calculate how much indentation is already present before the comment:
      const currentIndent = this.getExistingIndentationCharacterCount(currentWs, context);
      // Compute how much indentation should be applied to the comment:
      const expectedIndent = this.getIndentationCharacterCount(context, move);
      // Identify the indentation character currently used:
      const indentChar = context.options.insertSpaces ? ' ' : '\t';

      console.log(`createHiddenTextEdits: startRange = ${rangeToString(startRange)}`);
      console.log(
        `createHiddenTextEdits: current white space="${currentWs}" (indent=${currentIndent})`,
      );
      console.log(`createHiddenTextEdits: expected indent=${expectedIndent}`);

      // Define the text edit to correct indentation for the first line (applies to both SL_COMMENT and ML_COMMENT)
      const newWs = indentChar.repeat(expectedIndent);
      console.log(
        `createHiddenTextEdits: Adjusting first-line indentation to: ${JSON.stringify(newWs)}`,
      );
      const edits: TextEdit[] = [{ range: startRange, newText: newWs }];

      // If it's a single-line comment, return the edit now
      if (hidden.tokenType.name === 'SL_COMMENT') {
        return edits;
      }

      // Process multi-line comments (ML_COMMENT)
      if (hidden.tokenType.name === 'ML_COMMENT') {
        const lines = hidden.text.split('\n');

        // Process second and subsequent lines (if any)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const leadingMatch = line.match(/^\s*/);
          const existingLength = leadingMatch ? leadingMatch[0].length : 0;
          const lineNumber = hidden.range.start.line + i;
          const lineRange = {
            start: { line: lineNumber, character: 0 },
            end: { line: lineNumber, character: existingLength },
          };
          const trimmedLine = line.trim();

          // If the line doesn't already start with '*', ensure it has a proper ' * ' prefix
          const newLineText = trimmedLine.startsWith('*')
            ? indentChar.repeat(expectedIndent) + ' '
            : indentChar.repeat(expectedIndent) + (trimmedLine.length === 0 ? ' *' : ' * ');

          edits.push({ range: lineRange, newText: newLineText });
        }
        console.log(`createHiddenTextEdits: ML_COMMENT produced ${edits.length} edits.`);
      }

      return edits;
    }

    console.log(`createHiddenTextEdits("${hidden.text}") -- delegating to default implementation.`);
    return super.createHiddenTextEdits(previous, hidden, formatting, context);
  }
}

// Define enums for verbs and actions for type safety.
enum FormatVerb {
  Prepend = 'prepend',
  Append = 'append',
  Surround = 'surround',
}

enum FormatActionType {
  NoSpace = 'noSpace',
  OneSpace = 'oneSpace',
  NewLine = 'newLine',
  Indent = 'indent',
  NoIndent = 'noIndent',
  NewLines = 'newLines',
  Spaces = 'spaces',
}

// Map each FormatActionType to the corresponding Formatting function.
const formattingActionMap: Record<FormatActionType, (count?: number) => FormattingAction> = {
  [FormatActionType.NoSpace]: () => Formatting.noSpace(),
  [FormatActionType.OneSpace]: () => Formatting.oneSpace(),
  [FormatActionType.NewLine]: () => Formatting.newLine(),
  [FormatActionType.Indent]: () => Formatting.indent(),
  [FormatActionType.NoIndent]: () => Formatting.noIndent(),
  [FormatActionType.NewLines]: (count?: number) => {
    if (count === undefined)
      throw new Error(`Action ${FormatActionType.NewLines} expects a count.`);
    return Formatting.newLines(count);
  },
  [FormatActionType.Spaces]: (count?: number) => {
    if (count === undefined) throw new Error(`Action ${FormatActionType.Spaces} expects a count.`);
    return Formatting.spaces(count);
  },
};
