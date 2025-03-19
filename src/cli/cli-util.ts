import chalk from 'chalk';
import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function extractDocument(
  fileName: string,
  services: LangiumCoreServices,
): Promise<LangiumDocument> {
  const extensions = services.LanguageMetaData.fileExtensions;
  if (!extensions.includes(path.extname(fileName))) {
    console.error(
      chalk.yellow(`Please choose a file with one of these extensions: ${extensions.join(', ')}.`),
    );
    process.exit(1);
  }

  if (!fs.existsSync(fileName)) {
    console.error(chalk.red(`File ${fileName} does not exist.`));
    process.exit(1);
  }

  const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
    URI.file(path.resolve(fileName)),
  );
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });

  const validationErrors = (document.diagnostics ?? []).filter((e) => e.severity === 1);
  if (validationErrors.length > 0) {
    console.error(chalk.red('There are validation errors:'));
    for (const validationError of validationErrors) {
      console.error(
        chalk.red(
          `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(validationError.range)}]`,
        ),
      );
    }
    process.exit(1);
  }

  return document;
}

export async function extractAstNode<T extends AstNode>(
  fileName: string,
  services: LangiumCoreServices,
): Promise<T> {
  return (await extractDocument(fileName, services)).parseResult.value as T;
}

interface FilePathData {
  destination: string;
  name: string;
}

export function extractDestinationAndName(
  filePath: string,
  destination: string | undefined,
): FilePathData {
  filePath = path.basename(filePath, path.extname(filePath)).replace(/[.-]/g, '');
  return {
    destination: destination ?? path.join(path.dirname(filePath), 'generated'),
    name: path.basename(filePath),
  };
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
