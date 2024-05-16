import { type PathLike, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { convertTestToSeparateMetadataAndTestFunctionArguments, modernizeTest } from './core.js';
import { formatSource, parseSource } from './utils.js';

declare module 'typescript' {
  export interface Node {
    KIND?: string;
  }
}

const input = process.argv[2];
const output = process.argv[3] ?? input;

async function makeTestDefinitionsUniform(testFile: PathLike, output = testFile) {
  const source = parseSource(readFileSync(testFile, 'utf-8'));
  const result = modernizeTest(source);
  await writeFile(output, await formatSource(result));
}

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = dirname(__filename); // get the name of the directory

function* walk(root): Generator<string> {
  const directoryContents = readdirSync(root);
  for (const filepath of directoryContents) {
    const fullPath = join(root, filepath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
    } else if (stat.isFile()) {
      yield fullPath;
    }
  }
}

const files = walk(join(__dirname, '../../test'));
for (const file of files) {
  console.log('converting file: ', file);
  await makeTestDefinitionsUniform(file);
}
