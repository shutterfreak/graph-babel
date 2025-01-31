import {
  Graph,
  Node,
  Link,
  Element,
  Model,
  Style,
  isStyleDefinition,
  isGraph,
  isNode,
  isLink,
  isStringLabel,
  isStyle,
  isStyleBlock,
} from "../language/generated/ast.js";
import { AstUtils, Reference } from "langium";
import { expandToNode, joinToNode, toString } from "langium/generate";
// import * as fs from "node:fs";
import * as path from "node:path";
import { inspect } from "util";
import { extractDestinationAndName } from "./cli-util.js";
import { GenerateOptions } from "./main.js";
import {
  Element_get_style_items,
  Label_get_label,
  StyleDefinition_toString,
} from "../language/model-helpers.js";
import chalk from "chalk";

export function generate_cleaned_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): string {
  console.info(
    chalk.magentaBright(`generate_cleaned_graph - [${model.$type}] -- START`),
  );

  const data = extractDestinationAndName(filePath, opts?.destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}-clean.graph`;
  const INDENTATION = "  ";
  const level = 0;

  for (const childNode of AstUtils.streamAllContents(model)) {
    let debug_log_message = "";

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
              ? "<undefiined>"
              : `type: '${d.type}', name: '${d.name}', path: '${d.path}'}`) +
            (parent === undefined
              ? ""
              : ` within parent of type: '${parent.$type}'`),
        ),
        chalk.gray(inspect(ref.$nodeDescription)),
      );
      i++;
    }
    // DEBUG - END

    if (isGraph(childNode)) {
      const element_count: number = childNode.elements.length;
      const style_count: number = childNode.styles.length;
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ""}'`;
      debug_log_message = `${preamble} and name '${childNode.id}' "${Label_get_label(childNode.label)}" -- ${element_count} element(s), ${style_count} style(s)`;
    } else if (isNode(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ""}'`;
      debug_log_message = `${preamble} "${Label_get_label(childNode.label)}"`;
    } else if (isLink(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.styleref ? `:${childNode.styleref.$refText}` : ""}'`;

      const src_links: string[] = [];
      let s: Reference<Element> | undefined = undefined;
      for (s of childNode.src) {
        src_links.push(s.$refText);
      }
      const dst_links: string[] = [];
      for (s of childNode.dst) {
        dst_links.push(s.$refText);
      }

      debug_log_message = `${preamble} ${src_links.join(",")} ${childNode.kind} ${dst_links.join(",")} "${Label_get_label(childNode.label)}"`;
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
    console.info(
      chalk.magentaBright(`generate_cleaned_graph - [${childNode.$type}]`),
    );
    console.info(chalk.gray(debug_log_message));
    console.log(
      chalk.magenta(
        `generate_cleaned_graph() - childNode.$cstNode?.text := '${childNode.$cstNode?.text ?? "<not defined>"}' -- END`,
      ),
    );
  }

  const fileNode = expandToNode`
      ${joinToNode(model.elements, (element) => render_Element(element, level), { appendNewLineIfNotEmpty: true })}
      ${joinToNode(model.styles, (style) => render_Style(style, level), { appendNewLineIfNotEmpty: true })}
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
        `render_Graph(${graph.id}) - style := `,
        inspect(
          Element_get_style_items(graph)?.map((s) =>
            StyleDefinition_toString([s]),
          ),
        ),
      ),
    );

    return (
      `${INDENTATION.repeat(level)}graph${graph.styleref ? `:${graph.styleref.$refText}` : ""} ${graph.id}${label !== "" ? ` "${label}"` : ""} {\n` +
      graph.elements
        .map((element) => render_Element(element, level + 1))
        .join("\n") +
      (graph.elements.length > 0 ? "\n" : "") +
      graph.styles.map((style) => render_Style(style, level + 1)).join("\n") +
      (graph.styles.length > 0 ? "\n" : "") +
      `${INDENTATION.repeat(level)}}`
    );
  }

  function render_Node(node: Node, level: number): string {
    const label = Label_get_label(node.label);

    console.log(
      chalk.magenta(
        `render_Node(${node.id}) - style := `,
        inspect(
          Element_get_style_items(node)?.map((s) =>
            StyleDefinition_toString([s]),
          ),
        ),
      ),
    );

    return `${INDENTATION.repeat(level)}node${node.styleref ? `:${node.styleref.$refText}` : ""} ${node.id}${label !== "" ? ` "${label}"` : ""}`;
  }

  function render_Link(link: Link, level: number): string {
    const label = Label_get_label(link.label);

    console.log(
      chalk.magenta(
        `render_Link(${link.id ?? "<no name>"}) - style := `,
        inspect(
          Element_get_style_items(link)?.map((s) =>
            StyleDefinition_toString([s]),
          ),
        ),
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

    return `${INDENTATION.repeat(level)}link${link.styleref ? `:${link.styleref.$refText}` : ""} ${link.id != null ? `(${link.id}) ` : ""}${src_links.join(",")} ${link.kind} ${dst_links.join(",")}${label !== "" ? ` "${label}"` : ""}`;
  }

  function render_Style(style: Style, level: number): string {
    return `${INDENTATION.repeat(level)}style ${style.id} {\n${style.definition.items
      .map(
        (it) =>
          `${INDENTATION.repeat(level + 1)}${StyleDefinition_toString([it])}";`,
      )
      .join("\n")}\n${INDENTATION.repeat(level)}}`;
  }

  /*
  if (!fs.existsSync(data.destination)) {
      fs.mkdirSync(data.destination, { recursive: true });
  }
  fs.writeFileSync(generatedFilePath, toString(fileNode));
  */
  console.log(
    chalk.yellow(
      "\ngenerate_cleaned_graph() DEBUG - model::START\n",
      inspect(model),
      "\ngenerate_cleaned_graph() DEBUG - model::END\n",
    ),
  );
  if (model.$document?.references) {
    for (const ref of model.$document.references) {
      console.log(
        chalk.greenBright.bgGray(
          `Reference '${ref.$refText}' (type: ${ref.ref?.$type}) ${ref.ref?.$container ? ` - in container #${ref.ref.$container.$containerIndex} of type '${ref.ref.$container.$type}'` : ""}`,
        ),
        // chalk.green(inspect(ref))
      );
    }
  }
  console.log(toString(fileNode));
  return generatedFilePath;
}
