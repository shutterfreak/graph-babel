import { CodeActionKind, Diagnostic } from "vscode-languageserver";
import { CodeActionParams } from "vscode-languageserver-protocol";
import { Command, CodeAction } from "vscode-languageserver-types";
import {
  AstUtils,
  LangiumDocument,
  LeafCstNode,
  LeafCstNodeImpl,
  MaybePromise,
} from "langium";
import { CodeActionProvider } from "langium/lsp";
import { inspect } from "util";
import { isElement, isStyle } from "../language/generated/ast.js";
import { IssueCodes } from "../language/graph-validator.js";
import { findLeafNodeAtOffset } from "../language/cst-util.js";

export class GraphCodeActionProvider implements CodeActionProvider {
  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams,
  ): MaybePromise<(Command | CodeAction)[]> {
    const result: CodeAction[] = [];
    if ("context" in params) {
      for (const diagnostic of params.context.diagnostics) {
        const codeAction = this.createCodeAction(diagnostic, document);
        if (codeAction) {
          result.push(codeAction);
        }
      }
    }
    return result;
  }

  private createCodeAction(
    diagnostic: Diagnostic,

    document: LangiumDocument,
  ): CodeAction | undefined {
    switch (
      diagnostic.code // code as defined in 'graph-validator.ts' for each validation check
    ) {
      case IssueCodes.IdDuplicate:
      case IssueCodes.IdMissing:
        return this.generateNewId(diagnostic, document);
      case IssueCodes.StyleSelfReference:
        return this.removeStyleSelfReference(diagnostic, document);
      /*
      case "name_lowercase":
        return this.makeUpperCase(diagnostic, document);
      */
      default:
        return undefined;
    }
  }

  // Define the code actions:

  /**
   * Generate a new, nonxisting id
   * @param diagnostic
   * @param document
   * @returns
   */
  private generateNewId(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    const existingIds = new Set<string>();

    if (!rootCst) {
      console.error("generateNewId() - rootCst undefined!");
      return undefined!;
    }

    // Find the cstNode at the zero-based offset in the document:
    const cstNode = findLeafNodeAtOffset(rootCst, offset);
    if (!cstNode) {
      console.error("generateNewId() - cstNode undefined!");
      return undefined!;
    }

    // Find the astNode of the cstNode:
    const astNode = cstNode.astNode;
    // Ensure that astNode is valid and has a type:
    if (!("$type" in astNode) || typeof astNode.$type !== "string") {
      console.error(
        "generateNewId() - astNode has no '$type' property or '$type' property is not string!\ncstNode:\n",
        inspect(astNode),
      );
      return undefined!;
    }

    // Collect all existing IDs in the AST
    for (const childNode of AstUtils.streamAllContents(rootNode)) {
      if (
        (isElement(childNode) || isStyle(childNode)) &&
        childNode.id !== undefined
      ) {
        existingIds.add(childNode.id);
      }
    }

    // Generate the new id from the lowercased first letter of the cstNode $type plus an int sequence number:
    console.info(
      `generateNewId() - cstNode.astNode.$type = '${cstNode.astNode.$type}`,
    );
    const baseId = cstNode.astNode.$type.charAt(0).toLowerCase();

    let counter = 1;
    let newId = baseId + counter;

    while (existingIds.has(newId)) {
      counter++;
      newId = baseId + counter;
    }

    console.info(
      "generateNewId() - found IDs: { ",
      [...existingIds].join(", "),
      "}",
    );
    console.info("diagnostics:\n", inspect(diagnostic));

    return {
      title: "Generate new id",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range: diagnostic.range,
              newText: newId,
            },
          ],
        },
      },
    };
  }

  private removeStyleSelfReference(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    if (!rootCst) {
      console.error("removeStyleSelfReference() - rootCst undefined!");
      return undefined!;
    }

    // Find the CST node at the given offset
    const cstNode = findLeafNodeAtOffset(rootCst, offset); // as LeafCstNode;
    if (!cstNode) {
      console.error("removeStyleSelfReference() - cstNode undefined!");
      return undefined!;
    }

    // Get the corresponding AST node
    const astNode = cstNode.astNode;

    // Ensure the AST node is a Style instance and has a styleRef
    if (!isStyle(astNode) || !astNode.styleref) {
      console.error("removeStyleSelfReference() - Not a valid Style instance!");
      return undefined!;
    }

    // Find the colon (:) in the CST node's parent's children
    const parentCst = cstNode.container;
    if (!parentCst) {
      console.error("removeStyleSelfReference() - Parent CST node undefined!");
      return undefined!;
    }

    let colonNode: LeafCstNode | undefined;
    for (const child of parentCst.content) {
      if (child instanceof LeafCstNodeImpl && child.text === ":") {
        colonNode = child;
        break;
      }
    }

    if (!colonNode) {
      console.error("removeStyleSelfReference() - Colon token not found!");
      return undefined!;
    }

    // Define the range from the colon (`:`) to the end of `styleRef`
    const range = {
      start: document.textDocument.positionAt(colonNode.offset),
      end: document.textDocument.positionAt(cstNode.offset + cstNode.length),
    };

    return {
      title: "Remove self-reference",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range,
              newText: "", // Remove everything in the range
            },
          ],
        },
      },
    };
  }

  /*
  
  // EXAMPLE:

  private makeUpperCase(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction {
    const range = {
      start: diagnostic.range.start,
      end: {
        line: diagnostic.range.start.line,
        character: diagnostic.range.start.character + 1,
      },
    };
    return {
      title: "First letter to upper case",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range,
              newText: document.textDocument.getText(range).toUpperCase(),
            },
          ],
        },
      },
    };
  }

  */
}
