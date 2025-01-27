import { NodeFileSystem } from "langium/node";
import {
  Model,
  Graph,
  isGraph,
  Element,
  Node,
  Link,
  isNode,
  Style,
  StyleDefinition,
} from "../language/generated/ast.js";
import { createGraphServices } from "../language/graph-module.js";
import { extractDestinationAndName, extractDocument } from "./cli-util.js";
import { GenerateOptions } from "./main.js";
import chalk from "chalk";
import path from "path";
import {
  Element_get_style_items,
  Label_get_label,
  StyleDefinitions_get_shape,
  StyleDefinitions_get_label,
  StyleDefinitions_get_line_color,
  StyleDefinitions_get_label_color,
  StyleDefinitions_get_line_width,
  StyleDefinitions_get_line_opacity,
} from "./model-helpers.js";
import { inspect } from "util";

export async function generate_mermaid_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): Promise<string> {
  console.info(
    chalk.magentaBright(`generate_mermaid_graph - [${model.$type}] -- START`),
  );

  const data = extractDestinationAndName(filePath, opts?.destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}.mmd`;

  // const generatedFilePath = `${path.join(data.destination, data.name)}-clean.graph`;

  // retrieve the services for the language
  const services = createGraphServices(NodeFileSystem).Graph;
  // extract a document
  const document = await extractDocument(filePath, services);
  // extract the parse result details
  const parseResult = document.parseResult;
  // verify no lexer, parser, or general diagnostic errors show up
  if (
    parseResult.lexerErrors.length === 0 &&
    parseResult.parserErrors.length === 0
  ) {
    console.log(chalk.green(`Parsed and validated ${filePath} successfully!`));
    // console.log(document.parseResult.value);
  } else {
    console.log(chalk.red(`Failed to parse and validate ${filePath}!`));
  }

  console.log(chalk.greenBright(_generateMMD(model, 0, filePath)));
  console.log(
    chalk.green(`Mermaid graph generated successfully to ${generatedFilePath}`),
  );
  return generatedFilePath;
}

const INDENTATION = "  ";

/** A MermaidJS graph contains nodes, links, subgraphs and styling.
 */
function _generateMMD(
  model: Model | Graph,
  level = 0,
  filePath: string,
): string {
  // We must keep track of links since they aren't identifiable in MermaidJS (they are numbered sequentially as they are defined)
  const links: _mmd_link_info = { count: 0, style: {} };
  // Construct the mermaidJS document from a collection of text lines:
  const lines: string[] = [];

  lines.push(
    "---",
    `  title: ${filePath}`,
    "---",
    "graph",
    ...render_node_contents(model, level + 1, links),
    "%% END",
  );

  console.info(chalk.yellow(inspect(links)));
  // Get the keys of the links (edges) that have styling defined:
  const indexes = Object.keys(links.style);

  if (indexes.length > 0) {
    lines.push("\n%% Link styles:");
    // We will now group the link styles based on the defined style:
    for (const value of new Set(indexes.map((key) => links.style[key]))) {
      // Combine the indexes for identical style definitions
      const keys = indexes.filter((key) => links.style[key] == value);
      lines.push(`linkStyle ${keys.join(",")} ${value};`);
    }
  }

  return lines.join("\n");
}

function render_node_contents(
  node: Model | Graph,
  nesting_level: number,
  links: _mmd_link_info,
): string[] {
  const lines: string[] = [];

  // First export the styles
  for (const style of node.styles) {
    lines.push(render_style(style, nesting_level));
  }
  // Then the graph elements
  for (const element of node.elements) {
    lines.push(...render_element(element, nesting_level, links));
  }

  return lines;
}
function render_element(
  element: Element,
  nesting_level: number,
  links: _mmd_link_info,
): string[] {
  if (isGraph(element)) {
    return render_graph(element, nesting_level, links);
  } else if (isNode(element)) {
    return [render_node(element, nesting_level)];
  } else {
    // isLink(element)
    return [render_link(element, nesting_level, links)];
  }
}

function render_node(node: Node, nesting_level: number): string {
  const style_definitions: StyleDefinition[] | undefined =
    Element_get_style_items(node);
  let shape: string | undefined = StyleDefinitions_get_shape(style_definitions);
  let result =
    INDENTATION.repeat(nesting_level) +
    `${node.name}${node.style ? `:::${node.style.$refText}` : ""}`;
  let label: string | undefined = Label_get_label(node.label);
  if (label.length == 0) {
    label = StyleDefinitions_get_label(style_definitions);
  }

  const s: string[] = [];
  if (shape !== undefined && shape.length > 0) {
    shape = shape_to_mmd_shape(shape);
    s.push(`shape: ${shape}`);
  }
  if (label !== undefined && label.length > 0) {
    s.push(`label: "${label}"`);
  }
  result += `@{ ${s.join(", ")} }`;

  /* NOT YET IMPLEMENTED IN GRAMMAR: CHECK (NESTED) REDECLARATIONS */
  return result + "\n";
}

/**
 * Internal interface for processing the styling of Link nodes according to the MermaidJS Graph specification.
 * Reason: there is no explicit Link (edge) identifier in a MermaidJS Graph, so we must keep track of styling information
 * of styled links, and keep track of the link creation sequence number (implicit identifier in a MermaidJS Graph)
 * @count the implicit sequence number of link (edge) creation for MermaidJS
 * @style the stringified link styling to assign later on to links
 */
interface _mmd_link_info {
  count: number;
  style: Record<string, string>; // id --> array of mmd link style statements
}

/**
 *
 * @param link the AST node representing a Link Element that will be rendered
 * @param nesting_level the nesting level (used for rendering/indentation)
 * @param links the _mmd_link_info object for styling links
 * @returns the indented MermaisJS code representing the link
 */
function render_link(
  link: Link,
  nesting_level: number,
  links: _mmd_link_info,
): string {
  // TODO: first check label definition in Styles
  let label: string | undefined = Label_get_label(link.label);
  const style_definitions: StyleDefinition[] | undefined =
    Element_get_style_items(link);

  if (label.length == 0 && link.style !== undefined) {
    console.log(
      chalk.bgBlueBright(
        `render_link() - label not defined at Link level - processing relevant style definitions (${link.style.$refText})`,
      ),
    );
    // label = get_label_from_style(link.type);
    label = StyleDefinitions_get_label(style_definitions);
  }

  // The following items define the link style (which needs to be set at link level):

  // Link color:
  const link_color = to_mmd_color(
    StyleDefinitions_get_line_color(style_definitions),
    "stroke",
  ); // MermaidJS: 'stroke'

  // Label (text) color:
  const label_color = to_mmd_color(
    StyleDefinitions_get_label_color(style_definitions),
    "color",
  ); // MermaidJS: 'color' (named or #rgb or #rrggbb)

  // Link width:
  const stroke_width = to_mmd_line_width(
    StyleDefinitions_get_line_width(style_definitions),
    "stroke-width",
  ); // MermaidJS: 'width' (with unit)

  // Line opacity:
  const link_opacity = to_mmd_opacity(
    StyleDefinitions_get_line_opacity(style_definitions),
    "stroke-opacity",
  ); // MermaidJS: 'stroke-opacity' (0..1) or 0%..100%)

  const style_items: string[] = [
    link_color,
    label_color,
    stroke_width,
    link_opacity,
  ].filter((s) => s !== undefined); // TODO

  // Collapse string array of style fragments to string:
  if (style_items.length > 0) {
    links.style[links.count] = style_items.join(","); // TODO TODO TODO
  }

  let start = "",
    end = "";
  switch (link.kind) {
    case "to":
    case "->":
    case "-->":
      start = "-";
      end = "->";
      break;
    case "with":
    case "--":
      start = "-";
      end = "-";
      break;
    default:
      start = "???";
      end = "???";
  }
  const arrow = `${start}${label !== undefined && label.length == 0 ? "" : `- "${label}" -`}${end}`;
  links.count++; // Increment the link count before returning
  return (
    INDENTATION.repeat(nesting_level) +
    `${link.src.$refText} ${arrow} ${link.dst.$refText}` +
    "\n"
  );
}

/**
 * Render a Graph as MermaidJS Chart (subgraph) object
 * @param graph The AST node representing a Graph Element that will be rendered
 * @param nesting_level the nesting level (used for rendering/indentation)
 * @param links the _mmd_link_info object for styling links
 * @returns the indented MermaisJS code representing the graph
 */
function render_graph(
  graph: Graph,
  nesting_level: number,
  links: _mmd_link_info,
): string[] {
  return [
    `\n${INDENTATION.repeat(nesting_level)}subgraph ${graph.name}\n`,
    ...render_node_contents(graph, nesting_level + 1, links),
    INDENTATION.repeat(nesting_level) + "end\n\n",
  ];
}

/**
 * Render a Style as MermaidJS Chart (classDef) object
 * NOTE: classDef only applies to Node and Graph (TODO)
 * @param style The AST node representing a Graph Element that will be rendered
 * @param nesting_level the nesting level (used for rendering/indentation)
 * @returns the indented MermaisJS code representing the style
 */
function render_style(style: Style, nesting_level: number): string {
  // TODO transform the styles into mermaid styles (some properties must propagate to the nodes, e.g. shape)
  return INDENTATION.repeat(nesting_level) + `%% classDef ${style.name} TODO`;
}

/**
 * Convert a shape definition from a Style into a MermaodJS node shape
 * NODE: TODO!
 * @param shape the shape as defined in the graph style
 * @returns the equivalent shape as defined at https://mermaid.js.org/syntax/flowchart.html#complete-list-of-new-shapes
 */
function shape_to_mmd_shape(shape: string | undefined): string | undefined {
  if (shape === undefined) {
    return undefined;
  }
  switch (shape) {
    case "roundrect":
    case "rect-rounded":
    case "rounded-rect":
      shape = "rounded";
      break;
  }
  return shape;
}

/**
 * Render a StyleDefinition Color item in a style definition for MermaidJS
 * @param style_item the StyleDefinition Color item to be rendered as MermaidJS color
 * @param mmd_style_topic the MermaidJS style topic to which the Color applies
 * @returns the entire MermaidJS color style definition ("<topic>: <color-value>")
 */
function to_mmd_color(
  style_item: StyleDefinition | undefined,
  mmd_style_topic: string | undefined,
) {
  let match: RegExpMatchArray | null | undefined = null;
  let color: string | undefined = undefined;
  let errors = 0;

  if ((match = style_item?.value.match(/^rgb\(([\d]+),([\d]+),([\d]+)\)$/i))) {
    const red = Number(match[1]);
    if (red < 0 || red > 255) {
      errors++;
      console.error(`RGB color value for red is out of range: ${red}`);
    }
    const green = Number(match[2]);
    if (green < 0 || green > 255) {
      errors++;
      console.error(`RGB color value for green is out of range: ${green}`);
    }
    const blue = Number(match[3]);
    if (blue < 0 || blue > 255) {
      errors++;
      console.error(`RGB color value for blue is out of range: ${blue}`);
    }
    if (errors == 0) {
      color = `#${("00" + red.toString(16)).slice(-2)}${("00" + green.toString(16)).slice(-2)}${("00" + blue.toString(16)).slice(-2)}`;
    }
  } else if ((match = style_item?.value.match(/^#[0-9a-f]{3}$/i))) {
    // rgb hex-3
    color = style_item?.value.toLowerCase();
  } else if ((match = style_item?.value.match(/^#[0-9a-f]{6}$/i))) {
    // rgb hex-3
    color = style_item?.value.toLowerCase();
  } else if ((match = style_item?.value.match(/^[a-z]+$/i))) {
    // color name -- TODO: filter
    color = style_item?.value.toLowerCase();
  }
  if (color !== undefined) {
    return `${mmd_style_topic?.length == 0 ? "" : `${mmd_style_topic}: `}${color}`;
  }
  return undefined;
}

/**
 * Render a StyleDefinition LineWidth item in a style definition for MermaidJS
 * @param style_item the StyleDefinition LinkWidth item to be rendered as MermaidJS color
 * @param mmd_style_topic the MermaidJS style topic to which the LineWidth applies
 * @returns the entire MermaidJS line width style definition ("<topic>: <line-width-value>")
 */
function to_mmd_line_width(
  style_item: StyleDefinition | undefined,
  mmd_style_topic: string | undefined,
) {
  let match: RegExpMatchArray | null | undefined = null;
  let errors = 0;

  if (
    (match = style_item?.value.match(/^(\d+|\.\d+|\d*\.\d+)( *([a-z]{2,3}))?$/))
  ) {
    const value = match[1];
    const unit = match[3];
    const allowed_units = ["mm", "cm", "pc", "pt", "em", "ex", "rem", "rex"];
    if (value.length == 0) {
      console.error(
        chalk.red(
          `Link width has invalid numeric value: '${style_item?.value}'`,
        ),
      );
      errors++;
    }
    if (unit.length > 0 && !allowed_units.includes(unit)) {
      console.error(
        chalk.red(`Link width has invalid unit: '${style_item?.value}'`),
      );
      errors++;
    }
    if (errors == 0) {
      if (unit.length > 0) {
        return `${mmd_style_topic?.length == 0 ? "" : `${mmd_style_topic}: `}${value}${unit}`;
      }
      return `${mmd_style_topic?.length == 0 ? "" : `${mmd_style_topic}: `}${value}`;
    }
  }
  return undefined;
}

/**
 * Render a StyleDefinition *Opacity item in a style definition for MermaidJS
 * @param style_item the StyleDefinition LineOpacity item to be rendered as MermaidJS line-opacity
 * @param mmd_style_topic the MermaidJS style topic to which the LineOpacity applies
 * @returns the entire MermaidJS opacity style definition ("<topic>: <color-value>")
 */
function to_mmd_opacity(
  style_item: StyleDefinition | undefined,
  mmd_style_topic: string | undefined,
) {
  let match: RegExpMatchArray | null | undefined = null;
  let errors = 0;

  if ((match = style_item?.value.match(/^(1|0?\.\d+)$/))) {
    // number between 0 and 1
    return `${mmd_style_topic?.length == 0 ? "" : `${mmd_style_topic}: `}${match[1]}`;
  } else if ((match = style_item?.value.match(/^(\d+) *\%$/))) {
    // Percentage
    const pct = match[1];
    if (parseInt(pct) > 100) {
      console.error(`Link opacity value out of range: '${style_item?.value}'`);
      errors++;
    }
    if (errors === 0) {
      return `${mmd_style_topic?.length == 0 ? "" : `${mmd_style_topic}: `}${pct}%`;
    }
  }
  return undefined;
}
