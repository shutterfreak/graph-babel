import { DefaultScopeProvider, type Module, inject } from 'langium';
import {
  DefaultDefinitionProvider,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
  type PartialLangiumServices,
  createDefaultModule,
  createDefaultSharedModule,
} from 'langium/lsp';

import { GraphCodeActionProvider } from '../lsp/graph-code-actions.js';
import { GraphFormatter } from '../lsp/graph-formatter.js';
//import { GraphDefinitionProvider } from '../lsp/graph-definition-provider.js';
import { GraphNameProvider } from '../lsp/graph-name-provider.js';
import { GraphRenameProvider } from '../lsp/graph-rename-provider.js';
import { GraphScopeComputation } from '../lsp/graph-scope-computation.js';
//import { GraphTokenBuilder } from '../lsp/graph-token-builder.js';
import { GraphGeneratedModule, GraphGeneratedSharedModule } from './generated/module.js';
import { GraphValidator, registerValidationChecks } from './graph-validator.js';

/**
 * Declaration of custom services for the Graph language.
 * This interface defines the structure of services specific to the Graph language,
 * extending the Langium framework's capabilities.
 * 
 * It provides type safety for accessing custom services registered in the GraphModule,
 * ensuring that they are correctly used throughout the application.

 * NOTE: Make sure custom Graph services referenced in GraphModule are also declared here!
 */
export interface GraphAddedServices {
  // parser: {
  /**
   * Custom token builder for the Graph language.
   * Overrides the default token builder to include whitespace tokens in the CST.
   */
  /* TokenBuilder: GraphTokenBuilder;
  }; */

  validation: {
    /**
     * Custom validator for the Graph language.
     * Provides language-specific validation checks.
     */
    GraphValidator: GraphValidator;
  };

  references: {
    /**
     * Custom scope computation for the Graph language.
     * Computes the scope for name resolution and reference finding.
     */
    ScopeComputation: GraphScopeComputation;

    /**
     * Custom name provider for the Graph language.
     * Provides name-related operations such as name resolution.
     */
    NameProvider: GraphNameProvider;
  };

  lsp: {
    /**
     * Custom code action provider for the Graph language.
     * Provides code actions for quick fixes and refactoring.
     */
    CodeActionProvider: GraphCodeActionProvider;

    /**
     * Custom rename provider for the Graph language.
     * Handles rename refactoring operations.
     */
    RenameProvider: GraphRenameProvider;

    /**
     * Custom formatter for the Graph language.
     * Provides language-specific formatting rules.
     */
    Formatter: GraphFormatter;
  };
}

/**
 * Union of Langium default services and custom Graph language services.
 * This type is used as a constructor parameter for custom service classes.
 */
export type GraphServices = LangiumServices & GraphAddedServices;

/**
 * Dependency injection module for the Graph language.
 * This module overrides Langium default services and contributes custom services.
 */
export const GraphModule: Module<GraphServices, PartialLangiumServices & GraphAddedServices> = {
  // parser: {
  /** Custom token builder to include whitespace tokens in the CST. */
  /* TokenBuilder: () => new GraphTokenBuilder(),
  }, */
  validation: {
    /** Registers the custom GraphValidator for language-specific validations. */
    GraphValidator: () => new GraphValidator(),
  },
  references: {
    /** Registers the custom GraphNameProvider for name resolution. */
    NameProvider: () => new GraphNameProvider(),
    /** Registers the custom GraphScopeComputation for scope computation. */
    ScopeComputation: (services) => new GraphScopeComputation(services),
    /** Registers the default Langium scope provider for scope access. */
    ScopeProvider: (services) => new DefaultScopeProvider(services),
  },
  lsp: {
    /** Registers the custom GraphCodeActionProvider for providing code actions. */
    CodeActionProvider: () => new GraphCodeActionProvider(),
    /** Registers the default Langium DefinitionProvider for "Go to Definition" functionality. */
    // DefinitionProvider: (services) => new GraphDefinitionProvider(services),
    DefinitionProvider: (services) => new DefaultDefinitionProvider(services),
    /** Registers the custom GraphRenameProvider for rename refactoring. */
    RenameProvider: (services) => new GraphRenameProvider(services),
    /** Registers the custom GraphFormatter for formatting. */
    Formatter: () => new GraphFormatter(),
  },
};

/**
 * Creates the full set of services required by Langium.
 *
 * First inject the shared services by merging two modules:
 *  - Langium default shared services
 *  - Services generated by langium-cli
 *
 * Then inject the language-specific services by merging three modules:
 *  - Langium default language-specific services
 *  - Services generated by langium-cli
 *  - Services specified in this file
 *
 * @param context Optional module context with the LSP connection.
 * @returns An object wrapping the shared services and the language-specific services.
 */
export function createGraphServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Graph: GraphServices;
} {
  const shared = inject(createDefaultSharedModule(context), GraphGeneratedSharedModule);
  const Graph = inject(createDefaultModule({ shared }), GraphGeneratedModule, GraphModule);
  shared.ServiceRegistry.register(Graph);
  registerValidationChecks(Graph);
  if (!context.connection) {
    // We don't run inside a language server
    // Therefore, initialize the configuration provider instantly
    shared.workspace.ConfigurationProvider.initialized({}).catch((exception) =>
      console.error(exception),
    );
  }
  return { shared, Graph };
}
