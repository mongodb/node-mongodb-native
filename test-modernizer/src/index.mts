import { type PathLike, readdirSync, readFileSync, statSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, parse } from 'path';

import { modernizeTest, shouldRefactor } from './core.js';
import { formatSource, parseSource } from './utils.js';

declare module 'typescript' {
  export interface Node {
    KIND?: string;
  }
}

async function makeTestDefinitionsUniform(testFile: PathLike, output = testFile) {
  const source = parseSource(readFileSync(testFile, 'utf-8'));
  if (!shouldRefactor(source)) return;
  const result = modernizeTest(source);
  await writeFile(output, await formatSource(result));
}

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

const files = Array.from(walk(process.argv.at(-1))).filter(p => {
  const { ext, name } = parse(p);
  return name.includes('test') && ['.js', '.ts'].includes(ext);
});
for (const file of files) {
  await makeTestDefinitionsUniform(file);
}
