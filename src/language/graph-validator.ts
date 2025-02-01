import {
  AstNode,
  AstUtils,
  type ValidationAcceptor,
  type ValidationChecks,
} from "langium";
import {
  GraphAstType,
  Element,
  Model,
  isModel,
  Style,
  Graph,
  isElement,
  isGraph,
  isStyle,
  HexColorDefinition,
  LineStyleDefinition,
  OpacityStyleDefinition,
  RgbColorDefinition,
  TextColorDefinition,
  ShapeStyleDefinition,
  isNode,
  StyleDefinition,
} from "./generated/ast.js";
import type { GraphServices } from "./graph-module.js";
import {
  LENGTH_UNITS,
  NAMED_COLORS,
  NAMED_SHAPES,
  STYLE_TOPICS,
  StyleDefinition_toString,
} from "./model-helpers.js";
import chalk from "chalk";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<GraphAstType> = {
    Model: [validator.checkUniqueElementNames, validator.checkStyles],
    Style: [validator.checkStyleNames, validator.checkStyleSubstyles],
    StyleDefinition: [validator.checkStyleDefinitionTopics],
    HexColorDefinition: [validator.checkHexColorDefinitions],
    RgbColorDefinition: [validator.checkRgbColorDefinitions],
    TextColorDefinition: [validator.checkTextColorDefinitions],
    LineStyleDefinition: [validator.checkLineWidthDefinitions],
    OpacityStyleDefinition: [validator.checkOpacityStyleDefinition],
    ShapeStyleDefinition: [validator.checkShapeStyleDefinitions],
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class GraphValidator {
  /**
   * Verify that Elements have unique names (all nodes and graphs, named edges)
   * @param model
   * @param accept
   */
  checkUniqueElementNames = (
    model: Model,
    accept: ValidationAcceptor,
  ): void => {
    // Create a set of identifiers while traversing the AST
    const identifiers = new Set<string>();

    function traverseElement(element: Element): void {
      const preamble = `traverseElement(${element.$type} element (${element.id ?? "<no name>"}))`;
      console.log(chalk.white(`${preamble} - START`));
      if (
        (isNode(element) || isGraph(element)) &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        (element.id === undefined || element.id.length == 0)
      ) {
        console.error(
          chalk.redBright(
            `${element.$type} must have a nonempty id [${element.$cstNode?.text}]`,
          ),
        );
        accept(
          "error",
          `${element.$type} must have a nonempty id [${element.$cstNode?.text}]`,
          { node: element },
        );
      }
      if (element.id !== undefined) {
        // The element has a name (note: links have an optional name)
        if (identifiers.has(element.id)) {
          // report an error if the identifier is not unique
          console.warn(
            chalk.red(
              `${preamble} - Duplicate name ${element.id} found for ${element.$type}.`,
            ),
          );
          accept("error", `Duplicate name '${element.id}'`, {
            node: element,
            property: "id",
          });
        } else {
          identifiers.add(element.id);
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
  };
  /**
   * Check the Style nodes through the entire Model hierarchy:
   *  - Report if multiple Style defintions share the same name at the same hierarchy level
   * TODO:
   *  - Report duplicate style redefinitions (requires comparing the StyleItem entries in each Style)
   *
   * @param model
   * @param accept
   */
  checkStyles = (model: Model, accept: ValidationAcceptor): void => {
    console.info(chalk.cyanBright("checkStyles(model)"));

    // Check that style definitions appear before Element definitions
    check_styles_defined_before_elements(model, accept);

    // Traverse the model top-down) and store the graph nodes and their levels:
    const style_dict: _find_style_dict[] = find_styles(model, 0, 0, accept);
    for (const item of style_dict) {
      console.info(
        chalk.cyan(
          `checkStyles(model): ${item.containerID} - ${item.level} : Style '${item.style.id}' : [ ${StyleDefinition_toString(item.style.definition.items)} ]`,
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
      if (!(item.style.id in d[item.containerID])) {
        d[item.containerID][item.style.id] = [];
      }
      // Push to array:
      d[item.containerID][item.style.id].push(item.style);
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
                `Error: Multiple style definitions with name '${style_name}' at the same level should be merged. Found: ${StyleDefinition_toString(duplicate_style_definition.definition.items)}`,
              ),
            );
            accept(
              "error",
              `Found multiple style definitions with the same name '${style_name}' at the same level.`,
              {
                node: duplicate_style_definition,
                property: "id",
              },
            );
          }
        }
      }
    }
  };
  checkStyleNames = (style: Style, accept: ValidationAcceptor) => {
    if (style.id === undefined || style.id.length == 0) {
      console.error(
        chalk.redBright(
          `ERROR: checkStyleNames() - style has no id: [${style.$cstNode?.text}]`,
        ),
      );
      accept("error", "A style must have a nonempty name.", { node: style });
    }
  };
  checkStyleDefinitionTopics = (
    shape_definition: StyleDefinition,
    accept: ValidationAcceptor,
  ) => {
    const topic = shape_definition.topic;
    if (topic.length == 0) {
      accept("error", `Style topic missing.`, {
        node: shape_definition,
      });
    } else if (!STYLE_TOPICS.includes(topic)) {
      accept("error", `The style topic '${topic}' is not recognized.`, {
        node: shape_definition,
        property: "topic",
      });
    }
  };
  /**
   * Verify that the shape names provided are valid (exhaustive list defined in NAMED_SHAPES)
   * @param shape_definition
   * @param accept
   */
  checkShapeStyleDefinitions = (
    shape_definition: ShapeStyleDefinition,
    accept: ValidationAcceptor,
  ) => {
    const value = shape_definition.value.toLowerCase();
    if (value.length == 0) {
      accept("error", `Shape name missing.`, {
        node: shape_definition,
      });
    } else if (!NAMED_SHAPES.includes(value)) {
      accept(
        "error",
        `The shape '${shape_definition.value}' is not recognized.`,
        {
          node: shape_definition,
          property: "value",
        },
      );
    }
  };
  checkStyleSubstyles = (style: Style, accept: ValidationAcceptor) => {
    if (
      style.id !== undefined &&
      style.id.length > 0 &&
      style.id == style.styleref?.$refText
    ) {
      accept(
        "error",
        `Style '${style.id}' cannot refer to itself. Please remove ":${style.styleref.$refText}"`,
        {
          node: style,
          property: "styleref",
        },
      );
    }
  };
  /**
   * Check that the named colors provided are valid (exhaustive list defined in NAMED_COLORS)
   * @param color_definition
   * @param accept
   */
  checkTextColorDefinitions = (
    color_definition: TextColorDefinition,
    accept: ValidationAcceptor,
  ) => {
    const value = color_definition.color_name.toLowerCase();
    if (!NAMED_COLORS.includes(value)) {
      accept(
        "error",
        `The color '${color_definition.color_name}' is not defined. Please use a CSS named color.`,
        {
          node: color_definition,
          property: "color_name",
        },
      );
    }
  };
  /**
   * Check that the hexadecimal color definitions provided are valid (3 or 6 hexadecimal characters)
   * @param hex_color_definition
   * @param accept
   */
  checkHexColorDefinitions = (
    hex_color_definition: HexColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const code_length = hex_color_definition.hex_color.length;
    console.info(
      chalk.cyanBright(
        `checkHexColorDefinitions(${hex_color_definition.$cstNode?.text}): hex_color='${hex_color_definition.hex_color}' (length=${code_length})}`,
      ),
    );
    if (![4, 7].includes(code_length)) {
      console.warn(
        chalk.red(
          `Error: invalid hexadecimal color code '${hex_color_definition.hex_color}' (expecting '#' plus 3 or 6 hexadecimal digits, found ${code_length - 1}).`,
        ),
      );
      accept(
        "error",
        `Error: invalid hexadecimal color code '${hex_color_definition.hex_color}' (expecting '#' plus 3 or 6 hexadecimal digits, found ${code_length - 1}).`,
        {
          node: hex_color_definition,
          property: "hex_color",
        },
      );
    }
  };
  /**
   * Check that the hexadecimal color definitions provided are valid (integer values in range 0-255)
   * @param rgb_color_definition
   * @param accept
   */
  checkRgbColorDefinitions = (
    rgb_color_definition: RgbColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    // NOTE:; code duplication to circumvent access problems to 'property: "red" | "green" | "blue"' as those aren't strings but types.

    // Check red:
    const red = rgb_color_definition.red;
    if (!Number.isInteger(red)) {
      accept("error", `RGB color value for red is not an integer: '${red}'`, {
        node: rgb_color_definition,
        property: "red",
      });
    } else {
      if (red < 0 || red > 255) {
        accept(
          "error",
          `RGB color value for red out of range: '${red}' (expecting an integer value (0 ≤ red ≤ 255)`,
          {
            node: rgb_color_definition,
            property: "red",
          },
        );
      }
    }

    // Check green:
    const green = rgb_color_definition.green;
    if (!Number.isInteger(green)) {
      accept(
        "error",
        `RGB color value for green is not an integer: '${green}'`,
        {
          node: rgb_color_definition,
          property: "green",
        },
      );
    } else {
      if (green < 0 || green > 255) {
        accept(
          "error",
          `RGB color value for green out of range: '${green}' (expecting an integer value (0 ≤ green ≤ 255)`,
          {
            node: rgb_color_definition,
            property: "green",
          },
        );
      }
    }

    // Check blue:
    const blue = rgb_color_definition.blue;
    if (!Number.isInteger(blue)) {
      accept("error", `RGB color value for blue is not an integer: '${blue}'`, {
        node: rgb_color_definition,
        property: "blue",
      });
    } else {
      if (blue < 0 || blue > 255) {
        accept(
          "error",
          `RGB color value for blue out of range: '${blue}' (expecting an integer value (0 ≤ blue ≤ 255)`,
          {
            node: rgb_color_definition,
            property: "blue",
          },
        );
      }
    }
  };
  /**
   * Check that the line style definitions are valid (number + valid unit)
   * @param line_style_item
   * @param accept
   */
  checkLineWidthDefinitions = (
    line_style_item: LineStyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    if (["BorderWidth", "LineWidth"].includes(line_style_item.topic)) {
      // Check the line style definition
      const match = /^(\d+|\.\d+|\d*\.\d+)( *([a-z]{2,3}))?$/.exec(
        line_style_item.value,
      );
      if (match) {
        const value = match[1];
        const unit = match[3];
        if (value.length == 0) {
          console.error(
            chalk.red(
              `Link width has invalid numeric value: '${line_style_item.value}'.`,
            ),
          );
          accept(
            "error",
            `Link width has invalid numeric value: '${line_style_item.value}'.`,
            { node: line_style_item, property: "value" },
          );
        }
        if (unit.length > 0 && !LENGTH_UNITS.includes(unit)) {
          console.error(
            `Link width has invalid unit: '${line_style_item.value}'. Allowed units: ${LENGTH_UNITS.join(", ")}.`,
          );
          accept(
            "error",
            `Link width has invalid unit: '${line_style_item.value}'. Allowed units: ${LENGTH_UNITS.join(", ")}.`,
            { node: line_style_item, property: "value" },
          );
        }
      }
    }
  };
  /**
   * Check that the opacity / alpha style definitions are valid (number in range 0-1 or integer percentage in range 0%-100%)
   * @param opacity_style_item
   * @param accept
   */
  checkOpacityStyleDefinition = (
    opacity_style_item: OpacityStyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = opacity_style_item.value;
    const opacity: number = value.opacity;
    if (value.isPct === true) {
      // Opacity as integer percentage value (0--100)
      if (Number.isInteger(opacity)) {
        if (opacity < 0 || opacity > 100) {
          // Out of bounds
          console.error(
            `Link opacity value out of range (0% - 100%): found '${opacity}%'`,
          );
          accept(
            "error",
            `Link opacity value out of range (0% - 100%): found '${opacity}%'`,
            { node: opacity_style_item, property: "value" },
          );
        }
      } else {
        console.error(
          `Expecting integer percentage value: found '${opacity}%'`,
        );
        accept(
          "error",
          `Expecting integer percentage value: found '${opacity}%'`,
          { node: opacity_style_item, property: "value" },
        );
      }
    } else {
      // Opacity as float value (0--1)
      if (opacity < 0.0 || opacity > 1.0) {
        // Out of bounds (one)
        console.error(
          `Link opacity value out of range (0...1): found '${opacity}'`,
        );
        accept(
          "error",
          `Link opacity value out of range (0...1): found '${opacity}'`,
          { node: opacity_style_item, property: "value" },
        );
      }
    }
  };
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
        `${seq}::` + (isModel(container) === true ? "" : container.id),
      style,
    });
  }
  // Traverse the graph elements recursively for styles:
  for (const graph of container.elements.filter((e) => e.$type === Graph)) {
    style_dict.push(...find_styles(graph, level + 1, seq + 1, accept));
  }
  return style_dict;
}

function check_styles_defined_before_elements(
  node: AstNode,
  accept: ValidationAcceptor,
  level = 0,
) {
  console.debug(
    `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) - START`,
  );
  let elementCount = 0,
    styleCount = 0;
  for (const childNode of AstUtils.streamContents(node)) {
    // Check that all Style nodes appear before Element nodes
    if (isElement(childNode)) {
      elementCount++;
      console.debug(
        `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) [elements: ${elementCount}, styles: ${styleCount}] - process Element node #${elementCount} of type '${childNode.$type}' ${childNode.id === undefined ? "" : ` with name '${childNode.id}'`}`,
      );
      if (isGraph(childNode)) {
        // recurse
        console.debug(
          `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) -- BEGIN recursion`,
        );
        check_styles_defined_before_elements(childNode, accept, level + 1);
        console.debug(
          `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) -- END recursion`,
        );
      }
    } else if (isStyle(childNode)) {
      styleCount++;
      console.debug(
        `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) [elements: ${elementCount}, styles: ${styleCount}] - process Style node #${styleCount} with name '${childNode.id}'`,
      );

      if (elementCount > 0) {
        console.error(
          chalk.red(
            `Style definitions must appear before any graph elements. Found ${elementCount} graph element(s) so far.`,
          ),
        );
        accept(
          "error",
          "Style definitions must appear before any graph elements.",
          {
            node: childNode,
          },
        );
      }
    }
  }
  console.debug(
    `${"  ".repeat(level)}check_styles_defined_before_elements(${node.$type}) - END -  [elements: ${elementCount}, styles: ${styleCount}]`,
  );
}
