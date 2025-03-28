import chalk from 'chalk';
import { AstUtils, Reference } from 'langium';
import { expandToNode, joinToNode, toString } from 'langium/generate';
// import * as fs from "node:fs";
import * as path from 'node:path';
import { inspect } from 'util';

import {
  Element,
  ElementAlias,
  Graph,
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
} from '../language/model-helpers.js';
import { extractDestinationAndName } from './cli-util.js';
import { GenerateOptions } from './main.js';

export function generate_cleaned_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): string {
  console.info(chalk.magentaBright(`generate_cleaned_graph - [${model.$type}] -- START`));

  const data = extractDestinationAndName(filePath, opts?.destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}-clean.graph`;
  const INDENTATION = '  ';
  const level = 0;

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
      debug_log_message = `${preamble} and name '${childNode.name}' "${Label_get_label(childNode.label)}" -- ${element_count} element(s), ${style_count} style(s)`;
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
      debug_log_message = `${preamble} with name '${childNode.name}' (no direct access to StyleBlock)`;
    } else if (isStyleBlock(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type}`;
      debug_log_message = `${preamble} -- ${childNode.items.length | 0} item(s)`;
    } else if (isStyleDefinition(childNode)) {
      debug_log_message = `[${childNode.$containerIndex}] for style ${childNode.$container.$container.name}: ${StyleDefinition_toString([childNode])}"`;
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

  const fileNode = expandToNode`
      ${joinToNode(model.styles, (style) => render_Style(style, level), { appendNewLineIfNotEmpty: true })}
      ${joinToNode(model.aliases, (alias) => render_ElementAlias(alias, level), { appendNewLineIfNotEmpty: true })}
      ${joinToNode(model.elements, (element) => render_Element(element, level), { appendNewLineIfNotEmpty: true })}
  `.appendNewLineIfNotEmpty();

  function render_Element(element: Element, level: number): string {
    switch (element.$type) {
      case Graph:
        return render_Graph(element, level);
      case Node:
        return render_Node(element, level);
      case Link:
        return render_Link(element, level);
    }
  }

  function render_Graph(graph: Graph, level: number): string {
    const label = Label_get_label(graph.label);

    console.log(
      chalk.magenta(
        `render_Graph(${graph.name}) - style := `,
        inspect(Element_get_style_items(graph)?.map((s) => StyleDefinition_toString([s]))),
      ),
    );

    return (
      `${INDENTATION.repeat(level)}graph${graph.styleref ? `:${graph.styleref.$refText}` : ''} ${graph.name}${label !== '' ? ` "${label}"` : ''} {\n` +
      graph.styles.map((style) => render_Style(style, level + 1)).join('\n') +
      (graph.styles.length > 0 ? '\n' : '') +
      graph.aliases.map((alias) => render_ElementAlias(alias, level + 1)).join('\n') +
      (graph.elements.length > 0 ? '\n' : '') +
      graph.elements.map((element) => render_Element(element, level + 1)).join('\n') +
      (graph.elements.length > 0 ? '\n' : '') +
      `${INDENTATION.repeat(level)}}`
    );
  }

  function render_Node(node: Node, level: number): string {
    const label = Label_get_label(node.label);

    console.log(
      chalk.magenta(
        `render_Node(${node.name}) - style := `,
        inspect(Element_get_style_items(node)?.map((s) => StyleDefinition_toString([s]))),
      ),
    );
    // Update node start keyword if a ElementAlias has been used:
    const node_keyword = node.alias?.$refText ?? 'node';

    return `${INDENTATION.repeat(level)}${node_keyword}${node.styleref ? `:${node.styleref.$refText}` : ''} ${node.name}${label !== '' ? ` "${label}"` : ''}`;
  }

  function render_Link(link: Link, level: number): string {
    const label = Label_get_label(link.label);

    console.log(
      chalk.magenta(
        `render_Link(${link.name ?? '<no name>'}) - style := `,
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
    /*
    const src_head: string = link.src_head === undefined ? "" : link.src_head;
    const dst_head: string = link.dst_head === undefined ? "" : link.dst_head;
    const line: string = link.line === undefined ? "" : link.line;
    */
    let link_definition = '';
    if (relation.length > 0) {
      link_definition = relation;
    } else if (link_style.length > 0) {
      link_definition = link_style;
    } else {
      console.error("Error: this can't happen.");
    }

    return `${INDENTATION.repeat(level)}link${link.styleref ? `:${link.styleref.$refText}` : ''} ${link.name != null ? `(${link.name}) ` : ''}${src_links.join(',')} ${link_definition} ${dst_links.join(',')}${label !== '' ? ` "${label}"` : ''}`;
  }

  function render_Style(style: Style, level: number): string {
    return `${INDENTATION.repeat(level)}style ${style.name} {\n${style.definition.items
      .map((it) => `${INDENTATION.repeat(level + 1)}${StyleDefinition_toString([it])}";`)
      .join('\n')}\n${INDENTATION.repeat(level)}}`;
  }

  function render_ElementAlias(elementAlias: ElementAlias, level: number): string {
    // Logic to render ElementAlias
    // For Example, you could render it as a comment, or expand to the node it represents.
    // The below case renders it as a comment.
    return `${INDENTATION.repeat(level)}// ElementAlias: ${elementAlias.name} (styleref: ${elementAlias.styleref?.$refText})`;
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
