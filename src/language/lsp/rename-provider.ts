import {
  type AstNode,
  AstUtils,
  CstNode,
  GrammarUtils,
  type LangiumDocument,
  isNamed,
} from 'langium';
import { DefaultRenameProvider, LangiumServices } from 'langium/lsp';
import { rangeToString } from 'langium/test';
import { inspect } from 'node:util';
import {
  CancellationToken,
  Connection,
  Position,
  Range,
  RenameParams,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver';

import { isElement, isNodeAlias } from '../generated/ast.js';
import { render_text } from '../model-helpers.js';

/**
 * Custom rename provider with validation for Graph language.
 */
export class GraphRenameProvider extends DefaultRenameProvider {
  private readonly connection: Connection | undefined;

  constructor(services: LangiumServices) {
    super(services);
    this.connection = services.shared.lsp.Connection;
  }

  /**
   * Determines whether a rename is possible at the given position.
   * @returns The range of the identifier to rename, or `undefined` if renaming is not allowed.
   */
  override async prepareRename(
    document: LangiumDocument,
    params: TextDocumentPositionParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken?: CancellationToken,
  ): Promise<Range | undefined> {
    console.log('GraphRenameProvider.prepareRename() called at position:', params.position);

    const node = this.findDeclarationNode(document, params.position);
    console.log(
      `GraphRenameProvider.prepareRename() found node of type '${node?.$type}' defined as:\n${render_text(node?.$cstNode?.text, `'${node?.$type}' text`, '\\n', node?.$cstNode?.range.start.line)}\n`,
    );
    //console.log(render_text(inspect(node),`${node?.$type} AST node`));

    // If a valid node is found, return its name range; otherwise, return undefined
    if (!node) {
      return Promise.resolve(undefined);
    }

    const cstIdNode = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
    console.log(
      `GraphRenameProvider.prepareRename() found CST node with property "name" at range: (${cstIdNode?.range ? rangeToString(cstIdNode.range) : '?'}) : [${cstIdNode?.text}]\n`,
    );
    console.log(
      render_text(
        inspect(cstIdNode),
        `${node.$type} ${isNamed(node) ? `name="${node.name}"` : ''} CST node`,
        ',',
        0,
      ),
    );

    return Promise.resolve(cstIdNode?.range);
  }

  /**
   * Performs the rename operation, ensuring validity before applying changes.
   * @param document - The Langium document.
   * @param params - The rename parameters including the new name.
   * @param cancelToken - Optional cancellation token.
   * @returns A `WorkspaceEdit` if rename is successful, otherwise `undefined`.
   */
  override async rename(
    document: LangiumDocument,
    params: RenameParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken?: CancellationToken,
  ): Promise<WorkspaceEdit | undefined> {
    const node = this.findDeclarationNode(document, params.position);
    console.log('GraphRenameProvider.rename() called, params : ', inspect(params));
    console.log(
      `GraphRenameProvider.rename() found node of type '${node?.$type}' defined as:\n${render_text(node?.$cstNode?.text, `'${node?.$type}' text`, '\\n', node?.$cstNode?.range.start.line)}\n`,
    );

    if (!node || !(isElement(node) || isNodeAlias(node)) || !isNamed(node)) {
      return undefined;
    }

    if (!this.validateNewName(document, node, params.newName)) {
      return undefined; // Abort if validation fails
    }

    return Promise.resolve(this.createRenameEdit(document, node, params.newName));
  }

  /**
   * Validates if the new name is allowed.
   * @param document - The Langium document.
   * @param node - The AST node being renamed.
   * @param newName - The proposed new name.
   * @returns `true` if renaming is allowed, `false` otherwise.
   */
  private validateNewName(document: LangiumDocument, node: AstNode, newName: string): boolean {
    const elementNames = new Set<string>();
    const aliasNames = new Set<string>();

    for (const childNode of AstUtils.streamAllContents(document.parseResult.value)) {
      if (isElement(childNode) && isNamed(childNode)) {
        elementNames.add(childNode.name);
      }
      if (isNodeAlias(childNode) && isNamed(childNode)) {
        aliasNames.add(childNode.name);
      }
    }

    if (!node.$cstNode?.range) {
      return false;
    }

    if (this.isKeyword(newName)) {
      this.connection?.window.showErrorMessage(`"${newName}" is a reserved keyword.`);
      return false;
    }
    if (isElement(node) && elementNames.has(newName)) {
      this.connection?.window.showErrorMessage(`"${newName}" is already used by an Element.`);
      return false;
    }
    if (isNodeAlias(node) && aliasNames.has(newName)) {
      this.connection?.window.showErrorMessage(`"${newName}" is already used by a NodeAlias.`);
      return false;
    }

    return true;
  }

  /**
   * Finds the declaration AST node at the given cursor position.
   */

  protected findDeclarationNode(
    document: LangiumDocument,
    position: Position,
  ): AstNode | undefined {
    const rootNode = document.parseResult.value;

    if (!rootNode.$cstNode) {
      return undefined;
    }

    // Return the AST node at the given cursor position
    return this.findAstNodeAtPosition(rootNode.$cstNode, position);
  }

  /**
   * Locates the closest AST node at a given position.
   */
  protected findAstNodeAtPosition(rootCstNode: CstNode, position: Position): AstNode | undefined {
    let i = 0;
    const matches: AstNode[] = [];

    // Process the AST nodes to get the matching AST entry
    for (const astNode of AstUtils.streamAllContents(rootCstNode.astNode)) {
      i++;
      if (astNode.$cstNode == undefined) {
        continue;
      }
      const { start, end } = astNode.$cstNode.range;

      // Check if cursor in astNode's Cst node range:
      if (position.line < start.line) {
        // cstNode before cursor (line level) -- SKIP
        continue;
      } else if (position.line > end.line) {
        // cstNode after cursor (line level) -- SKIP
        continue;
      } else {
        // cursor line in cstNode range
        if (position.line === start.line && position.character < start.character) {
          // cstNode after cursor (char level) -- SKIP
          continue;
        } else if (position.line === end.line && position.character > end.character) {
          // cstNode before cursor (char level) -- SKIP
          continue;
        }
      }

      // Potential candidate found
      console.log(`POTENTIAL MATCH: cursor position within cstNode range`);

      console.log(
        `\nAST ${String('    ' + i).slice(-4)} | ${astNode.$type} (${
          astNode.$containerProperty ?? '<unknown container property>'
        }) - cstNode <${astNode.$cstNode.grammarSource?.$type ?? 'undefined'}: ${
          astNode.$cstNode.grammarSource?.$containerProperty ?? '<container property not set>'
        }> @ (${rangeToString(astNode.$cstNode.range)}) -- length = ${astNode.$cstNode.length}`,
      );
      console.log(
        astNode.$cstNode.text
          .split(/\r?\n|\r|\n/g)
          .map(
            (line, index) =>
              `  astNode.$cstNode.text: ${String('    ' + (index + start.line + 1)).slice(-4)} | ${line}`,
          )
          .join('\n'),
      );

      // We found a possible match of type Element (Graph, Node, Link) or Style
      matches.push(astNode);

      if (!(isElement(astNode) || isNodeAlias(astNode))) {
        // rename not applicable
        console.log(' -- not in scope for renaming (skipped)');
        continue;
      }
    }

    // Now get the AST node with the "smallest match":
    const m = matches.sort((a, b) => (a.$cstNode?.length ?? 0) - (b.$cstNode?.length ?? 0));

    console.log(
      (m[0].$cstNode?.text ?? '<Error: CST Node is undefined>')
        .split(/\r?\n|\r|\n/g)
        .map(
          (line, index) =>
            `  MATCH astNode.$cstNode.text: ${String('    ' + (index + (m[0].$cstNode?.range.start.line ?? 0) + 1)).slice(-4)} | ${line}`,
        )
        .join('\n'),
    );

    return m[0];
  }

  /**
   * Creates the necessary text edits to rename an element and update all references.
   */
  protected createRenameEdit(
    document: LangiumDocument,
    node: AstNode,
    newName: string,
  ): WorkspaceEdit | undefined {
    if (!(isElement(node) || isNodeAlias(node)) || !isNamed(node)) {
      return undefined;
    }

    const edits: TextEdit[] = [];

    // Rename the declaration
    const cstIdNode = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
    if (cstIdNode) {
      edits.push(TextEdit.replace(cstIdNode.range, newName));
    }

    // Rename all references
    for (const ref of document.references) {
      if (ref.$refText === node.name && ref.$refNode) {
        edits.push(TextEdit.replace(ref.$refNode.range, newName));
      }
    }

    return edits.length > 0 ? { changes: { [document.uri.toString()]: edits } } : undefined;
  }

  /**
   * Checks if a given name is a reserved keyword.
   */
  protected isKeyword(name: string): boolean {
    const keywords = new Set(['define', 'element', 'graph', 'link', 'node', 'style', 'to', 'with']);
    return keywords.has(name);
  }
}
