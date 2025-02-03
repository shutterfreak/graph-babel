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

export function generate_graphml_graph(
  model: Model,
  filePath: string,
  opts: GenerateOptions | undefined,
): string {
  console.info(
    chalk.magentaBright(`generate_graphml - [${model.$type}] -- START`),
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
      const relation =
        childNode.relation === undefined ? "" : childNode.relation;
      const line: string = childNode.link === undefined ? "" : childNode.link;
      const link = relation.length > 0 ? relation : line;
      debug_log_message = `${preamble} ${src_links.join(",")} ${link} ${dst_links.join(",")} "${Label_get_label(childNode.label)}"`;
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

  const fileNode =
    expandToNode`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!--Created by yFiles for HTML 3.0-EAP3a-->
<graphml xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml.html/2.0/ygraphml.xsd "
	xmlns="http://graphml.graphdrawing.org/xmlns"
	xmlns:yca="http://www.yworks.com/xml/yfiles-compat-arrows/1.0"
	xmlns:ycns="http://www.yworks.com/xml/yfiles-compat-node-styles/1.0"
	xmlns:yjs2="http://www.yworks.com/xml/yfiles-for-html/2.0/xaml"
	xmlns:demostyle2="http://www.yworks.com/yFilesHTML/demos/FlatDemoStyle/2.0"
	xmlns:demostyle="http://www.yworks.com/yFilesHTML/demos/FlatDemoStyle/1.0"
	xmlns:icon-style="http://www.yworks.com/yed-live/icon-style/1.0"
	xmlns:bpmn="http://www.yworks.com/xml/yfiles-bpmn/2.0"
	xmlns:demotablestyle="http://www.yworks.com/yFilesHTML/demos/FlatDemoTableStyle/1.0"
	xmlns:uml="http://www.yworks.com/yFilesHTML/demos/UMLDemoStyle/1.0"
	xmlns:GraphvizNodeStyle="http://www.yworks.com/yFilesHTML/graphviz-node-style/1.0"
	xmlns:Vue2jsNodeStyle="http://www.yworks.com/demos/yfiles-vuejs-node-style/1.0"
	xmlns:Vue3jsNodeStyle="http://www.yworks.com/demos/yfiles-vue-node-style/3.0"
	xmlns:explorer-style="http://www.yworks.com/data-explorer/1.0"
	xmlns:yx="http://www.yworks.com/xml/yfiles-common/4.0"
	xmlns:y="http://www.yworks.com/xml/yfiles-common/3.0"
	xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/3.0"
	xmlns:yjs="http://www.yworks.com/xml/yfiles-for-html/3.0/xaml"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<key id="d0" for="node" attr.type="int" attr.name="zOrder" y:attr.uri="http://www.yworks.com/xml/yfiles-z-order/1.0/zOrder"/>
	<key id="d1" for="node" attr.type="boolean" attr.name="Expanded" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/folding/Expanded">
		<default>true</default>
	</key>
	<key id="d2" for="node" attr.type="string" attr.name="url"/>
	<key id="d3" for="node" attr.type="string" attr.name="description"/>
	<key id="d4" for="node" attr.name="NodeLabels" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/NodeLabels"/>
	<key id="d5" for="node" attr.name="NodeGeometry" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/NodeGeometry"/>
	<key id="d6" for="all" attr.name="UserTags" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/UserTags"/>
	<key id="d7" for="node" attr.name="NodeStyle" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/NodeStyle"/>
	<key id="d8" for="node" attr.name="NodeViewState" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/folding/1.1/NodeViewState"/>
	<key id="d9" for="edge" attr.type="string" attr.name="url"/>
	<key id="d10" for="edge" attr.type="string" attr.name="description"/>
	<key id="d11" for="edge" attr.name="EdgeLabels" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/EdgeLabels"/>
	<key id="d12" for="edge" attr.name="EdgeGeometry" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/EdgeGeometry"/>
	<key id="d13" for="edge" attr.name="EdgeStyle" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/EdgeStyle"/>
	<key id="d14" for="edge" attr.name="EdgeViewState" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/folding/1.1/EdgeViewState"/>
	<key id="d15" for="port" attr.name="PortLabels" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/PortLabels"/>
	<key id="d16" for="port" attr.name="PortLocationParameter" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/PortLocationParameter">
		<default>
			<x:Static Member="y:FreeNodePortLocationModel.NodeCenterAnchored"/>
		</default>
	</key>
	<key id="d17" for="port" attr.name="PortStyle" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/PortStyle">
		<default>
			<x:Static Member="y:VoidPortStyle.Instance"/>
		</default>
	</key>
	<key id="d18" for="port" attr.name="PortViewState" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/folding/1.1/PortViewState"/>
	<key id="d19" attr.name="SharedData" y:attr.uri="http://www.yworks.com/xml/yfiles-common/2.0/SharedData"/>
	<data key="d19">
		<y:SharedData>
			<yx:ExteriorNodeLabelModel x:Key="1" Margins="5"/>
			<yx:CompositeLabelModelParameter x:Key="2">
				<yx:CompositeLabelModelParameter.Parameter>
					<yx:ExteriorNodeLabelModelParameter Position="Bottom" Model="{y:GraphMLReference 1}"/>
				</yx:CompositeLabelModelParameter.Parameter>
				<yx:CompositeLabelModelParameter.Model>
					<yx:CompositeLabelModel>
						<yx:CompositeLabelModel.Models>
							<yx:CompositeLabelModelModelPair Model="{y:GraphMLReference 1}"/>
							<yx:CompositeLabelModelModelPair>
								<yx:CompositeLabelModelModelPair.Model>
									<yx:InteriorNodeLabelModel/>
								</yx:CompositeLabelModelModelPair.Model>
							</yx:CompositeLabelModelModelPair>
							<yx:CompositeLabelModelModelPair Model="{x:Static yx:FreeNodeLabelModel.Instance}"/>
						</yx:CompositeLabelModel.Models>
					</yx:CompositeLabelModel>
				</yx:CompositeLabelModelParameter.Model>
			</yx:CompositeLabelModelParameter>
			<yjs:LabelStyle x:Key="3" verticalTextAlignment="CENTER" horizontalTextAlignment="CENTER">
				<yjs:LabelStyle.font>
					<yjs:Font fontSize="12" lineSpacing="0.2"/>
				</yjs:LabelStyle.font>
				<yjs:LabelStyle.textFill>
					<yjs:CssFill cssString="white"/>
				</yjs:LabelStyle.textFill>
			</yjs:LabelStyle>
			<yjs:Stroke x:Key="4">
				<yjs:Stroke.fill>
					<yjs:CssFill cssString="#663800"/>
				</yjs:Stroke.fill>
			</yjs:Stroke>
			<yjs:Stroke x:Key="5">
				<yjs:Stroke.fill>
					<yjs:CssFill cssString="#ffffff"/>
				</yjs:Stroke.fill>
			</yjs:Stroke>
		</y:SharedData>
	</data>
            ${joinToNode(model.elements, (element) => render_Element(element, level), { appendNewLineIfNotEmpty: true })}
            ${joinToNode(model.styles, (style) => render_Style(style, level), { appendNewLineIfNotEmpty: true })}
        </graphml>`.appendNewLineIfNotEmpty();

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
        inspect(
          Element_get_style_items(graph)?.map((s) =>
            StyleDefinition_toString([s]),
          ),
        ),
      ),
    );

    return (
      `${INDENTATION.repeat(level)}<graph id="${graph.id}">\n` +
      graph.elements
        .map((element) => render_Element(element, level + 1))
        .join("\n") +
      (graph.elements.length > 0 ? "\n" : "") +
      /*
            graph.styles.map((style) => render_Style(style, level + 1)).join("\n") +
            (graph.styles.length > 0 ? "\n" : "") +
            */
      `${INDENTATION.repeat(level)}</graph>`
    );
  }

  function render_Node(node: Node, level: number): string {
    const label = Label_get_label(node.label);

    if (label.length > 0) {
      console.warn(
        chalk.redBright(
          `Warning: node label not (yet) implemented for GraphML. Found: '${label}'`,
        ),
      );
    }

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

    return `${INDENTATION.repeat(level)}<node id="${node.id}">
    ${INDENTATION.repeat(level + 1)}<data key="d4">
	${INDENTATION.repeat(level + 2)}<x:List>
	${INDENTATION.repeat(level + 3)}<y:Label Text="${label}" LayoutParameter="{y:GraphMLReference 2}" Style="{y:GraphMLReference 3}"/>
	${INDENTATION.repeat(level + 2)}</x:List>
	${INDENTATION.repeat(level + 1)}</data>
    ${INDENTATION.repeat(level + 1)}<data key="d5">
    ${INDENTATION.repeat(level + 2)}<y:RectD X="0" Y="0" Width="60" Height="60"/>
	${INDENTATION.repeat(level + 1)}</data>
    ${INDENTATION.repeat(level + 1)}<data key="d7">
	${INDENTATION.repeat(level + 2)}<yjs:ShapeNodeStyle stroke="{y:GraphMLReference 4}" fill="DARK_ORANGE"/>
	${INDENTATION.repeat(level + 1)}</data>
    ${INDENTATION.repeat(level)}</node>`;
  }

  function render_Link(link: Link, level: number): string {
    const label = Label_get_label(link.label);

    if (label.length > 0) {
      console.warn(
        chalk.redBright(
          `Warning: edge (link) label not (yet) implemented for GraphML. Found: '${label}'`,
        ),
      );
    }

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
    const relation = link.relation === undefined ? "" : link.relation;
    const link_style = link.link === undefined ? "" : link.link;

    let link_definition = "";
    if (relation.length > 0) {
      link_definition = relation;
    } else if (link_style.length > 0) {
      link_definition = link_style;
    } else {
      console.error("Error: this can't happen.");
    }
    if (link_definition.length > 0) {
      console.warn(
        chalk.redBright(
          `Warning: edge (link) styling not yet implemented. Found: '${link_style}'`,
        ),
      );
    }
    const lines: string[] = [];
    for (const src of src_links) {
      for (const dst of dst_links) {
        lines.push(
          `${INDENTATION.repeat(level)}<edge ${link.id == null ? "" : `id="(${link.id})" `}source="${src}" target="${dst}">
          	${INDENTATION.repeat(level + 1)}<data key="d11">
			${INDENTATION.repeat(level + 2)}<x:List>
			${INDENTATION.repeat(level + 3)}<y:Label Text="${label}" Style="{y:GraphMLReference 3}">
			${INDENTATION.repeat(level + 4)}<y:Label.LayoutParameter>
			${INDENTATION.repeat(level + 5)}<yx:SmartEdgeLabelModelParameter Distance="5">
			${INDENTATION.repeat(level + 6)}<yx:SmartEdgeLabelModelParameter.Model>
			${INDENTATION.repeat(level + 7)}<yx:SmartEdgeLabelModel/>
			${INDENTATION.repeat(level + 6)}</yx:SmartEdgeLabelModelParameter.Model>
			${INDENTATION.repeat(level + 5)}</yx:SmartEdgeLabelModelParameter>
			${INDENTATION.repeat(level + 4)}</y:Label.LayoutParameter>
			${INDENTATION.repeat(level + 3)}</y:Label>
			${INDENTATION.repeat(level + 2)}</x:List>
			${INDENTATION.repeat(level + 1)}</data>
            ${INDENTATION.repeat(level)}</edge>`,
        );
      }
    }

    return lines.join("\n");
  }

  function render_Style(style: Style, level: number): string {
    /*
    return `${INDENTATION.repeat(level)}style ${style.id} {\n${style.definition.items
      .map(
        (it) =>
          `${INDENTATION.repeat(level + 1)}${StyleDefinition_toString([it])}";`,
      )
      .join("\n")}\n${INDENTATION.repeat(level)}}`;
      */
    return `<!-- Style definitions not yet implemented in GraphML. At level ${level}: '${style.$cstNode?.text}' -->`;
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
