import chalk from "chalk";
import { AstNode } from "langium";
// import { inspect } from "util";
import {
  Element,
  isGraph,
  isModel,
  Label,
  StringLabel,
  StyleDefinition,
} from "../language/generated/ast.js";

export function Label_get_label(label: Label | undefined): string {
  if (!label) {
    return "";
  }
  if (label.$type === StringLabel) {
    return label.label_string;
  } else {
    // (label.$type === BracketedLabel)
    // Trim the opening and closing bracket, and remove leading and trailing white space:
    return label.label_bracketed.slice(1, -1).trim();
  }
}

/**
 * Construct an array of style items that apply to the Element.
 * If the element has no style, or no style items can be found for the style provided, then an empty array is returned.
 * In all other cases, a scoped array of style items will be generated, following the following rules:
 *  - Style items at the same level in the model are combined in the order they appear.
 *  - When combining style items with the same topic, the last item is kept (overrruling previous topic definitions)
 *  - Style items at a given nesting level inherit style definitions from previous levels
 * @param element The element that may have to be styled
 * @returns The array of unique style items applicable to the element, or undefined if element not defined or style not provided
 */
export function Element_get_style_items(
  element: Element,
): StyleDefinition[] | undefined {
  if (element.style === undefined) {
    return undefined;
  }
  // The element has a style
  const filtered_style_definitions: StyleDefinition[] = [];

  //collect the element's ancestry (bottom-up):
  const ancestry: AstNode[] = [];
  let container: AstNode = element;
  while (container.$container) {
    ancestry.push(container.$container);
    container = container.$container;
  }

  // Process the ancestry top-down:
  for (const ancestor of ancestry.reverse()) {
    // Search for style definitions with the proper style identifier:
    if (isModel(ancestor) || isGraph(ancestor)) {
      // Useless check (required for linter)
      for (const s of ancestor.styles) {
        if (s.name === element.style.$refText) {
          // Matching style found - Process the style items, taking care of scope, redefinition and reset rules
          for (const d of s.definition.items) {
            // First check reset topic:
            if (d.topic === "Reset") {
              // Check which topics must be reset
              if (["All", "*"].includes(d.value)) {
                // Reset entire style definition:
                filtered_style_definitions.length = 0;
              } else {
                console.error(
                  chalk.redBright(
                    `ERROR: NOT YET IMPLEMENTED: reset style with argument '${d.value}'`,
                  ),
                );
              }
            } else {
              // Retrieve the index of the style definition with the same topic (returns -1 if no match)
              const index = filtered_style_definitions.findIndex(
                (it) => it.topic === d.topic,
              );
              if (index < 0) {
                // No match: add to array
                filtered_style_definitions.push(d);
              } else {
                // Match: replace existing style defintion with new one
                filtered_style_definitions.splice(index, 1, d);
              }
            }
          }
        }
      }
    }
  }

  // Debug statements:
  for (const d of filtered_style_definitions) {
    console.log(
      chalk.bgWhite.blueBright(`Filtered: ${d.topic}: "${d.value}";`),
    );
  }

  return filtered_style_definitions;
}

export function StyleDefinition_toString(d: StyleDefinition[]): string {
  return d.map((def) => `${def.topic}: "${def.value}"`).join("; ");
}
