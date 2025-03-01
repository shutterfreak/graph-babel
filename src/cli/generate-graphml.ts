import chalk from 'chalk';
import { AstUtils, Reference } from 'langium';
import { expandToNode, joinToNode, toString } from 'langium/generate';
// import * as fs from "node:fs";
import * as path from 'node:path';
import { inspect } from 'util';

import {
  Element,
  Graph,
  GraphTerminals,
  Link,
  Model,
  Node,
  Style,
  isGraph,
  isLink,
  isNode,
  isStringLabel,
  isStyle,
  isStyleBlock,
  isStyleDefinition,
} from '../language/generated/ast.js';
import {
  Element_get_style_items,
  Label_get_label,
  StyleDefinition_toString,
  StyleDefinitions_get_color_value_as_hex,
  StyleDefinitions_get_label,
  StyleDefinitions_get_shape,
} from '../language/model-helpers.js';
import { extractDestinationAndName } from './cli-util.js';
import { GenerateOptions } from './main.js';

type yworks_graphml_shape = {
  type: string;
  shape: string;
};
export function NAMED_SHAPES_to_yworks_graphml_shape(
  named_shape: string | undefined,
): yworks_graphml_shape {
  if (named_shape === undefined || named_shape.length == 0) {
    return { type: 'ShapeNode', shape: 'rectangle' };
  }
  switch (named_shape) {
    case 'notch_rect':
    case 'card':
    case 'notched_rectangle': // Card - Represents a card
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.card' };

    case 'cyl':
    case 'cylinder':
    case 'database':
    case 'db': // Database - Database storage
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.dataBase' };
    case 'lin_cyl':
    case 'disk':
    case 'lined_cylinder': // Disk Storage - Disk storage
      console.warn(
        chalk.yellowBright(
          `Warning: shape '${named_shape}' will be mapped to yWorks GraphML GenericNode: com.yworks.flowchart.dataBase`,
        ),
      );
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.dataBase' };

    case 'diam':
    case 'diamond':
      return { type: 'ShapeNode', shape: 'diamond' };

    case 'decision':
    case 'question': // Decision - Decision-making step
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.decision' };

    case 'delay':
    case 'half_rounded_rectangle': // Delay - Represents a delay
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.delay' };

    case 'trap_t':
    case 'inv_trapezoid':
    case 'trapezoid_top': // Manual Operation - Represents a manual task
      return { type: 'ShapeNode', shape: 'trapezoid2' };
    case 'manual':
      return {
        type: 'GenericNode',
        shape: 'com.yworks.flowchart.manualOperation',
      };

    case 'trap_b':
    case 'priority':
    case 'trapezoid':
    case 'trapezoid_bottom': // Priority Action - Priority action
      return { type: 'ShapeNode', shape: 'trapezoid' };

    case 'rect':
    case 'rectangle': // Process - Standard process shape
      return { type: 'ShapeNode', shape: 'rectangle' };
    case 'proc':
    case 'process':
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.process' };

    case 'rounded':
    case 'event': // Event - Represents an event
      return { type: 'ShapeNode', shape: 'roundrectangle' };

    case 'doc':
    case 'document': // Document - Represents a document
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.document' };

    case 'brace_l':
    case 'brace':
    case 'comment': // Comment - Adds a comment
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.annotation' };
    case 'brace_r': // Comment Right - Adds a comment
    case 'braces': // Comment with braces on both sides - Adds a comment
      console.warn(
        chalk.yellowBright(
          `Warning: shape '${named_shape}' will be mapped to yWorks GraphML GenericNode: com.yworks.flowchart.annotation`,
        ),
      );
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.annotation' };

    case 'lean_r':
    case 'in_out':
    case 'lean_right': // Data Input/Output - Represents input or output
      return { type: 'ShapeNode', shape: 'parallelogram' };
    case 'lean_l':
    case 'lean_left':
    case 'out_in': // Data Input/Output - Represents output or input
      return { type: 'ShapeNode', shape: 'parallelogram2' };

    case 'curv_trap':
    case 'curved_trapezoid':
    case 'display': // Display - Represents a display
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.display' };

    case 'flag':
    case 'paper_tape': // Paper Tape - Paper tape
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.paperType' };

    case 'hex':
    case 'hexagon':
      return { type: 'ShapeNode', shape: 'hexagon' };
    case 'prepare': // Prepare Conditional - Preparation or condition step
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.preparation' };

    case 'h_cyl':
    case 'das':
    case 'horizontal_cylinder': // Direct Access Storage - Direct access storage
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.directData' };

    case 'tri':
    case 'extract':
    case 'triangle': // Extract - Extraction process
      return { type: 'ShapeNode', shape: 'triangle' };

    case 'flip_tri':
    case 'flipped_triangle':
    case 'manual_file': // Manual File - Manual file operation
      return { type: 'ShapeNode', shape: 'triangle2' };

    case 'win_pane':
    case 'internal_storage':
    case 'window_pane': // Internal Storage - Internal storage
      return {
        type: 'GenericNode',
        shape: 'com.yworks.flowchart.internalStorage',
      };

    case 'sl_rect':
    case 'manual_input':
    case 'sloped_rectangle': // Manual Input - Manual input step
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.manualInput' };

    case 'stadium':
    case 'pill':
    case 'terminal': // Terminal Point - Terminal point
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.terminator' };

    case 'fr_rect':
    case 'framed_rectangle':
    case 'subproc':
    case 'subprocess':
    case 'subroutine': // Subprocess - Subprocess
      return {
        type: 'GenericNode',
        shape: 'com.yworks.flowchart.predefinedProcess',
      };

    case 'circle':
    case 'circ': // Start - Starting point
    case 'sm_circ':
    case 'small_circle':
    case 'start': // Start - Small starting point
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.start2' };

    case 'odd': // Odd - Odd shape
      return {
        type: 'GenericNode',
        shape: 'com.yworks.flowchart.networkMessage',
      };

    case 'notch_pent':
    case 'loop_limit':
    case 'notched_pentagon': // Loop Limit - Loop limit step
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.loopLimit' };

    case 'bow_rect':
    case 'bow_tie_rectangle':
    case 'stored_data': // Stored Data - Stored data
      return { type: 'GenericNode', shape: 'com.yworks.flowchart.storedData' };

    default:
      console.warn(
        chalk.red(
          `Warning: shape '${named_shape}' not yet mapped to yWorks GraphML shape - assigning shape 'rectangle'`,
        ),
      );
      return { type: 'ShapeNode', shape: 'rectangle' };
  }
  /* TODO:
  "hourglass",
  "collate",
  "hourglass", // Collate - Represents a collate operation
  "bolt",
  "com_link",
  "lightning_bolt", // Com Link - Communication link
  "div_rect",
  "div_proc",
  "divided_process",
  "divided_rectangle", // Divided Process - Divided process shape
  "fork",
  "join", // Fork/Join - Fork or join in process flow
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
  "docs",
  "documents",
  "st_doc",
  "stacked_document", // Multi-Document - Multiple documents
  "st_rect",
  "processes",
  "procs",
  "stacked_rectangle", // Multi-Process - Multiple processes
  "dbl_circ",
  "double_circle", // Stop - Represents a stop point
  "fr_circ",
  "framed_circle",
  "stop", // Stop - Stop point
  "cross_circ",
  "crossed_circle",
  "summary", // Summary - Summary
  "tag_doc",
  "tagged_document", // Tagged Document - Tagged document
  "tag_rect",
  "tag_proc",
  "tagged_process",
  "tagged_rectangle", // Tagged Process - Tagged process
  "text", // Text Block - Text block
  */
}

export function generate_graphml_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): string {
  console.info(chalk.magentaBright(`generate_graphml - [${model.$type}] -- START`));

  const data = extractDestinationAndName(filePath, opts?.destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}-clean.graph`;

  for (const childNode of AstUtils.streamAllContents(model)) {
    let debug_log_message = '';

    // DEBUG - START
    const references = AstUtils.findLocalReferences(childNode);
    let i = 1;
    for (const ref of references) {
      const d = ref.$nodeDescription;
      const parent = ref.$refNode?.astNode.$container;

      console.log(
        chalk.green(
          `DBG : node of type '${childNode.$type}' - Found local reference ${i}: [${ref.$refText}] -> ` +
            (d === undefined
              ? '<undefiined>'
              : `type: '${d.type}', name: '${d.name}', path: '${d.path}'}`) +
            (parent === undefined ? '' : ` within parent of type: '${parent.$type}'`),
        ),
        chalk.gray(inspect(ref.$nodeDescription)),
      );
      i++;
    }
    // DEBUG - END

    if (isGraph(childNode)) {
      const element_count: number = childNode.elements.length;
      const style_count: number = childNode.styles.length;
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ''}'`;
      debug_log_message = `${preamble} and name '${childNode.id}' "${Label_get_label(childNode.label)}" -- ${element_count} element(s), ${style_count} style(s)`;
    } else if (isNode(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ''}'`;
      debug_log_message = `${preamble} "${Label_get_label(childNode.label)}"`;
    } else if (isLink(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ''}'`;

      const src_links: string[] = [];
      let s: Reference<Element> | undefined = undefined;
      for (s of childNode.src) {
        src_links.push(s.$refText);
      }
      const dst_links: string[] = [];
      for (s of childNode.dst) {
        dst_links.push(s.$refText);
      }
      const relation = childNode.relation === undefined ? '' : childNode.relation;
      const line: string = childNode.link === undefined ? '' : childNode.link;
      const link = relation.length > 0 ? relation : line;
      debug_log_message = `${preamble} ${src_links.join(',')} ${link} ${dst_links.join(',')} "${Label_get_label(childNode.label)}"`;
    } else if (isStyle(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type}`;
      debug_log_message = `${preamble} with name '${childNode.id}' (no direct access to StyleBlock)`;
    } else if (isStyleBlock(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type}`;
      debug_log_message = `${preamble} -- ${childNode.items.length | 0} item(s)`;
    } else if (isStyleDefinition(childNode)) {
      debug_log_message = `[${childNode.$containerIndex}] for style ${childNode.$container.$container.id}: ${StyleDefinition_toString([childNode])}"`;
    } else if (isStringLabel(childNode)) {
      debug_log_message = `${childNode.$type} "${Label_get_label(childNode)}"`;
    } else {
      debug_log_message = ` --- generic '${childNode.$type}' (not yet processed)`;
    }
    console.info(chalk.magentaBright(`generate_cleaned_graph - [${childNode.$type}]`));
    console.info(chalk.gray(debug_log_message));
    console.log(
      chalk.magenta(
        `generate_cleaned_graph() - childNode.$cstNode?.text := '${childNode.$cstNode?.text ?? '<not defined>'}' -- END`,
      ),
    );
  }

  const fileNode = expandToNode`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
  xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java"
  xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0"
  xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:y="http://www.yworks.com/xml/graphml"
  xmlns:yed="http://www.yworks.com/xml/yed/3"
  xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
  <!--Created by yEd 3.25-->
  <key attr.name="Description" attr.type="string" for="graph" id="d0"/>
  <key for="port" id="d1" yfiles.type="portgraphics"/>
  <key for="port" id="d2" yfiles.type="portgeometry"/>
  <key for="port" id="d3" yfiles.type="portuserdata"/>
  <key attr.name="url" attr.type="string" for="node" id="d4"/>
  <key attr.name="description" attr.type="string" for="node" id="d5"/>
  <key for="node" id="d6" yfiles.type="nodegraphics"/>
  <key for="graphml" id="d7" yfiles.type="resources"/>
  <key attr.name="url" attr.type="string" for="edge" id="d8"/>
  <key attr.name="description" attr.type="string" for="edge" id="d9"/>
  <key for="edge" id="d10" yfiles.type="edgegraphics"/>
    ${joinToNode(model.elements, (element) => render_Element(element), { appendNewLineIfNotEmpty: true })}
    ${joinToNode(model.styles, (style) => render_Style(style), { appendNewLineIfNotEmpty: true })}
</graphml>`.appendNewLineIfNotEmpty();

  function render_Element(element: Element): string {
    switch (element.$type) {
      case Graph:
        return render_Graph(element);
      case Node:
        return render_Node(element);
      case Link:
        return render_Link(element);
    }
  }

  function render_Graph(graph: Graph): string {
    const label = Label_get_label(graph.label);

    if (label.length > 0) {
      console.warn(
        chalk.redBright(
          `Warning: graph label not (yet) implemented for GraphML. Found: '${label}'`,
        ),
      );
    }

    console.log(
      chalk.magenta(
        `render_Graph(${graph.id}) - style := `,
        inspect(Element_get_style_items(graph)?.map((s) => StyleDefinition_toString([s]))),
      ),
    );

    return (
      `
<node id="${graph.id}">
  <!-- Graph rendered as node -->
  <data key="d5">${label}</data>` +
      graph.elements
        // .filter((e) => !isLink(e))
        .map((element) => render_Element(element))
        .join('\n') +
      `  <!-- Graph rendered as node -->
</node>`
    );
  }

  function render_Node(node: Node): string {
    const style_items = Element_get_style_items(node);

    let label: string | undefined = Label_get_label(node.label);
    if (label.length == 0) {
      label = StyleDefinitions_get_label(style_items) ?? '';
    }

    console.log(
      chalk.magenta(
        `render_Node(${node.id}) - style := `,
        inspect(style_items?.map((s) => StyleDefinition_toString([s]))),
      ),
    );

    console.log(chalk.green('GraphMl:Node - Style items:\n', inspect(style_items)));

    const fill_color_value = StyleDefinitions_get_color_value_as_hex(style_items, ['FillColor']);
    const border_color_value = StyleDefinitions_get_color_value_as_hex(style_items, [
      'BorderColor',
    ]);
    const label_color_value = StyleDefinitions_get_color_value_as_hex(style_items, ['LabelColor']);
    const shape = StyleDefinitions_get_shape(style_items);
    const graphml_shape: yworks_graphml_shape = NAMED_SHAPES_to_yworks_graphml_shape(shape);

    // return `<node id="${node.id}" /><!-- label: "${label}" -->`;

    return `<node id="${node.id}">
  <data key="d5"/>
  <data key="d6">
    <y:${graphml_shape.type}${graphml_shape.type == 'GenericNode' ? ` configuration="${graphml_shape.shape}"` : ''} >
      <y:Geometry height="30.0" width="30.0" x="0.0" y="0.0"/>${
        fill_color_value === undefined
          ? ''
          : `
      <y:Fill color="${fill_color_value}" transparent="false"/>`
      }
      <y:BorderStyle${border_color_value === undefined ? '' : ` color="${border_color_value}"`} raised="false" type="line" width="1.0"/>
      <y:NodeLabel fontFamily="Dialog" fontSize="12" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false"${label_color_value === undefined ? '' : ` textColor="${label_color_value}"`} xml:space="preserve">${label}</y:NodeLabel>
      ${graphml_shape.type == 'ShapeNode' ? `<y:Shape type="${graphml_shape.shape}"/>` : ''}
    </y:${graphml_shape.type}>
  </data>
</node>`;
  }

  function render_Link(link: Link): string {
    const style_items = Element_get_style_items(link);

    let label: string | undefined = Label_get_label(link.label);
    if (label.length == 0) {
      label = StyleDefinitions_get_label(style_items) ?? '';
    }

    console.log(
      chalk.magenta(
        `render_Link(${link.id ?? '<no name>'}) - style := `,
        inspect(Element_get_style_items(link)?.map((s) => StyleDefinition_toString([s]))),
      ),
    );

    const src_links: string[] = [];
    let s: Reference<Element> | undefined = undefined;
    for (s of link.src) {
      src_links.push(s.$refText);
    }
    const dst_links: string[] = [];
    for (s of link.dst) {
      dst_links.push(s.$refText);
    }
    const relation = link.relation === undefined ? '' : link.relation;
    const link_style = link.link === undefined ? '' : link.link;

    let link_definition = '';
    if (relation.length > 0) {
      link_definition = relation;
    } else if (link_style.length > 0) {
      link_definition = link_style;
    } else {
      console.error("Error: this can't happen.");
    }
    if (link_definition.length > 0) {
      console.warn(
        chalk.redBright(`Warning: edge (link) styling not yet implemented. Found: '${link_style}'`),
      );
    }

    // LINK STYLE AND ARROW HEADS - START
    const comments: string[] = [];
    let comment = '';
    const GRAPHML_ARROWHEADS = {
      none: 'none', // No arrow head
      standard: 'standard', // Standard arrow head
      delta: 'delta', // Triangular arrow head, filled
      white_delta: 'white_delta', // Same, filled in white
      diamond: 'diamond', // Diamond arrow head, filled
      white_diamond: 'white_diamond', // Same, filled in white
      circle: 'circle', // Circle, filled
      transparent_circle: 'transparent_circle', // Circle, not filled
      plain: 'plain', // Plain (straight) arrow
      cross: 'cross', // Cross
      // TODO: add other arrow heads
    };

    const GRAPHML_LINE_STYLES = {
      line: 'line',
      dotted: 'dotted',
      dashed: 'dashed',
      dashed_dotted: 'dashed_dotted',
    };

    let arrowhead_src: string = GRAPHML_ARROWHEADS.none;
    let arrowhead_dst: string = GRAPHML_ARROWHEADS.none;
    let edge_style: string | undefined = undefined;
    if (link.relation !== undefined && link.relation.length > 0) {
      // 'relation' defined:
      edge_style = GRAPHML_LINE_STYLES.line;
      switch (link.relation) {
        case 'to':
          arrowhead_dst = GRAPHML_ARROWHEADS.standard;
          break;
        case 'with':
          break;
        default: // Error - shouldn't happen
          break;
      }
    } else {
      // 'link' defined:
      if (link.link !== undefined && link.link.length > 0) {
        const match = GraphTerminals.LINK_TYPE.exec(link.link);
        if (match) {
          const src_head = match[1] ?? '';
          const line = match[2] ?? '';
          let dst_head = match[3] ?? '';

          // Arrowhead at source:
          if (src_head.length > 0) {
            switch (src_head) {
              case '<':
                arrowhead_src = GRAPHML_ARROWHEADS.standard;
                break;
              case 'o':
                arrowhead_src = GRAPHML_ARROWHEADS.transparent_circle;
                break;
              case 'x':
                arrowhead_src = GRAPHML_ARROWHEADS.cross;
                break;
              case '<>':
                arrowhead_src = GRAPHML_ARROWHEADS.white_diamond;
                break;
              case '<|':
                arrowhead_src = GRAPHML_ARROWHEADS.white_delta;
                break;

              default:
                comment = `Warning: source arrowhead '${src_head}' is not (yet) available in a yEd GraphML graph. Will render as 'standard'. Source: '${link.$cstNode?.text}'`;
                comments.push(comment);
                console.warn(chalk.red(comment));
                arrowhead_src = GRAPHML_ARROWHEADS.standard;
            }
          }

          // Arrowhead at destination:
          if (dst_head.length > 0) {
            switch (dst_head) {
              case '>':
                arrowhead_dst = GRAPHML_ARROWHEADS.standard;
                break;

              case 'o':
                arrowhead_dst = GRAPHML_ARROWHEADS.transparent_circle;
                break;

              case 'x':
                arrowhead_dst = GRAPHML_ARROWHEADS.cross;
                break;

              case '<>':
                arrowhead_dst = GRAPHML_ARROWHEADS.white_diamond;
                break;
              case '|>':
                arrowhead_dst = GRAPHML_ARROWHEADS.white_delta;
                break;
              default:
                comment = `Warning: destination arrowhead '${dst_head}' is not (yet) available in a yEd GraphML graph. Will render as 'standard'. Source: '${link.$cstNode?.text}'`;
                comments.push(comment);
                console.warn(chalk.red(comment));
                dst_head = '>';
            }
          }

          // Line style:
          if (line.length > 0) {
            if (/(-{2,}|\.{2,}|={2,}|~{2,}|-\.+-)/.exec(line) === null) {
              comment = `Warning: line style '${line}' is not (yet) available in a yEd GraphML graph. Will render as 'dotted'. Source: '${link.$cstNode?.text}'`;
              console.warn(chalk.red(comment));
              edge_style = GRAPHML_LINE_STYLES.dotted;
            }
          }

          // Generate edge:
        } else {
          // No match
          comment = `Error: invalid line style: '${link.$cstNode?.text}'. Will render as 'dotted'. Source: '${link.$cstNode?.text}'`;
          comments.push(comment);
          console.error(chalk.red(comment));
          edge_style = GRAPHML_LINE_STYLES.dotted;
        }
      } else {
        comment = `Error: line style missing: '${link.$cstNode?.text}'. Will render as 'dotted'. Source: '${link.$cstNode?.text}'`;
        comments.push(comment);
        console.error(chalk.red(comment));
        edge_style = GRAPHML_LINE_STYLES.dotted;
      }
    }
    // LINK STYLE AND ARROW HEADS - END

    const line_color_value = StyleDefinitions_get_color_value_as_hex(style_items, ['LineColor']);
    const label_color_value = StyleDefinitions_get_color_value_as_hex(style_items, ['LabelColor']);

    //return(`<!-- edge from ${src} to ${dst} removed ->`)
    const lines: string[] = [];
    for (const src of src_links) {
      for (const dst of dst_links) {
        lines.push(`
<edge ${link.id == null ? '' : `id="${link.id}" `}source="${src}" target="${dst}">
  <data key="d9"/>
  <data key="d10">
    <y:PolyLineEdge>
      <y:LineStyle${line_color_value === undefined ? '' : ` color="${line_color_value}"`} type="${edge_style}" width="1.0"/>
      <y:Arrows source="${arrowhead_src}" target="${arrowhead_dst}"/>
      <y:EdgeLabel fontFamily="Dialog" fontSize="12" fontStyle="plain" hasBackgroundColor="false" ${label_color_value === undefined ? 'hasLineColor="false"' : `textColor="${label_color_value}"`} xml:space="preserve">${label}</y:EdgeLabel>
    </y:PolyLineEdge>
  </data>
</edge>`);
      }
    }

    return lines.join('\n');
  }

  function render_Style(style: Style): string {
    return `<!-- Style definitions not yet fully implemented in GraphML: '${style.$cstNode?.text}' -->`;
  }

  /*
        if (!fs.existsSync(data.destination)) {
            fs.mkdirSync(data.destination, { recursive: true });
        }
        fs.writeFileSync(generatedFilePath, toString(fileNode));
        */
  console.log(
    chalk.yellow(
      '\ngenerate_cleaned_graph() DEBUG - model::START\n',
      inspect(model),
      '\ngenerate_cleaned_graph() DEBUG - model::END\n',
    ),
  );
  if (model.$document?.references) {
    for (const ref of model.$document.references) {
      console.log(
        chalk.greenBright.bgGray(
          `Reference '${ref.$refText}' (type: ${ref.ref?.$type}) ${ref.ref?.$container ? ` - in container #${ref.ref.$container.$containerIndex} of type '${ref.ref.$container.$type}'` : ''}`,
        ),
        // chalk.green(inspect(ref))
      );
    }
  }
  console.log(toString(fileNode));
  return generatedFilePath;
}
