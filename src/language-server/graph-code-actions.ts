import { CodeActionKind, Diagnostic } from "vscode-languageserver";
import { CodeActionParams } from "vscode-languageserver-protocol";
import { Command, CodeAction } from "vscode-languageserver-types";
import {
  AstUtils,
  CstNode,
  LangiumDocument,
  LeafCstNode,
  LeafCstNodeImpl,
  MaybePromise,
} from "langium";
import { CodeActionProvider } from "langium/lsp";
import { inspect } from "util";
import { isElement, isStyle, isWidthValue } from "../language/generated/ast.js";
import { IssueCodes } from "../language/graph-validator.js";
import { CstUtils } from "langium";
import { LENGTH_UNITS } from "../language/model-helpers.js";

export class GraphCodeActionProvider implements CodeActionProvider {
  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams,
  ): MaybePromise<(Command | CodeAction)[]> {
    console.log("getCodeActions() called with params:", inspect(params));

    const result: CodeAction[] = [];

    if ("context" in params) {
      for (const diagnostic of params.context.diagnostics) {
        const codeActions = this.createCodeAction(diagnostic, document);

        if (Array.isArray(codeActions)) {
          result.push(...codeActions); // Handle multiple actions
        } else if (codeActions) {
          result.push(codeActions); // Handle single action
        }
      }
    }

    // Handle manually triggered source actions (like rename ID)
    if (
      params.context.only &&
      params.context.only.includes(CodeActionKind.Source)
    ) {
      console.log("getCodeActions() - Source actions requested!");
      result.push(this.renameGraphElementId(document));
    }

    console.log("getCodeActions() - Returning code actions:", inspect(result));

    return result;
  }

  private createCodeAction(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction | CodeAction[] | undefined {
    switch (
      diagnostic.code // code as defined in 'graph-validator.ts' for each validation check
    ) {
      case IssueCodes.IdDuplicate:
      case IssueCodes.IdMissing:
        return this.generateNewId(diagnostic, document);
      case IssueCodes.StyleSelfReference:
        return this.removeStyleSelfReference(diagnostic, document);
      case IssueCodes.LinkWidthUnitUnknown:
      case IssueCodes.LinkWidthHasNoUnit:
        return this.fixIncorrectWidthUnit(diagnostic, document); // Now supports multiple actions
      /*
      case "name_lowercase":
        return this.makeUpperCase(diagnostic, document);
      */
      default:
        return undefined;
    }
  }

  // Define the code actions:

  /*
   * Code actions without triggering diagnostic code:
   */

  private renameGraphElementId(document: LangiumDocument): CodeAction {
    console.log("renameGraphElementId() called!"); // Debugging output

    return {
      title: "Rename graph element ID",
      kind: CodeActionKind.Source, // This makes it a source action, not a quick fix
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range: {
                start: { line: 0, character: 0 }, // Placeholder range, should be dynamic
                end: { line: 0, character: 5 }, // Replace with the actual 'id' range
              },
              newText: "new-id", // Placeholder, should prompt for user input
            },
          ],
        },
      },
    };
  }

  /*
   * Code actions triggered by diagonstic code:
   */

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
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset);
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
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset); // as LeafCstNode;
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

  private fixIncorrectWidthUnit(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction[] {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    if (!rootCst) {
      console.error("fixIncorrectWidthUnit() - rootCst undefined!");
      return [];
    }

    // Find the CST node at the given offset
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset);
    if (!cstNode) {
      console.error("fixIncorrectWidthUnit() - cstNode undefined!");
      return [];
    }

    // Get the corresponding AST node
    const astNode = cstNode.astNode;

    // Ensure the AST node is a WidthValue instance
    if (!isWidthValue(astNode)) {
      console.error(
        "fixIncorrectWidthUnit() - Not a valid WidthValue instance!",
      );
      return [];
    }

    const { value, unit } = astNode;
    let units = LENGTH_UNITS;

    if (unit !== undefined) {
      if (LENGTH_UNITS.includes(unit)) {
        console.info("fixIncorrectWidthUnit() - Unit is known");
        return [];
      } else if (LENGTH_UNITS.includes(unit.toLowerCase())) {
        units = [unit.toLowerCase()];
      }
    } else {
      console.info("fixIncorrectWidthUnit() - No unit found (dimensionless)!");
    }

    // Find the CST node representing the unit
    let unitNode: LeafCstNode | undefined;
    let valueNode: CstNode | undefined;
    let foundValue = false;

    for (const child of cstNode.container?.content ?? []) {
      if (!foundValue && child.text === value.toString()) {
        valueNode = child;
        foundValue = true;
      } else if (foundValue && child instanceof LeafCstNodeImpl) {
        unitNode = child;
        break;
      }
    }

    // Determine range to replace (unitNode if it exists, otherwise insert after valueNode)
    const startOffset = unitNode
      ? unitNode.offset
      : valueNode
        ? valueNode.offset + valueNode.length
        : cstNode.offset + value.toString().length;
    const endOffset = unitNode
      ? unitNode.offset + unitNode.length
      : startOffset;

    const range = {
      start: document.textDocument.positionAt(startOffset),
      end: document.textDocument.positionAt(endOffset),
    };

    console.info(
      `fixIncorrectWidthUnit() - Replacement range: [${startOffset}, ${endOffset}]`,
    );

    console.info(
      `fixIncorrectWidthUnit() - Returning ${units.length} code actions.`,
    );

    // Generate multiple CodeActions, each suggesting a valid unit
    return units.map((validUnit) => ({
      title:
        unit === undefined
          ? `Set unit to '${validUnit}'`
          : `Replace '${unit}' with '${validUnit}'`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range,
              newText: validUnit, // Correctly replaces or inserts the new unit
            },
          ],
        },
      },
    }));
  }
}
