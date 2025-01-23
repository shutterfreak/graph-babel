import type { ValidationAcceptor, ValidationChecks } from "langium";
import type { GraphAstType, Element, Model } from "./generated/ast.js";
import type { GraphServices } from "./graph-module.js";
import chalk from "chalk";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<GraphAstType> = {
    // Person: validator.checkPersonStartsWithCapital
    Model: validator.checkUniqueElementNames,
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
}
