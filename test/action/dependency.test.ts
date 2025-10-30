import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from 'chai';

import { dependencies, peerDependencies, peerDependenciesMeta } from '../../package.json';
import { setDifference } from '../../src/utils';
import { alphabetically, itInNodeProcess, sorted } from '../tools/utils';

const EXPECTED_DEPENDENCIES = sorted(
  ['@mongodb-js/saslprep', 'bson', 'mongodb-connection-string-url'],
  alphabetically
);
const EXPECTED_PEER_DEPENDENCIES = [
  '@aws-sdk/credential-providers',
  '@mongodb-js/zstd',
  'kerberos',
  'snappy',
  'mongodb-client-encryption',
  'gcp-metadata',
  'socks'
];

describe('package.json', function () {
  describe('dependencies', function () {
    it('only contains the expected dependencies', function () {
      expect(sorted(Object.keys(dependencies), alphabetically)).to.deep.equal(
        EXPECTED_DEPENDENCIES
      );
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

    for (const [depName, depVersion] of Object.entries(
      peerDependencies as Record<string, string>
    )) {
      // If a dependency specifies `alpha|beta`, the major version will fail to install because
      // an alpha < the major of that version (ex: mongodb-client-encryption@7.0.0-alpha < mongodb-client-encryption@7.0.0)
      const depInstallSpecifier = /alpha|beta/.test(depVersion)
        ? depVersion
        : depVersion.split('.')[0];

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

        if (depName === 'snappy') {
          itInNodeProcess('getSnappy returns rejected import', async function ({ expect }) {
            // @ts-expect-error: import from the inside forked process
            const { getSnappy } = await import('./src/deps.ts');
            const snappyImport = getSnappy();
            expect(snappyImport).to.have.nested.property(
              'kModuleError.name',
              'MongoMissingDependencyError'
            );
          });
        }
      });

      context(`when ${depName} is installed`, () => {
        beforeEach(async function () {
          execSync(`npm install --no-save -D "${depName}"@"${depInstallSpecifier}"`);
        });

        it(`driver is importable`, () => {
          expect(fs.existsSync(path.join(repoRoot, 'node_modules', depName))).to.be.true;

          const result = execSync(`./node_modules/.bin/ts-node -e "${testScript}"`, {
            encoding: 'utf8'
          });

          expect(result).to.include('import success!');
        });

        if (depName === 'snappy') {
          itInNodeProcess('getSnappy returns fulfilled import', async function ({ expect }) {
            // @ts-expect-error: import from the inside forked process
            const { getSnappy } = await import('./src/deps.ts');
            const snappyImport = getSnappy();
            expect(snappyImport).to.have.property('compress').that.is.a('function');
            expect(snappyImport).to.have.property('uncompress').that.is.a('function');
          });
        }
      });
    }
  });

  const EXPECTED_IMPORTS = [
    'bson',
    '@mongodb-js/saslprep',
    'sparse-bitfield',
    'memory-pager',
    'mongodb-connection-string-url',
    'whatwg-url',
    'webidl-conversions',
    'tr46',
    'punycode'
  ];

  describe('mongodb imports', () => {
    let imports: string[];

    beforeEach(async function () {
      for (const key of Object.keys(require.cache)) delete require.cache[key];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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
        expect(setDifference(imports, EXPECTED_IMPORTS)).to.deep.equal(new Set());
      });

      it('does not import optional dependencies', () => {
        for (const peerDependency of EXPECTED_PEER_DEPENDENCIES) {
          expect(imports).to.not.include(peerDependency);
        }
      });
    });
  });
});
