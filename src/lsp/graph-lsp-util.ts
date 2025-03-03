// import { Position as vscodePosition, Range as vscodeRange } from 'vscode';
import { Position, Range } from 'vscode-languageserver';

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
 *
 * @param text The string to render. Can be undefined.
 * @param prefix An optional prefix to add to each line. Defaults to ''.
 * @param suffix An optional suffix to add to each line. Defaults to ''.
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
 */
export function render_text(
  text: string | undefined,
  prefix: string = '',
  suffix: string = '',
  start_line: number = 0,
): string {
  return (text ?? '<undefined text>')
    .split(/\r?\n|\r|\n/g)
    .map(
      (line, index) =>
        `  ${prefix == '' ? '' : prefix + ':'} ${String('    ' + (index + start_line + 1)).slice(-4)}|${line}${suffix}`,
    )
    .join('\n');
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
