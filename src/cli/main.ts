import type { Model } from "../language/generated/ast.js";
import chalk from "chalk";
import { Command } from "commander";
import { GraphLanguageMetaData } from "../language/generated/module.js";
import { createGraphServices } from "../language/graph-module.js";
import { extractAstNode, extractDocument } from "./cli-util.js";
import { generate_cleaned_graph } from "./generator.js";
import { NodeFileSystem } from "langium/node";
import * as url from "node:url";
import * as fs from "node:fs/promises";
import * as path from "node:path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const packagePath = path.resolve(__dirname, "..", "..", "package.json");
const packageContent = await fs.readFile(packagePath, "utf-8");

export const parseAndValidateAction = async (
  fileName: string,
): Promise<void> => {
  // retrieve the services for our language
  const services = createGraphServices(NodeFileSystem).Graph;
  // extract a document for our program
  const document = await extractDocument(fileName, services);
  // extract the parse result details
  const parseResult = document.parseResult;
  // verify no lexer, parser, or general diagnostic errors show up
  if (
    parseResult.lexerErrors.length === 0 &&
    parseResult.parserErrors.length === 0
  ) {
    console.log(chalk.green(`Parsed and validated ${fileName} successfully!`));
  } else {
    console.log(chalk.red(`Failed to parse and validate ${fileName}!`));
  }
};

export const generateAction = async (
  fileName: string,
  opts: GenerateOptions,
): Promise<void> => {
  const services = createGraphServices(NodeFileSystem).Graph;
  const model = await extractAstNode<Model>(fileName, services);
  const generatedFilePath = generate_cleaned_graph(model, fileName, opts);
  console.log(
    chalk.green(`JavaScript code generated successfully: ${generatedFilePath}`),
  );
};

export interface GenerateOptions {
  destination?: string;
}

export default function (): void {
  const program = new Command();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
  program.version(JSON.parse(packageContent).version);

  const fileExtensions = GraphLanguageMetaData.fileExtensions.join(", ");

  // Action: check only
  program
    .command("check")
    .argument(
      "<file>",
      `Source file to parse & validate (ending in ${fileExtensions})`,
    )
    .description(
      "Indicates where a program parses & validates successfully, but produces no output code",
    )
    .action(parseAndValidateAction);

  // Action: generate
  program
    .command("generate:clean")
    .argument(
      "<file>",
      `source file (possible file extensions: ${fileExtensions})`,
    )
    .option("-d, --destination <dir>", "destination directory of generating")
    .description("strip comments and clean the input file (indentation etc.)")
    .action(generateAction);

  program.parse(process.argv);
}
