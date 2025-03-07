import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeComputation,
  LangiumDocument,
  MultiMap,
  PrecomputedScopes,
  isNamed,
} from 'langium';
import { inspect } from 'util';

import { Graph, Model, isGraph } from '../language/generated/ast.js';
import { render_text } from './graph-lsp-util.js';

export class GraphScopeComputation extends DefaultScopeComputation {
  private processCount = 0;

  override async computeLocalScopes(document: LangiumDocument): Promise<PrecomputedScopes> {
    console.log(`computeLocalScopes() - Document URI: ${document.uri.toString()}`);

    console.log(
      `computeLocalScopes() - Document content:\n${render_text(document.textDocument.getText(), 'document.textDocument.getText()')}`,
    );

    const model = document.parseResult.value as Model;
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    // Create a single, model-level scope
    this.processModel(model, scopes, document);
    AstUtils.streamAllContents(document.parseResult.value).forEach((node, i) => {
      console.log(`computeLocalScopes() - processing AstNode ${i} of type "${node.$type}"`);

      if (isGraph(node)) {
        console.log(
          `computeLocalScopes() - processing AstNode ${i} of type "${node.$type}" -- before calling processGraph(), scopes: ${scopes.size}`,
        );
        this.processGraph(node, scopes, document);
        console.log(
          `computeLocalScopes() - processing AstNode ${i} of type "${node.$type}" -- after calling processGraph(), scopes: ${scopes.size}`,
        );
      }
    });

    // Assign the computed scopes to the document's precomputedScopes property
    document.precomputedScopes = scopes;
    console.log(
      `computeLocalScopes() - precomputedScopes size: ${document.precomputedScopes.size}`,
    );
    /*
    console.log(
      `computeLocalScopes() - precomputedScopes keys: ${Array.from(document.precomputedScopes.keys()).join(', ')}`,
    );
    */
    document.precomputedScopes.forEach((description, node) =>
      console.log(
        `computeLocalScopes() - precomputedScopes: description: [ name: "${description.name}", path: "${description.path}", type: "${description.type}" ], node type: "${node.$type}"`,
      ),
    );
    /*
    console.log(
      `computeLocalScopes() - document.precomputedScopes:\n${render_text(
        inspect(document.precomputedScopes),
        'precomputedScopes',
      )}`,
    );
    console.log(
      `computeLocalScopes() - document before return:\n${render_text(
        inspect(document, false, 2),
        'document',
      )}`,
    );
    console.log(
      `computeLocalScopes() - scopes before return:\n${render_text(
        inspect(scopes, false, 2),
        'scopes',
      )}`,
    );
    console.log(
      `computeLocalScopes() - document.precomputedScopes before return:\n${render_text(
        inspect(document.precomputedScopes, false, 2),
        'document.precomputedScopes',
      )}`,
    );
    console.log(
      `computeLocalScopes() - document identity: ${render_text(inspect(document), 'document')}`,
    );
    */

    return Promise.resolve(scopes);
  }

  private processModel(model: Model, scopes: PrecomputedScopes, document: LangiumDocument): void {
    this.processCount++;
    const prefix = `processModel(processCount = ${this.processCount}), elements: ${model.elements.length}, styles: ${model.styles.length}`;
    const localDescriptions: AstNodeDescription[] = [];
    console.log(`${prefix} - Document URI: ${document.uri.toString()} -- processing Model`);

    const descriptionSet = new Set<string>(); // Use a Set to track unique descriptions.

    // Process styles
    for (const style of model.styles) {
      if (isNamed(style)) {
        console.log(`${prefix}: isNamed(style) is true for style: ${style.name}`);
        console.log(`${prefix}: Before createDescription for style: ${style.name}`);

        const description = this.descriptions.createDescription(style, style.name, document);
        /*
        console.log(
          `${prefix}: After createDescription for style: ${style.name}, description: ${inspect(description)}`,
        );
        */

        //localDescriptions.push(elementDescription);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }

        //console.log(`${prefix}: Pushed style description: ${inspect(description)}`);
        console.log(
          `${prefix}: Pushed style description for style: ${style.name}, description: name: "${description.name}", path: "${description.path}", type: "${description.type}"`,
        );
      } else {
        console.log(`${prefix}: isNamed(style) is false for style: ${inspect(style)}`);
      }
    }

    // Process elements
    for (const element of model.elements) {
      if (isNamed(element)) {
        const description = this.descriptions.createDescription(element, element.name, document);
        //localDescriptions.push(elementDescription);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }

        console.log(
          `${prefix}: Added ${element.$type} (name: '${element.name}') to scope of Model: ${element.name}`,
        );
        console.log(`${prefix}: elementDescription path: ${description.path}`);
      }
    }

    // Collect descriptions for logging
    const allDescriptions: AstNodeDescription[] = [];
    for (const style of model.styles) {
      if (isNamed(style)) {
        const description = this.descriptions.createDescription(style, style.name, document);
        allDescriptions.push(description);
      }
    }
    for (const element of model.elements) {
      if (isNamed(element)) {
        const description = this.descriptions.createDescription(element, element.name, document);
        allDescriptions.push(description);
      }
    }

    // Inspect descriptions
    /*
    console.log(
      `processModel(): Adding scope for model, descriptions: ${inspect(allDescriptions)}`,
    );
    */
    allDescriptions.forEach((description, i) =>
      console.log(
        `${prefix}: Adding scope for model, description ${i}: name: "${description.name}", path: "${description.path}", type: "${description.type}"`,
      ),
    );

    scopes.addAll(model, localDescriptions);
  }

  private processGraph(graph: Graph, scopes: PrecomputedScopes, document: LangiumDocument): void {
    this.processCount++;
    const prefix = `processGraph(processCount = ${this.processCount}) - graph "${graph.name}", elements: ${graph.elements.length}, styles: ${graph.styles.length}`;
    const localDescriptions: AstNodeDescription[] = [];
    const descriptionSet = new Set<string>(); // Use a Set to track unique descriptions.

    console.log(
      `${prefix} - Document URI: ${document.uri.toString()} -- processing Graph: ${graph.name}`,
    );

    // Process styles within the Graph
    for (const style of graph.styles) {
      if (isNamed(style)) {
        console.log(`${prefix}: isNamed(style) is true for style: ${style.name}`);
        console.log(`${prefix}: Before createDescription for style: ${style.name}`);

        const description = this.descriptions.createDescription(style, style.name, document);
        console.log(
          // `${prefix}: After createDescription for style: ${style.name}, description: ${inspect(description)}`,
          `${prefix}: After createDescription for style: ${style.name}, description: name: "${description.name}", path: "${description.path}", type: "${description.type}"`,
        );
        //localDescriptions.push(description);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }
        console.log(
          `${prefix}: Pushing description to localDescriptions: type "${style.$type}" name "${style.name}"`,
        );
        // console.log(`${prefix}: Pushed style description: ${inspect(description)}`);
      } else {
        console.log(`${prefix}: isNamed(style) is false for style: ${inspect(style)}`);
      }
    }

    // Process elements within the Graph
    for (const element of graph.elements) {
      if (isNamed(element)) {
        const description = this.descriptions.createDescription(element, element.name, document);
        console.log(
          `${prefix}: Pushing elementDescription to localDescriptions: type "${element.$type}" name "${element.name}"`,
        );

        //localDescriptions.push(description);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }
      }
    }

    // Create a new scope for the graph
    /*
    console.log(
      `${prefix}: Adding scope for graph: ${graph.name}, descriptions: ${inspect(localDescriptions)}`,
    );
    */
    localDescriptions.forEach((description, i) =>
      console.log(
        `${prefix}: localDescription ${i} for graph "${graph.name}", description: name: "${description.name}", path: "${description.path}", type: "${description.type}"`,
      ),
    );
    scopes.addAll(graph, localDescriptions);

    // Recursively process nested Graphs
    for (const element of graph.elements) {
      if (isGraph(element)) {
        console.log(
          `${prefix} - found "${element.$type}" with name="${element.name}" -- before calling processNestedGraph(), scopes: ${scopes.size}`,
        );
        this.processNestedGraph(element, scopes, document);
        console.log(
          `${prefix} - found "${element.$type}" with name="${element.name}" -- after calling processNestedGraph(), scopes: ${scopes.size}`,
        );
      }
    }
  }

  private processNestedGraph(
    graph: Graph,
    scopes: PrecomputedScopes,
    document: LangiumDocument,
  ): void {
    this.processCount++;
    const prefix = `processNestedGraph(processCount = ${this.processCount}) - graph "${graph.name}", elements: ${graph.elements.length}, styles: ${graph.styles.length}`;
    const localDescriptions: AstNodeDescription[] = [];
    const descriptionSet = new Set<string>(); // Use a Set to track unique descriptions.

    console.log(
      `${prefix} - Document URI: ${document.uri.toString()} -- processing Graph: ${graph.name}`,
    );

    // Process styles within the nested Graph
    for (const style of graph.styles) {
      if (isNamed(style)) {
        console.log(`${prefix}: isNamed(style) is true for style: ${style.name}`);
        console.log(`${prefix}: Before createDescription for style: ${style.name}`);

        const description = this.descriptions.createDescription(style, style.name, document);
        console.log(
          // `${prefix}: After createDescription for style: ${style.name}, description: ${inspect(description)}`,
          `${prefix}: After createDescription for style: ${style.name}, description: name: "${description.name}", path: "${description.path}", type: "${description.node?.$type ?? '(unknown)'}"`,
        );
        //localDescriptions.push(description);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }
        console.log(
          `${prefix}: Pushing description to localDescriptions: type "${style.$type}" name "${style.name}"`,
        );
        //console.log(`${prefix}: Pushed style description: ${inspect(description)}`);
      } else {
        console.log(`${prefix}: isNamed(style) is false for style: ${inspect(style)}`);
      }
    }

    // Process elements within the nested Graph
    for (const element of graph.elements) {
      if (isNamed(element)) {
        const description = this.descriptions.createDescription(element, element.name, document);
        //localDescriptions.push(description);
        const descriptionKey = `${description.name}-${description.path}-${description.type}`; // Create a unique key.
        if (!descriptionSet.has(descriptionKey)) {
          localDescriptions.push(description);
          descriptionSet.add(descriptionKey);
        }
      }
    }

    // Create a new scope for the nested graph, inheriting from the parent graph's scope
    const nestedScopes = new MultiMap<AstNode, AstNodeDescription>();
    const scopeSet = new Set<string>(); // Track unique scope identifiers

    // console.log(`${prefix}: Parent container: ${inspect(graph.$container)}`);
    console.log(
      `${prefix}: Parent container: type "${graph.$container.$type}", elements: ${graph.$container.elements.length}, styles: ${graph.$container.styles.length}`,
    );
    // console.log(`${prefix}: Parent scopes: ${inspect(scopes.get(graph.$container))}`);
    scopes
      .get(graph.$container)
      .forEach((scope, i) =>
        console.log(
          `${prefix}: Parent scope ${i}: , description: name: "${scope.name}", path: "${scope.path}", type: "${scope.type}"`,
        ),
      );

    //copy all parent scopes to the nested graph scope.
    /*
    if (scopes.get(graph.$container).length > 0) {
      for (const parentScope of scopes.get(graph.$container)) {
        nestedScopes.add(graph, parentScope);
      }
    }*/
    if (scopes.get(graph.$container).length > 0) {
      for (const parentScope of scopes.get(graph.$container)) {
        const scopeKey = `${parentScope.name}-${parentScope.path}-${parentScope.type}`; // Create a unique key

        if (!scopeSet.has(scopeKey)) {
          console.log(
            `${prefix} - will add parent scope (name "${parentScope.name}", type "${parentScope.type}", path: "${parentScope.path}) to nested scopes`,
          );
          nestedScopes.add(graph, parentScope);
          scopeSet.add(scopeKey);
        }
      }
    }

    /*
    console.log(
      `${prefix}: nestedScopes after copying parent: ${inspect(nestedScopes.get(graph))}`,
    );
    */
    nestedScopes
      .get(graph)
      .forEach((scope, i) =>
        console.log(
          `${prefix}: nestedScopes after copying parent: nestedScope ${i} for graph "${graph.name}", description: name: "${scope.name}", path: "${scope.path}", type: "${scope.type}"`,
        ),
      );

    localDescriptions.forEach((description, i) =>
      console.log(
        `${prefix}: localDescription ${i} for graph "${graph.name}", description: name: "${description.name}", path: "${description.path}", type: "${description.type}"`,
      ),
    );

    nestedScopes.addAll(graph, localDescriptions);
    /*
    console.log(
      `${prefix}: nestedScopes after adding localDescriptions: ${inspect(nestedScopes.get(graph))}`,
    );
    */
    nestedScopes
      .get(graph)
      .forEach((scope, i) =>
        console.log(
          `${prefix}: nestedScopes after adding localDescriptions: nestedScope ${i} for graph "${graph.name}", description: name: "${scope.name}", path: "${scope.path}", type: "${scope.type}"`,
        ),
      );
    // Add the new scope to the main scopes map
    //console.log(`${prefix}: Scope to add to main scopes: ${inspect(nestedScopes.get(graph))}`);
    nestedScopes
      .get(graph)
      .forEach((scope, i) =>
        console.log(
          `${prefix}: Scope to add to main scopes: nestedScope ${i} for graph "${graph.name}", description: name: "${scope.name}", path: "${scope.path}", type: "${scope.type}"`,
        ),
      );
    scopes.addAll(graph, nestedScopes.get(graph));

    // Recursively process nested Graphs (if any)
    for (const element of graph.elements) {
      if (isGraph(element)) {
        console.log(
          `${prefix} - found "${element.$type}" with name="${element.name}" -- before calling processNestedGraph(), scopes: ${scopes.size}`,
        );
        this.processNestedGraph(element, scopes, document);
        console.log(
          `${prefix} - found "${element.$type}" with name="${element.name}" -- after calling processNestedGraph(), scopes: ${scopes.size}`,
        );
      }
    }
  }
}
