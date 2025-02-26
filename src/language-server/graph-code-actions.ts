import { CodeActionKind, Diagnostic } from "vscode-languageserver";
import { CodeActionParams } from "vscode-languageserver-protocol";
import { Command, CodeAction } from "vscode-languageserver-types";
import { AstUtils, LangiumDocument, MaybePromise } from "langium";
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
