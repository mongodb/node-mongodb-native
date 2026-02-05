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

describe('importing mongodb driver', () => {
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
