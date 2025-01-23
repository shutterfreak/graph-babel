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
import { AstUtils } from "langium";
import { expandToNode, joinToNode, toString } from "langium/generate";
// import * as fs from "node:fs";
import * as path from "node:path";
import { inspect } from "util";
import { extractDestinationAndName } from "./cli-util.js";
import { GenerateOptions } from "./main.js";
import { Element_get_style_items, Label_get_label } from "./model-helpers.js";
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
    let foo = "";

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

    // if (childNode.$type === StyleDefinition) {
    if (isGraph(childNode)) {
      const element_count: number = childNode.elements.length;
      const style_count: number = childNode.styles.length;
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.style ? `:${childNode.style.$refText}` : ""}'`;
      foo = `${preamble} and name '${childNode.name}' "${Label_get_label(childNode.label)}" -- ${element_count} element(s), ${style_count} style(s)`;
    } else if (isNode(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.style ? `:${childNode.style.$refText}` : ""}'`;
      foo = `${preamble} "${Label_get_label(childNode.label)}"`;
    } else if (isLink(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type} with style '${childNode.style ? `:${childNode.style.$refText}` : ""}'`;
      foo = `${preamble} ${childNode.src.$refText} --> ${childNode.dst.$refText} "${Label_get_label(childNode.label)}"`;
    } else if (isStyle(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type}`;
      foo = `${preamble} with name '${childNode.name}' (no direct access to StyleBlock)`;
    } else if (isStyleBlock(childNode)) {
      const preamble = `[${childNode.$containerIndex}] ${childNode.$type}`;
      foo = `${preamble} -- ${childNode.items.length | 0} item(s)`;
    } else if (isStyleDefinition(childNode)) {
      const topic = childNode.topic;
      const def = childNode.value;
      // let props = childNode.$containerProperty
      // let i = childNode.$container.$containerIndex
      foo = `[${childNode.$containerIndex}] for style ${childNode.$container.$container.name}: ${topic}: "${def}"`;
    } else if (isStringLabel(childNode)) {
      foo = `${childNode.$type} "${Label_get_label(childNode)}"`;
    } else {
      foo = ` --- generic '${childNode.$type}' (not yet processed)`;
    }
    console.info(
      chalk.magentaBright(`generate_cleaned_graph - [${childNode.$type}]`),
    );
    console.info(chalk.gray(foo));
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
        `render_Graph(${graph.name}) - style := `,
        inspect(
          Element_get_style_items(graph)?.map(
            (s) => `${s.topic} : "${s.value}"`,
          ),
        ),
      ),
    );

    return (
      `${INDENTATION.repeat(level)}${graph.$type} ${graph.name}${label !== "" ? ` "${label}"` : ""} {\n` +
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
        `render_Node(${node.name}) - style := `,
        inspect(
          Element_get_style_items(node)?.map(
            (s) => `${s.topic} : "${s.value}"`,
          ),
        ),
      ),
    );

    return `${INDENTATION.repeat(level)}${node.$type} ${node.name}${label !== "" ? ` "${label}"` : ""}`;
  }

  function render_Link(link: Link, level: number): string {
    const label = Label_get_label(link.label);

    console.log(
      chalk.magenta(
        `render_Link(${link.name ?? "<no name>"}) - style := `,
        inspect(
          Element_get_style_items(link)?.map(
            (s) => `${s.topic} : "${s.value}"`,
          ),
        ),
      ),
    );

    return `${INDENTATION.repeat(level)}${link.$type} ${link.name != null ? `(${link.name}) ` : ""} ${link.src.ref?.name} to ${link.dst.ref?.name}${label !== null ? ` "${label}"` : ""}`;
  }

  function render_Style(style: Style, level: number): string {
    return `${INDENTATION.repeat(level)}${style.$type} ${style.name} TODO`;
  }

  /*
  if (!fs.existsSync(data.destination)) {
      fs.mkdirSync(data.destination, { recursive: true });
  }
  fs.writeFileSync(generatedFilePath, toString(fileNode));
  */
  console.log(chalk.yellow(inspect(model)));
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
