import chalk from 'chalk';
import { Reference } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import { inspect } from 'util';

import {
  Element,
  Graph,
  GraphTerminals,
  Link,
  Model,
  Node,
  Style,
  StyleDefinition,
  isColorStyleDefinition,
  isGraph,
  isHexColorDefinition,
  isLineStyleDefinition,
  isNode,
  isOpacityStyleDefinition,
  isRgbColorDefinition,
} from '../language/generated/ast.js';
import { createGraphServices } from '../language/graph-module.js';
import {
  Element_get_style_items,
  Label_get_label,
  NAMED_SHAPES,
  StyleDefinitions_get_color_value,
  StyleDefinitions_get_label,
  StyleDefinitions_get_line_width_value,
  StyleDefinitions_get_opacity_value,
  StyleDefinitions_get_shape,
} from '../language/model-helpers.js';
import { extractDestinationAndName, extractDocument } from './cli-util.js';
import { GenerateOptions } from './main.js';

export async function generate_mermaid_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): Promise<string> {
  console.info(chalk.magentaBright(`generate_mermaid_graph - [${model.$type}] -- START`));

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
  if (parseResult.lexerErrors.length === 0 && parseResult.parserErrors.length === 0) {
    console.log(chalk.green(`Parsed and validated ${filePath} successfully!`));
    // console.log(document.parseResult.value);
  } else {
    console.log(chalk.red(`Failed to parse and validate ${filePath}!`));
  }

  console.log(chalk.whiteBright(_generateMMD(model, 0, filePath)));
  console.log(chalk.green(`Mermaid graph generated successfully to ${generatedFilePath}`));
  return generatedFilePath;
}

const INDENTATION = '  ';

/** A MermaidJS graph contains nodes, links, subgraphs and styling.
 */
function _generateMMD(model: Model | Graph, level = 0, filePath: string): string {
  // We must keep track of links since they aren't identifiable in MermaidJS (they are numbered sequentially as they are defined)
  const link_style_dict: __mmd_link_style_dict = { count: 0, styled_links: {} };
  // Construct the mermaidJS document from a collection of text lines:
  const lines: string[] = [];

  lines.push(
    '---',
    `  title: ${filePath}`,
    '---',
    'graph',
    ...render_node_contents(model, level + 1, link_style_dict),
  );

  console.info(chalk.yellow(inspect(link_style_dict)));

  // Render the link styling (if applicable):
  const link_style_list = Object.keys(link_style_dict.styled_links);
  if (link_style_list.length > 0) {
    lines.push('\n%% Link styles:');
    for (const key of link_style_list) {
      lines.push(`linkStyle ${link_style_dict.styled_links[key].join(',')} ${key};`);
    }
  }
  lines.push('%% END');

  return lines.join('\n');
}

function render_node_contents(
  node: Model | Graph,
  nesting_level: number,
  link_style_dict: __mmd_link_style_dict,
): string[] {
  const lines: string[] = [];

  // First export the styles
  for (const style of node.styles) {
    lines.push(render_style(style, nesting_level));
  }
  // Then the graph elements
  for (const element of node.elements) {
    lines.push(...render_element(element, nesting_level, link_style_dict));
  }

  return lines;
}

function render_element(
  element: Element,
  nesting_level: number,
  link_style_dict: __mmd_link_style_dict,
): string[] {
  if (isGraph(element)) {
    return render_graph(element, nesting_level, link_style_dict);
  } else if (isNode(element)) {
    return [render_node(element, nesting_level)];
  } else {
    // isLink(element)
    return [render_link(element, nesting_level, link_style_dict)];
  }
}

function render_node(node: Node, nesting_level: number): string {
  const style_definitions: StyleDefinition[] | undefined = Element_get_style_items(node);
  let shape: string | undefined = StyleDefinitions_get_shape(style_definitions);
  let result =
    INDENTATION.repeat(nesting_level) +
    `${node.name}${node.styleref === undefined ? '' : `:::${node.styleref.$refText}`}`;
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
  result += `@{ ${s.join(', ')} }`;

  /* NOT YET IMPLEMENTED IN GRAMMAR: CHECK (NESTED) REDECLARATIONS */
  return result + '\n';
}

/**
 * Internal interface for processing the styling of Link nodes according to the MermaidJS Graph specification.
 * Reason: there is no explicit Link (edge) identifier in a MermaidJS Graph, so we must keep track of styling information
 * of styled links, and keep track of the link creation sequence number (implicit identifier in a MermaidJS Graph)
 * @count the implicit sequence number of link (edge) creation for MermaidJS
 * @styled_links a dict with the stringified link styling as key pointing to an array of styled links
 */
interface __mmd_link_style_dict {
  count: number;
  styled_links: Record<string, number[]>;
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
  link_style_dict: __mmd_link_style_dict,
): string {
  const style_definitions: StyleDefinition[] | undefined = Element_get_style_items(link);

  // Rendering warnings and errors:
  const comments: string[] = [];
  let comment = '';

  let label: string | undefined = Label_get_label(link.label);
  if (label.length == 0 && link.styleref !== undefined) {
    // Try obtaining the label definition from the link Style
    console.log(
      chalk.bgBlueBright(
        `render_link() - label not defined at Link level - processing relevant style definitions (${link.styleref.$refText})`,
      ),
    );
    label = StyleDefinitions_get_label(style_definitions);
    console.log(
      chalk.bgBlueBright(
        `render_link() - label after checking style definitions (${link.styleref.$refText}): "${label}"`,
      ),
    );
  }

  // The following items define the link style (which needs to be set at link level):

  // Link color:
  const link_color = to_mmd_color(
    //StyleDefinitions_get_line_color(style_definitions),
    StyleDefinitions_get_color_value(style_definitions, ['LineColor']),
    'stroke',
  ); // MermaidJS: 'stroke'

  // Label (text) color:
  const label_color = to_mmd_color(
    //StyleDefinitions_get_label_color(style_definitions),
    StyleDefinitions_get_color_value(style_definitions, ['LabelColor']),
    'color',
  ); // MermaidJS: 'color' (named or #rgb or #rrggbb)

  // Link width:
  const stroke_width = to_mmd_line_width(
    StyleDefinitions_get_line_width_value(style_definitions, ['LineWidth']),
    'stroke-width',
  ); // MermaidJS: 'width' (with unit)

  // Line opacity:
  const link_opacity = to_mmd_opacity(
    StyleDefinitions_get_opacity_value(style_definitions, ['LineOpacity']),
    'stroke-opacity',
  ); // MermaidJS: 'stroke-opacity' (0..1) or 0%..100%)

  const style_items: string[] = [link_color, label_color, stroke_width, link_opacity].filter(
    (s) => s !== undefined,
  ); // TODO

  // Render the link
  // MermaidJS: A -->|label| B
  let edge: string | undefined = undefined;
  if (label === undefined || label.length == 0) {
    label = '';
  } else {
    // Escape '|' characters in the edge label:
    label = `|${label.replaceAll('|', '\|')}|`;
  }

  // A link either has property 'relation' defined ('to' | 'with'), or 'link' (obeying GraphTerminals.LINK_TYPE)
  if (link.relation !== undefined && link.relation.length > 0) {
    // 'relation' defined:
    switch (link.relation) {
      case 'to':
        edge = '-->';
        break;
      case 'with':
        edge = '---';
        break;
      default: // Error - shouldn't happen
        break;
    }
  } else {
    // 'link' defined:
    if (link.link !== undefined && link.link.length > 0) {
      const match = GraphTerminals.LINK_CONNECTOR.exec(link.link);
      if (match) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let src_head = match[1] ?? '';
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let line = match[2] ?? '';
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        let dst_head = match[3] ?? '';

        // Arrowhead at source:
        if (src_head.length > 0) {
          switch (src_head) {
            case '<':
            case 'o':
            case 'x':
              break;
            default:
              comment = `Warning: source arrowhead '${src_head}' is not available in a MermaidJS graph. Will render as '<'. Source: '${link.$cstNode?.text}'`;
              comments.push(comment);
              console.warn(chalk.red(comment));
              src_head = '<';
          }
        }

        // Arrowhead at destination:
        if (dst_head.length > 0) {
          switch (dst_head) {
            case '>':
            case 'o':
            case 'x':
              break;
            default:
              comment = `Warning: destination arrowhead '${dst_head}' is not available in a MermaidJS graph. Will render as '>'. Source: '${link.$cstNode?.text}'`;
              comments.push(comment);
              console.warn(chalk.red(comment));
              dst_head = '>';
          }
        }

        // Line style:
        if (line.length > 0) {
          if (/(-{2,}|\.{2,}|={2,}|~{2,}|-\.+-)/.exec(line) === null) {
            comment = `Warning: line style '${line}' is not available in a MermaidJS graph. Will render as '...'. Source: '${link.$cstNode?.text}'`;
            console.warn(chalk.red(comment));
            edge = '...';
          }

          if (src_head.length == 0 && dst_head.length == 0) {
            // ensure line length is 3 characters:
            if (line.length < 3) {
              // Only if identical characters - duplicate the 1st characer:
              line = line + line.charAt(0);
            }
          }
        }

        // Generate edge:
        edge = src_head + line + dst_head;
      } else {
        // No match
        comment = `Error: invalid line style: '${link.$cstNode?.text}'. Will render as '...'. Source: '${link.$cstNode?.text}'`;
        comments.push(comment);
        console.error(chalk.red(comment));
        edge = '...';
      }
    } else {
      comment = `Error: line style missing: '${link.$cstNode?.text}'. Will render as '...'. Source: '${link.$cstNode?.text}'`;
      comments.push(comment);
      console.error(chalk.red(comment));
      edge = '...';
    }
  }

  let s: Reference<Element> | undefined = undefined;
  const src_links: string[] = [];
  for (s of link.src) {
    src_links.push(s.$refText);
  }
  const dst_links: string[] = [];
  for (s of link.dst) {
    dst_links.push(s.$refText);
  }

  // Collapse string array of style fragments to string:
  if (style_items.length > 0) {
    const link_style = style_items.join(',');

    // A styled link will be added to the link_style_dict.styled_links array
    if (!(link_style in link_style_dict.styled_links)) {
      // Initialize new entry
      link_style_dict.styled_links[link_style] = [];
    }

    // Add link indexes:
    link_style_dict.styled_links[link_style].push(
      ...Array.from(
        { length: src_links.length * dst_links.length },
        (value, index) => link_style_dict.count + index,
      ),
    );
  }

  // Increment the number of links (for styling purposes):
  link_style_dict.count += src_links.length * dst_links.length;

  //TODO: assign styling to ALL links (not only the first one)
  return (
    (comments.length > 0
      ? INDENTATION.repeat(nesting_level) +
        '%% ' +
        comments.join('\n' + INDENTATION.repeat(nesting_level) + '%% ') +
        '\n'
      : '') +
    INDENTATION.repeat(nesting_level) +
    `${src_links.join(' & ')} ${edge}${label} ${dst_links.join(' & ')}\n`
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
  link_style_dict: __mmd_link_style_dict,
): string[] {
  let label = Label_get_label(graph.label);
  if (label.length > 0) {
    label = label.trim();
  } else {
    label = '';
  }
  // Only render non-empty graph labels as MMD subgraph title:
  if (label.length > 0) {
    label = ` [${label}]`;
  }
  return [
    `\n${INDENTATION.repeat(nesting_level)}subgraph ${graph.name}${label}\n`,
    ...render_node_contents(graph, nesting_level + 1, link_style_dict),
    INDENTATION.repeat(nesting_level) + 'end\n\n',
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

  // The following items define the link style (which needs to be set at link level):

  // Link color:
  const fill_color = to_mmd_color(
    //StyleDefinitions_get_fill_color(style.definition.items),
    StyleDefinitions_get_color_value(style.definition.items, ['FillColor']),
    'fill',
  ); // MermaidJS: 'fill'

  const border_color = to_mmd_color(
    //StyleDefinitions_get_fill_color(style.definition.items),
    StyleDefinitions_get_color_value(style.definition.items, ['BorderColor']),
    'stroke',
  ); // MermaidJS: 'stroke'

  // Label (text) color:
  const label_color = to_mmd_color(
    //StyleDefinitions_get_label_color(style.definition.items),
    StyleDefinitions_get_color_value(style.definition.items, ['LabelColor']),
    'color',
  ); // MermaidJS: 'color' (named or #rgb or #rrggbb)

  // Link width:
  const border_width = to_mmd_line_width(
    StyleDefinitions_get_line_width_value(style.definition.items, ['BorderWidth']),
    'stroke-width',
  ); // MermaidJS: 'width' (with unit)

  // Line opacity:
  const border_opacity = to_mmd_opacity(
    StyleDefinitions_get_opacity_value(style.definition.items, ['LineOpacity']),
    'stroke-opacity',
  ); // MermaidJS: 'stroke-opacity' (0..1) or 0%..100%)

  const style_items: string[] = [
    fill_color,
    border_color,
    label_color,
    border_width,
    border_opacity,
  ].filter((s) => s !== undefined); // TODO

  let result =
    INDENTATION.repeat(nesting_level) +
    `%% style ${style.name} ${style.definition.$cstNode?.text.replaceAll(/[\r\n\s]+/g, ' ')}`;
  if (style_items.length > 0) {
    result +=
      '\n' + INDENTATION.repeat(nesting_level) + `classDef ${style.name} ${style_items.join(',')};`;
  }
  return result;
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
  if (NAMED_SHAPES.includes(shape)) {
    return shape;
  }
  console.warn(
    chalk.red(
      `shape_to_mmd_shape(${shape}) - unknown shape - not yet implemented (will use 'rect').`,
    ),
  );
  return 'rect';
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
  let color: string | undefined = undefined;
  if (isColorStyleDefinition(style_item)) {
    // Check the color definition
    const colorValue = style_item.value.color;

    if (isRgbColorDefinition(colorValue)) {
      // Not supported by MermaidJS - Convert to hex color code
      const red = colorValue.red;
      const green = colorValue.green;
      const blue = colorValue.blue;
      color =
        '#' +
        ('00' + red.toString(16)).slice(-2) +
        ('00' + green.toString(16)).slice(-2) +
        ('00' + blue.toString(16)).slice(-2);
    } else if (isHexColorDefinition(colorValue)) {
      color = colorValue.hex_color;
    } else {
      color = colorValue.color_name;
    }
  }
  console.info(
    chalk.gray(
      `to_mmd_color(${style_item?.topic}: ${style_item?.$cstNode?.text ?? '<$cstNode undefined>'}): mmd style: [ ${mmd_style_topic} ] -> color = "${color ?? '<undefined>'}"`,
    ),
  );
  if (color !== undefined) {
    return `${mmd_style_topic?.length == 0 ? '' : `${mmd_style_topic}:`}${color}`;
  }
  return undefined;
}

/**
 * Render a StyleDefinition LineWidth item in a style definition for MermaidJS
 * @param style_item the StyleDefinition LineWidth item to be rendered as MermaidJS color
 * @param mmd_style_topic the MermaidJS style topic to which the LineWidth applies
 * @returns the entire MermaidJS line width style definition ("<topic>: <line-width-value>")
 */
function to_mmd_line_width(
  style_item: StyleDefinition | undefined,
  mmd_style_topic: string | undefined,
) {
  let match: RegExpMatchArray | null | undefined = null;
  let errors = 0;

  if (isLineStyleDefinition(style_item) && style_item.topic == 'LineWidth') {
    // Check the line style definition -- already checked in graph-validator.ts
    match = /^(\d+|\.\d+|\d*\.\d+)( *([a-z]{2,3}))?$/.exec(style_item.value);
    if (match) {
      const value = match[1];
      const unit = match[3];
      const allowed_units = ['mm', 'cm', 'pc', 'pt', 'em', 'ex', 'rem', 'rex'];
      if (value.length == 0) {
        console.error(chalk.red(`Link width has invalid numeric value: '${style_item.value}'`));
        errors++;
      }
      if (unit.length > 0 && !allowed_units.includes(unit)) {
        console.error(chalk.red(`Link width has invalid unit: '${style_item.value}'`));
        errors++;
      }
      if (errors == 0) {
        if (unit.length > 0) {
          return `${mmd_style_topic?.length == 0 ? '' : `${mmd_style_topic}: `}${value}${unit}`;
        }
        return `${mmd_style_topic?.length == 0 ? '' : `${mmd_style_topic}: `}${value}`;
      }
    }
  }

  return undefined;
}

/**
 * Render a StyleDefinition *Opacity item in a style definition for MermaidJS (can be percentage or fraction of 1)
 * @param style_item the StyleDefinition LineOpacity item to be rendered as MermaidJS line-opacity
 * @param mmd_style_topic the MermaidJS style topic to which the LineOpacity applies
 * @returns the entire MermaidJS opacity style definition ("<topic>: <color-value>")
 */
function to_mmd_opacity(
  style_item: StyleDefinition | undefined,
  mmd_style_topic: string | undefined,
) {
  if (
    isOpacityStyleDefinition(style_item) &&
    ['LineAlpha', 'LineOpacity'].includes(style_item.topic)
  ) {
    // NOTE: checking already happened in graph-validator.ts
    const value = style_item.value;
    const opacity: number = value.opacity;
    return `${mmd_style_topic?.length == 0 ? '' : `${mmd_style_topic}:`}${opacity}${value.isPct == true ? '%' : ''}`;
  }
  return undefined;
}
