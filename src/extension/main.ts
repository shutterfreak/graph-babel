import * as path from 'node:path';
import * as vscode from 'vscode';
import { workspace } from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client: LanguageClient | undefined;

/******* EXAMPLE REGISTRATION:
import ∗ as vscode from 'vscode';
export function activate(context:vscode.ExtensionContext){
  this.context.subscriptions.push (
    vscode.commands.registerCommand('example.hello',()=> {
    vscode.window.showInformationMessage('Hello!') ;
  }));
  this.context.subscriptions.push (
  vscode.commands.registerCommand('example.newFile ', async()=> {
    const newDocument=await workspace.openTextDocument({
      content:'\n\n\n\nHello',
      language:'txt',
    });
    await window.showTextDocument(newDocument )
  }));
}
*/

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Registered languages:', (await vscode.languages.getLanguages()).join(', '));

  try {
    client = await startLanguageClient(context); // Wait for the client to fully start

    console.log('Extension activated successfully and client started.');
  } catch (error) {
    console.error('Error during extension activation:', error);
  }
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
  if (client !== undefined) {
    return client.stop();
  }
  return undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
  const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
  // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
  const debugOptions = {
    execArgv: [
      '--nolazy',
      `--inspect${process.env.DEBUG_BREAK != null ? '-brk' : ''}=${process.env.DEBUG_SOCKET ?? '6009'}`,
    ],
  };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'graph' },
      { scheme: 'builtin', language: 'graph' },
    ],
    synchronize: { fileEvents: workspace.createFileSystemWatcher('**/*') },
  };

  // Create the language client and start the client.
  const client = new LanguageClient('graph', 'Graph', serverOptions, clientOptions);

  // Wait for the client to start before proceeding
  await client.start().catch((exception) => {
    console.error('Failed to start the language client:', exception);
  });

  return client;
}
