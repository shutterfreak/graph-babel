import type { ValidationAcceptor, ValidationChecks } from "langium";
import type { GraphAstType, Person } from "./generated/ast.js";
import type { GraphServices } from "./graph-module.js";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<GraphAstType> = {
    Person: validator.checkPersonStartsWithCapital,
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class GraphValidator {
  checkPersonStartsWithCapital(
    person: Person,
    accept: ValidationAcceptor,
  ): void {
    if (person.name) {
      const firstChar = person.name.substring(0, 1);
      if (firstChar.toUpperCase() !== firstChar) {
        accept("warning", "Person name should start with a capital.", {
          node: person,
          property: "name",
        });
      }
    }
  }
}
