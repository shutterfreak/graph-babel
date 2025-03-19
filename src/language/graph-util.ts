// import { Position as vscodePosition, Range as vscodeRange } from 'vscode';
import { AstUtils, CstNode, isCompositeCstNode, isLeafCstNode } from 'langium';
import { rangeToString } from 'langium/test';
import { Position } from 'vscode-languageserver';

/**
 * Checks if a given CST node represents a comment.
 * It verifies if the node is a hidden leaf node with a token type name of
 * 'ML_COMMENT' or 'SL_COMMENT'.
 *
 * @param cstNode The CST node to check.
 * @returns True if the node represents a comment, false otherwise.
 */
export function isCommentCstNode(cstNode: CstNode): boolean {
  return (
    isLeafCstNode(cstNode) &&
    cstNode.hidden &&
    ['ML_COMMENT', 'SL_COMMENT'].includes(cstNode.tokenType.name)
  );
}

/**
 * Generates a string containing detailed information about a CST node.
 * This is useful for debugging and logging purposes.
 *
 * @param cstNode The CST node to get information about.
 * @param context An optional string providing context or a description for the node.
 * Defaults to 'CstNode'.
 * @returns A string containing information about the CST node.
 */
export function getCstNodeInfo(cstNode: CstNode, context: string = 'CstNode'): string {
  const path = AstUtils.getDocument(cstNode.astNode).uri.path;

  const nodeTypeInfo = isLeafCstNode(cstNode)
    ? `${cstNode.hidden ? 'HIDDEN ' : ''}Leaf CST Node: "${cstNode.tokenType.name}"`
    : isCompositeCstNode(cstNode)
      ? `${cstNode.hidden ? 'HIDDEN ' : ''}Composite CST Node: ${cstNode.astNode.$type}`
      : `Other ${cstNode.hidden ? 'HIDDEN ' : ''}CST Node: grammar source "${cstNode.grammarSource?.$type}"`;

  return `${context} (${path}) - ${rangeToString(cstNode.range)}: ${JSON.stringify(cstNode.text)} - ${nodeTypeInfo}`;
}

/**
 * Converts a Position object to a human-readable string (similar to Langium's rangeToString() method).
 *
 * @param position The Position object to convert. Can be undefined.
 * @returns A string representation of the Position, or '<position undefined>' if position is undefined.
 *
 * @example
 * const pos = { line: 10, character: 5 };
 * const posString = position_toString(pos); // Returns "10:5"
 */
export function positionToString(position: Position | undefined): string {
  if (!position) {
    return '<position undefined>';
  }
  return `${position.line}:${position.character}`;
}

/**
 * Renders a string or undefined text into a multiline string, with optional prefix, suffix, and starting line number.
 * Line endings are treated individually, and suffix is only appended after lines ending with a line ending.
 *
 * @param text The string to render. Can be undefined.
 * @param prefix An optional prefix to add to each line. Defaults to ''.
 * @param suffix An optional suffix to add to lines ending with a line ending. Defaults to ''.
 * @param start_line The starting line number for the rendered text. Defaults to 0.
 * @returns A multiline string representation of the input text, or '<undefined text>' if text is undefined.
 *
 * @example
 * const myText = "Line 1\nLine 2\nLine 3";
 * const renderedText = render_text(myText, "DEBUG", "END", 10);
 * // Returns:
 * //   DEBUG:   11|Line 1END
 * //   DEBUG:   12|Line 2END
 * //   DEBUG:   13|Line 3END
 *
 * const myText2 = "Line 1\nLine 2\nLine 3\n\n";
 * const renderedText2 = render_text(myText2, "DEBUG", "END", 10);
 * // Returns:
 * //   DEBUG:   11|Line 1END
 * //   DEBUG:   12|Line 2END
 * //   DEBUG:   13|Line 3END
 * //   DEBUG:   14|END
 * //   DEBUG:   15|END
 *
 * const myText3 = "Line 1\nLine 2\nLine 3";
 * const renderedText3 = render_text(myText3, "DEBUG", "END", 10);
 * // Returns:
 * //   DEBUG:   11|Line 1END
 * //   DEBUG:   12|Line 2END
 * //   DEBUG:   13|Line 3
 */
export function render_text(
  text: string | undefined,
  prefix: string = '',
  suffix: string = '',
  start_line: number = 0,
): string {
  if (text === undefined) {
    return `  ${prefix == '' ? '' : prefix + ':'} <undefined text>`;
  }

  let lineNumber = start_line + 1;
  let result = '';
  let currentLine = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++; // Skip the '\n' in '\r\n'
      }
      result += `  ${prefix == '' ? '' : prefix + ':'} ${String('    ' + lineNumber).slice(-4)}|${currentLine}${suffix}\n`;
      lineNumber++;
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  // Handle the last line (if it doesn't end with a line ending)
  if (currentLine.length > 0) {
    result += `  ${prefix == '' ? '' : prefix + ':'} ${String('    ' + lineNumber).slice(-4)}|${currentLine}`;
  }

  return result;
}

/**
 * Extracts the file name from a given path.
 *
 * @param path The file path from which to extract the file name.
 * @returns The file name, or undefined if the path is empty or invalid.
 *
 * @example
 * const filePath = "/path/to/my/file.txt";
 * const fileName = path_get_file(filePath); // Returns "file.txt"
 *
 * const emptyPath = "";
 * const emptyFileName = path_get_file(emptyPath); // Returns undefined
 */
export function path_get_file(path: string): string | undefined {
  return path.split(/[\\\/]/).pop();
}

/**
 * Groups adjacent integer values in a sorted array into ranges.
 *
 * This function takes a sorted array of integers and identifies sequences of
 * consecutive numbers. It then represents these sequences as pairs of the
 * starting and ending values of the range.
 *
 * @param arr A sorted array of integers.
 * @returns An array of number pairs, where each pair represents a range of
 * adjacent integers. The first element of the pair is the start of the
 * range, and the second element is the end. Returns an empty array if
 * the input array is empty.
 *
 * @example
 * ```typescript
 * const indices = [0, 1, 3, 5, 6, 9];
 * const groupedRanges = groupAdjacentArrayIndexes(indices);
 * console.log(groupedRanges); // Output: [ [ 0, 1 ], [ 3, 3 ], [ 5, 6 ], [ 9, 9 ] ]
 * ```
 *
 * @example
 * ```typescript
 * const indices2 = [1, 2, 3, 7, 8, 9];
 * const groupedRanges2 = groupAdjacentArrayIndexes(indices2);
 * console.log(groupedRanges2); // Output: [ [ 1, 3 ], [ 7, 9 ] ]
 * ```
 *
 * @example
 * ```typescript
 * const indices3 = [4];
 * const groupedRanges3 = groupAdjacentArrayIndexes(indices3);
 * console.log(groupedRanges3); // Output: [ [ 4, 4 ] ]
 * ```
 *
 * @example
 * ```typescript
 * const indices4: number[] = [];
 * const groupedRanges4 = groupAdjacentArrayIndexes(indices4);
 * console.log(groupedRanges4); // Output: []
 * ```
 */

export function groupAdjacentArrayIndexes(arr: number[]): number[][] {
  if (arr.length === 0) {
    return [];
  }

  const result = arr.reduce((acc: number[][], currentValue, index) => {
    if (index === 0) {
      acc.push([currentValue, currentValue]);
    } else {
      const lastGroup = acc[acc.length - 1];
      if (currentValue === lastGroup[1] + 1) {
        lastGroup[1] = currentValue;
      } else {
        acc.push([currentValue, currentValue]);
      }
    }
    return acc;
  }, []);
  console.log(`groupAdjacentArrayIndexes( ${JSON.stringify(arr)} ) : ${JSON.stringify(result)}`);

  return result;
}

export function checkPreviousCstNodeIs(givenCstNode: CstNode, tokens: string[]): boolean {
  const parent = givenCstNode.container;
  if (!parent || tokens.length === 0) {
    return false; // No parent, so no preceding sibling
  }

  const index = parent.content.indexOf(givenCstNode);
  if (index <= 0) {
    return false; // No preceding sibling
  }

  const precedingNode = parent.content[index - 1];
  return tokens.includes(precedingNode.text);
}

export function checkNextCstNodeIs(givenCstNode: CstNode, tokens: string[]): boolean {
  const parent = givenCstNode.container;
  if (!parent || tokens.length === 0) {
    return false; // No parent, so no succeeding sibling
  }

  const index = parent.content.indexOf(givenCstNode);
  if (index >= parent.content.length - 1) {
    return false; // No succeeding sibling
  }

  const succeedingNode = parent.content[index + 1];
  return tokens.includes(succeedingNode.text);
}

/**
 * Checks whether the next sibling of the given CST node (if any) has an AST node
 * with the given type.
 */
export function checkNextAstType(given: CstNode, expectedType: string): boolean {
  const parent = given.container;
  if (!parent) return false;
  const idx = parent.content.indexOf(given);
  if (idx < 0 || idx >= parent.content.length - 1) return false;
  const next = parent.content[idx + 1];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
  return next.astNode ? next.astNode.$type === expectedType : false;
}

/**
 * Checks whether the previous sibling of the given CST node is a hidden token with the given token type.
 */
export function checkPreviousTokenType(given: CstNode, expectedTokenType: string): boolean {
  const parent = given.container;
  if (!parent) return false;
  const idx = parent.content.indexOf(given);
  if (idx <= 0) return false;
  const prev = parent.content[idx - 1];
  return isLeafCstNode(prev) && prev.hidden && prev.tokenType.name === expectedTokenType;
}
