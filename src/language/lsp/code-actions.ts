import {
  AstUtils,
  CstNode,
  CstUtils,
  LangiumDocument,
  LeafCstNode,
  LeafCstNodeImpl,
  MaybePromise,
  isNamed,
} from 'langium';
import { CodeActionProvider } from 'langium/lsp';
import { inspect } from 'util';
import { CodeActionKind, Diagnostic } from 'vscode-languageserver';
import { CodeActionParams } from 'vscode-languageserver-protocol';
import { CodeAction, Command } from 'vscode-languageserver-types';

import { isElement, isStyle, isWidthValue } from '../generated/ast.js';
import { IssueCodes } from '../graph-validator.js';
import { LENGTH_UNITS } from '../model-helpers.js';

/**
 * Provides code actions (quick fixes and refactorings) for the Graph language.
 * This class handles diagnostics reported by the validator and offers suggestions
 * to resolve common issues or perform automated refactorings.
 */
export class GraphCodeActionProvider implements CodeActionProvider {
  /**
   * Provides code actions for the given document and range.
   *
   * This method is the entry point for the code action provider. It analyzes the
   * diagnostics reported for the given range and generates corresponding code actions.
   * It also handles manually triggered source actions.
   *
   * @param document The Langium document.
   * @param params Parameters for the code action request, including diagnostics and context.
   * @returns A promise that resolves to an array of code actions or commands.
   */
  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams,
  ): MaybePromise<(Command | CodeAction)[]> {
    console.log('getCodeActions() called with params:', inspect(params));

    const result: CodeAction[] = [];

    // Process diagnostics to generate quick fixes
    if (params.context.diagnostics.length > 0) {
      for (const diagnostic of params.context.diagnostics) {
        const codeActions = this.createCodeAction(diagnostic, document);

        if (Array.isArray(codeActions)) {
          result.push(...codeActions); // Handle multiple actions for a single diagnostic
        } else if (codeActions) {
          result.push(codeActions); // Handle single action for a single diagnostic
        }
      }
    }

    // Handle manually triggered source actions (like rename name)
    if (params.context.only && params.context.only.includes(CodeActionKind.Source)) {
      console.log('getCodeActions() - Source actions requested!');
      result.push(this.renameGraphElementName(document));
    }

    console.log('getCodeActions() - Returning code actions:', inspect(result));

    return result;
  }

  /**
   * Creates a code action or a list of code actions based on the given diagnostic.
   *
   * This method maps diagnostic codes (defined in the validator) to specific
   * code action generators.
   *
   * @param diagnostic The diagnostic reported by the validator.
   * @param document The Langium document.
   * @returns A single code action, an array of code actions, or undefined if no action is available.
   */
  private createCodeAction(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction | CodeAction[] | undefined {
    switch (
      diagnostic.code // code as defined in 'graph-validator.ts' for each validation check
    ) {
      case IssueCodes.NameDuplicate:
      case IssueCodes.NameMissing:
        return this.generateNewName(diagnostic, document);
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
   * Code actions without triggering diagnostic code (Source Actions):
   */

  /**
   * Provides a code action to rename a graph element.
   *
   * This code action is triggered manually by the user (e.g., via a context menu)
   * and allows renaming of a graph element. Currently, it's a placeholder and
   * needs to be implemented to dynamically determine the element to rename and
   * prompt the user for a new name.
   *
   * @param document The Langium document.
   * @returns A code action for renaming.
   */
  private renameGraphElementName(document: LangiumDocument): CodeAction {
    console.log('renameGraphElementName() called!'); // Debugging output

    return {
      title: 'Rename graph element name',
      kind: CodeActionKind.Source, // Marks it as a source action (refactoring)
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range: {
                start: { line: 0, character: 0 }, // Placeholder range, should be dynamic
                end: { line: 0, character: 7 }, // Replace with the actual 'name' range
              },
              newText: 'new-name', // Placeholder, should prompt for user input
            },
          ],
        },
      },
    };
  }

  /*
   * Code actions triggered by diagnostic code (Quick Fixes):
   */

  /**
   * Generates a new, unique name for an element.
   *
   * This quick fix is triggered when a duplicate or missing name is detected.
   * It generates a new name based on the element's type and ensures it doesn't
   * conflict with existing names in the document.
   *
   * @param diagnostic The diagnostic reporting the name issue.
   * @param document The Langium document.
   * @returns A code action to generate a new name.
   */
  private generateNewName(diagnostic: Diagnostic, document: LangiumDocument): CodeAction {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    const existingIds = new Set<string>();

    if (!rootCst) {
      console.error('generateNewName() - rootCst undefined!');
      return undefined!;
    }

    // Find the cstNode at the zero-based offset in the document:
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset);
    if (!cstNode) {
      console.error('generateNewName() - cstNode undefined!');
      return undefined!;
    }

    // Find the astNode of the cstNode:
    const astNode = cstNode.astNode;
    // Ensure that astNode is valid and has a type:
    if (!('$type' in astNode) || typeof astNode.$type !== 'string') {
      console.error(
        "generateNewName() - astNode has no '$type' property or '$type' property is not string!\ncstNode:\n",
        inspect(astNode),
      );
      return undefined!;
    }

    // Collect all existing IDs in the AST
    for (const childNode of AstUtils.streamAllContents(rootNode)) {
      if (
        (isElement(childNode) || isStyle(childNode)) &&
        isNamed(childNode) &&
        childNode.name.length > 0
      ) {
        existingIds.add(childNode.name);
      }
    }

    // Generate the new name from the lowercased first letter of the cstNode $type plus an int sequence number:
    console.info(`generateNewName() - cstNode.astNode.$type = '${cstNode.astNode.$type}`);
    const baseId = cstNode.astNode.$type.charAt(0).toLowerCase();

    let counter = 1;
    let newId = baseId + counter;

    while (existingIds.has(newId)) {
      counter++;
      newId = baseId + counter;
    }

    console.info('generateNewName() - found IDs: { ', [...existingIds].join(', '), '}');
    console.info('diagnostics:\n', inspect(diagnostic));

    return {
      title: 'Generate new name',
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

  /**
   * Removes a self-reference in a style definition.
   *
   * This quick fix is triggered when a style is referencing itself. It removes
   * the self-referential part of the style definition.
   *
   * @param diagnostic The diagnostic reporting the self-reference.
   * @param document The Langium document.
   * @returns A code action to remove the self-reference.
   */
  private removeStyleSelfReference(diagnostic: Diagnostic, document: LangiumDocument): CodeAction {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    if (!rootCst) {
      console.error('removeStyleSelfReference() - rootCst undefined!');
      return undefined!;
    }

    // Find the CST node at the given offset
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset); // as LeafCstNode;
    if (!cstNode) {
      console.error('removeStyleSelfReference() - cstNode undefined!');
      return undefined!;
    }

    // Get the corresponding AST node
    const astNode = cstNode.astNode;

    // Ensure the AST node is a Style instance and has a styleRef
    if (!isStyle(astNode) || !astNode.styleref) {
      console.error('removeStyleSelfReference() - Not a valid Style instance!');
      return undefined!;
    }

    // Find the colon (:) in the CST node's parent's children
    const parentCst = cstNode.container;
    if (!parentCst) {
      console.error('removeStyleSelfReference() - Parent CST node undefined!');
      return undefined!;
    }

    let colonNode: LeafCstNode | undefined;
    for (const child of parentCst.content) {
      if (child instanceof LeafCstNodeImpl && child.text === ':') {
        colonNode = child;
        break;
      }
    }

    if (!colonNode) {
      console.error('removeStyleSelfReference() - Colon token not found!');
      return undefined!;
    }

    // Define the range from the colon (`:`) to the end of `styleRef`
    const range = {
      start: document.textDocument.positionAt(colonNode.offset),
      end: document.textDocument.positionAt(cstNode.offset + cstNode.length),
    };

    return {
      title: 'Remove self-reference',
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [document.textDocument.uri]: [
            {
              range,
              newText: '', // Remove everything in the range
            },
          ],
        },
      },
    };
  }

  /**
   * Fixes an incorrect or missing unit for a width value.
   *
   * This quick fix is triggered when a link width has an unknown unit or no unit
   * at all. It provides multiple code actions, each suggesting a valid unit.
   *
   * @param diagnostic The diagnostic reporting the issue with the width unit.
   * @param document The Langium document.
   * @returns An array of code actions, each suggesting a valid unit.
   */
  private fixIncorrectWidthUnit(diagnostic: Diagnostic, document: LangiumDocument): CodeAction[] {
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const rootNode = document.parseResult.value;
    const rootCst = rootNode.$cstNode;

    if (!rootCst) {
      console.error('fixIncorrectWidthUnit() - rootCst undefined!');
      return [];
    }

    // Find the CST node at the given offset
    const cstNode = CstUtils.findLeafNodeAtOffset(rootCst, offset);
    if (!cstNode) {
      console.error('fixIncorrectWidthUnit() - cstNode undefined!');
      return [];
    }

    // Get the corresponding AST node
    const astNode = cstNode.astNode;

    // Ensure the AST node is a WidthValue instance
    if (!isWidthValue(astNode)) {
      console.error('fixIncorrectWidthUnit() - Not a valid WidthValue instance!');
      return [];
    }

    const { value, unit } = astNode;
    let units = LENGTH_UNITS;

    if (unit !== undefined) {
      if (LENGTH_UNITS.includes(unit)) {
        console.info('fixIncorrectWidthUnit() - Unit is known');
        return [];
      } else if (LENGTH_UNITS.includes(unit.toLowerCase())) {
        units = [unit.toLowerCase()];
      }
    } else {
      console.info('fixIncorrectWidthUnit() - No unit found (dimensionless)!');
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
    const endOffset = unitNode ? unitNode.offset + unitNode.length : startOffset;

    const range = {
      start: document.textDocument.positionAt(startOffset),
      end: document.textDocument.positionAt(endOffset),
    };

    console.info(`fixIncorrectWidthUnit() - Replacement range: [${startOffset}, ${endOffset}]`);

    console.info(`fixIncorrectWidthUnit() - Returning ${units.length} code actions.`);

    // Generate multiple CodeActions, each suggesting a valid unit
    return units.map((validUnit) => ({
      title:
        unit === undefined ? `Set unit to '${validUnit}'` : `Replace '${unit}' with '${validUnit}'`,
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
