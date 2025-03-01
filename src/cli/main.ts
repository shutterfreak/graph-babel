import chalk from 'chalk';
import { Command } from 'commander';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import type { Model } from '../language/generated/ast.js';
import { GraphLanguageMetaData } from '../language/generated/module.js';
import { createGraphServices } from '../language/graph-module.js';
import { extractAstNode, extractDocument } from './cli-util.js';
import { generate_graphml_graph } from './generate-graphml.js';
import { generate_mermaid_graph } from './generate-mmd.js';
import { generate_cleaned_graph } from './generator.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const parseAndValidateAction = async (fileName: string): Promise<void> => {
  // retrieve the services for our language
  const services = createGraphServices(NodeFileSystem).Graph;
  // extract a document for our program
  const document = await extractDocument(fileName, services);
  // extract the parse result details
  const parseResult = document.parseResult;
  // verify no lexer, parser, or general diagnostic errors show up
  if (parseResult.lexerErrors.length === 0 && parseResult.parserErrors.length === 0) {
    console.log(chalk.green(`Parsed and validated ${fileName} successfully!`));
  } else {
    console.log(chalk.red(`Failed to parse and validate ${fileName}!`));
  }
};

export const generateCleanedGraphAction = async (
  fileName: string,
  opts: GenerateOptions,
): Promise<void> => {
  const services = createGraphServices(NodeFileSystem).Graph;
  const model = await extractAstNode<Model>(fileName, services);
  const generatedFilePath = generate_cleaned_graph(model, fileName, opts);
  console.log(chalk.green(`JavaScript code generated successfully: ${generatedFilePath}`));
};

export const generateMermaidGraphAction = async (
  fileName: string,
  opts: GenerateOptions,
): Promise<void> => {
  const services = createGraphServices(NodeFileSystem).Graph;
  const model = await extractAstNode<Model>(fileName, services);
  const generatedFilePath = await generate_mermaid_graph(model, fileName, opts);
  console.log(chalk.green(`MermaidJS Graph code generated successfully: ${generatedFilePath}`));
};

export const generateGraphMLAction = async (
  fileName: string,
  opts: GenerateOptions,
): Promise<void> => {
  const services = createGraphServices(NodeFileSystem).Graph;
  const model = await extractAstNode<Model>(fileName, services);
  const generatedFilePath = generate_graphml_graph(model, fileName, opts);
  console.log(chalk.green(`GraphML Graph code generated successfully: ${generatedFilePath}`));
};

export interface GenerateOptions {
  destination?: string;
}

export default function (): void {
  const program = new Command();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
  program.version(JSON.parse(packageContent).version);

  const fileExtensions = GraphLanguageMetaData.fileExtensions.join(', ');

  // Action: check only
  program
    .command('check')
    .argument('<file>', `Source file to parse & validate (ending in ${fileExtensions})`)
    .description(
      'Indicates where a program parses & validates successfully, but produces no output code',
    )
    .action(parseAndValidateAction);

  // Action generate:clean
  program
    .command('generate:clean')
    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
    .option('-d, --destination <dir>', 'destination directory of generating')
    .description('strip comments and clean the input file (indentation etc.)')
    .action(generateCleanedGraphAction);

  // Action generate:mmd
  program
    .command('generate:mmd')
    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
    .option('-d, --destination <dir>', 'destination directory of generating')
    .description('generate a MermaidJS graph (.mmd)')
    .action(generateMermaidGraphAction);

  // Action generate:graphml
  program
    .command('generate:graphml')
    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
    .option('-d, --destination <dir>', 'destination directory of generating')
    .description('generate a graphML graph (.graphml)')
    .action(generateGraphMLAction);

  program.parse(process.argv);
}
