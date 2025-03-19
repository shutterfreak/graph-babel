import {
  AstNode,
  AstUtils,
  CstNode,
  CstUtils,
  LangiumDocument,
  LangiumDocuments,
  MaybePromise,
  ScopeProvider,
} from 'langium';
import { DefaultDefinitionProvider, GoToLink, LangiumServices } from 'langium/lsp';
import { inspect } from 'util';
import { CancellationToken, DefinitionParams, LocationLink } from 'vscode-languageserver';

import { isElement, isStyle } from '../generated/ast.js';
import { render_text } from '../graph-util.js';

/**
 * Custom DefinitionProvider for the Graph language, handling hierarchical Style scopes and document-level Element scopes.
 */
export class GraphDefinitionProvider extends DefaultDefinitionProvider {
  constructor(protected readonly services: LangiumServices) {
    super(services);
  }

  protected get documents(): LangiumDocuments {
    return this.services.shared.workspace.LangiumDocuments;
  }

  protected get scopeProvider(): ScopeProvider {
    return this.services.references.ScopeProvider;
  }

  /**
   * Handles the go-to-definition request.
   * @param document The document in which the definition request was triggered.
   * @param params The parameters of the definition request.
   * @param cancelToken A cancellation token that can be used to cancel the request.
   * @returns A promise that resolves to an array of LocationLinks or undefined.
   */
  override getDefinition(
    document: LangiumDocument,
    params: DefinitionParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken = CancellationToken.None,
  ): MaybePromise<LocationLink[] | undefined> {
    const rootNode = document.parseResult.value;
    if (rootNode.$cstNode) {
      const cst = rootNode.$cstNode;
      const sourceCstNode = CstUtils.findDeclarationNodeAtOffset(
        cst,
        document.textDocument.offsetAt(params.position),
        this.services.parser.GrammarConfig.nameRegexp,
      );
      if (sourceCstNode) {
        if (isStyle(sourceCstNode.astNode)) {
          return this.collectStyleLocationLinks(sourceCstNode, params, document);
        } else if (isElement(sourceCstNode.astNode)) {
          return this.collectElementLocationLinks(sourceCstNode, params, document);
        } else {
          return this.collectLocationLinks(sourceCstNode, params);
        }
      }
    }
    return undefined;
  }

  /**
   * Collects location links for Style node definitions, handling hierarchical scope.
   * @param sourceCstNode The CST node of the source Style.
   * @param _params The definition parameters.
   * @param document The document containing the source Style.
   * @returns A promise that resolves to an array of LocationLinks or undefined.
   */
  protected collectStyleLocationLinks(
    sourceCstNode: CstNode,
    _params: DefinitionParams,
    document: LangiumDocument,
  ): MaybePromise<LocationLink[] | undefined> {
    const goToDefinition = this.findStyleDefinition(sourceCstNode, document);
    if (goToDefinition) {
      return [
        LocationLink.create(
          goToDefinition.targetDocument.textDocument.uri,
          (goToDefinition.target.astNode.$cstNode ?? goToDefinition.target).range,
          goToDefinition.target.range,
          sourceCstNode.range,
        ),
      ];
    }
    return undefined;
  }

  /**
   * Collects location links for Element node definitions, handling document-level scope.
   * @param sourceCstNode The CST node of the source Element.
   * @param _params The definition parameters.
   * @param document The document containing the source Element.
   * @returns A promise that resolves to an array of LocationLinks or undefined.
   */
  protected async collectElementLocationLinks(
    sourceCstNode: CstNode,
    _params: DefinitionParams,
    document: LangiumDocument,
  ): Promise<LocationLink[] | undefined> {
    const goToLink = await this.findElementDefinition(document, sourceCstNode);
    if (goToLink) {
      return [
        LocationLink.create(
          goToLink.targetDocument.textDocument.uri,
          (goToLink.target.astNode.$cstNode ?? goToLink.target).range,
          goToLink.target.range,
          sourceCstNode.range,
        ),
      ];
    }
    return undefined;
  }

  /**
   * Finds the definition of a Style node within the same document, traversing the container hierarchy.
   * @param source The CST node of the source Style.
   * @param document The document containing the source Style.
   * @returns A GoToLink object or undefined.
   */
  protected findStyleDefinition(source: CstNode, document: LangiumDocument): GoToLink | undefined {
    const prefix = `GraphDefinitionProvider.findStyleDefinition()`;
    console.log(`${prefix} called for: "${source.text}"`);

    let current: AstNode | undefined = source.astNode;
    while (current && current.$cstNode) {
      const target = this.services.references.References.findDeclarationNode(current.$cstNode);
      if (target?.astNode) {
        try {
          const targetDocument = AstUtils.getDocument(target.astNode);
          if (targetDocument.uri.toString() === document.uri.toString()) {
            console.log(
              `${prefix} - Style definition found:`,
              render_text(
                target.astNode.$cstNode?.text,
                'target.astNode.$cstNode.text',
                '\\n',
                target.astNode.$cstNode?.range.start.line,
              ),
            );

            return { source, target, targetDocument };
          }
        } catch (err) {
          console.error(`${prefix} An error has occurred:`, err);
        }
      }
      current = current.$container;
    }
    console.log(`${prefix} - Style definition not found.`);
    return undefined;
  }

  /**
   * Finds the definition of an Element node within the same document.
   * @param document The document containing the source Element.
   * @param source The CST node of the source Element.
   * @returns A GoToLink object or undefined.
   */
  protected async findElementDefinition(
    document: LangiumDocument,
    source: CstNode,
  ): Promise<GoToLink | undefined> {
    const prefix = `GraphDefinitionProvider.findElementDefinition()`;
    console.log(`${prefix} called for: "${source.text}"`);
    console.log(`${prefix} document URI: ${document.uri.toString()}`);

    const offset = source.offset;

    const rootNode = document.parseResult.value;
    if (!rootNode.$cstNode) {
      return undefined;
    }

    const node = CstUtils.findLeafNodeAtOffset(rootNode.$cstNode, offset);
    if (!node) {
      return undefined;
    }

    const declarationNode = this.services.references.References.findDeclarationNode(node);

    if (!declarationNode) {
      return undefined;
    }

    console.log(
      `${prefix} - leafNode (container property: ${node.grammarSource?.$containerProperty}):\n${render_text(node.text, 'leafNode.text', '\\n', node.range.start.line)}`,
    );
    console.log(
      `${prefix} - declarationNode (container property: ${declarationNode.grammarSource?.$containerProperty}):\n${render_text(declarationNode.text, 'declarationNode.text', '\\n', declarationNode.range.start.line)}`,
    );
    console.log(render_text(inspect(declarationNode, false, 1), 'declarationNode'));

    if (!isElement(declarationNode.astNode)) {
      return undefined;
    }

    const refText = declarationNode.astNode.name ?? '';
    if (refText.length == 0) {
      return undefined;
    }
    const containerProperty = node.grammarSource?.$containerProperty ?? '';

    console.log(
      `${prefix} called for: ${declarationNode.astNode.name} -- containerProperty = "${containerProperty}"`,
    );
    console.log(`${prefix} document URI: ${document.uri.toString()}`);

    if (containerProperty.length == 0) {
      return undefined;
    }
    // Find the Link node as the container
    let linkNode: AstNode | undefined = node.astNode.$container; //Use the reference node to find the link.
    while (linkNode) {
      if (linkNode.$type === 'Link') {
        break;
      }
      linkNode = linkNode.$container;
    }
    if (!linkNode) {
      return undefined;
    }
    const context = {
      reference: { $refText: refText },
      container: linkNode,
      property: containerProperty,
    };
    const scope = this.scopeProvider.getScope(context);

    console.log(`${prefix} -- calling getScope(\n${render_text(inspect(context), 'context')}\n)`);
    console.log(
      `${prefix} refText = "${refText}" (declarationNode.astNode.$type ${declarationNode.astNode.$type})`,
    );

    const descriptions = scope.getAllElements().toArray();

    console.log(`${prefix} -- scope descriptions: ${descriptions.length}`);
    descriptions.forEach((desc) => {
      console.log(
        `${prefix} -- scope description: ${desc.name} path: ${desc.path} type: ${desc.type} document URI: ${desc.documentUri.toString()}`,
      );
    });

    const target = descriptions.find((description) => description.name === refText);

    if (!target) {
      console.log('${prefix} - Element definition not found.');
      return undefined;
    }

    const targetDocument = await this.documents.getOrCreateDocument(target.documentUri);

    if (!target.node || !target.nameSegment) {
      return undefined;
    }

    if (!target.node.$cstNode) {
      return undefined;
    }

    return {
      source,
      target: declarationNode,
      targetDocument,
    };
  }
}
