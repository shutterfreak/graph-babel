# About Graph Babel

The Graph Babel project emanated from the need to simplify the collaborative
authoring of graphs, and to generate different graph formats from the same input.

Although several graph languages exist, they suffer from the tight bonds with
the renderer and/or the GUI-based product that uses them. As a result, it is
hard to move from one graph technology to another.

## Base concepts

The base `Element`s that shape any `Graph` are `Node`s and `Link`s between
`Node`s (edges). A collection of `Node`s and `Link`s are a `Graph`.

In addition, `Node`s can be containers for `Element`s (`Graph`s, `Node`s and
`Link`s).

A `Style` can be defined for assigning rendering properties to an `Element`.

Any `Element` can refer to a `Style` definition.

## Scoping

All `Element`s are visible in the global document scope.

`Style` definitions can occur at the level of a `Graph` or at any level up.

Scoping requires `Style` definitions to appear before `Element` definitions, at any level.

`Style` definitions can extend, overwrite portions (or all) previous `Style` definitions with the same name.

## ITEA4 FireBIM

The need for defining a simple text-based graph modelling language, and to
generate graphs in different formats, emanated from the European ITEA4 FireBIM
project. During a workshop, a set of sticky notes of different colors have been
used to represent different concepts in a work flow describing the current and
future user journey. These paper flows were transformed into a digital format
and the participants were invited to collaboratively enhance and refine these
flows by using online tools.

One problem we faced, was the unwanted clean-up of the source file while
editing, and the need to manually assign colors and shapes to nodes. Another
was the difficulty in identifying the nodes (and edges) in the graph while
commenting, reviewing and editing.

An initial attempt to generate 'canonical' graph source files from our side
made us realize that we were trying to (ab)use a graph format for purposes
not intended by that format/technology. In reality we needed something
different, allowing us to be in control of the graph definition itself,
and to use generators for generating graph representations that could be
fed to other graph technologies (such as [Mermaid](https://mermaid.js.org/)
graphs).

In principle custom generators for any graph format could be generated,
e.g. for generating [SHACL](https://www.w3.org/TR/shacl/) shapes
from graphs adhering to a specific syntax.
