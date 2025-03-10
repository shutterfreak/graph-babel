import {
  type AstNode,
  AstUtils,
  CstNode,
  GrammarUtils,
  type LangiumDocument,
  isNamed,
} from 'langium';
import { DefaultRenameProvider, LangiumServices } from 'langium/lsp';
import { inspect } from 'node:util';
import {
  CancellationToken,
  Position,
  Range,
  RenameParams,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver';

import { isElement } from '../language/generated/ast.js';
import { range_toString, render_text } from './graph-lsp-util.js';

export class GraphRenameProvider extends DefaultRenameProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  /**
   * Determines if a rename operation is valid and returns the range of the identifier to rename.
   */
  override async prepareRename(
    document: LangiumDocument,
    params: TextDocumentPositionParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken?: CancellationToken,
  ): Promise<Range | undefined> {
    console.log('GraphRenameProvider.prepareRename() called, params.position : ', params.position);
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
      `GraphRenameProvider.prepareRename() found CST node with property "name" at range: (${range_toString(cstIdNode?.range)}) : [${cstIdNode?.text}]\n`,
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
   * Performs the rename operation by updating all occurrences of the symbol in the document.
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

    if (!node || !isElement(node)) {
      return undefined;
    }
    // Generate the required text edits for renaming the element
    return Promise.resolve(this.createRenameEdit(document, node, params.newName));
  }

  /**
   * Finds the declaration node corresponding to the rename request.
   */

  protected findDeclarationNode(
    document: LangiumDocument,
    position: Position,
  ): AstNode | undefined {
    const rootNode = document.parseResult.value;

    // Ensure CST node exists
    if (!rootNode.$cstNode) {
      console.log('GraphRenameProvider.findDeclarationNode() - No root CST node.');
      return undefined;
    }

    // Find the AST node at the given cursor position
    const declarationNode = this.findAstNodeAtPosition(rootNode.$cstNode, position);
    console.log(
      `GraphRenameProvider.findDeclarationNode() - will return node of type '${declarationNode?.$type}' defined as:\n${render_text(
        declarationNode?.$cstNode?.text,
        `declaration node type: ${declarationNode?.$type}`,
        '\\n',
        declarationNode?.$cstNode?.range.start.line,
      )}\n\n\n`,
    );

    return declarationNode;
  }

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
        }> @ (${range_toString(astNode.$cstNode.range)}) -- length = ${astNode.$cstNode.length}`,
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

      if (!isElement(astNode)) {
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
   * Creates the necessary text edits to rename an element, updating all references.
   */
  protected createRenameEdit(
    document: LangiumDocument,
    node: AstNode,
    newName: string,
  ): WorkspaceEdit | undefined {
    console.log(
      `\n\nGraphRenameProvider.createRenameEdit() - node type: '${node.$type}' - property 'name' will be renamed to "${newName}"`,
    );

    if (!isElement(node) || !isNamed(node)) {
      return undefined;
    }

    console.log(
      `GraphRenameProvider.createRenameEdit() - node type: '${node.$type}' - property 'name' will be renamed from "${node.name}" to "${newName}"`,
    );

    // Collect all existing IDs in the document to avoid naming conflicts
    const existingIds = new Set<string>();
    for (const childNode of AstUtils.streamAllContents(document.parseResult.value)) {
      if (isElement(childNode) && childNode.name != null) {
        existingIds.add(childNode.name);
      }
    }

    console.log(
      `GraphRenameProvider.createRenameEdit() - existing 'name' values: [${[...existingIds].join(', ')}] -- should not contain "${newName}"`,
    );

    // Validate the new name to prevent conflicts with existing identifiers or keywords
    if (existingIds.has(newName) || this.isKeyword(newName)) {
      console.warn(
        `GraphRenameProvider.createRenameEdit() - Error: "${newName}" already exists as 'name' or is a reserved keyword`,
      );
      return undefined;
    }

    const edits: TextEdit[] = [];

    // Rename the actual declaration
    const cstIdNode = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
    if (cstIdNode) {
      edits.push(TextEdit.replace(cstIdNode.range, newName));
    } else {
      console.warn("No CST node for 'name' property found. NOT YET IMPLEMENTED");
    }

    // Find all references
    const refs = document.references;

    console.log(`GraphRenameProvider.createRenameEdit() - Found ${refs.length} references:`);

    for (const ref of refs) {
      console.log(
        `- Reference at ${inspect(ref.$refNode?.range)}: ${ref.$refText} ${
          ref.$refNode
            ? `Node type '${ref.$refNode.astNode.$type}', text: ${ref.$refNode.text}`
            : 'Unresolved reference'
        }`,
      );
    }

    // Rename all references
    for (const ref of document.references) {
      if (ref.$refText !== node.name) {
        continue; // Skip references that don't match the original name
      }

      console.log(
        `GraphRenameProvider.createRenameEdit() - Renaming reference '${ref.$refText}' at ${range_toString(ref.$refNode?.range)}`,
      );

      if (ref.$refNode) {
        edits.push(TextEdit.replace(ref.$refNode.range, newName));
      }
    }

    if (edits.length === 0) {
      console.warn('No edits generated for rename.');
      return undefined;
    }

    const changes = { changes: { [document.uri.toString()]: edits } };

    console.log(
      `GraphRenameProvider.createRenameEdit() - will return:\n${render_text(inspect(changes), 'changes')}\n`,
    );

    return changes;
  }

  /**
   * Checks if a given name is a reserved keyword in the language to prevent invalid renaming.
   */
  protected isKeyword(name: string): boolean {
    const keywords = new Set(['element', 'graph', 'link', 'node', 'style', 'to', 'with']);
    return keywords.has(name);
  }
}
