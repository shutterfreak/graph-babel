import { type ValidationAcceptor, type ValidationChecks } from "langium";
import {
  GraphAstType,
  Element,
  Model,
  isModel,
  Style,
  Graph,
} from "./generated/ast.js";
import type { GraphServices } from "./graph-module.js";
import { StyleDefinition_toString } from "../cli/model-helpers.js";
import chalk from "chalk";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<GraphAstType> = {
    // Person: validator.checkPersonStartsWithCapital
    Model: [validator.checkUniqueElementNames, validator.checkStyles],
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class GraphValidator {
  /*
  checkPersonStartsWithCapital(
    person: Person,
    accept: ValidationAcceptor,
  ): void {
    if (person.name !== "") {
      const firstChar = person.name.substring(0, 1);
      if (firstChar.toUpperCase() !== firstChar) {
        accept("warning", "Person name should start with a capital.", {
          node: person,
          property: "name",
        });
      }
    }
  }
  */

  checkUniqueElementNames(model: Model, accept: ValidationAcceptor): void {
    // Create a set of identifiers while traversing the AST
    const identifiers = new Set<string>();

    function traverseElement(element: Element): void {
      const preamble = `traverseElement(${element.$type} element (${element.name ?? "<no name>"}))`;
      console.log(chalk.white(`${preamble} - START`));
      if (element.name !== undefined) {
        // The element has a name (note: links have an optional name)
        if (identifiers.has(element.name)) {
          // report an error if the identifier is not unique
          console.warn(
            chalk.red(
              `${preamble} - Duplicate name ${element.name} found for ${element.$type}.`,
            ),
          );
          accept("error", `Duplicate name '${element.name}'`, {
            node: element,
            property: "name",
          });
        } else {
          identifiers.add(element.name);
        }
      }

      if (element.$type === "Graph") {
        // Recurse
        for (const e of element.elements) {
          traverseElement(e);
        }
      }

      console.log(chalk.white(`${preamble} - END`));
    }

    console.log(chalk.whiteBright("checkUniqueElementNames() - START"));

    // Traverse the elements in the model:
    for (const element of model.elements) {
      traverseElement(element);
    }

    console.log(chalk.whiteBright("checkUniqueElementNames() - END"));
  }

  /**
   * Check the Style nodes through the entire Model hierarchy:
   *  - Report if multiple Style defintions share the same name at ehe same hierarchy level
   * TODO:
   *  - Report duplicate style redefinitions (requires comparing the StyleItem entries in each Style)
   *  - Warn user to place style definitions before graph elements (Graph / Node / Link)
   *
   * @param model
   * @param accept
   */
  checkStyles(model: Model, accept: ValidationAcceptor): void {
    console.info(chalk.cyanBright("checkStyles(model)"));

    // Traverse the model top-down) and store the graph nodes and their levels:
    const style_dict: _find_style_dict[] = find_styles(model, 0, 0, accept);
    for (const item of style_dict) {
      console.info(
        chalk.cyan(
          `checkStyles(model): ${item.containerID} - ${item.level} : Style '${item.style.name}' : [ ${StyleDefinition_toString(item.style.definition.items)} ]`,
        ),
      );
    }

    // Check style_dict at all (container_name, level) for duplicate style declarations:

    // Iterate over all containers (Model + Graph)

    const d: Record<string, Record<string, Style[]>> = {};

    for (const item of style_dict) {
      if (!(item.containerID in d)) {
        // Initialize:
        d[item.containerID] = {};
      }
      if (!(item.style.name in d[item.containerID])) {
        d[item.containerID][item.style.name] = [];
      }
      // Push to array:
      d[item.containerID][item.style.name].push(item.style);
    }

    // Now compute counts per node:
    for (const container_id in d) {
      // Count occurrences of style name
      for (const style_name in d[container_id]) {
        if (d[container_id][style_name].length > 1) {
          // Multiple Style definitions with same name: issue warning
          for (const duplicate_style_definition of d[container_id][
            style_name
          ]) {
            console.warn(
              chalk.red(
                `Warning: Multiple style definitions with name '${style_name}' at the same level should be merged. Found: ${StyleDefinition_toString(duplicate_style_definition.definition.items)}`,
              ),
            );
            accept(
              "warning",
              `Multiple style definitions with name '${style_name}' at the same level should be merged.`,
              {
                node: duplicate_style_definition,
                property: "name",
              },
            );
          }
        }
      }
    }
  }
}

interface _find_style_dict {
  level: number;
  containerID: string;
  style: Style;
}

function find_styles(
  container: Model | Graph,
  level: number,
  seq: number,
  accept: ValidationAcceptor,
): _find_style_dict[] {
  const style_dict: _find_style_dict[] = [];

  // Iterate over all styles defined in the container:
  for (const style of container.styles) {
    // Add the style:
    style_dict.push({
      level,
      containerID:
        `${seq}::` + (isModel(container) === true ? "" : container.name),
      style,
    });
  }
  // Traverse the graph elements recursively for styles:
  for (const graph of container.elements.filter((e) => e.$type === Graph)) {
    style_dict.push(...find_styles(graph, level + 1, seq + 1, accept));
  }
  return style_dict;
}
