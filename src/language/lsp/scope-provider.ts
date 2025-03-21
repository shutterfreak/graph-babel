import {
  AstNodeDescription,
  AstUtils,
  DefaultScopeProvider,
  LangiumCoreServices,
  ReferenceInfo,
  Scope,
  Stream,
  stream,
} from 'langium';

import { isGraph, isLink, isNode, isNodeAlias, isStyle } from '../generated/ast.js';
import { path_get_file } from '../graph-util.js';

/**
 * GraphScopeProvider restricts reference resolution to definitions declared within the same file.
 *
 * This custom scope provider extends the default Langium implementation by filtering
 * definitions based on their type, name, and file location. Global scope merging is
 * intentionally omitted so that references (e.g. 'styleref', 'src', 'dst', and 'alias')
 * resolve only to nodes defined in the current document.
 */
export class GraphScopeProvider extends DefaultScopeProvider {
  /**
   * Constructs a new GraphScopeProvider instance.
   *
   * @param services The Langium core services that provide necessary language infrastructure.
   */
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  /**
   * Returns the resolution scope for a given reference context by filtering precomputed scopes
   * to only include definitions from the current file that match the reference's expected type
   * and name.
   *
   * Global scope is explicitly omitted, ensuring that definitions from other files are not considered.
   *
   * @param context The reference context containing the container node, property, and reference details.
   * @returns The scope containing only file-local definitions relevant to the reference.
   */
  override getScope(context: ReferenceInfo): Scope {
    // Prepare a list for additional scopes (used for non-special cases)
    const scopes: Stream<AstNodeDescription>[] = [];
    // Determine the expected type for the reference
    const referenceType = this.reflection.getReferenceType(context);
    // Retrieve the document from the reference context
    const document = AstUtils.getDocument(context.container);
    const precomputed = document.precomputedScopes;
    const documentUri = document.uri.toString();

    // Log the current file being processed
    console.log(
      `getScope(${path_get_file(documentUri)}) - property "${context.property}", reference.$refText: "${context.reference.$refText}", reference.$nodeDescription?.type: "${context.reference.$nodeDescription?.type}"`,
    );

    /*
    // Log all precomputed scope entries for debugging purposes
    precomputed
      ?.get(document.parseResult.value)
      .forEach((ref, index) =>
        console.log(
          `precomputed scope ${index}: name: "${ref.name}", type: "${ref.type}", file: "${path_get_file(ref.documentUri.path)}", path: "${ref.path}"`,
        ),
      );

    // Debug log: details of the current reference context
    console.log(
      `getScope(${path_get_file(document.uri.toString())}) [context] property: "${context.property}" (in ${context.container.$type}) reference: "${context.reference.$refText}" (${context.reference.$refNode?.astNode.$type}) in ${
        context.reference.$refNode
          ? `"${path_get_file(AstUtils.getDocument(context.reference.$refNode.astNode).uri.toString())}"`
          : '<no referenced document path found>'
      }"`,
    );
    */

    if (precomputed) {
      const allDescriptions = precomputed.get(document.parseResult.value);
      // Keep trac k of duplicate scope entries
      const seenPaths = new Set<string>();

      const filterUnique = (desc: AstNodeDescription) => {
        if (seenPaths.has(desc.path)) {
          return false;
        }
        seenPaths.add(desc.path);
        return true;
      };

      // Handling style references: only Style nodes declared in the same file should be considered.
      if (context.property === 'styleref') {
        // console.log('Filtering for styleref (restricting to current file)');

        const styleScope = stream(allDescriptions).filter(
          (desc) =>
            isStyle(desc.node) && // Must be a Style node
            (context.reference.$refText.length === 0 ||
              desc.name.toLowerCase().includes(context.reference.$refText.toLowerCase())) && // Empty name or case-insensitive incomplete match
            desc.documentUri.toString() === documentUri && // Must be defined in the current file
            this.reflection.isSubtype(desc.type, referenceType) && // Must be a subtype of the expected type
            filterUnique(desc), // Deduplicate
        );

        allDescriptions.forEach((description) => {
          console.log(
            `getScope(${path_get_file(documentUri)}) - reference type: ${referenceType}): type: "${description.type}", name: "${description.name}", path: ${description.path}`,
          );
        });

        // Return a scope containing only the filtered Style nodes.
        return this.createScope(
          styleScope,
          // Global scope intentionally omitted to enforce file-local resolution.
        );
      } else if (context.property === 'src' || context.property === 'dst') {
        // For link source and destination references, restrict resolution to Node nodes.
        if (isLink(context.container)) {
          // console.log(`Filtering for ${context.property} (restricting to current file)`);
          const nodeScope = stream(allDescriptions).filter(
            (desc) =>
              isNode(desc.node) && // Must be a Node
              (context.reference.$refText.length === 0 ||
                desc.name.toLowerCase().includes(context.reference.$refText.toLowerCase())) && // Empty name or case-insensitive incomplete match
              desc.documentUri.toString() === documentUri && // Must belong to the current file
              this.reflection.isSubtype(desc.type, referenceType) && // Must be a subtype of the expected type
              filterUnique(desc), // Deduplicate
          );

          // Return a scope with only the filtered Node definitions.
          return this.createScope(
            nodeScope,
            // Global scope intentionally omitted.
          );
        }
      } else if (context.property === 'alias') {
        // For alias references within Nodes, restrict resolution to NodeAlias nodes.
        if (isNode(context.container)) {
          const aliasScope = stream(allDescriptions).filter(
            (desc) =>
              isNodeAlias(desc.node) && // Must be a NodeAlias node
              desc.name === context.reference.$refText && // Must have a matching name
              this.reflection.isSubtype(desc.type, referenceType) && // Must be a subtype of the expected type
              filterUnique(desc), // Deduplicate
          );
          return this.createScope(
            aliasScope,
            // Global scope intentionally omitted.
          );
        }
        // Additional handling for alias in other contexts can be added here if needed.
      } else {
        // For other reference properties, add definitions if they match the expected type.
        if (allDescriptions.length > 0) {
          scopes.push(
            stream(allDescriptions).filter((desc) => {
              // In the case of link nodes with src/dst properties, exclude entries that are not Nodes or Graphs.
              if (
                isLink(context.container) && // Link nodes
                (context.property === 'src' || context.property === 'dst') && // src or dst property
                !isNode(desc.node) && // Not a Node
                !isGraph(desc.node) // Not a graph
              ) {
                return false;
              }
              return (
                this.reflection.isSubtype(desc.type, referenceType) && // Must be a subtype of the expected type
                filterUnique(desc) // Deduplicate
              );
            }),
          );
        }
      }
    }

    // For reference properties that do not have special filtering,
    // fall back to the default local scope provided by the parent class.
    // console.log(`getScope() -- NOT a 'special' node type -- apply DEFAULT scoping`);
    const localScope = super.getScope(context);
    let combinedScope = localScope;

    if (scopes.length > 0) {
      combinedScope = this.createScope(
        scopes[0],
        // Global scope intentionally omitted.
      );
    }

    // Final debug log: list all elements in the computed scope.
    /*
    console.log(`Final scope for property "${context.property}" in ${path_get_file(documentUri)}:`);
    combinedScope.getAllElements().forEach((element) => {
      console.log(
        `  - Name: ${element.name}, Type: ${element.type}, File: ${path_get_file(element.documentUri.toString())}`,
      );
    });
    */
    return combinedScope;
  }
}
