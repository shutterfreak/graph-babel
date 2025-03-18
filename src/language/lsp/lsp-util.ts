// import { Position as vscodePosition, Range as vscodeRange } from 'vscode';
import { AstUtils, CstNode, isCompositeCstNode, isLeafCstNode } from 'langium';
import { rangeToString } from 'langium/test';
import { Position, Range } from 'vscode-languageserver';

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
 * Converts a Position object to a human-readable string.
 *
 * @param position The Position object to convert. Can be undefined.
 * @returns A string representation of the Position, or '<position undefined>' if position is undefined.
 *
 * @example
 * const pos = { line: 10, character: 5 };
 * const posString = position_toString(pos); // Returns "line 10, char 5"
 */
export function position_toString(position: Position | undefined): string {
  if (!position) {
    return '<position undefined>';
  }
  return `line ${position.line}, char ${position.character}`;
}

/**
 * Converts a Range object to a human-readable string.
 *
 * @param range The Range object to convert. Can be undefined.
 * @returns A string representation of the Range, or '<range undefined>' if range is undefined.
 * If the start and end lines are the same, it returns a single-line range.
 * Otherwise, it returns a multi-line range.
 *
 * @example
 * const singleLineRange = { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } };
 * const singleLineRangeString = range_toString(singleLineRange); // Returns "line 5, char 10 -- 20"
 *
 * const multiLineRange = { start: { line: 10, character: 0 }, end: { line: 15, character: 5 } };
 * const multiLineRangeString = range_toString(multiLineRange); // Returns "line 10, char 0 -- line 15, char 5"
 */
export function range_toString(range: Range | undefined): string {
  if (!range) {
    return '<range undefined>';
  }
  if (range.start.line == range.end.line) {
    return `line ${range.start.line}, char ${range.start.character} -- ${range.end.character}`;
  } else {
    return `${position_toString(range.start)} -- ${position_toString(range.end)}`;
  }
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
