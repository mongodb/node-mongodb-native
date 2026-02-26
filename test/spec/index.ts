import * as fs from 'fs';
import * as path from 'path';

import { EJSON } from '../mongodb';

function hasDuplicates(testArray) {
  const testNames = testArray.map(test => test.description);
  const testNameSet = new Set(testNames);
  return testNameSet.size !== testNames.length;
}

/**
 * Given spec test folder names, loads the corresponding JSON
 *
 * @param args - the spec test name to load
 */
export function loadSpecTests(...args: string[]): any[] {
  const specPath = path.resolve(...[__dirname].concat(args));

  const suites = fs
    .readdirSync(specPath)
    .filter(x => x.includes('.json'))
    .map(x => ({
      ...EJSON.parse(fs.readFileSync(path.join(specPath, x), 'utf8'), { relaxed: true }),
      name: path.basename(x, '.json')
    }));

  for (const suite of suites) {
    if (suite.tests && hasDuplicates(suite.tests)) {
      throw new Error(
        `Failed to load suite ${suite.name} because it contains duplicate test cases`
      );
    }
  }

  return suites;
}
