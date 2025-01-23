import chalk from "chalk";
import { AstNode } from "langium";
import { inspect } from "util";
import { integer } from "vscode-languageserver";
import {
  Element,
  isGraph,
  isModel,
  Label,
  StringLabel,
  Style,
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

export function Element_get_style_items(
  element: Element,
): StyleDefinition[] | undefined {
  if (element.style !== undefined) {
    const style_name = element.style.$refText;
    chalk.cyanBright(
      `Element_get_style_items() ${element.$type} :::${style_name} '${element.name}' [${Label_get_label(element.label)}]`,
    );

    const styles: Style[] = [];
    let container: AstNode | undefined = element; //.$container
    let level: integer = 0;
    interface StyleDefintionDecomposed {
      topic: string;
      level: integer;
      value: string;
      item: StyleDefinition;
    }
    const decomposed_style_definitions: StyleDefintionDecomposed[] = [];
    const decomposed_style_definitions_filtered: StyleDefintionDecomposed[] =
      [];

    while (container !== undefined) {
      console.log(
        chalk.cyan(
          `Element_get_style_items(style=${style_name}) - at level ${level} - found container of type <${container.$type}>`,
        ),
      );
      if (container.$container === undefined) {
        container = undefined;
      } else {
        container = container.$container;
        // Process the style elements in the parent container
        if (isModel(container) || isGraph(container)) {
          for (const s of container.styles) {
            if (s.name === style_name) {
              console.log(
                chalk.greenBright(
                  `Found matching ${s.$type} '${style_name}' at level ${level}`,
                ),
              );

              // Push the style items to decomposed_style_definitions

              const defs: string[] = [];
              //let def:string = ''
              for (const it of s.definition.items) {
                console.log(
                  chalk.gray(
                    `At level ${level} - ${s.name}: ${it.topic}: "${it.value}"`,
                  ),
                );
                defs.push(`[${it.topic}] := [${it.value}]`);
                decomposed_style_definitions.push({
                  topic: it.topic,
                  level,
                  value: it.value,
                  item: it,
                });
                if (
                  decomposed_style_definitions_filtered.find(
                    (dsd) => dsd.topic === it.topic,
                  ) === undefined
                ) {
                  decomposed_style_definitions_filtered.push({
                    topic: it.topic,
                    level,
                    value: it.value,
                    item: it,
                  });
                }
              }
              //def = defs.join(' ; ')

              styles.push(s);
            } else {
              console.log(
                chalk.red(
                  `Skipping ${s.$type} '${style_name}' at level ${level}`,
                ),
              );
            }
          }
        } else {
          console.error(
            chalk.redBright(`Unexpected container type: ${container.$type}`),
          );
        }
      }
      level += 1;
    }

    // Now filter the style items:
    decomposed_style_definitions.sort((a, b) => {
      if (a.topic === b.topic) {
        return a.level - b.level;
      }
      return a.topic > b.topic ? -1 : 1;
    });

    console.log(
      chalk.greenBright(
        style_name,
        "decomposed_style_definitions (before filtering) := ",
        inspect(decomposed_style_definitions),
      ),
    );

    console.log(
      chalk.yellowBright(
        style_name,
        "decomposed_style_definitions (after filtering) := ",
        inspect(decomposed_style_definitions_filtered),
      ),
    );

    //return styles
    return decomposed_style_definitions_filtered.map((s) => s.item);
  }
  return undefined;
}
