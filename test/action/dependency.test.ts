import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as timers from 'node:timers/promises';

import { expect } from 'chai';

import { dependencies, peerDependencies, peerDependenciesMeta } from '../../package.json';
import * as mongodb from '../mongodb';

const EXPECTED_DEPENDENCIES = ['bson', 'mongodb-connection-string-url', 'socks'];
const EXPECTED_PEER_DEPENDENCIES = [
  '@aws-sdk/credential-providers',
  '@mongodb-js/zstd',
  'kerberos',
  'snappy',
  'mongodb-client-encryption'
];

const resolvable = depName => {
  try {
    require.resolve(depName);
    return true;
  } catch {
    return false;
  }
};

const importerMap = new Map()
  .set('@aws-sdk/credential-providers', 'getAwsCredentialProvider')
  .set('@mongodb-js/zstd', 'getZstd')
  .set('kerberos', 'getKerberos')
  .set('snappy', 'getSnappy')
  .set('saslprep', 'getSaslPrep')
  .set('aws4', 'getAWS4')
  .set('mongodb-client-encryption', 'getMongoDBClientEncryption');

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

          while (resolvable(depName)) {
            await timers.setTimeout(100);
          }

          for (const key of Object.keys(require.cache)) delete require.cache[key];
        });

        it(`driver is importable`, () => {
          const result = execSync(`./node_modules/.bin/ts-node -e "${testScript}"`, {
            encoding: 'utf8'
          });

          expect(result).to.include('import success!');
        });

        it.skip('importer helper returns rejected', async () => {
          const importer = importerMap.get(depName);
          expect(mongodb).to.have.property(importer).that.is.a('function');
          const importResult = await mongodb[importer]();

          expect(importResult).to.have.property('status', 'rejected');
          expect(importResult)
            .to.have.property('reason')
            .to.be.instanceOf(mongodb.MongoMissingDependencyError);
        });
      });

      context(`when ${depName} is installed`, () => {
        beforeEach(async () => {
          execSync(`npm install --no-save "${depName}"@"${depMajor}"`);
          while (!resolvable(depName)) {
            await timers.setTimeout(100);
          }
          for (const key of Object.keys(require.cache)) delete require.cache[key];
        });

        it(`driver is importable`, () => {
          const result = execSync(`./node_modules/.bin/ts-node -e "${testScript}"`, {
            encoding: 'utf8'
          });

          expect(result).to.include('import success!');
        });

        it.skip('importer helper returns fulfilled', async () => {
          const importer = importerMap.get(depName);
          expect(mongodb).to.have.property(importer).that.is.a('function');
          const importResult = await mongodb[importer]();

          expect(importResult).to.have.property('status', 'fulfilled');
          expect(importResult).to.have.property('value').and.to.exist;
        });
      });
    }
  });

  const EXPECTED_IMPORTS = [
    'bson',
    'saslprep',
    'sparse-bitfield',
    'memory-pager',
    'mongodb-connection-string-url',
    'whatwg-url',
    'webidl-conversions',
    'tr46',
    'socks',
    'ip',
    'smart-buffer'
  ];

  describe('mongodb imports', () => {
    let imports: string[];
    beforeEach(async function () {
      for (const key of Object.keys(require.cache)) delete require.cache[key];
      require('../../src');
      imports = Array.from(
        new Set(
          Object.entries(require.cache)
            .filter(([modKey]) => modKey.includes('/node_modules/'))
            .map(([modKey]) => {
              const leadingPkgName = modKey.split('/node_modules/')[1];
              const [orgName, pkgName] = leadingPkgName.split('/');
              if (orgName.startsWith('@')) {
                return `${orgName}/${pkgName}`;
              }
              return orgName;
            })
        )
      );
    });

    context('when importing mongodb', () => {
      it('only contains the expected imports', function () {
        expect(imports).to.deep.equal(EXPECTED_IMPORTS);
      });

      it('does not import optional dependencies', () => {
        for (const peerDependency of EXPECTED_PEER_DEPENDENCIES) {
          expect(imports).to.not.include(peerDependency);
        }
      });
    });
  });
});
