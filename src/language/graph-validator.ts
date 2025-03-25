import {
  AstNode,
  AstUtils,
  CstUtils,
  type ValidationAcceptor,
  type ValidationChecks,
  isLeafCstNode,
  isNamed,
} from 'langium';

import * as ast from './generated/ast.js';
import type { GraphServices } from './graph-module.js';
import { groupAdjacentArrayIndexes, isCommentCstNode } from './model-helpers.js';
import {
  ARROWHEADS,
  LENGTH_UNITS,
  NAMED_COLORS,
  NAMED_SHAPES,
  STYLE_TOPICS,
  //StyleDefinition_toString,
} from './model-helpers.js';

/**
 * Registers custom validation checks for the Graph language.
 *
 * This function registers a collection of validation checks on the Graph AST.
 * Each check is associated with one or more AST node types. The registered checks
 * will be executed during document validation.
 *
 * @param services The Graph language services.
 */
export function registerValidationChecks(services: GraphServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.GraphValidator;
  const checks: ValidationChecks<ast.GraphAstType> = {
    Model: [validator.checkUniqueElementNames, validator.checkStyles],
    Element: [validator.checkStyleRef],
    Link: [validator.checkLinkStyles],
    Style: [validator.checkStyleNames, validator.checkStyleSubstyles],
    ElementAlias: [validator.checkStyleRef],
    StyleBlock: [validator.checkSpuriousSemicolons],
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

/**
 * Issue codes are used to classify validation problems.
 * They help to link diagnostics with potential code actions.
 */
export const IssueCode = {
  NameMissing: 'name-missing',
  NameDuplicate: 'name-duplicate',
  SrcArrowheadEmpty: 'src-arrowhead-empty',
  SrcArrowheadInvalid: 'src-arrowhead-invalid',
  DstArrowheadEmpty: 'dst-arrowhead-empty',
  DstArrowheadInvalid: 'dst-arrowhead-invalid',
  SrcArrowheadRedefined: 'src-arrowhead-redefined',
  DstArrowheadRedefined: 'dst-arrowhead-redefined',
  LinkStyleInvalid: 'link-style-invalid',
  StyleAfterElement: 'style-after-element',
  StyleSelfReference: 'style-self-reference',
  StyleMultipleDefinitions: 'style-multiple-definitions',
  StyleDefinitionEmptyTopic: 'style-definition-empty-topic',
  StyleDefinitionUnknownTopic: 'style-definition-unknown-topic',
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
  StyleRefNotFound: 'style-ref-not-found',
  StyleRefMissing: 'style-ref-missing',
  SpuriousSemicolonDelete: 'styleblock-spurious-semicolon-delete',
};

/**
 * GraphValidator implements custom validation checks for the Graph language.
 *
 * This class contains methods to validate various aspects of a Graph document.
 * The validations cover:
 *
 * - Uniqueness of element names across nodes and graphs.
 * - Correctness of style references.
 * - Validity of link style definitions, including arrowhead specifications.
 * - Ordering of style definitions relative to graph elements.
 * - Validity of style topics, color definitions, width values, and opacity values.
 * - Detection of spurious semicolons in StyleBlock nodes.
 *
 * Each method accepts a target AST node and a callback function (accept) which
 * is used to report validation errors or warnings along with associated issue codes.
 */
export class GraphValidator {
  /**
   * Validates that all Elements in the model have unique names.
   * For nodes and graphs, a missing or duplicate name is reported.
   *
   * @param model The Model node containing the document's elements.
   * @param accept The callback to report validation issues.
   */
  checkUniqueElementNames = (model: ast.Model, accept: ValidationAcceptor): void => {
    // Map to store names and their corresponding AST nodes
    const nameMap = new Map<string, ast.Element[]>();

    function traverseElement(element: ast.Element): void {
      //const preamble = `traverseElement(${element.$type} element (${element.name ?? '<no name>'}))`;
      //console.log(chalk.white(`${preamble} - START`));

      // Report error if a Node or Graph has an empty name.
      if (
        (ast.isNode(element) || ast.isGraph(element)) &&
        (!isNamed(element) || element.name.length == 0)
      ) {
        accept('error', `${element.$type} must have a nonempty name [${element.$cstNode?.text}]`, {
          node: element,
          property: 'name',
          code: IssueCode.NameMissing,
        });
      }

      // Record the name for duplicate detection.
      if (isNamed(element) && element.name.length > 0) {
        // The element has a name (note: links have an optional name)
        const name = element.name;
        if (!nameMap.has(name)) {
          nameMap.set(name, []);
        }
        nameMap.get(name)?.push(element);
      }

      // Recurse into Graph elements.
      if (ast.isGraph(element)) {
        for (const e of element.elements) {
          traverseElement(e);
        }
      }
    }

    //console.log(chalk.whiteBright('checkUniqueElementNames() - START'));

    // Traverse the elements in the model:
    for (const element of model.elements) {
      traverseElement(element);
    }

    // Report duplicate names.
    nameMap.forEach((elements, name) => {
      if (elements.length > 1) {
        elements.forEach((element) => {
          accept('error', `Duplicate name '${name}'`, {
            node: element,
            property: 'name',
            code: IssueCode.NameDuplicate,
          });
        });
      }
    });

    // Validate link references against duplicate names.
    AstUtils.streamAllContents(model)
      .filter(ast.isLink)
      .forEach((link: ast.Link) => {
        link.src.forEach((ref) => {
          if ((nameMap.get(ref.$refText)?.length ?? 0) > 1) {
            accept('error', `Reference to duplicate name '${ref.$refText}' in src`, {
              node: link,
              property: 'src',
              code: IssueCode.NameDuplicate,
            });
          }
        });
        link.dst.forEach((ref) => {
          if ((nameMap.get(ref.$refText)?.length ?? 0) > 1) {
            accept('error', `Reference to duplicate name '${ref.$refText}' in dst`, {
              node: link,
              property: 'dst',
              code: IssueCode.NameDuplicate,
            });
          }
        });
      });
  };
  /**
   * Validates that the style reference (styleref) on an Element or ElementAlias resolves to a valid Style.
   *
   * This check ensures that a style reference is not empty, is resolvable, and that the referenced
   * node is of type Style.
   *
   * @param node The Element or ElementAlias to validate.
   * @param accept The callback to report validation issues.
   */
  checkStyleRef = (node: ast.Element | ast.ElementAlias, accept: ValidationAcceptor): void => {
    /*
    console.log(
      `checkStyleRef() called for ${node.$type}${isNamed(node) ? ` "${node.name}"` : '(unnamed)'} - Style reference '${node.styleref?.$refText}' (${node.styleref?.ref?.$cstNode?.astNode.$type ?? '<undefined>'})`,
    );
    */
    if (node.styleref) {
      if (node.styleref.$refText.length === 0) {
        accept('error', `Style reference missing after the ':' token.`, {
          node,
          property: 'styleref',
          code: IssueCode.StyleRefMissing,
        });
      } else if (!node.styleref.ref) {
        accept('error', `Style reference '${node.styleref.$refText}' not found.`, {
          node,
          property: 'styleref',
          code: IssueCode.StyleRefNotFound,
        });
      } else if (!ast.isStyle(node.styleref.ref.$cstNode?.astNode)) {
        accept(
          'error',
          `Style reference '${node.styleref.$refText}' is not a reference to a Style (found ${node.styleref.ref.$cstNode?.astNode.$type ?? '<undefined>'}).`,
          {
            node,
            property: 'styleref',
            code: IssueCode.StyleRefNotFound,
          },
        );
      }
    }
  };
  /**
   * Validates that the Link node's arrowhead and link style definitions are correct.
   *
   * Checks for:
   * - Missing or empty arrowhead definitions.
   * - Unknown arrowhead values.
   * - Conflicts between the arrowhead defined in the link and that inferred from the link style.
   *
   * @param link The Link node to validate.
   * @param accept The callback to report validation issues.
   */
  checkLinkStyles = (link: ast.Link, accept: ValidationAcceptor): void => {
    // Validate source arrowhead.
    if (link.src_arrowhead !== undefined) {
      if (link.src_arrowhead.length === 0) {
        accept(
          'error',
          'Expecting a source arrowhead style definition after the colon - it cannot be empty.',
          {
            node: link,
            property: 'src_arrowhead',
            code: IssueCode.SrcArrowheadEmpty,
          },
        );
      } else if (!ARROWHEADS.includes(link.src_arrowhead)) {
        accept('error', `Unknown source arrowhead style definition: '${link.src_arrowhead}'`, {
          node: link,
          property: 'src_arrowhead',
          code: IssueCode.SrcArrowheadInvalid,
        });
      }
    }
    // Validate destination arrowhead.
    if (link.dst_arrowhead !== undefined) {
      if (link.dst_arrowhead.length === 0) {
        accept(
          'error',
          'Expecting a destination arrowhead style definition after the colon - it cannot be empty.',
          {
            node: link,
            property: 'dst_arrowhead',
            code: IssueCode.DstArrowheadEmpty,
          },
        );
      } else if (!ARROWHEADS.includes(link.dst_arrowhead)) {
        accept('error', `Unknown destination arrowhead style definition: '${link.dst_arrowhead}'`, {
          node: link,
          property: 'dst_arrowhead',
          code: IssueCode.DstArrowheadInvalid,
        });
      }
    }
    // Link style (already captured by grammar) - ensure there are no arrowhead redefinitions in link style:
    if (link.link !== undefined) {
      const match = ast.GraphTerminals.LINK_CONNECTOR.exec(link.link);
      if (match) {
        // ESLint Bug: match[i] can be undefined!
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const src_head: string = match[1] ?? '';
        // const line = match[2] ?? ""; -- already checked in the grammar
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const dst_head: string = match[3] ?? '';

        if (link.src_arrowhead !== undefined && src_head.length > 0) {
          accept(
            'error',
            `Redefinition of source arrowhead: ':${link.src_arrowhead}' conflicts with '${src_head}'`,
            {
              node: link,
              property: 'link',
              code: IssueCode.SrcArrowheadRedefined,
            },
          );
        }
        if (link.dst_arrowhead !== undefined && dst_head.length > 0) {
          accept(
            'error',
            `Redefinition of destination arrowhead: ':${link.dst_arrowhead}' conflicts with '${dst_head}'`,
            {
              node: link,
              property: 'link',
              code: IssueCode.DstArrowheadRedefined,
            },
          );
        }
      } else {
        accept('error', `Invalid link style definition: ':${link.link}'`, {
          node: link,
          property: 'link',
          code: IssueCode.LinkStyleInvalid,
        });
      }
    }
  };
  /**
   * Validates the order and uniqueness of style definitions within the model.
   *
   * Ensures that:
   * - Style definitions appear before any graph elements.
   * - No duplicate style definitions exist at the same hierarchy level.
   *
   * @param model The Model node containing styles and elements.
   * @param accept The callback to report validation issues.
   */
  checkStyles = (model: ast.Model, accept: ValidationAcceptor): void => {
    //console.info(chalk.cyanBright('checkStyles(model)'));

    // Ensure all style definitions precede element definitions.
    check_styles_defined_before_elements(model, accept);

    // Collect style definitions along with their hierarchy level.
    const style_dict: _find_style_dict[] = find_styles(model, 0, 0, accept);

    // Group style definitions by container and check for duplicates.
    const d: Record<string, Record<string, ast.Style[]>> = {};
    for (const item of style_dict) {
      if (!(item.containerID in d)) {
        d[item.containerID] = {};
      }
      if (!(item.style.name in d[item.containerID])) {
        d[item.containerID][item.style.name] = [];
      }
      d[item.containerID][item.style.name].push(item.style);
    }

    // Report duplicate style names.
    for (const container_id in d) {
      // Count occurrences of style name
      for (const style_name in d[container_id]) {
        if (d[container_id][style_name].length > 1) {
          // Multiple Style definitions with same name: issue warning
          d[container_id][style_name].forEach((duplicateStyleDefinition) => {
            accept(
              'error',
              `Multiple style definitions with name '${style_name}' at the same level.`,
              {
                node: duplicateStyleDefinition,
                property: 'name',
                code: IssueCode.StyleMultipleDefinitions,
              },
            );
          });
        }
      }
    }
  };
  /**
   * Validates that a Style node has a nonempty name.
   *
   * @param style The Style node to validate.
   * @param accept The callback to report validation issues.
   */
  checkStyleNames = (style: ast.Style, accept: ValidationAcceptor): void => {
    if (!isNamed(style) || style.name.length === 0) {
      accept('error', 'A style must have a nonempty name.', {
        node: style,
        property: 'name',
        code: IssueCode.NameMissing,
      });
    }
  };
  /**
   * Validates the topic of a StyleDefinition.
   *
   * Ensures that a topic is provided and that it is recognized.
   *
   * @param styleDefinition The StyleDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkStyleDefinitionTopics = (
    styleDefinition: ast.StyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const topic = styleDefinition.topic;
    if (topic.length === 0) {
      accept('error', 'Style topic missing.', {
        node: styleDefinition,
        property: 'topic',
        code: IssueCode.StyleDefinitionEmptyTopic,
      });
    } else if (!STYLE_TOPICS.includes(topic)) {
      accept('error', `The style topic '${topic}' is not recognized.`, {
        node: styleDefinition,
        property: 'topic',
        code: IssueCode.StyleDefinitionUnknownTopic,
      });
    }
  };
  /**
   * Validates that the shape name in a ShapeStyleDefinition is provided and recognized.
   *
   * @param shapeDefinition The ShapeStyleDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkShapeStyleDefinitions = (
    shapeDefinition: ast.ShapeStyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = shapeDefinition.value.toLowerCase();
    if (value.length === 0) {
      accept('error', 'Shape name missing.', {
        node: shapeDefinition,
        property: 'value',
        code: IssueCode.ShapeNameMissing,
      });
    } else if (!NAMED_SHAPES.includes(value)) {
      accept('error', `The shape '${shapeDefinition.value}' is not recognized.`, {
        node: shapeDefinition,
        property: 'value',
        code: IssueCode.ShapeNameUnknown,
      });
    }
  };
  /**
   * Validates that a Style does not reference itself.
   *
   * @param style The Style node to validate.
   * @param accept The callback to report validation issues.
   */
  checkStyleSubstyles = (style: ast.Style, accept: ValidationAcceptor): void => {
    if (isNamed(style) && style.name.length > 0 && style.name === style.styleref?.$refText) {
      accept(
        'error',
        `Style '${style.name}' cannot reference itself. Please remove ":${style.styleref.$refText}"`,
        {
          node: style,
          property: 'styleref',
          code: IssueCode.StyleSelfReference,
        },
      );
    }
  };
  /**
   * Validates that the color name in a TextColorDefinition is recognized.
   *
   * @param colorDefinition The TextColorDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkTextColorDefinitions = (
    colorDefinition: ast.TextColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = colorDefinition.color_name.toLowerCase();
    if (!NAMED_COLORS.includes(value)) {
      accept(
        'error',
        `The color '${colorDefinition.color_name}' is not defined. Please use a CSS named color.`,
        {
          node: colorDefinition,
          property: 'color_name',
          code: IssueCode.ColorNameUnknown,
        },
      );
    }
  };
  /**
   * Validates that a hexadecimal color code in a HexColorDefinition is valid.
   *
   * The code must start with '#' and be followed by either 3 or 6 hexadecimal digits.
   *
   * @param hexColorDefinition The HexColorDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkHexColorDefinitions = (
    hexColorDefinition: ast.HexColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const codeLength = hexColorDefinition.hex_color.length;
    if (![4, 7].includes(codeLength)) {
      accept(
        'error',
        `Invalid hexadecimal color code '${hexColorDefinition.hex_color}' (expected '#' plus 3 or 6 hex digits, found ${codeLength - 1}).`,
        {
          node: hexColorDefinition,
          property: 'hex_color',
          code: IssueCode.HexColorInvalid,
        },
      );
    }
  };
  /**
   * Validates that RGB color definitions have integer channel values within 0–255.
   *
   * Checks the red, green, and blue channel values for type and range.
   *
   * @param rgbColorDefinition The RgbColorDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkRgbColorDefinitions = (
    rgbColorDefinition: ast.RgbColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    enum ColorChannel {
      Red = 'red',
      Green = 'green',
      Blue = 'blue',
    }

    const checkChannel = (channel: number, channelName: ColorChannel) => {
      if (!Number.isInteger(channel)) {
        accept('error', `RGB channel value for ${channelName} is not an integer: '${channel}'`, {
          node: rgbColorDefinition,
          property: channelName,
          code: IssueCode.RgbChannelValueInvalid,
        });
      } else if (channel < 0 || channel > 255) {
        accept(
          'error',
          `RGB channel value for ${channelName} out of range (0 - 255): '${channel}'`,
          {
            node: rgbColorDefinition,
            property: channelName,
            code: IssueCode.RgbChannelValueOutOfRange,
          },
        );
      }
    };

    checkChannel(rgbColorDefinition.red, ColorChannel.Red);
    checkChannel(rgbColorDefinition.green, ColorChannel.Green);
    checkChannel(rgbColorDefinition.blue, ColorChannel.Blue);
  };
  /**
   * Validates that a WidthValue has a valid numeric value and an allowed unit.
   *
   * If the unit is missing, a warning is issued. If the unit is invalid, an error is reported.
   *
   * @param widthValue The WidthValue to validate.
   * @param accept The callback to report validation issues.
   */
  checkWidthDefinitions = (widthValue: ast.WidthValue, accept: ValidationAcceptor): void => {
    if (widthValue.value < 0) {
      accept('error', `Invalid width value: '${widthValue.value}'.`, {
        node: widthValue,
        property: 'value',
        code: IssueCode.LinkWidthValueInvalid,
      });
    }
    if (!('unit' in widthValue) || widthValue.unit?.length === 0) {
      accept(
        'warning',
        `Width is missing a unit. The default unit will be used in conversions. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
        {
          node: widthValue,
          property: undefined, // there is no "unit"
          code: IssueCode.LinkWidthHasNoUnit,
        },
      );
    } else if (!LENGTH_UNITS.includes(widthValue.unit ?? '')) {
      accept(
        'error',
        `Invalid width unit '${widthValue.unit}'. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
        {
          node: widthValue,
          property: 'unit',
          code: IssueCode.LinkWidthUnitUnknown,
        },
      );
    }
  };
  /**
   * Validates the opacity value in an OpacityStyleDefinition.
   *
   * Checks whether the opacity is specified as a percentage (integer 0–100) or a float (0–1)
   * and validates its range accordingly.
   *
   * @param opacityStyle The OpacityStyleDefinition to validate.
   * @param accept The callback to report validation issues.
   */
  checkOpacityStyleDefinition = (
    opacityStyleDefinition: ast.OpacityStyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = opacityStyleDefinition.value;
    const opacity: number = value.opacity;
    if (value.isPct === true) {
      // Opacity as integer percentage value (0--100)
      if (Number.isInteger(opacity)) {
        if (opacity < 0 || opacity > 100) {
          accept('error', `Opacity percentage out of range (0% - 100%): '${opacity}%'`, {
            node: opacityStyleDefinition,
            property: 'value',
            code: IssueCode.OpacityValueOutOfRange,
          });
        }
      } else {
        accept('error', `Expected integer percentage value for opacity, found '${opacity}%'`, {
          node: opacityStyleDefinition,
          property: 'value',
          code: IssueCode.OpacityValueInvalid,
        });
      }
    } else {
      // Opacity as float value (0--1)
      if (opacity < 0.0 || opacity > 1.0) {
        accept('error', `Opacity value out of range (0.0 - 1.0): '${opacity}'`, {
          node: opacityStyleDefinition,
          property: 'value',
          code: IssueCode.OpacityValueOutOfRange,
        });
      }
    }
  };
  /**
   * Validates spurious semicolons in a StyleBlock.
   *
   * This function examines the direct child CST nodes of a StyleBlock and reports diagnostics for:
   * - Leading semicolons (before the first StyleDefinition).
   * - Redundant semicolons between StyleDefinition nodes.
   * - Trailing semicolons (after the last StyleDefinition).
   *
   * The ranges for diagnostics are computed by grouping adjacent semicolon tokens,
   * skipping over hidden comment nodes.
   *
   * @param styleBlock The StyleBlock node to validate.
   * @param accept The callback to report validation issues.
   */
  checkSpuriousSemicolons = (styleBlock: ast.StyleBlock, accept: ValidationAcceptor): void => {
    const cstNode = styleBlock.$cstNode;
    if (!cstNode) {
      return;
    }

    // Define an enum to classify direct child CST nodes.
    enum NodeType {
      Other = 0,
      Semi = 1,
      Comment = 2,
      StyleDefinition = 3,
    }
    // Process only the direct child nodes of the StyleBlock.
    const directChildren = CstUtils.streamCst(cstNode)
      .filter((child) => CstUtils.isChildNode(child, cstNode))
      .map((node) => {
        // For leaf nodes, if it’s a comment, mark it as Comment;
        // if its text is ';', mark as Semi; otherwise Other.
        // For non-leaf nodes, if the AST node is a StyleDefinition, mark it accordingly.
        const nodeType = isLeafCstNode(node)
          ? isCommentCstNode(node)
            ? NodeType.Comment
            : node.text === ';'
              ? NodeType.Semi
              : NodeType.Other
          : ast.isStyleDefinition(node.astNode)
            ? NodeType.StyleDefinition
            : NodeType.Other;
        return {
          cstNode: node,
          nodeType,
        };
      })
      .filter((item) => item.nodeType !== NodeType.Other)
      .toArray();

    // Extract indexes of semicolon and StyleDefinition nodes.
    const semis: number[] = [];
    const defs: number[] = [];
    directChildren.forEach((child, index) => {
      if (child.nodeType === NodeType.Semi) {
        semis.push(index);
      } else if (child.nodeType === NodeType.StyleDefinition) {
        defs.push(index);
      }
    });

    if (semis.length === 0) {
      // Nothing to do
      return;
    }

    // Case 1: For 0 or 1 StyleDefinition, all semicolons should be deleted.
    if (defs.length <= 1) {
      // Merge ranges of consecutive semicolon nodes into one
      groupAdjacentArrayIndexes(semis).forEach(([start, end]) => {
        accept('warning', 'Spurious semicolon(s) in empty StyleBlock.', {
          node: styleBlock,
          code: IssueCode.SpuriousSemicolonDelete,
          range: {
            start: directChildren[start].cstNode.range.start,
            end: directChildren[end].cstNode.range.end,
          },
        });
      });
    } else {
      // Case 2: For multiple StyleDefinition nodes, check semicolons before, between, and after definitions.
      const firstDefIndex = defs[0];
      const lastDefIndex = defs[defs.length - 1];

      // Semicolons before first and after last StyleDefinition nodes
      groupAdjacentArrayIndexes(semis.filter((i) => i < firstDefIndex || i > lastDefIndex)).forEach(
        ([start, end]) => {
          accept(
            'warning',
            `Spurious semicolon(s) ${end < firstDefIndex ? 'before first' : 'after last'} StyleDefinition.`,
            {
              node: styleBlock,
              code: IssueCode.SpuriousSemicolonDelete,
              range: {
                start: directChildren[start].cstNode.range.start,
                end: directChildren[end].cstNode.range.end,
              },
            },
          );
        },
      );

      // Semicolons between adjacent StyleDefinitions: keep the first, delete extras.
      for (let j = 0; j < defs.length - 1; j++) {
        const semisBetween = semis.filter((i) => i > defs[j] && i < defs[j + 1]);
        // Keep the first semicolon; the rest are redundant.
        const redundant = semisBetween.slice(1);
        if (redundant.length > 0) {
          groupAdjacentArrayIndexes(redundant).forEach(([start, end]) => {
            accept(
              'warning',
              `Excess ${end - start > 0 ? 'semicolons' : 'semicolon'} between Style Definitions.`,
              {
                node: styleBlock,
                code: IssueCode.SpuriousSemicolonDelete,
                range: {
                  start: directChildren[start].cstNode.range.start,
                  end: directChildren[end].cstNode.range.end,
                },
              },
            );
          });
        }
      }
    }
  };
}

interface _find_style_dict {
  level: number;
  containerID: string;
  style: ast.Style;
}

/**
 * Recursively finds all style definitions within the given container (Model or Graph),
 * along with their hierarchy level and container identifier.
 *
 * @param container The Model or Graph node to search.
 * @param level The current hierarchy level.
 * @param seq A sequence number for container identification.
 * @param accept The validation acceptor (unused in this function but available for extensions).
 * @returns An array of objects each containing a style, its level, and its container ID.
 */
function find_styles(
  container: ast.Model | ast.Graph,
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
      containerID: `${seq}::` + (ast.isModel(container) === true ? '' : container.name),
      style,
    });
  }
  // Traverse the graph elements recursively for styles:
  for (const graph of container.elements.filter((e) => ast.isGraph(e))) {
    style_dict.push(...find_styles(graph, level + 1, seq + 1, accept));
  }
  return style_dict;
}

/**
 * Checks that all Style nodes appear before any graph elements in the document.
 *
 * This function traverses the AST and ensures that no Style node appears after an Element.
 * If a Style is found after an Element, an error is reported.
 *
 * @param node The root AST node.
 * @param accept The validation acceptor callback.
 * @param level The current recursion level (for logging purposes).
 */
function check_styles_defined_before_elements(
  node: AstNode,
  accept: ValidationAcceptor,
  level = 0,
) {
  ///console.debug(`${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) - START`);
  let elementCount = 0; ///, styleCount = 0;
  for (const childNode of AstUtils.streamContents(node)) {
    // Check that all Style nodes appear before Element nodes
    if (ast.isElement(childNode)) {
      elementCount++;
      /***
       console.debug(
        `${'  '.repeat(level)}check_styles_defined_before_elements(${node.$type}) [elements: ${elementCount}, styles: ${styleCount}] - process Element node #${elementCount} of type '${childNode.$type}' ${childNode.name === undefined ? '' : ` with name '${childNode.name}'`}`,
      );
      ***/
      if (ast.isGraph(childNode)) {
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
    } else if (ast.isStyle(childNode)) {
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
          code: IssueCode.StyleAfterElement,
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
