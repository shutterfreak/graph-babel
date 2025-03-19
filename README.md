# Graph Babel

## Project Summary

Graph Babel (`graph-babel`) is a project designed to facilitate the creation,
manipulation and conversion of graph data structures within a Node.js
environment. It provides a generic textual graph modelling language and
a set of tools and libraries to transform graphs into any graph format.

Thanks to `langium`, you can even run this code as a plugin in Microsoft Visual Studio Code.

> [!WARNING]
> This project is currently in active development. Functionality and the grammar may evolve.

Why this project? see [ABOUT](ABOUT.md).

## Features

- Generic graph modelling language (parser based on langium)
- Perform validations on the graph
- Support for nested graphs, typing of graph elements (nodes, links and graphs)
- Styling
- Integration with other Node.js modules and libraries
- Comprehensive documentation and examples will follow later on
- **Semantic Token Highlighting in VS Code:** Provides enhanced code readability by highlighting different language elements with distinct colors based on their meaning.

## Installation

To install the `graph-babel` Node.js Graph package, use the following command:

```sh
npm install graph-babel
```

Note: the devlopment makes use of the pnpm package manager.

## Usage

### Generic graph description language

The starting point is the ability to describe graphs independently of the graph
rendering technology used. To this end, a parser built with
[langium](https://langium.org/) has been developed.

The [grammar](src/language/graph.langium) allows to describe graphs as follows:

```text
// NOTE: the style object is still under active development
style decision
{
    BorderColor : blue ;
    BorderWidth : 2pt ;
    FillColor : rgb(240,120,24) ;
    LabelColor : black ;
    Shape : "diamond" ;
}

style yn
{
    LineWidth : 10pt
}

style:yn yesno
{
   // Style 'inherits' from style 'yn'
    LineOpacity : .75 ;
    LineWidth : 1.5pt ;
}

style:yesno no
{
    LabelColor : #ff0000 ;
    LabelText : "no" ;
    LineColor : red ;
}

style:yesno yes
{
    LabelColor : green ;
    LabelText : "yes" ;
    LineColor : green ;
}

define decision node:decision

graph g1 "Main graph title"
{
    style decision
    {
       // Override style in this scope:
        FillColor : darkorange ;
        BorderColor : red ;
    }

    style yes
    {
        LabelColor : lime ;
        LineColor : lime
    }

    node:decision n1 "a node in a graph"
    decision d2 "A decision node"
    node n2 [bracketed node label]
    node n3 /* Empty node */
    link n1 <|-- n2 // Shorthand for delta arrowhead
    link n2 <>-- n3 // Shorthand notation for diamond arrowhead

    // Links don't have to have a name (identifier) defined:
    link:yes n1, n2 ==> g2n1, g2n2
    link:no n1 to n3

    graph g2 "Graph g2 in graph g1"
    {
        node g2n1 "graph 2 node 1"
        node g2n2 "graph 2 node 2"
        // A named link has the identifier between round brackets:
        link (l1g2) g2n1:diamond -- g2n2:circle "edge label in g2" // Source and destination arrowheads specified by name
    }
}

node n_1 "A node at top (model) level"
node n_2 "Another node at top (model) level"
link:yes n_1 --> n_2
```

The CLI allows checking a graph for errors, and transformation of the graph into different formats
(currently cleaned graph and Mermaid Graph).

#### Basic CLI operation

```sh
node bin/cli check input_file.graph
```

#### Clean properly indented graph (comments stripped)

```sh
node bin/cli generate:clean input_file.graph
```

### Convert the graph to Mermaid Graph

The followng command will generate a file containing a Mermaid graph:

```sh
node bin/cli generate:mermaid input_file.graph
```

> [!NOTE]
> More refined [rendering options for the `elk` layout engine](https://mermaid.js.org/intro/syntax-reference.html)
> might be added later.

### Convert the graph to yEd graphml format

The followng command will generate a file containing a yEd graphml graph:

```sh
node bin/cli generate:mermaid input_file.graph
```

> [!NOTE]
> The generation of yEd graphml format is still incomplete.
>
> Styling still needs to be refined.
>
> Nesting of graphs in graphs is only supported with a depth of 1. For this reason, yEd-specific group nodes must be used.
> This is not yet fully implemented.

Supported features:

- A shape defined in a style is applied to `Node`
- A label defined in a style is applied to `Link` if no link label has been specified
- A `Link` can specify source and target arrowheads by name or by a shorthand notation
- Scoping of `Graph`, `Node` and named `Link` nodes
- Cascading `Style` computation, including `reset` option
- Inheritance of styles (one style can extend another style)
- VS Code plugin (see below) with syntax highlighting and validation checks

> [!WARNING]
> Shape definitions may override node shape definitions. This will be refined later.
> Shape styling for MermaidJS currently only handles shape definition in Style.

## Visual Studio Code integration

### Initial setup

For details, please read [langium-quickstart.md](langium-quickstart.md).

Thanks to Langium, you can immediately try out the grammar when opening this project in VS Code.
Run the following commands from the root of the project (where package.json resides):

```sh
npm run langium:generate
npm run build
```

And now hit 'F5' in VS Code.

### Scope computation and Scope provider

Names of `Graph`, `Node` and `Link` nodes are available at file level irrespective of where they are defined. They can refer to other styles in that scope.

Style definitions obey the Langium-based scoping, and can refer to other styles in that scope.

See [scope-computation.ts](src/language/lsp/scope-computation.ts) and [scope-provider.ts](src/language/lsp/scope-provider.ts).

### Name provider

A custom name provider has been implemented, returning the name for `Style`nodes and for `Eleement` nodes with nonempty name (`Graph`, `Node`, `Link`).

See [name-provider.ts](src/language/lsp/name-provider.ts).

### Diagnostics and Code Actions

The following diagonstics have been implemented, some of which also provide code actions:

|   vscode diagnostic code    |               code text                | description                                   | code action and explanation                                                             |
| :-------------------------: | :------------------------------------: | --------------------------------------------- | --------------------------------------------------------------------------------------- |
|         NameMissing         |             "name-missing"             | Object has a missing `name` property          | `generateNewName()` - generate a (new) unique `name`                                    |
|        NameDuplicate        |            "name-duplicate"            | Object has a duplicate `name` property        | `generateNewName()` - generate a (new) unique `name`                                    |
|     StyleSelfReference      |         "style-self-reference"         | `Style` references itself                     | `removeStyleSelfReference` - remove ': styleref' from self-referencing style definition |
|    LinkWidthUnitUnknown     |       "link-width-unit-unknown"        | `WidthValue` has an unknown width unit        | `fixIncorrectWidthUnit` - propose the selection of valid units                          |
|     LinkWidthHasNoUnit      |          "link-width-no-unit"          | `WidthValue` has no width unit                | `fixIncorrectWidthUnit` - propose the selection of valid units                          |
|      SrcArrowheadEmpty      |         "src-arrowhead-empty"          | Source arrowhead is empty                     | No code action implemented                                                              |
|     SrcArrowheadInvalid     |        "src-arrowhead-invalid"         | Source arrowhead is invalid                   | No code action implemented                                                              |
|      DstArrowheadEmpty      |         "dst-arrowhead-empty"          | Destination arrowhead is empty                | No code action implemented                                                              |
|     DstArrowheadInvalid     |        "dst-arrowhead-invalid"         | Destination arrowhead is invalid              | No code action implemented                                                              |
|    SrcArrowheadRedefined    |       "src-arrowhead-redefined"        | Source arrowhead is redefined                 | No code action implemented                                                              |
|    DstArrowheadRedefined    |       "dst-arrowhead-redefined"        | Destination arrowhead is redefined            | No code action implemented                                                              |
|      LinkStyleInvalid       |          "link-style-invalid"          | Link style is invalid                         | No code action implemented                                                              |
|      StyleAfterElement      |         "style-after-element"          | Style defined after element                   | No code action implemented                                                              |
|  StyleMultipleDefinitions   |      "style-multiple-definitions"      | Multiple style definitions with the same name | No code action implemented                                                              |
|  StyleDefinitionEmptyTopic  |     "style-definition-empty-topic"     | Style definition has an empty topic           | No code action implemented                                                              |
| StyleDefinitionUnknownTopic |    "style-definition-unknown-topic"    | Style definition has an unknown topic         | No code action implemented                                                              |
|      ShapeNameMissing       |          "shape-name-missing"          | Shape name is missing                         | No code action implemented                                                              |
|      ShapeNameUnknown       |          "shape-name-unknown"          | Shape name is unknown                         | No code action implemented                                                              |
|      ColorNameUnknown       |          "color-name-unknown"          | Color name is unknown                         | No code action implemented                                                              |
|       HexColorInvalid       |          "hex-color-invalid"           | Hex color is invalid                          | No code action implemented                                                              |
|   RgbChannelValueInvalid    |      "rgb-channel-value-invalid"       | RGB channel value is invalid                  | No code action implemented                                                              |
|  RgbChannelValueOutOfRange  |    "rgb-channel-value-out-of-range"    | RGB channel value is out of range             | No code action implemented                                                              |
|    LinkWidthValueInvalid    |       "link-width-value-invalid"       | Link width value is invalid                   | No code action implemented                                                              |
|   OpacityValueOutOfRange    |      "opacity-value-out-of-range"      | Opacity value is out of range                 | No code action implemented                                                              |
|     OpacityValueInvalid     |        "opacity-value-invalid"         | Opacity value is invalid                      | No code action implemented                                                              |
|   SpuriousSemicolonDelete   | "styleblock-spurious-semicolon-delete" | Spurious semicolons in StyleBlock             | `deleteSpuriousSemicolons` - remove spurious semicolons                                 |

See [graph-validators.ts](src/language/graph-validators.ts) and [code-actions.ts](src/language/lsp/code-actions.ts).

### Semantic Token Highlighting

The Graph language extension provides semantic token highlighting, which enhances the visual representation of your code in VS Code. This feature uses the language's understanding of the code to colorize elements based on their meaning, making it easier to read and understand.

The following table outlines the AST node types and properties for which semantic token highlighting has been implemented:

|  AST Node Type  |    Property     | VS Code Token Type |
| :-------------: | :-------------: | :----------------: |
|    NodeAlias    |      name       |       macro        |
|     Element     |      name       |      property      |
|      Link       |      name       |      property      |
|      Link       | src (elements)  |      property      |
|      Link       | dst (elements)  |      property      |
|      Link       |  src_arrowhead  |     enumMember     |
|      Link       |  dst_arrowhead  |     enumMember     |
|      Node       |      alias      |       macro        |
| BracketedLabel  | label_bracketed |       string       |
| StyleDefinition |      topic      |      property      |
|      Style      |      name       |       class        |
|     Element     |    styleref     |       class        |
|      Style      |    styleref     |       class        |
|    NodeAlias    |    styleref     |       class        |

### Formatting provider

A custom formatting provider has been implemented to format an unformatted `.graph` file. It takes care of indentation, brace placement and comments after an opening brace.

See [formatting-provider.ts](src/language/lsp/formatting-provider.ts).

### Rename provider

The vscode Rename Symbol `<F2>` context menu can be used to rename a Node, Graph or Link. References are automatically renamed as well. The rename operation will not be applied if the new name is empty or already exists as name. Reserved keywords are also not permitted.

See [rename-provider.ts](src/language/lsp/rename-provider.ts).

### Folding Range Provider

`Graph` and `Style` items can be folded. See [folding-provider.ts](src/language/lsp/folding-provider.ts).

## Contributing

We welcome contributions to the Graph Babel project.

## License

This project is licensed under the [MIT License](LICENSE).
