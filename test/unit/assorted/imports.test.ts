import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function* walk(root) {
  const directoryContents = fs.readdirSync(root);
  for (const filepath of directoryContents) {
    const fullPath = path.join(root, filepath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
    } else if (stat.isFile()) {
      yield fullPath;
    }
  }
}

// these tests take a long time to run and never break, setting `SKIP_IMPORT`
// will skip these tests locally.
//
// alternatively, we could consider getting rid of them, since they caught anything in 3 years.
const test = process.env.SKIP_IMPORT ? describe.skip : describe;
test('importing mongodb driver', () => {
  const sourceFiles = walk(path.resolve(__dirname, '../../../src'));

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.endsWith('.ts')) {
      continue;
    }

    const sliceFrom = sourceFile.indexOf('src');
    it(`should import ${sourceFile.slice(sliceFrom)} directly without issue`, () => {
      execSync(`./node_modules/.bin/ts-node -e "require('${sourceFile}')"`);
    });
  }
});
