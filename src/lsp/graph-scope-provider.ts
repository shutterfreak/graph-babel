import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeProvider,
  LangiumCoreServices,
  ReferenceInfo,
  Scope,
  Stream,
  stream,
} from 'langium';
import { inspect } from 'util';

import { isGraph, isLink, isNode, isNodeAlias, isStyle } from '../language/generated/ast.js';
import { path_get_file, render_text } from './graph-lsp-util.js';

/**
 * Provides custom scope resolution for the Graph language.
 * Extends the default Langium scope provider to filter and customize
 * the scope based on the context of the reference.
 */
export class GraphScopeProvider extends DefaultScopeProvider {
  /**
   * Constructs a new GraphScopeProvider.
   *
   * @param services The Langium core services.
   */
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  /**
   * Retrieves the scope for a given reference context.
   * Combines the local scope with the file-global scope, and applies
   * context-specific filtering to ensure references resolve to the
   * correct types of AST nodes.
   *
   * @param context The reference context, containing information about the reference.
   * @returns The combined and filtered scope.
   */
  override getScope(context: ReferenceInfo): Scope {
    const scopes: Stream<AstNodeDescription>[] = [];
    const referenceType = this.reflection.getReferenceType(context);
    let fileGlobalScope: readonly AstNodeDescription[] = [];
    // Get the local scope computed by the default scope provider
    const localScope = super.getScope(context);

    const document = AstUtils.getDocument(context.container);
    const precomputed = document.precomputedScopes;

    // Debug logging for reference context (optional, can be removed in production)
    console.log(
      render_text(
        inspect(context),
        `getScope(${path_get_file(document.uri.toString())}) : context`,
      ),
    );

    if (precomputed) {
      // Retrieve file-global scope from LangiumDocument
      fileGlobalScope = precomputed.get(document.parseResult.value);

      let currentNode: AstNode | undefined = context.container;
      do {
        const allDescriptions = precomputed.get(currentNode);
        if (allDescriptions.length > 0) {
          scopes.push(
            stream(allDescriptions).filter((desc) => {
              // Debug logging for scope descriptions (optional, can be removed in production)
              console.log(
                `getScope(${path_get_file(document.uri.toString())}) -- context.property: "${context.property}", desc.type: "${desc.type}, desc.name: "${desc.name}", desc.path: "${desc.path}"`,
              );

              // Ensure 'styleref' only resolves to 'Style' nodes.
              if (context.property === 'styleref' && !isStyle(desc.node)) {
                console.warn(
                  `getScope(${path_get_file(document.uri.toString())})-- context.property: "${context.property}", desc.type: "${desc.type}, desc.name: "${desc.name}", desc.path: "${desc.path}" -- Discarding description for 'StyleRef' that is NOT referring to a Style node`,
                );
                return false;
              }

              // Prevent 'Link' nodes from resolving to themselves in 'src' or 'dst'.
              if (
                isLink(context.container) &&
                (context.property === 'src' || context.property === 'dst') &&
                context.container === desc.node
              ) {
                console.warn(
                  `getScope(${path_get_file(document.uri.toString())})-- context.property: "${context.property}", desc.type: "${desc.type}, desc.name: "${desc.name}", desc.path: "${desc.path}" -- Discarding description for 'Link' that IS referring to a Link node`,
                );
                return false;
              }

              // Ensure 'src' and 'dst' in 'Link' nodes resolve to 'Node', 'Graph', or 'NodeAlias' nodes.
              if (
                (context.property === 'src' || context.property === 'dst') &&
                !isNode(desc.node) &&
                !isGraph(desc.node) &&
                !isNodeAlias(desc.node)
              ) {
                console.warn(
                  `getScope(${path_get_file(document.uri.toString())})-- context.property: "${context.property}", desc.type: "${desc.type}, desc.name: "${desc.name}", desc.path: "${desc.path}" -- Discarding description for 'Link' that IS NOT referring to a Node, Graph or KeywordAlias node`,
                );
                return false;
              }

              // Include 'NodeAlias' nodes directly in the scope.
              if (isNodeAlias(desc.node)) {
                console.warn(
                  `getScope(${path_get_file(document.uri.toString())})-- context.property: "${context.property}", desc.type: "${desc.type}, desc.name: "${desc.name}", desc.path: "${desc.path}" -- Keyword Alias description -- including directly`,
                );

                return true; // Include KeywordAlias nodes directly
              }

              return this.reflection.isSubtype(desc.type, referenceType);
            }),
          );
        }
        currentNode = currentNode.$container;
      } while (currentNode);
    }

    let combinedScope = localScope;

    // If the file-global scope exists, combine it with the local scope
    if (fileGlobalScope.length > 0) {
      combinedScope = this.createScope(fileGlobalScope, combinedScope);
    }

    // From Default implementation:
    // let result: Scope = this.getGlobalScope(referenceType, context);
    // for (let i = scopes.length - 1; i >= 0; i--) {
    //   result = this.createScope(scopes[i], result);
    // }
    // return result;

    // Resolve ID to KeywordAlias
    if (context.reference.$refText.length > 0) {
      const refText = context.reference.$refText;
      for (const scope of scopes) {
        for (const desc of scope) {
          if (isNodeAlias(desc.node) && desc.node.name === refText) {
            return this.createScope([desc], combinedScope);
          }
        }
      }
      if (fileGlobalScope.length > 0) {
        for (const desc of fileGlobalScope) {
          if (isNodeAlias(desc.node) && desc.node.name === refText) {
            return this.createScope([desc], combinedScope);
          }
        }
      }
    }

    return combinedScope;
  }
}
