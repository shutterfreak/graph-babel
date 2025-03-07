import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeProvider,
  LangiumCoreServices,
  LangiumDocument,
  MultiMap,
  ReferenceInfo,
  Scope,
  Stream,
  StreamScope,
  stream,
} from 'langium';
import { inspect } from 'util';

import { isElement } from '../language/generated/ast.js';
import { render_text } from './graph-lsp-util.js';

export class GraphScopeProvider extends DefaultScopeProvider {
  private globalElementDescriptions: MultiMap<string, AstNodeDescription> | undefined = undefined;
  private cnt = 0;

  constructor(services: LangiumCoreServices) {
    super(services);
  }

  override getScope(context: ReferenceInfo): Scope {
    this.cnt++;
    const document = AstUtils.getDocument(context.container);
    const prefix = `getScope(#${this.cnt}: document state=${document.state},refText="${context.reference.$refText})"`;

    console.log(`\n${prefix} START`);
    if (!this.globalElementDescriptions) {
      console.log(
        `${prefix} globalElementDescriptions is undefined: will invoke populateGlobalElementDescriptions()`,
      );
      this.populateGlobalElementDescriptions(document);
    }

    const scopes: Stream<AstNodeDescription>[] = [];
    const referenceType = this.reflection.getReferenceType(context);

    if (document.precomputedScopes) {
      console.log(
        `${prefix} Found precomputed scopes: ${document.precomputedScopes.keys().count()}`,
      );

      console.log(`getScope() - Found precomputed scopes: ${document.precomputedScopes.size}`);
      document.precomputedScopes.forEach((description, node) =>
        console.log(
          `${prefix} - precomputedScopes: description: [ name: "${description.name}", path: "${description.path}", type: "${description.type}" ], node type: "${node.$type}"`,
        ),
      );

      let currentNode: AstNode | undefined = context.container;
      do {
        const allDescriptions = document.precomputedScopes.get(currentNode);
        if (allDescriptions.length > 0) {
          console.log(
            `${prefix} Found descriptions for current node of type '${currentNode.$type}': ${allDescriptions.length}`,
          );
          scopes.push(stream(allDescriptions));
        }
        currentNode = currentNode.$container;
      } while (currentNode);
    } else {
      console.log(`${prefix} No precomputed scope found !`);
    }

    let result: Scope | undefined = undefined;
    if (this.globalElementDescriptions) {
      const fileGlobalScope: Stream<AstNodeDescription> = stream(
        this.globalElementDescriptions.get(referenceType),
      );

      result = new StreamScope(fileGlobalScope, this.getGlobalScope(referenceType, context));
    } else {
      result = this.getGlobalScope(referenceType, context);
    }

    for (let i = scopes.length - 1; i >= 0; i--) {
      console.log(
        `${prefix} - context:\n${render_text(inspect(scopes[i]), `${prefix} createScope(): scopes[${i}]`)}`,
      );

      result = this.createScope(scopes[i], result);
    }
    console.log(
      `${prefix} - context:\n${render_text(inspect(result, false, 4), `${prefix} result`)}`,
    );

    if (result instanceof StreamScope) {
      console.log(`${prefix} - Inspecting StreamScope elements:`);
      result.getAllElements().forEach((e, i) => {
        console.log(
          `${prefix} - StreamScope element #${i}: name "${e.name}", node type "${e.node?.$type}", path "${e.path}"`,
        );
      });
    }
    if (this.globalElementDescriptions) {
      console.log(
        `${prefix} - globalElementDescriptions size: ${this.globalElementDescriptions.size}`,
      );
      console.log(
        `${prefix} - globalElementDescriptions keys: ${Array.from(this.globalElementDescriptions.keys()).join(', ')}`,
      );
    }

    console.log(`${prefix} END\n`);
    return result;
  }

  private populateGlobalElementDescriptions(document: LangiumDocument): void {
    const prefix = `populateGlobalElementDescriptions()`;
    if (!this.globalElementDescriptions) {
      console.log(`${prefix} - fetching descriptions for all named Element nodes...`);
      //      console.log(inspect(document))
      this.globalElementDescriptions = new MultiMap<string, AstNodeDescription>();

      // AstUtils.streamAllContents(model).forEach((element, i) => {
      AstUtils.streamAllContents(document.parseResult.value).forEach((element, i) => {
        console.log(`${prefix} - processing AstNode ${i} of type "${element.$type}"`);
        if (isElement(element)) {
          const name = element.name ?? '';
          console.log(`${prefix} - Found ${element.$type} with name="${name}"`);
          if (name.length > 0) {
            const description = this.descriptions.createDescription(element, name, document);
            console.log(`${prefix} - Adding description of ${element.$type} with name="${name}"`);
            console.log(
              render_text(inspect(description), `description for ${element.$type} "${name}"`),
            );
            this.globalElementDescriptions!.add(element.$type, description);
          }
        }
      });

      console.log(
        `${prefix} - globalElementDescriptions size: ${this.globalElementDescriptions.size}`,
      );
      console.log(
        `${prefix} - globalElementDescriptions keys: ${Array.from(this.globalElementDescriptions.keys()).join(', ')}`,
      );
    }
  }
}
