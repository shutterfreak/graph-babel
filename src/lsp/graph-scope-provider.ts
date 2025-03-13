import {
  DefaultScopeProvider,
  LangiumCoreServices,
  ReferenceInfo,
  Scope,
  ScopeComputation,
} from 'langium';

import { GraphScopeComputation } from './graph-scope-computation.js';

/**
 * Custom scope provider that extends the default Langium scope provider.
 * Augments local scopes with a file-global scope for named elements.
 */
export class GraphScopeProvider extends DefaultScopeProvider {
  /**
   * The custom scope computation service instance.
   */
  protected readonly scopeComputation: ScopeComputation;

  /**
   * Constructs a new GraphScopeProvider.
   *
   * @param services The Langium core services.
   */
  constructor(services: LangiumCoreServices) {
    super(services);
    this.scopeComputation = services.references.ScopeComputation;
  }

  /**
   * Retrieves the scope for a given reference context.
   * Combines the local scope with the file-global scope.
   *
   * @param context The reference context.
   * @returns The combined scope.
   */
  override getScope(context: ReferenceInfo): Scope {
    // Get the local scope computed by the default scope provider
    const localScope = super.getScope(context);
    // Get the file-global scope from the custom scope computation
    const fileGlobalScope = (this.scopeComputation as GraphScopeComputation).getFileGlobalScope();

    // If the file-global scope exists, combine it with the local scope
    if (fileGlobalScope) {
      return this.createScope(fileGlobalScope.values(), localScope);
    }

    // Otherwise, return the local scope
    return localScope;
  }
}
