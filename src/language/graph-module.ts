import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeComputation,
  LangiumDocument,
  type Module,
  MultiMap,
  PrecomputedScopes,
  inject,
} from "langium";
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
import {
  isElement,
  isGraph,
  isModel,
  isStyle,
  Model,
} from "./generated/ast.js";
import chalk from "chalk";
import { GraphCodeActionProvider } from "../lsp/graph-code-actions.js";
import { GraphRenameProvider } from "../lsp/graph-rename-provider.js";

/**
 * Declaration of custom services - add your own service classes here.
 */
export interface GraphAddedServices {
  validation: {
    GraphValidator: GraphValidator;
  };
  references: {
    ScopeComputation: GraphScopeComputation;
  };
}

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
  references: {
    ScopeComputation: (services) => new GraphScopeComputation(services),
  },
  lsp: {
    CodeActionProvider: () => new GraphCodeActionProvider(),
    RenameProvider: (services) => new GraphRenameProvider(services), // Ensure correct type
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
    shared.workspace.ConfigurationProvider.initialized({}).catch((exception) =>
      console.error(exception),
    );
  }
  return { shared, Graph };
}

export class GraphScopeComputation extends DefaultScopeComputation {
  /**
   * Export all named elements using their name (they are available globally)
   * NOTE: style definitions exist only at local level (default scoping) and can be overridden
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  override async computeExports(
    document: LangiumDocument,
  ): Promise<AstNodeDescription[]> {
    const prefix = "GraphScopeComputation.computeExports()";
    const exportedDescriptions: AstNodeDescription[] = [];
    for (const childNode of AstUtils.streamAllContents(
      document.parseResult.value,
    )) {
      if (isElement(childNode) && childNode.id !== undefined) {
        // `descriptions` is our `AstNodeDescriptionProvider` defined in `DefaultScopeComputation`
        // It allows us to easily create descriptions that point to elements using a name.
        const d = this.descriptions.createDescription(
          childNode,
          childNode.id,
          document,
        );
        exportedDescriptions.push(d);
        console.info(
          chalk.whiteBright(
            `${prefix} - ${childNode.$type} ${childNode.id} : exporting description as name (${d.name}) path (${d.path})`,
          ),
        );
      } else {
        console.info(chalk.gray(`${prefix} - skipping ${childNode.$type}`));
      }
    }
    let i = 1;
    for (const d of exportedDescriptions) {
      console.info(
        chalk.greenBright(
          `${prefix} - Exported description ${i} : ${d.type} ${d.name} ${d.path}`,
        ),
      );
      i++;
    }
    return exportedDescriptions;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async computeLocalScopes(
    document: LangiumDocument,
  ): Promise<PrecomputedScopes> {
    const prefix = "GraphScopeComputation::computeLocalScopes()";

    console.log(chalk.cyan(`${prefix} - START`));

    const model = document.parseResult.value as Model;
    // This multi-map stores a list of descriptions for each node in our document
    const scopes = new MultiMap<AstNode, AstNodeDescription>();
    const level = 0;
    this.processContainer(model, scopes, document, level);

    console.log(chalk.cyan(`${prefix} - END`));
    return scopes;
  }

  private processContainer(
    container: AstNode,
    scopes: PrecomputedScopes,
    document: LangiumDocument,
    level: number,
  ): AstNodeDescription[] {
    let id: string | undefined;
    try {
      if (isElement(container) || isStyle(container)) {
        id = container.id;
      }
    } catch (e) {
      console.error(e);
      id = undefined;
    }
    if (id?.length === 0) {
      id = undefined;
    }

    const preamble = `${"  ".repeat(level)}processContainer(level: ${level}) - ${container.$type}${isGraph(container) || isStyle(container) ? ` ${id ?? "<ID not set>"}` : ""}`;
    const localDescriptions: AstNodeDescription[] = [];

    console.log(
      chalk.blue(`${preamble} - processing ${container.$type} -- START`),
    );

    // Only add style definitions at (1) the current scope and (2) all parent levels

    if (isModel(container) || isGraph(container)) {
      // Process style definitions at the local scope

      for (const style of container.styles) {
        if (style.id !== undefined && style.id.length > 0) {
          const description = this.descriptions.createDescription(
            style,
            style.id,
            document,
          );
          console.log(
            chalk.cyan(
              `${preamble} - adding to local scope: [style ${style.id}] description: '${description.name}' | path: '${description.path}' | type: '${description.type}'`,
            ),
          );
          localDescriptions.push(description);
        } else {
          console.error(
            chalk.redBright(
              `${preamble} ERROR: Found style without ID : [${style.$cstNode?.text}]`,
            ),
          );
        }
      }

      // Recurse on elements
      for (const element of container.elements) {
        console.log(
          chalk.blue(`${preamble} - processing child ${element.$type}`),
        );
        this.processContainer(element, scopes, document, level + 1);
      }
    }

    scopes.addAll(container, localDescriptions);

    for (const ld of localDescriptions) {
      console.log(
        chalk.gray(
          `${preamble} >> LocalDescription : name='${ld.name}' type='${ld.type}' path='${ld.path}'`,
        ),
      );
    }
    for (const scope of scopes) {
      const node = scope[0];
      const description = scope[1];
      console.log(
        chalk.red(
          `${preamble} >> scope : type = '${node.$type}' - description = (type: '${description.type}, name: '${description.name}', path: '${description.path}'')`,
        ),
      );
    }

    console.log(
      chalk.blue(`${preamble} - processing ${container.$type} -- END`),
    );

    return localDescriptions;
  }
}
