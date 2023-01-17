import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from 'chai';

import { dependencies, peerDependencies, peerDependenciesMeta } from '../../package.json';

const EXPECTED_DEPENDENCIES = ['bson', 'mongodb-connection-string-url', 'socks'];
const EXPECTED_PEER_DEPENDENCIES = [
  '@aws-sdk/credential-providers',
  'snappy',
  'mongodb-client-encryption'
];

describe('package.json', function () {
  describe('dependencies', function () {
    it('only contains the expected dependencies', function () {
      expect(dependencies).to.have.keys(EXPECTED_DEPENDENCIES);
    });
  });

  describe('peerDependencies', function () {
    it('only contains the expected peerDependencies', function () {
      expect(peerDependencies).to.have.keys(EXPECTED_PEER_DEPENDENCIES);
    });

    it('has a meta field for each expected peer', function () {
      expect(peerDependenciesMeta).to.have.keys(EXPECTED_PEER_DEPENDENCIES);
    });
  });

  describe('Optional Peer dependencies', () => {
    after('reset npm dependencies', () => {
      // This test file is not meant to be run alongside others, but in case
      // we can attempt to reset the environment
      fs.rmSync(path.join(repoRoot, 'node_modules'), { recursive: true, force: true });
      execSync(`npm clean-install`);
    });

    const repoRoot = path.resolve(__dirname, '../..');

    const testScript = `
      const mdb = require('${repoRoot}/src/index.ts');
      console.log('import success!');`
      .split('\n')
      .join('');

    for (const [depName, depVersion] of Object.entries(peerDependencies)) {
      const depMajor = depVersion.split('.')[0];

      context(`when ${depName} is NOT installed`, () => {
        beforeEach(async () => {
          fs.rmSync(path.join(repoRoot, 'node_modules', depName), { recursive: true, force: true });
        });

        it(`driver is importable`, () => {
          expect(fs.existsSync(path.join(repoRoot, 'node_modules', depName))).to.be.false;

          const result = execSync(`./node_modules/.bin/ts-node -e "${testScript}"`, {
            encoding: 'utf8'
          });

          expect(result).to.include('import success!');
        });
      });

      context(`when ${depName} is installed`, () => {
        beforeEach(async () => {
          execSync(`npm install --no-save "${depName}"@${depMajor}`);
        });

        it(`driver is importable`, () => {
          expect(fs.existsSync(path.join(repoRoot, 'node_modules', depName))).to.be.true;

          const result = execSync(`./node_modules/.bin/ts-node -e "${testScript}"`, {
            encoding: 'utf8'
          });

          expect(result).to.include('import success!');
        });
      });
    }
  });
});
