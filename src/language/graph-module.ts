import { type Module, inject } from "langium";
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
  type PartialLangiumServices,
} from "langium/lsp";
import {
  GraphGeneratedModule,
  GraphGeneratedSharedModule,
} from "./generated/module.js";
import { GraphValidator, registerValidationChecks } from "./graph-validator.js";

/**
 * Declaration of custom services - add your own service classes here.
 */
export type GraphAddedServices = {
  validation: {
    GraphValidator: GraphValidator;
  };
};

/**
 * Union of Langium default services and your custom services - use this as constructor parameter
 * of custom service classes.
 */
export type GraphServices = LangiumServices & GraphAddedServices;

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the custom services must be fully specified.
 */
export const GraphModule: Module<
  GraphServices,
  PartialLangiumServices & GraphAddedServices
> = {
  validation: {
    GraphValidator: () => new GraphValidator(),
  },
};

/**
 * Create the full set of services required by Langium.
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
 * @param context Optional module context with the LSP connection
 * @returns An object wrapping the shared services and the language-specific services
 */
export function createGraphServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Graph: GraphServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    GraphGeneratedSharedModule,
  );
  const Graph = inject(
    createDefaultModule({ shared }),
    GraphGeneratedModule,
    GraphModule,
  );
  shared.ServiceRegistry.register(Graph);
  registerValidationChecks(Graph);
  if (!context.connection) {
    // We don't run inside a language server
    // Therefore, initialize the configuration provider instantly
    shared.workspace.ConfigurationProvider.initialized({});
  }
  return { shared, Graph };
}
