import chalk from 'chalk';
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
import { isCommentCstNode } from './lsp/lsp-util.js';
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
 * The checks are organized by AST node type. When the model is validated,
 * the corresponding functions in GraphValidator will be executed.
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
    NodeAlias: [validator.checkStyleRef],
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
 * Issue codes for validation diagnostics.
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
 * Each method in this class performs a specific validation on AST or CST nodes.
 * When a problem is found, the provided ValidationAcceptor is called to report
 * an error or warning, along with the node, property, and issue code.
 */
export class GraphValidator {
  /**
   * Checks that all Elements (e.g. Nodes, Graphs, and named edges) have unique names.
   *
   * This function traverses the Model's AST, collecting names and reporting diagnostics
   * for missing names and duplicate names.
   *
   * @param model The Model node.
   * @param accept The validation acceptor callback.
   */
  checkUniqueElementNames = (model: ast.Model, accept: ValidationAcceptor): void => {
    // Map to store names and their corresponding AST nodes
    const nameMap = new Map<string, ast.Element[]>();

    function traverseElement(element: ast.Element): void {
      const preamble = `traverseElement(${element.$type} element (${element.name ?? '<no name>'}))`;
      console.log(chalk.white(`${preamble} - START`));

      // Report error if a Node or Graph has an empty name.
      if (
        (ast.isNode(element) || ast.isGraph(element)) &&
        (!isNamed(element) || element.name.length === 0)
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

    console.log(chalk.whiteBright('checkUniqueElementNames() - START'));

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
   * Validates that the style reference (styleref) on an Element or NodeAlias resolves to a valid Style.
   *
   * This check ensures that a style reference is not empty, is resolvable, and that the referenced
   * node is of type Style.
   *
   * @param node The Element or NodeAlias node.
   * @param accept The validation acceptor callback.
   */
  checkStyleRef = (node: ast.Element | ast.NodeAlias, accept: ValidationAcceptor): void => {
    console.log(
      `checkStyleRef() called for ${node.$type}${isNamed(node) ? ` "${node.name}"` : '(unnamed)'} - Style reference '${node.styleref?.$refText}' (${node.styleref?.ref?.$cstNode?.astNode.$type ?? '<undefined>'})`,
    );
    if (node.styleref) {
      if (node.styleref.$refText.length === 0) {
        accept('error', 'Style reference missing after the ":" token.', {
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
          `Style reference '${node.styleref.$refText}' is not a valid Style (found ${node.styleref.ref.$cstNode?.astNode.$type ?? '<undefined>'}).`,
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
   * This check verifies that the source and destination arrowhead definitions are not empty,
   * are recognized, and that there are no conflicting arrowhead definitions in the link style.
   *
   * @param link The Link node.
   * @param accept The validation acceptor callback.
   */
  checkLinkStyles = (link: ast.Link, accept: ValidationAcceptor): void => {
    // Validate source arrowhead.
    if (link.src_arrowhead !== undefined) {
      if (link.src_arrowhead.length === 0) {
        accept('error', 'Source arrowhead style definition cannot be empty.', {
          node: link,
          property: 'src_arrowhead',
          code: IssueCode.SrcArrowheadEmpty,
        });
      } else if (!ARROWHEADS.includes(link.src_arrowhead)) {
        accept('error', `Unknown source arrowhead style: '${link.src_arrowhead}'`, {
          node: link,
          property: 'src_arrowhead',
          code: IssueCode.SrcArrowheadInvalid,
        });
      }
    }
    // Validate destination arrowhead.
    if (link.dst_arrowhead !== undefined) {
      if (link.dst_arrowhead.length === 0) {
        accept('error', 'Destination arrowhead style definition cannot be empty.', {
          node: link,
          property: 'dst_arrowhead',
          code: IssueCode.DstArrowheadEmpty,
        });
      } else if (!ARROWHEADS.includes(link.dst_arrowhead)) {
        accept('error', `Unknown destination arrowhead style: '${link.dst_arrowhead}'`, {
          node: link,
          property: 'dst_arrowhead',
          code: IssueCode.DstArrowheadInvalid,
        });
      }
    }
    // Link style (already captured by grammar) - ensure there are no arrowhead redefinitions in link style:
    if (link.link !== undefined) {
      const match = ast.GraphTerminals.LINK_TYPE.exec(link.link);
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
   * Validates the order and uniqueness of Style definitions within the model.
   *
   * Checks that all Style definitions appear before any Element nodes and that no
   * duplicate style names exist at the same hierarchy level.
   *
   * @param model The Model node.
   * @param accept The validation acceptor callback.
   */
  checkStyles = (model: ast.Model, accept: ValidationAcceptor): void => {
    console.info(chalk.cyanBright('checkStyles(model)'));

    // Ensure styles are defined before elements.
    check_styles_defined_before_elements(model, accept);

    // Traverse the model and collect style definitions along with their container and level.
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
              `Found multiple style definitions with the same name '${style_name}' at the same level.`,
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
   * @param style The Style node.
   * @param accept The validation acceptor callback.
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
   * Validates that a StyleDefinition node has a valid topic.
   *
   * Reports an error if the topic is missing or not recognized.
   *
   * @param styleDefinition The StyleDefinition node.
   * @param accept The validation acceptor callback.
   */
  checkStyleDefinitionTopics = (
    styleDefinition: ast.StyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const topic = styleDefinition.topic;
    if (topic.length === 0) {
      accept('error', 'Style topic is missing.', {
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
   * Validates that a ShapeStyleDefinition node specifies a valid shape name.
   *
   * @param shapeDefinition The ShapeStyleDefinition node.
   * @param accept The validation acceptor callback.
   */
  checkShapeStyleDefinitions = (
    shapeDefinition: ast.ShapeStyleDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = shapeDefinition.value.toLowerCase();
    if (value.length === 0) {
      accept('error', 'Shape name is missing.', {
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
   * Validates that a Style node does not reference itself.
   *
   * @param style The Style node.
   * @param accept The validation acceptor callback.
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
   * Validates that the named color in a TextColorDefinition is a valid CSS color.
   *
   * @param colorDefinition The TextColorDefinition node.
   * @param accept The validation acceptor callback.
   */
  checkTextColorDefinitions = (
    colorDefinition: ast.TextColorDefinition,
    accept: ValidationAcceptor,
  ): void => {
    const value = colorDefinition.color_name.toLowerCase();
    if (!NAMED_COLORS.includes(value)) {
      accept(
        'error',
        `The color '${colorDefinition.color_name}' is not defined. Please use a valid CSS color name.`,
        {
          node: colorDefinition,
          property: 'color_name',
          code: IssueCode.ColorNameUnknown,
        },
      );
    }
  };
  /**
   * Validates that the hexadecimal color code in a HexColorDefinition is valid.
   *
   * @param hexColorDefinition The HexColorDefinition node.
   * @param accept The validation acceptor callback.
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
   * Validates that the RGB color values in a RgbColorDefinition are integers within 0–255.
   *
   * @param rgbColorDefinition The RgbColorDefinition node.
   * @param accept The validation acceptor callback.
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
   * Validates that the WidthValue node has a nonnegative number and a valid unit.
   *
   * @param widthValue The WidthValue node.
   * @param accept The validation acceptor callback.
   */
  checkWidthDefinitions = (widthValue: ast.WidthValue, accept: ValidationAcceptor): void => {
    if (widthValue.value < 0) {
      accept('error', `Width value '${widthValue.value}' is invalid.`, {
        node: widthValue,
        property: 'value',
        code: IssueCode.LinkWidthValueInvalid,
      });
    }
    if (!('unit' in widthValue) || widthValue.unit?.length === 0) {
      accept(
        'warning',
        `Width has no unit. The default unit will be used in conversions. Allowed units: ${LENGTH_UNITS.join(', ')}.`,
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
   * Validates that the opacity in an OpacityStyleDefinition is within the expected range.
   * For percentage values, it must be an integer between 0 and 100; for decimal values,
   * it must be between 0.0 and 1.0.
   *
   * @param opacityStyleDefinition The OpacityStyleDefinition node.
   * @param accept The validation acceptor callback.
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
   * The diagnostic range is computed by grouping adjacent semicolon tokens (ignoring hidden comment nodes).
   *
   * @param styleBlock The StyleBlock node to validate.
   * @param accept The validation acceptor callback.
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
            accept('warning', 'Excess semicolons between Style Definitions.', {
              node: styleBlock,
              code: IssueCode.SpuriousSemicolonDelete,
              range: {
                start: directChildren[start].cstNode.range.start,
                end: directChildren[end].cstNode.range.end,
              },
            });
          });
        }
      }
    }
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
function groupAdjacentArrayIndexes(arr: number[]): number[][] {
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

interface _find_style_dict {
  level: number;
  containerID: string;
  style: ast.Style;
}

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
