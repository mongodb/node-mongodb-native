'use strict';
const { expect } = require('chai');
const tar = require('tar');
const cp = require('child_process');
const fs = require('fs');
const pkg = require('../package.json');

const packFile = `mongodb-client-encryption-${pkg.version}.tgz`;

const REQUIRED_FILES = [
  'package/binding.gyp',
  'package/CHANGELOG.md',
  'package/index.d.ts',
  'package/lib/index.js',
  'package/lib/autoEncrypter.js',
  'package/lib/buffer_pool.js',
  'package/lib/clientEncryption.js',
  'package/lib/common.js',
  'package/lib/providers/index.js',
  'package/lib/providers/gcp.js',
  'package/lib/providers/aws.js',
  'package/lib/providers/azure.js',
  'package/lib/providers/utils.js',
  'package/lib/cryptoCallbacks.js',
  'package/lib/errors.js',
  'package/lib/mongocryptdManager.js',
  'package/lib/stateMachine.js',
  'package/LICENSE',
  'package/package.json',
  'package/README.md',
  'package/src/mongocrypt.cc',
  'package/src/mongocrypt.h'
];

describe(`Release ${packFile}`, function () {
  this.timeout(5000);

  let tarFileList;
  before(() => {
    expect(fs.existsSync(packFile)).to.equal(false);
    cp.execSync('npm pack', { stdio: 'ignore' });
    tarFileList = [];
    tar.list({
      file: packFile,
      sync: true,
      onentry(entry) {
        tarFileList.push(entry.path);
      }
    });
  });

  after(() => {
    fs.unlinkSync(packFile);
  });

  for (const requiredFile of REQUIRED_FILES) {
    it(`should contain ${requiredFile}`, () => {
      expect(tarFileList).to.includes(requiredFile);
    });
  }

  it('should not have extraneous files', () => {
    const unexpectedFileList = tarFileList.filter(f => !REQUIRED_FILES.some(r => r === f));
    expect(unexpectedFileList).to.have.lengthOf(0, `Extra files: ${unexpectedFileList.join(', ')}`);
  });
});
