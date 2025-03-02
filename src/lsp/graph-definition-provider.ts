import { AstUtils, CstNode, CstUtils, LangiumDocument, MaybePromise, Reference } from 'langium';
import { DefaultDefinitionProvider, GoToLink, LangiumServices } from 'langium/lsp';
import { inspect } from 'util';
// import { Position as vscodePosition, Range as vscodeRange } from 'vscode';
import {
  CancellationToken,
  DefinitionParams,
  LocationLink,
  Position,
  Range,
} from 'vscode-languageserver';

export class GraphDefinitionProvider extends DefaultDefinitionProvider {
  constructor(services: LangiumServices) {
    super(services);
  }

  // Override the getDefinition method.
  override getDefinition(
    document: LangiumDocument,
    params: DefinitionParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken?: CancellationToken,
  ): MaybePromise<LocationLink[] | undefined> {
    console.log(
      `GraphDefinitionProvider.getDefinition() called for document URI "${document.uri.toString()}" with params:\n${inspect(params)}\n`,
    );

    const rootNode = document.parseResult.value;
    if (rootNode.$cstNode) {
      // Get the root CST node (representing the entire document)
      const cst = rootNode.$cstNode;
      const sourceCstNode = CstUtils.findDeclarationNodeAtOffset(
        cst,
        document.textDocument.offsetAt(params.position),
        this.grammarConfig.nameRegexp,
      );
      if (sourceCstNode) {
        console.info(
          `GraphDefinitionProvider.getDefinition() - Found leafNode with text [${sourceCstNode.text}] at ${this.range_toString(
            sourceCstNode.range,
          )}:\nLeaf node :\n${this.render_text(inspect(sourceCstNode, false, 1), 'LeafNode')}\n`,
        );
        return this.collectLocationLinks(sourceCstNode, params);
      }
    }
    console.error(
      `GraphDefinitionProvider.getDefinition() - ${rootNode.$cstNode ? 'sourceCstNode' : 'rootNode.cst'} undefined!`,
    );
    return undefined;

    //return super.getDefinition(document, params, cancelToken);
  }

  /*
  override findLink(source: CstNode): GoToLink | undefined {
    const target = this.references.findDeclarationNode(source);
    if (target?.astNode) {
      const targetDocument = AstUtils.getDocument(target.astNode);
      console.log(`GraphDefinitionProvider.findLink(${source.text}) --> [${target.text}] @ ${targetDocument.uri.toString()}`)
      return { source, target, targetDocument };
    }

    return undefined;
  }
    */

  override findLink(source: CstNode): GoToLink | undefined {
    const target = this.references.findDeclarationNode(source);
    const sourceDocument = AstUtils.getDocument(source.astNode); // Get the source document

    console.log(
      `GraphDefinitionProvider.findLink(${source.text}) @ ${sourceDocument.uri.toString()} --> [${target?.text ?? '<target not lnked to AST node>'}]`,
    );

    if (target?.astNode) {
      const targetDocument = AstUtils.getDocument(target.astNode);
      console.log(
        `GraphDefinitionProvider.findLink(${source.text}) @ ${sourceDocument.uri.toString()} --> [${target.text}] @ ${targetDocument.uri.toString()} -- will return {source, target, targetDocument}`,
      );
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (target && targetDocument) {
        return { source, target, targetDocument };
      }
    }
    return undefined;

    /*
    const target = this.references.findDeclarationNode(source);
    if (target?.astNode) {
      const targetDocument = AstUtils.getDocument(target.astNode);
      const sourceDocument = AstUtils.getDocument(source.astNode); // Get the source document

      console.log(
        `GraphDefinitionProvider.findLink(${source.text}) @ ${sourceDocument.uri.toString()} --> [${target.text}] @ ${targetDocument.uri.toString()}`,
      );

      if (targetDocument.uri.toString() === sourceDocument.uri.toString()) {
        // Check if documents are the same
        console.log(
          `GraphDefinitionProvider.findLink(${source.text}) --> [${target.text}] @ ${targetDocument.uri.toString()}`,
        );
        return { source, target, targetDocument };
      } else {
        console.log(
          `GraphDefinitionProvider.findLink(${source.text}) --> [${target.text}] @ ${targetDocument.uri.toString()} (Different document)`,
        );
        // If the target is in a different document, return undefined.
        return undefined;
      }
    }
    return undefined;
    */
  }

  /**
   * Finds a reference at the given position in the document.
   */
  protected findReferenceAtPosition(
    document: LangiumDocument,
    position: { line: number; character: number },
  ): Reference | undefined {
    const i = 0;
    const matches: Reference[] = [];

    for (const ref of document.references) {
      console.log(
        `findReferenceAtPosition(${this.position_toString(position, false)}) - "${ref.$refText}" --> [type ${ref.$refNode?.astNode.$type}] at ${this.range_toString(ref.ref?.$cstNode?.range)} in [ ${ref.ref?.$cstNode?.grammarSource?.$document?.uri.toString()} ] defined as:\n${this.render_text(ref.ref?.$cstNode?.text, 'ref.ref?.$cstNode?.text', '\\n', ref.ref?.$cstNode?.range.start.line)}\n`,
      );
    }
    for (const ref of document.references) {
      console.log(
        `findReferenceAtPosition() (round 2) - "${ref.$refText}" --> [type ${ref.$refNode?.astNode.$type}] at ${this.range_toString(ref.ref?.$cstNode?.range)} in [ ${ref.ref?.$cstNode?.grammarSource?.$document?.uri.toString()} ] defined as:\n${this.render_text(ref.ref?.$cstNode?.text, 'ref.ref?.$cstNode?.text', '\\n', ref.ref?.$cstNode?.range.start.line)}\n`,
      );
      if (!ref.$refNode) continue;

      const refRange = ref.$refNode.range;
      /*
        if (
            position.line >= refRange.start.line &&
            position.line <= refRange.end.line &&
            position.character >= refRange.start.character &&
            position.character <= refRange.end.character
        ) {
            return ref;
        }
        */

      const { start, end } = refRange;

      // Check if cursor in astNode's Cst node range:
      if (position.line < start.line) {
        // cstNode before cursor (line level) -- SKIP
        continue;
      } else if (position.line > end.line) {
        // cstNode after cursor (line level) -- SKIP
        continue;
      } else {
        // cursor line in cstNode range
        if (position.line === start.line && position.character < start.character) {
          // cstNode after cursor (char level) -- SKIP
          continue;
        } else if (position.line === end.line && position.character > end.character) {
          // cstNode before cursor (char level) -- SKIP
          continue;
        }
      }
      // MATCH

      const astNode = ref.ref;

      if (!astNode) {
        console.warn(`findReferenceAtPosition() -- ref.ref is UNDEFINED -- skipped`);
        continue;
      }

      // Potential candidate found
      console.log(`POTENTIAL MATCH: cursor position within cstNode range`);

      console.log(
        `\nAST ${String('    ' + i).slice(-4)} | ${astNode.$type} (${
          astNode.$containerProperty ?? '<unknown container property>'
        }) - cstNode <${astNode.$cstNode?.grammarSource?.$type ?? 'undefined'}: ${
          astNode.$cstNode?.grammarSource?.$containerProperty ?? '<container property not set>'
        }> @ (${this.range_toString(refRange)}) -- length = ${astNode.$cstNode?.length}`,
      );
      console.log(
        this.render_text(astNode.$cstNode?.text, 'astNode.$cstNode.text', '\\n', start.line),
      );

      // We found a possible match of type Element (Graph, Node, Link) or Style
      matches.push(ref);
    }

    // Now get the AST node with the "smallest match":
    const m = matches.sort(
      (a, b) => (a.ref?.$cstNode?.length ?? 0) - (b.ref?.$cstNode?.length ?? 0),
    );

    console.log(
      this.render_text(
        m[0].ref?.$cstNode?.text ?? '<Error: CST Node is undefined>',
        'MATCH astNode.$cstNode.text',
        '\\n',
        m[0].ref?.$cstNode?.range.start.line,
      ),
    );

    return m[0];
  }

  protected position_toString(
    position: Position | undefined,
    show_brackets: boolean = true,
  ): string {
    if (!position) {
      return '<position undefined>';
    }
    return `${show_brackets ? '(' : ''}line ${position.line}, char ${position.character}${show_brackets ? ')' : ''}`;
  }

  protected range_toString(range: Range | undefined): string {
    if (!range) {
      return '<range undefined>';
    }
    if (range.start.line == range.end.line) {
      return `(line ${range.start.line}, char ${range.start.character} -- ${range.end.character})`;
    } else {
      return `(${this.position_toString(range.start, false)} -- ${this.position_toString(range.end, false)})`;
    }
  }

  protected render_text(
    text: string | undefined,
    prefix: string = '',
    suffix: string = '',
    start_line: number = 0,
  ): string {
    return (text ?? '<undefined text>')
      .split(/\r?\n|\r|\n/g)
      .map(
        (line, index) =>
          `  ${prefix == '' ? '' : prefix + ':'} ${String('    ' + (index + start_line + 1)).slice(-4)}|${line}${suffix}`,
      )
      .join('\n');
  }
}
