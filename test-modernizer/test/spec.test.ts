import { createProjectSync } from '@ts-morph/bootstrap';
import { expect } from 'chai';
import { describe } from 'mocha';

import { convert } from '../src/index';
import { formatSource } from '../src/utils';

function parseSource(source: string) {
  const project = createProjectSync();
  const resultFile = project.createSourceFile('someFileName.ts', source);
  return resultFile;
}
describe('Specification Tests', function () {
  // const source = readFileSync('./spec.txt', 'utf-8');
  // const tests = source.split('===').map(test => {
  //   const [input, output] = test.trim().split('---');
  //   return { input, output };
  // });

  let i = 0;

  for (const test of []) {
    it(`${JSON.stringify(i++)}`, async function () {
      expect(await formatSource(test.output)).to.equal(
        await formatSource(convert(parseSource(test.input)))
      );
    });
  }
});
