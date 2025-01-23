import type { Model } from "../language/generated/ast.js";
import chalk from "chalk";
import { Command } from "commander";
import { GraphLanguageMetaData } from "../language/generated/module.js";
import { createGraphServices } from "../language/graph-module.js";
import { extractAstNode } from "./cli-util.js";
import { generate_cleaned_graph } from "./generator.js";
import { NodeFileSystem } from "langium/node";
import * as url from "node:url";
import * as fs from "node:fs/promises";
import * as path from "node:path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const packagePath = path.resolve(__dirname, "..", "..", "package.json");
const packageContent = await fs.readFile(packagePath, "utf-8");

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
  program
    .command("generate")
    .argument(
      "<file>",
      `source file (possible file extensions: ${fileExtensions})`,
    )
    .option("-d, --destination <dir>", "destination directory of generating")
    .description(
      'generates JavaScript code that prints "Hello, {name}!" for each greeting in a source file',
    )
    .action(generateAction);

  program.parse(process.argv);
}
