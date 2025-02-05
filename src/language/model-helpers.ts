import chalk from "chalk";
import { AstNode } from "langium";
// import { inspect } from "util";
import {
  ColorDefinition,
  ColorStyleDefinition,
  Element,
  isColorDefinition,
  isColorStyleDefinition,
  isGraph,
  isHexColorDefinition,
  isLabelStyleDefinition,
  isLineStyleDefinition,
  isModel,
  isOpacityStyleDefinition,
  isResetStyleDefinition,
  isRgbColorDefinition,
  isShapeStyleDefinition,
  isTextColorDefinition,
  Label,
  StringLabel,
  StyleDefinition,
} from "./generated/ast.js";

export const NAMED_COLORS_AND_HEX_DEFINITIONS: { [key: string]: string } = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff", // (synonym of aqua)
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080", // (synonym of gray)
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff", // (synonym of fuchsia)
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399", // In memory of Rebecca Meyer
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  // transparent: "", // (not a color)
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
}; // Already sorted alphabetically

export function color_name_to_hex(color_name: string): string | undefined {
  return NAMED_COLORS_AND_HEX_DEFINITIONS[color_name] ?? undefined;
}

export const NAMED_COLORS: string[] = [
  "transparent",
  ...Object.keys(NAMED_COLORS_AND_HEX_DEFINITIONS),
].sort();

/** Named shapes originate from MermaidJS:
 * url: https://mermaid.js.org/syntax/flowchart.html
 */
const _NAMED_SHAPES: string[] = [
  "notch_rect",
  "card",
  "notched_rectangle", // Card - Represents a card
  "hourglass",
  "collate",
  "hourglass", // Collate - Represents a collate operation
  "bolt",
  "com_link",
  "lightning_bolt", // Com Link - Communication link
  "brace",
  "brace_l",
  "comment", // Comment - Adds a comment
  "brace_r", // Comment Right - Adds a comment
  "braces", // Comment with braces on both sides - Adds a comment
  "lean_r",
  "in_out",
  "lean_right", // Data Input/Output - Represents input or output
  "lean_l",
  "lean_left",
  "out_in", // Data Input/Output - Represents output or input
  "cyl",
  "cylinder",
  "database",
  "db", // Database - Database storage
  "diam",
  "decision",
  "diamond",
  "question", // Decision - Decision-making step
  "delay",
  "half_rounded_rectangle", // Delay - Represents a delay
  "h_cyl",
  "das",
  "horizontal_cylinder", // Direct Access Storage - Direct access storage
  "lin_cyl",
  "disk",
  "lined_cylinder", // Disk Storage - Disk storage
  "curv_trap",
  "curved_trapezoid",
  "display", // Display - Represents a display
  "div_rect",
  "div_proc",
  "divided_process",
  "divided_rectangle", // Divided Process - Divided process shape
  "doc",
  "document", // Document - Represents a document
  "rounded",
  "event", // Event - Represents an event
  "tri",
  "extract",
  "triangle", // Extract - Extraction process
  "fork",
  "join", // Fork/Join - Fork or join in process flow
  "win_pane",
  "internal_storage",
  "window_pane", // Internal Storage - Internal storage
  "f_circ",
  "filled_circle",
  "junction", // Junction - Junction point
  "lin_doc",
  "lined_document", // Lined Document - Lined document
  "lin_rect",
  "lin_proc",
  "lined_process",
  "lined_rectangle",
  "shaded_process", // Lined/Shaded Process - Lined process shape
  "notch_pent",
  "loop_limit",
  "notched_pentagon", // Loop Limit - Loop limit step
  "flip_tri",
  "flipped_triangle",
  "manual_file", // Manual File - Manual file operation
  "sl_rect",
  "manual_input",
  "sloped_rectangle", // Manual Input - Manual input step
  "trap_t",
  "inv_trapezoid",
  "manual",
  "trapezoid_top", // Manual Operation - Represents a manual task
  "docs",
  "documents",
  "st_doc",
  "stacked_document", // Multi-Document - Multiple documents
  "st_rect",
  "processes",
  "procs",
  "stacked_rectangle", // Multi-Process - Multiple processes
  "odd", // Odd - Odd shape
  "flag",
  "paper_tape", // Paper Tape - Paper tape
  "hex",
  "hexagon",
  "prepare", // Prepare Conditional - Preparation or condition step
  "trap_b",
  "priority",
  "trapezoid",
  "trapezoid_bottom", // Priority Action - Priority action
  "rect",
  "proc",
  "process",
  "rectangle", // Process - Standard process shape
  "circle",
  "circ", // Start - Starting point
  "sm_circ",
  "small_circle",
  "start", // Start - Small starting point
  "dbl_circ",
  "double_circle", // Stop - Represents a stop point
  "fr_circ",
  "framed_circle",
  "stop", // Stop - Stop point
  "bow_rect",
  "bow_tie_rectangle",
  "stored_data", // Stored Data - Stored data
  "fr_rect",
  "framed_rectangle",
  "subproc",
  "subprocess",
  "subroutine", // Subprocess - Subprocess
  "cross_circ",
  "crossed_circle",
  "summary", // Summary - Summary
  "tag_doc",
  "tagged_document", // Tagged Document - Tagged document
  "tag_rect",
  "tag_proc",
  "tagged_process",
  "tagged_rectangle", // Tagged Process - Tagged process
  "stadium",
  "pill",
  "terminal", // Terminal Point - Terminal point
  "text", // Text Block - Text block
].sort();
export const NAMED_SHAPES = [...new Set(_NAMED_SHAPES)]; // Remove potential duplicates

export const LENGTH_UNITS: string[] = [
  "mm",
  "cm",
  "pc",
  "pt",
  "em",
  "ex",
  "rem",
  "rex",
].sort();

/**
 * Topics for ColorStyleDefintion:
 */
export const COLOR_STYLE_TOPICS: string[] = [
  "BorderColor",
  "LabelColor",
  "LineColor",
  "FillColor",
];

/**
 * Topics for OpacityStyleDefinition:
 */
export const OPACITY_STYLE_TOPICS: string[] = [
  "BorderAlpha",
  "BorderOpacity",
  "LabelAlpha",
  "LabelOpacity",
  "LineAlpha",
  "LineOpacity",
  "FillAlpha",
  "FillOpacity",
];

/**
 * Topics for LabelStyleDefinition:
 */
export const LABEL_STYLE_TOPICS: string[] = [
  "LabelText",
  "SrcLabelText",
  "DstLabelText",
];

/**
 * Topics for BorderStyleDefinition:
 */
export const LINE_STYLE_TOPICS: string[] = ["BorderStyle", "LineStyle"];

/**
 * Topics for LineWidthDefinition:
 */
export const LINE_WIDTH_TOPICS: string[] = ["BorderWidth", "LineWidth"];

/**
 * Topics for ShapeStyleDefinition:
 */
export const SHAPE_STYLE_TOPICS: string[] = ["Shape"];

/**
 * Topics for ResetStyleDefinition:
 */
export const RESET_STYLE_TOPIC: string[] = ["Reset"];

export const STYLE_TOPICS: string[] = [
  ...COLOR_STYLE_TOPICS,
  ...OPACITY_STYLE_TOPICS,
  ...LABEL_STYLE_TOPICS,
  ...LINE_STYLE_TOPICS,
  ...LINE_WIDTH_TOPICS,
  ...SHAPE_STYLE_TOPICS,
  ...RESET_STYLE_TOPIC,
].sort();

export const ARROWHEADS: string[] = [
  "none",
  "standard",
  "default",
  "plain",
  "diamond",
  "white_diamond",
  "delta",
  "white_delta",
  "circle",
  "white_circle",
  "transparent_circle",
  "cross",
].sort();

/**
 * Retrieve the label string from a Label node
 * @param label the Label item to fetch the label text from
 * @returns the label text
 */
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
 * In all other cases, a scoped array of style items will be generated 'top down': the entries at a lower level enhance or replace
 * The styles adhere to CSS logic: top-down inheritance, and selective overruling of style items at lower levels.
 * Style items at a given nesting level inherit style definitions from previous levels.
 * A 'Reset' token allows selective resetting of parts or all style elements defined in parent styles.
 * @param {Element} element - The element that may have to be styled
 * @returns {StyleDefinition[] | undefined} The array of unique style items applicable to the element, or undefined if element not defined or style not provided
 */
export function Element_get_style_items(
  element: Element,
): StyleDefinition[] | undefined {
  console.info(
    chalk.gray(
      `Element_get_style_items(type = ${element.$type}) - [${element.$cstNode?.text.replaceAll("\n", "\\n")}]`,
    ),
  );
  if (element.styleref === undefined) {
    // The element has no style assigned
    console.info(
      chalk.gray(
        `Element_get_style_items(type = ${element.$type}) - NO STYLE REFERENCE FOUND`,
      ),
    );
    return undefined;
  }

  // Collect the element's (and linked style's) ancestry (bottom-up):
  const ancestry: AstNode[] = Element_get_ancestry(element);

  // Traverse the style tree and get the style definition stack
  const style_definition_stack = generate_style_definition_stack(
    element.styleref.$refText,
    ancestry,
  );

  // Flatten the style definition stack
  const flattened_style_items = flatten_style_definition_stack(
    style_definition_stack,
  );
  console.info(
    chalk.gray(
      `Element_get_style_items(type = ${element.$type}) - FOUND ${flattened_style_items.length} UNFILTERED STYLE ITEMS`,
    ),
  );

  let i = 1;
  for (const item of flattened_style_items) {
    console.debug(
      chalk.blueBright(
        `DBG: Element_get_style_items() - Flattened: #${i} - type: '${item.$type}', topic: '${item.topic}', definition: '${item.$cstNode?.text}'`,
      ),
    );
    i++;
  }

  // Process the ancestry top-down to get the filtered style definitions
  const filtered_style_definitions = generate_filtered_style_definition(
    ancestry,
    element.styleref.$refText,
    flattened_style_items,
  );

  // Debug statements:
  i = 1;
  for (const item of filtered_style_definitions) {
    console.log(
      chalk.bgWhite.blueBright(
        `DBG: Element_get_style_items() - Filtered: #${i} - type: '${item.$type}', topic: '${item.topic}', definition: '${item.$cstNode?.text}'`,
      ),
    );
    i++;
  }
  console.info(
    chalk.gray(
      `Element_get_style_items(type = ${element.$type}) - FOUND ${filtered_style_definitions.length} FILTERED STYLE ITEMS`,
    ),
  );

  return filtered_style_definitions;
}

/**
 * Traverses the ancestry of AST nodes to find style definitions that match the given style name.
 *
 * @param style_name - The name of the style to search for.
 * @param ancestry - An array of AST nodes representing the ancestry to traverse.
 * @returns An array of arrays of style definitions that match the given style name.
 */
function generate_style_definition_stack(
  style_name: string,
  ancestry: AstNode[],
  level: number = 0,
  stack: StyleDefinition[][] = [],
): StyleDefinition[][] {
  const style_definition_stack = stack;
  console.info(
    chalk.yellowBright(
      `DBG::traverse_ancestry_for_style(style '${style_name}', level: ${level}) - START`,
    ),
  );

  for (const ancestor of ancestry) {
    if (isModel(ancestor) || isGraph(ancestor)) {
      // Useless check (required for linter)
      for (const s of ancestor.styles) {
        if (s.id === style_name) {
          // Matching style found - Process the style items, taking care of scope, redefinition and reset rules
          console.info(
            chalk.yellowBright(
              `DBG::Element_get_style_items(style '${style_name}', level: ${level}) - Found style '${s.id}'`,
            ),
            chalk.redBright(
              `${s.styleref === undefined ? "" : ` REFERRING TO style '${s.styleref.$refText}'`}\n`,
            ),
          );
          console.info(chalk.yellow(s.definition.$cstNode?.text));

          // Add the style definition to the stack:
          style_definition_stack.push(s.definition.items);
          if (s.styleref !== undefined) {
            generate_style_definition_stack(
              s.styleref.$refText,
              ancestry,
              level + 1,
              style_definition_stack,
            );
          }
        }
      }
    }
  }

  return style_definition_stack;
}

/**
 * Flattens a stack of style definitions by reversing the order of the stack
 * and then flattening it by one level.
 *
 * @param style_definition_stack - A stack of style definitions, where each
 * element is an array of `StyleDefinition`.
 * @returns A flattened array of `StyleDefinition` from the reversed stack which can
 * subsequently be processed linearly to compute the resulting style definition.
 */
function flatten_style_definition_stack(
  style_definition_stack: StyleDefinition[][],
): StyleDefinition[] {
  return style_definition_stack.reverse().flat(1);
}

function generate_filtered_style_definition(
  ancestry: AstNode[],
  style_ref_text: string,
  flattened_style_items: StyleDefinition[],
): StyleDefinition[] {
  const filtered_style_definitions: StyleDefinition[] = [];

  const topicIndexMap = new Map<string, number>();

  /*
  for (const ancestor of ancestry.reverse()) {
    // Search for style definitions with the proper style identifier:
    if (isModel(ancestor) || isGraph(ancestor)) {
      // Useless check (required for linter)
      for (const s of ancestor.styles) {
        if (s.id === style_ref_text) {
          // Matching style found - Process the style items, taking care of scope, redefinition and reset rules
          for (const d of s.definition.items) {
          */
  for (const d of flattened_style_items) {
    // First check reset topic:
    if (isResetStyleDefinition(d)) {
      // Check which topics must be reset
      if (["All", "*"].includes(d.value)) {
        // Reset entire style definition:
        filtered_style_definitions.length = 0;
        topicIndexMap.clear();
      } else {
        console.error(
          chalk.redBright(
            `ERROR: NOT YET IMPLEMENTED: reset style argument '${d.value}'`,
          ),
        );
      }
    } else {
      // Retrieve the index of the style definition with the same topic (returns -1 if no match)
      const index = topicIndexMap.get(d.topic);
      if (index === undefined) {
        // No match: add to array
        filtered_style_definitions.push(d);
        topicIndexMap.set(d.topic, filtered_style_definitions.length - 1);
      } else {
        // Match: replace existing style defintion with new one
        filtered_style_definitions[index] = d;
      }
    }
    /*
          }
        }
      }
    }*/
  }

  return filtered_style_definitions;
}

/**
 * Render a Style definition to string
 * @param d the style definition as an array of StyleDefinition items
 * @returns an unparsed, unprocessed (at least for now) string representation of the style definition
 */
export function StyleDefinition_toString(d: StyleDefinition[]): string {
  console.warn(
    chalk.yellowBright(
      `[WARN] StyleDefinition_toString(topics: ${d.map((sd) => sd.topic).join(", ")}) - values NOT YET PARSED (falling back to '$CstNode.text')`,
    ),
  );
  return d.map((def) => `${def.topic}: "${def.$cstNode?.text}"`).join("; ");
}

/**
 * Get the Shape StyleItem from a style definition
 * @param items the StyleItem array to explore
 * @returns the last matching StyleItem
 */
export function StyleDefinitions_get_shape(
  items: StyleDefinition[] | undefined,
): string | undefined {
  if (items === undefined) {
    return undefined;
  }
  return items.findLast((def) => isShapeStyleDefinition(def))?.value;
}

/**
 * Get the Label from a style definition
 * @param items the StyleItem array to explore
 * @returns the string representation of the label as found in the last matching StyleItem
 */
export function StyleDefinitions_get_label(
  items: StyleDefinition[] | undefined,
): string | undefined {
  if (items === undefined) {
    return undefined;
  }
  return items
    .filter((def) => isLabelStyleDefinition(def))
    .findLast((def) => def.topic == "LabelText")?.value;
}

/**
 * Get the color value of a ColorStyleItem from a style definition that matches any token in matching_tokens
 * @param items the StyleItem array to explore
 * @param matching_tokens the array of tokens to check (BorderColor, FillColor, LabelColor, LineColor)
 * @returns the last matching StyleItem
 */
export function StyleDefinitions_get_color_value(
  items: StyleDefinition[] | undefined,
  matching_tokens: string[],
): ColorStyleDefinition | undefined {
  if (items === undefined) {
    return undefined;
  }
  return items
    .filter((def) => isColorStyleDefinition(def))
    .findLast((def) => matching_tokens.includes(def.topic)); //?.value;
}

/**
 * Get the color value as hex color code
 * @param items the StyleItem array to explore
 * @param matching_tokens the array of tokens to check (BorderWidth, LineWidth)
 * @returns the color as hex color code (or undefined)
 */
export function StyleDefinitions_get_color_value_as_hex(
  items: StyleDefinition[] | undefined,
  matching_tokens: string[],
) {
  if (items === undefined) {
    return undefined;
  }
  const color_item: ColorStyleDefinition | undefined =
    StyleDefinitions_get_color_value(items, matching_tokens);
  let color_value: string | undefined = undefined;
  if (color_item !== undefined) {
    color_value = ColorDefinition_to_hex_color(color_item.value);
  }
  return color_value;
}

/**
 * Get the LineWidth StyleItem from a style definition
 * @param items the StyleItem array to explore
 * @param matching_tokens the array of tokens to check (BorderWidth, LineWidth)
 * @returns the last matching StyleItem
 */
export function StyleDefinitions_get_line_width_value(
  items: StyleDefinition[] | undefined,
  matching_tokens: string[],
): StyleDefinition | undefined {
  if (items === undefined) {
    return undefined;
  }
  return items
    .filter((def) => isLineStyleDefinition(def))
    .findLast((def) => matching_tokens.includes(def.topic)); //?.value;
}

/**
 * Get the LineOpacity StyleItem from a style definition (can be overridden by 'Opacity')
 * @param items the StyleItem array to explore
 * @param matching_tokens the array of tokens to check (BorderAlpha, FillAlpha, LabelAlpha, LineAlpha, BorderOpacity, FillOpacity, LabelOpacity, LineOpacity)
 * @returns the last matching StyleItem
 */
export function StyleDefinitions_get_opacity_value(
  items: StyleDefinition[] | undefined,
  matching_tokens: string[],
): StyleDefinition | undefined {
  if (items === undefined) {
    return undefined;
  }
  return items
    .filter((def) => isOpacityStyleDefinition(def))
    .findLast((def) => matching_tokens.includes(def.topic)); //?.value;
}

export function ColorDefinition_toString(d: ColorDefinition) {
  if (isColorDefinition(d)) {
    const color = d.color;
    if (isRgbColorDefinition(color)) {
      return `rgb(${color.red},${color.green},${color.blue})`;
    } else if (isHexColorDefinition(color)) {
      return color.hex_color;
    }
    return color.color_name;
  }
  return undefined;
}

function color_component_to_hex(c: number) {
  const hex = c.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
}

function rgb_to_hex(r: number, g: number, b: number) {
  return (
    "#" +
    color_component_to_hex(r) +
    color_component_to_hex(g) +
    color_component_to_hex(b)
  );
}

export function ColorDefinition_to_hex_color(d: ColorDefinition) {
  if (isColorDefinition(d)) {
    const color = d.color;
    if (isRgbColorDefinition(color)) {
      return rgb_to_hex(color.red, color.green, color.blue);
      // `rgb(${color.red},${color.green},${color.blue})`;
    } else if (isHexColorDefinition(color)) {
      return color.hex_color;
    } else if (isTextColorDefinition(color)) {
      // Named color
      return color_name_to_hex(color.color_name);
    }
  }
  return undefined;
}

function Element_get_ancestry(element: Element): AstNode[] {
  const ancestry: AstNode[] = [];
  let container: AstNode = element;
  while (container.$container) {
    ancestry.push(container.$container);
    container = container.$container;
  }
  return ancestry;
}
