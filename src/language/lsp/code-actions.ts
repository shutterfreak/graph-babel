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
import { CodeActionParams, TextEdit } from 'vscode-languageserver-protocol';
import { CodeAction, Command } from 'vscode-languageserver-types';

import * as ast from '../generated/ast.js';
import { IssueCode } from '../graph-validator.js';
import { LENGTH_UNITS } from '../model-helpers.js';

/**
 * Provides code actions (quick fixes and fix-all actions) for the Graph language.
 *
 * This class implements the CodeActionProvider interface. It generates quick fixes based on
 * diagnostics produced by the validator (such as duplicate names, invalid units, spurious semicolons,
 * etc.) and also supports manually triggered source actions.
 *
 * The main method getCodeActions() gathers all diagnostics within the given range and delegates
 * to helper methods to create CodeActions for each specific issue. In addition, a fix‑all action is
 * provided (for example, to delete all spurious semicolons) by aggregating all diagnostics that
 * share a given issue code.
 *
 * Note: Currently, the SourceFixAll code action is registered using CodeActionKind.QuickFix.
 */
export class GraphCodeActionProvider implements CodeActionProvider {
  /**
   * Returns an array of CodeActions for the given document and range.
   *
   * This method examines the diagnostics provided in the CodeActionParams. For each diagnostic,
   * it calls createCodeAction() to generate the corresponding quick fix(s). It also checks for
   * manually triggered source actions and a "fix all" action for spurious semicolons.
   *
   * @param document The Langium document.
   * @param params The CodeActionParams containing the request range, context, and diagnostics.
   * @returns A promise resolving to an array of CodeActions or Commands.
   */
  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams,
  ): MaybePromise<(Command | CodeAction)[]> {
    console.log('getCodeActions() called with params:', inspect(params));

    const result: CodeAction[] = [];

    // Process diagnostics to generate quick fixes.
    if (params.context.diagnostics.length > 0) {
      for (const diagnostic of params.context.diagnostics) {
        const codeActions = this.createCodeAction(diagnostic, document);

        if (Array.isArray(codeActions)) {
          result.push(...codeActions); // Merge multiple actions for one diagnostic.
        } else if (codeActions) {
          result.push(codeActions); // Add single action.
        }
      }
    }

    // Process manually triggered source actions.
    if (params.context.only) {
      if (params.context.only.includes(CodeActionKind.Source)) {
        console.log('getCodeActions() - Source actions requested!');
        result.push(this.renameGraphElementName(document));
      }
    }

    // Add a "fix all" action if spurious semicolon diagnostics exist.
    const spuriousSemicolonDiagnostics =
      document.diagnostics?.filter((d) => d.code === IssueCode.SpuriousSemicolonDelete) || [];
    if (spuriousSemicolonDiagnostics.length > 0) {
      const deleteAllSpuriousSemicolonsAction = this.deleteAllSpuriousSemicolons(
        document,
        spuriousSemicolonDiagnostics,
      );
      if (deleteAllSpuriousSemicolonsAction) result.push(deleteAllSpuriousSemicolonsAction);
    }

    // Debug: list all code actions found:
    console.log('getCodeActions() - Returning code actions:', inspect(result));

    return result;
  }

  /**
   * Creates a code action or an array of code actions based on the diagnostic code.
   *
   * This method maps the diagnostic.code produced by the validator to the corresponding
   * code action generator function.
   *
   * @param diagnostic The diagnostic reported by the validator.
   * @param document The Langium document.
   * @returns A CodeAction, an array of CodeActions, or undefined if no action is applicable.
   */
  private createCodeAction(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction | CodeAction[] | undefined {
    switch (
      diagnostic.code // code as defined in 'graph-validator.ts' for each validation check
    ) {
      case IssueCode.NameDuplicate:
      case IssueCode.NameMissing:
        return this.generateNewName(diagnostic, document);
      case IssueCode.StyleSelfReference:
        return this.removeStyleSelfReference(diagnostic, document);
      case IssueCode.LinkWidthUnitUnknown:
      case IssueCode.LinkWidthHasNoUnit:
        return this.fixIncorrectWidthUnit(diagnostic, document);
      case IssueCode.SpuriousSemicolonDelete:
        return this.deleteSpuriousSemicolons(diagnostic, document);
      default:
        return undefined;
    }
  }

  // --------------------------------------------------
  // Source Code Actions (Manually Triggered)
  // --------------------------------------------------

  /**
   * Provides a code action to rename a graph element.
   *
   * This source action is manually triggered (e.g., via a context menu) and is a placeholder.
   * It currently uses a fixed range and new name, but you should implement dynamic resolution.
   *
   * @param document The Langium document.
   * @returns A CodeAction for renaming a graph element.
   */
  private renameGraphElementName(document: LangiumDocument): CodeAction {
    console.log('renameGraphElementName() called!');
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
              newText: 'new-name', // Placeholder, iteally prompt for user input.
            },
          ],
        },
      },
    };
  }

  /**
   * Creates a "fix all" CodeAction to delete all spurious semicolons in the document.
   *
   * This action aggregates all diagnostics with IssueCode.SpuriousSemicolonDelete
   * and generates a workspace edit that deletes the entire ranges.
   *
   * @param document The Langium document.
   * @param diagnostics An array of diagnostics with spurious semicolon issues.
   * @returns A CodeAction that removes all spurious semicolons in the document.
   */
  private deleteAllSpuriousSemicolons(
    document: LangiumDocument,
    diagnostics: Diagnostic[],
  ): CodeAction | undefined {
    console.info(
      `deleteAllSpuriousSemicolons() -- found ${diagnostics.length} diagnostics matching 'IssueCode.SpuriousSemicolonDelete'`,
    );
    if (diagnostics.length === 0) {
      return undefined;
    }

    // Create one TextEdit per diagnostic.
    const edits: TextEdit[] = diagnostics.map((diag) => ({
      range: diag.range,
      newText: '',
    }));

    // Combine all edits into a single workspace edit.
    const workspaceEdit = {
      changes: {
        [document.textDocument.uri]: edits,
      },
    };

    const action: CodeAction = {
      title: 'Delete all spurious semicolons',
      kind: CodeActionKind.QuickFix,
      diagnostics,
      isPreferred: true,
      edit: workspaceEdit,
    };

    return action;
  }

  // --------------------------------------------------
  // Quick Fixes Triggered by Diagnostics
  // --------------------------------------------------

  /**
   * Generates a new, unique name for an element.
   *
   * This quick fix is triggered when a duplicate or missing name is detected.
   * It traverses the AST to collect existing names and generates a new one based on
   * the element's type.
   *
   * @param diagnostic The diagnostic reporting the name issue.
   * @param document The Langium document.
   * @returns A CodeAction to generate a new unique name.
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
        "generateNewName() - astNode has no '$type' property or '$type' is not string!\nCST Node:",
        inspect(astNode),
      );
      return undefined!;
    }

    // Collect existing names.
    for (const childNode of AstUtils.streamAllContents(rootNode)) {
      if (
        (ast.isElement(childNode) || ast.isStyle(childNode)) &&
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
   * This quick fix removes the self-referential part (typically the colon and style reference)
   * from a Style node that incorrectly references itself.
   *
   * @param diagnostic The diagnostic reporting the self-reference.
   * @param document The Langium document.
   * @returns A CodeAction that removes the self-reference.
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
    if (!ast.isStyle(astNode) || !astNode.styleref) {
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
   * This quick fix is triggered when a link width value has either no unit or an unknown unit.
   * It suggests valid units from the allowed list.
   *
   * @param diagnostic The diagnostic reporting the width unit issue.
   * @param document The Langium document.
   * @returns An array of CodeActions, each suggesting a valid unit.
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
    if (!ast.isWidthValue(astNode)) {
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

  /**
   * Creates CodeActions that delete spurious semicolons in a StyleBlock.
   *
   * The validator produces diagnostics whose ranges cover a contiguous group of
   * spurious semicolon tokens that should be deleted. This method creates a single
   * CodeAction with a workspace edit that removes (replaces with an empty string)
   * all text in the diagnostic range.
   *
   * @param diagnostic The diagnostic that triggered this fix.
   * @param document The Langium document.
   * @returns An array containing one CodeAction to delete the spurious semicolons.
   */
  private deleteSpuriousSemicolons(
    diagnostic: Diagnostic,
    document: LangiumDocument,
  ): CodeAction[] {
    // Create a single TextEdit covering the entire diagnostic range.
    // The diagnostic range already spans all extra semicolons to delete (while skipping comments).

    // Create a single edit that removes everything in the diagnostic's range:
    const edit: TextEdit = {
      range: diagnostic.range,
      newText: '', // Remove the semicolons.
    };

    // Create the code action:
    const action: CodeAction = {
      title: 'Delete spurious semicolons',
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: { changes: { [document.textDocument.uri]: [edit] } },
    };

    return [action];
  }
}
