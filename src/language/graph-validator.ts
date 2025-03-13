import chalk from 'chalk';
import {
  AstNode,
  AstUtils,
  type ValidationAcceptor,
  type ValidationChecks,
  isNamed,
} from 'langium';

import {
  Element,
  Graph,
  GraphAstType,
  GraphTerminals,
  HexColorDefinition,
  Link,
  Model,
  OpacityStyleDefinition,
  RgbColorDefinition,
  ShapeStyleDefinition,
  Style,
  StyleDefinition,
  TextColorDefinition,
  WidthValue,
  isElement,
  isGraph,
  isLink,
  isModel,
  isNode,
  isStyle,
} from './generated/ast.js';
import type { GraphServices } from './graph-module.js';
import {
  ARROWHEADS,
  LENGTH_UNITS,
  NAMED_COLORS,
  NAMED_SHAPES,
  STYLE_TOPICS,
  //StyleDefinition_toString,
} from './model-helpers.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<GraphAstType> = {
    Model: [validator.checkUniqueElementNames, validator.checkStyles],
    Link: [validator.checkLinkStyles],
    Style: [validator.checkStyleNames, validator.checkStyleSubstyles],
    StyleDefinition: [validator.checkStyleDefinitionTopics],
    HexColorDefinition: [validator.checkHexColorDefinitions],
    RgbColorDefinition: [validator.checkRgbColorDefinitions],
    TextColorDefinition: [validator.checkTextColorDefinitions],
    WidthValue: [validator.checkWidthDefinitions],
    OpacityStyleDefinition: [validator.checkOpacityStyleDefinition],
    ShapeStyleDefinition: [validator.checkShapeStyleDefinitions],
  };
  registry.register(checks, validator);
}

// The issue codes can help to select code actions for issues encountered while validating the document
export const IssueCodes = {
  NameMissing: 'name-missing',
  NameDuplicate: 'name-duplicate',
  SrcArrowheadEmpty: 'src-arrowhead-empty',
  SrcArrowheadInvalid: 'src-arrowhead-empty',
  DstArrowheadEmpty: 'dst-arrowhead-empty',
  DstArrowheadInvalid: 'dst-arrowhead-empty',
  SrcArrowheadRedefined: 'src-arrowhead-redefined',
  DstArrowheadRedefined: 'dst-arrowhead-redefined',
  LinkStyleInvalid: 'link-style-invalid',
  StyleAfterElement: 'style-after-element',
  StyleSelfReference: 'style-self-reference',
  StyleMultipleDefinitions: 'style-multiple-definitions',
  StyleDefinitionEmptyTopic: 'style-definition-empty-topic',
  StyleDefinitionUnknownTopic: 'style-definition-missing-topic',
  ShapeNameMissing: 'shape-name-missing',
  ShapeNameUnknown: 'shape-name-unknown',
  ColorNameUnknown: 'color-name-unknown',
  HexColorInvalid: 'hex-color-invalid',
  RgbChannelValueInvalid: 'rgb-channel-value-invalid',
  RgbChannelValueOutOfRange: 'rgb-channel-value-out-of-range',
  LinkWidthHasNoUnit: 'link-width-no-unit',
  LinkWidthValueInvalid: 'link-width-value-invalid',
  LinkWidthUnitUnknown: 'link-width-unit-unknown',
  OpacityValueOutOfRange: 'opacity-value-out-of-range',
  OpacityValueInvalid: 'opacity-value-invalid',
};

/**
 * Implementation of custom validations.
 */
export class GraphValidator {
  /**
   * Verify that Elements have unique names (all nodes and graphs, named edges)
   * @param model
   * @param accept
   */
  checkUniqueElementNames = (model: Model, accept: ValidationAcceptor): void => {
    // Create a set of identifiers while traversing the AST
    // const identifiers = new Set<string>();

    // Map to store names and their corresponding AST nodes
    const nameMap = new Map<string, Element[]>();

    function traverseElement(element: Element): void {
      const preamble = `traverseElement(${element.$type} element (${element.name ?? '<no name>'}))`;
      console.log(chalk.white(`${preamble} - START`));
      // Check for missing name
      if (
        (isNode(element) || isGraph(element)) &&
        (!isNamed(element) || element.name.length == 0)
      ) {
        /*
        console.error(
          chalk.redBright(`${element.$type} must have a nonempty name [${element.$cstNode?.text}]`),
        );
        */
        accept('error', `${element.$type} must have a nonempty name [${element.$cstNode?.text}]`, {
          node: element,
          property: 'name',
          code: IssueCodes.NameMissing,
        });
      }

      // Handle named elements
      if (isNamed(element) && element.name.length > 0) {
        // The element has a name (note: links have an optional name)
        const name = element.name;
        if (!nameMap.has(name)) {
          nameMap.set(name, []);
        }
        nameMap.get(name)?.push(element);
      }

      // Recurse for Graph elements
      if (isGraph(element)) {
        // Recurse
        for (const e of element.elements) {
          traverseElement(e);
        }
      }

      ///console.log(chalk.white(`${preamble} - END`));
    }

    console.log(chalk.whiteBright('checkUniqueElementNames() - START'));

    // Traverse the elements in the model:
    for (const element of model.elements) {
      traverseElement(element);
    }
    // Check for duplicate names and report errors
    nameMap.forEach((elements, name) => {
      if (elements.length > 1) {
        elements.forEach((element) => {
          accept('error', `Duplicate name '${name}'`, {
            node: element,
            property: 'name',
            code: IssueCodes.NameDuplicate,
          });
        });
      }
    });

    // Check Link references against duplicate names
    AstUtils.streamAllContents(model)
      .filter(isLink)
      .forEach((link: Link) => {
        link.src.forEach((ref) => {
          if (nameMap.size > 0 && (nameMap.get(ref.$refText)?.length ?? 0) > 1) {
            accept('error', `Reference to duplicate name '${ref.$refText}' in src`, {
              node: link,
              property: 'src',
              code: IssueCodes.NameDuplicate,
            });
          }
        });
        link.dst.forEach((ref) => {
          if (nameMap.size > 0 && (nameMap.get(ref.$refText)?.length ?? 0) > 1) {
            accept('error', `Reference to duplicate name '${ref.$refText}' in dst`, {
              node: link,
              property: 'dst',
              code: IssueCodes.NameDuplicate,
            });
          }
        });
      });

    ///console.log(chalk.whiteBright('checkUniqueElementNames() - END'));
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
  checkLinkStyles = (link: Link, accept: ValidationAcceptor): void => {
    // Source arrowhead:
    if (link.src_arrowhead !== undefined) {
      if (link.src_arrowhead.length === 0) {
        accept(
          'error',
          'Expecting a source arrowhead style definition after the colon - it cannot be empty.',
          {
            node: link,
            property: 'src_arrowhead',
            code: IssueCodes.SrcArrowheadEmpty,
          },
        );
      } else if (!ARROWHEADS.includes(link.src_arrowhead)) {
        accept('error', `Unknown source arrowhead style definition: '${link.src_arrowhead}'`, {
          node: link,
          property: 'src_arrowhead',
          code: IssueCodes.SrcArrowheadInvalid,
        });
      }
    }
    // Destination arrowhead:
    if (link.dst_arrowhead !== undefined) {
      if (link.dst_arrowhead.length === 0) {
        accept(
          'error',
          'Expecting a destination arrowhead style definition after the colon - it cannot be empty.',
          {
            node: link,
            property: 'dst_arrowhead',
            code: IssueCodes.DstArrowheadEmpty,
          },
        );
      } else if (!ARROWHEADS.includes(link.dst_arrowhead)) {
        accept('error', `Unknown destination arrowhead style definition: '${link.dst_arrowhead}'`, {
          node: link,
          property: 'dst_arrowhead',
          code: IssueCodes.DstArrowheadInvalid,
        });
      }
    }
    // Link style (already captured by grammar) - ensure there are no arrowhead redefinitions in link style:
    if (link.link !== undefined) {
      const match = GraphTerminals.LINK_TYPE.exec(link.link);
      if (match) {
        const src_head: string = match[1]; // ?? '';
        // const line = match[2] ?? ""; -- already checked in the grammar
        const dst_head: string = match[3] ?? '';

        if (link.src_arrowhead !== undefined && src_head.length > 0) {
          accept(
            'error',
            `Redefinition of source arrowhead style definition: ':${link.src_arrowhead}' and '${src_head}'`,
            {
              node: link,
              property: 'link',
              code: IssueCodes.SrcArrowheadRedefined,
            },
          );
        }
        if (link.dst_arrowhead !== undefined && dst_head.length > 0) {
          accept(
            'error',
            `Redefinition of destination arrowhead style definition: ':${link.dst_arrowhead}' and '${dst_head}'`,
            {
              node: link,
              property: 'link',
              code: IssueCodes.DstArrowheadRedefined,
            },
          );
        }
      } else {
        accept('error', `Invalid link style definition: ':${link.link}'`, {
          node: link,
          property: 'link',
          code: IssueCodes.LinkStyleInvalid,
        });
      }
    }
  };
  checkStyles = (model: Model, accept: ValidationAcceptor): void => {
    console.info(chalk.cyanBright('checkStyles(model)'));

    // Check that style definitions appear before Element definitions
    check_styles_defined_before_elements(model, accept);

    // Traverse the model top-down) and store the graph nodes and their levels:
    const style_dict: _find_style_dict[] = find_styles(model, 0, 0, accept);
    /*
    for (const item of style_dict) { // DEBUG LOG
      console.info(
        chalk.cyan(
          `checkStyles(model): ${item.containerID} - ${item.level} : Style '${item.style.name}' : [ ${StyleDefinition_toString(item.style.definition.items)} ]`,
        ),
      );
    }
    */

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
          for (const duplicate_style_definition of d[container_id][style_name]) {
            /*
            console.warn(
              chalk.red(
                `Error: Multiple style definitions with name '${style_name}' at the same level should be merged. Found: ${StyleDefinition_toString(duplicate_style_definition.definition.items)}`,
              ),
            );
            */
            accept(
              'error',
              `Found multiple style definitions with the same name '${style_name}' at the same level.`,
              {
                node: duplicate_style_definition,
                property: 'name',
                code: IssueCodes.StyleMultipleDefinitions,
              },
            );
          }
        }
      }
    }
  };
  checkStyleNames = (style: Style, accept: ValidationAcceptor) => {
    if (!isNamed(style) || style.name.length == 0) {
      /*
      console.error(
        chalk.redBright(`ERROR: checkStyleNames() - style has no name: [${style.$cstNode?.text}]`),
      );
      */
      accept('error', 'A style must have a nonempty name.', {
        node: style,
        property: 'name',
        code: IssueCodes.NameMissing,
      });
    }
  };
  checkStyleDefinitionTopics = (shape_definition: StyleDefinition, accept: ValidationAcceptor) => {
    const topic = shape_definition.topic;
    if (topic.length == 0) {
      accept('error', `Style topic missing.`, {
        node: shape_definition,
        property: 'topic',
        code: IssueCodes.StyleDefinitionEmptyTopic,
      });
    } else if (!STYLE_TOPICS.includes(topic)) {
      accept('error', `The style topic '${topic}' is not recognized.`, {
        node: shape_definition,
        property: 'topic',
        code: IssueCodes.StyleDefinitionUnknownTopic,
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
      accept('error', `Shape name missing.`, {
        node: shape_definition,
        property: 'value',
        code: IssueCodes.ShapeNameMissing,
      });
    } else if (!NAMED_SHAPES.includes(value)) {
      accept('error', `The shape '${shape_definition.value}' is not recognized.`, {
        node: shape_definition,
        property: 'value',
        code: IssueCodes.ShapeNameUnknown,
      });
    }
  };
  checkStyleSubstyles = (style: Style, accept: ValidationAcceptor) => {
    if (isNamed(style) && style.name.length > 0 && style.name == style.styleref?.$refText) {
      accept(
        'error',
        `Style '${style.name}' cannot refer to itself. Please remove ":${style.styleref.$refText}"`,
        {
          node: style,
          property: 'styleref',
          code: IssueCodes.StyleSelfReference,
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
        'error',
        `The color '${color_definition.color_name}' is not defined. Please use a CSS named color.`,
        {
          node: color_definition,
          property: 'color_name',
          code: IssueCodes.ColorNameUnknown,
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
    /*
    console.info(
      chalk.cyanBright(
        `checkHexColorDefinitions(${hex_color_definition.$cstNode?.text}): hex_color='${hex_color_definition.hex_color}' (length=${code_length})}`,
      ),
    );
    */
    if (![4, 7].includes(code_length)) {
      /*
      console.warn(
        chalk.red(
          `Error: invalid hexadecimal color code '${hex_color_definition.hex_color}' (expecting '#' plus 3 or 6 hexadecimal digits, found ${code_length - 1}).`,
        ),
      );
      */
      accept(
        'error',
        `Error: invalid hexadecimal color code '${hex_color_definition.hex_color}' (expecting '#' plus 3 or 6 hexadecimal digits, found ${code_length - 1}).`,
        {
          node: hex_color_definition,
          property: 'hex_color',
          code: IssueCodes.HexColorInvalid,
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
      accept('error', `RGB color value for red is not an integer: '${red}'`, {
        node: rgb_color_definition,
        property: 'red',
        code: IssueCodes.RgbChannelValueInvalid,
      });
    } else {
      if (red < 0 || red > 255) {
        accept(
          'error',
          `RGB color value for red out of range: '${red}' (expecting an integer value (0 ≤ red ≤ 255)`,
          {
            node: rgb_color_definition,
            property: 'red',
            code: IssueCodes.RgbChannelValueOutOfRange,
          },
        );
      }
    }

    // Check green:
    const green = rgb_color_definition.green;
    if (!Number.isInteger(green)) {
      accept('error', `RGB color value for green is not an integer: '${green}'`, {
        node: rgb_color_definition,
        property: 'green',
        code: IssueCodes.RgbChannelValueInvalid,
      });
    } else {
      if (green < 0 || green > 255) {
        accept(
          'error',
          `RGB color value for green out of range: '${green}' (expecting an integer value (0 ≤ green ≤ 255)`,
          {
            node: rgb_color_definition,
            property: 'green',
            code: IssueCodes.RgbChannelValueOutOfRange,
          },
        );
      }
    }

    // Check blue:
    const blue = rgb_color_definition.blue;
    if (!Number.isInteger(blue)) {
      accept('error', `RGB color value for blue is not an integer: '${blue}'`, {
        node: rgb_color_definition,
        property: 'blue',
        code: IssueCodes.RgbChannelValueInvalid,
      });
    } else {
      if (blue < 0 || blue > 255) {
        accept(
          'error',
          `RGB color value for blue out of range: '${blue}' (expecting an integer value (0 ≤ blue ≤ 255)`,
          {
            node: rgb_color_definition,
            property: 'blue',
            code: IssueCodes.RgbChannelValueOutOfRange,
          },
        );
      }
    }
  };
  /**
   * Check that the line style definitions are valid (number + valid unit)
   * @param width_definition
   * @param accept
   */
  checkWidthDefinitions = (width_value: WidthValue, accept: ValidationAcceptor): void => {
    if (width_value.value < 0) {
      console.error(chalk.red(`Width has invalid numeric value: '${width_value.value}'.`));
      accept('error', `Width has invalid numeric value: '${width_value.value}'.`, {
        node: width_value,
        property: 'value',
        code: IssueCodes.LinkWidthValueInvalid,
      });
    }
    if (!('unit' in width_value) || width_value.unit?.length == 0) {
      accept(
        'warning',
        `Width has no unit. The default unit will be used in conversions. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
        {
          node: width_value,
          property: undefined, // there is no "unit"
          code: IssueCodes.LinkWidthHasNoUnit,
        },
      );
    } else {
      if ((width_value.unit?.length ?? 0) > 0 && !LENGTH_UNITS.includes(width_value.unit ?? '')) {
        /*
        console.error(
          `Width has invalid unit: '${width_value.unit}'. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
        );
        */
        accept(
          'error',
          `Width has invalid unit: '${width_value.unit}'. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
          {
            node: width_value,
            property: 'unit',
            code: IssueCodes.LinkWidthUnitUnknown,
          },
        );
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
          ///console.error(`Link opacity value out of range (0% - 100%): found '${opacity}%'`);
          accept('error', `Link opacity value out of range (0% - 100%): found '${opacity}%'`, {
            node: opacity_style_item,
            property: 'value',
            code: IssueCodes.OpacityValueOutOfRange,
          });
        }
      } else {
        ///console.error(`Expecting integer percentage value: found '${opacity}%'`);
        accept('error', `Expecting integer percentage value: found '${opacity}%'`, {
          node: opacity_style_item,
          property: 'value',
          code: IssueCodes.OpacityValueInvalid,
        });
      }
    } else {
      // Opacity as float value (0--1)
      if (opacity < 0.0 || opacity > 1.0) {
        // Out of bounds (one)
        ///console.error(`Link opacity value out of range (0...1): found '${opacity}'`);
        accept('error', `Link opacity value out of range (0...1): found '${opacity}'`, {
          node: opacity_style_item,
          property: 'value',
          code: IssueCodes.OpacityValueOutOfRange,
        });
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
      containerID: `${seq}::` + (isModel(container) === true ? '' : container.name),
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
  ///console.debug(`${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) - START`);
  let elementCount = 0; ///, styleCount = 0;
  for (const childNode of AstUtils.streamContents(node)) {
    // Check that all Style nodes appear before Element nodes
    if (isElement(childNode)) {
      elementCount++;
      /***
       console.debug(
        `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) [elements: ${elementCount}, styles: ${styleCount}] - process Element node #${elementCount} of type '${childNode.$type}' ${childNode.name === undefined ? '' : ` with name '${childNode.name}'`}`,
      );
      ***/
      if (isGraph(childNode)) {
        // recurse
        /***
        console.debug(
          `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) -- BEGIN recursion`,
        );
        ***/
        check_styles_defined_before_elements(childNode, accept, level + 1);
        /***
        console.debug(
          `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) -- END recursion`,
        );
        ***/
      }
    } else if (isStyle(childNode)) {
      /***
      styleCount++;
      console.debug(
        `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) [elements: ${elementCount}, styles: ${styleCount}] - process Style node #${styleCount} with name '${childNode.name}'`,
      );
      ***/

      if (elementCount > 0) {
        /***
        console.error(
          chalk.red(
            `Style definitions must appear before any graph elements. Found ${elementCount} graph element(s) so far.`,
          ),
        );
        ***/
        accept('error', 'Style definitions must appear before any graph elements.', {
          node: childNode,
          code: IssueCodes.StyleAfterElement,
        });
      }
    }
  }
  /***
  console.debug(
    `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) - END -  [elements: ${elementCount}, styles: ${styleCount}]`,
  );
  ***/
}
