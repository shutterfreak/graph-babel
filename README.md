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
style decision {
    BorderColor: blue;
    BorderWidth: 2pt;
    FillColor: "rgb(240,120,24)";
    LabelColor: "black";
    Shape: "diamond";
}
style yes {
    LabelColor: "green";
    LabelText: "no";
    LineColor: "green";
    LineOpacity: .75;
    LineWidth: 2pt;
}
style no {
    LabelColor: #ff0000;
    LabelText: "yes";
    LineColor: "red";
    LineOpacity: .75;
    LineWidth: 2pt;
}

graph g1 "Main graph title" {
    style decision { // Override style in this scope:
        FillColor: "darkorange";
        BorderColor: "red";
    }
    node:decision n1 "a node in a graph"
    node n2 [bracketed node label]
    node n3 /* Empty node */

    // Links don't have to have a name (identifier) defined:
    link:yes n1 to n2,g2n1 /* separate identifiers with commas to specify multiple sources / destinations */
    link:no n1 to n3

    graph g2 "Graph g2 in graph g1" {
        node g2n1 "graph 2 node 1"
        node g2n2 "graph 2 node 2"
        // A named link has the identifier between round brackets:
        link (l1g2) g2n1 -- g2n2 "edge label in g2"
    }
}
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

The followng command will generate file containing a Mermaid graph:

```sh
node bin/cli generate:mermaid input_file.graph
```

> [!NOTE]
> More refined [rendering options for the `elk` layout engine](https://mermaid.js.org/intro/syntax-reference.html)
> might be added later.

Supported features:

- A shape defined in a style is applied to `Node`
- A label defined in a style is applied to `Link` if no link label has been specified
- Scoping of `Graph`, `Node` and named `Link` nodes
- Cascading `Style` computation, including `reset` option
- VS Code plugin (see below) with syntax highlighting and validation checks

> [!WARNING]
> Shape definitions may override node shape definitions. This will be refined later.
> Shape styling for MermaidJS currently only handles shape definition in Style.

## Visual Studio Code integration

For details, please read [langium-quickstart.md](langium-quickstart.md).

Thanks to Langium, you can immediately try out the grammar when opening this project in VS Code.
Run the following commands from the root of the project (where package.json resides):

```sh
npm run langium:generate
npm run build
```

And now hit 'F5' in VS Code.

## Contributing

We welcome contributions to the Graph Babel project.

## License

This project is licensed under the [MIT License](LICENSE).
