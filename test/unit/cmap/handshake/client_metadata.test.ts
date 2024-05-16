import { expect } from 'chai';
import * as os from 'os';
import * as process from 'process';
import * as sinon from 'sinon';
import { inspect } from 'util';

import { version as NODE_DRIVER_VERSION } from '../../../../package.json';
import {
  getFAASEnv,
  Int32,
  LimitedSizeDocument,
  makeClientMetadata,
  MongoInvalidArgumentError,
  ObjectId
} from '../../../mongodb';

describe('client metadata module', () => {
  afterEach(() => sinon.restore());

  describe('new LimitedSizeDocument()', () => {
    // For the sake of testing the size limiter features
    // We test document: { _id: ObjectId() }
    // 4 bytes + 1 type byte + 4 bytes for key + 12 bytes Oid + 1 null term byte
    // = 22 bytes
    it('allows setting a key and value that fit within maxSize', () => {
      const doc = new LimitedSizeDocument(22);
      expect(doc.ifItFitsItSits('_id', new ObjectId())).to.be.true;
      expect(doc.toObject()).to.have.all.keys('_id');
    });

    it('ignores attempts to set key-value pairs that are over size', () => {
      const doc = new LimitedSizeDocument(22);
      expect(doc.ifItFitsItSits('_id', new ObjectId())).to.be.true;
      expect(doc.ifItFitsItSits('_id2', '')).to.be.false;
      expect(doc.toObject()).to.have.all.keys('_id');
    });
  });

  describe('getFAASEnv()', function () {
    const tests: Array<[envVariable: string, provider: string]> = [
      ['AWS_LAMBDA_RUNTIME_API', 'aws.lambda'],
      ['FUNCTIONS_WORKER_RUNTIME', 'azure.func'],
      ['K_SERVICE', 'gcp.func'],
      ['FUNCTION_NAME', 'gcp.func'],
      ['VERCEL', 'vercel']
    ];
    for (const [envVariable, provider] of tests) {
      describe(`when ${envVariable} is set to a non-empty string`, () => {
        before(() => {
          process.env[envVariable] = 'non_empty_string';
        });

        after(() => {
          delete process.env[envVariable];
        });

        it('determines the correct provider', () => {
          expect(getFAASEnv()?.get('name')).to.equal(provider);
        });

        describe(`when ${envVariable} is set to an empty string`, () => {
          before(() => {
            process.env[envVariable] = '';
          });

          after(() => {
            delete process.env[envVariable];
          });

          it('returns null', () => {
            expect(getFAASEnv()).to.be.null;
          });
        });
      });
    }

    describe('when AWS_EXECUTION_ENV starts with "AWS_Lambda_"', () => {
      before(() => {
        process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_correctStartString';
      });

      after(() => {
        delete process.env.AWS_EXECUTION_ENV;
      });

      it('indicates the runtime is aws lambda', () => {
        expect(getFAASEnv()?.get('name')).to.equal('aws.lambda');
      });
    });

    describe('when AWS_EXECUTION_ENV does not start with "AWS_Lambda_"', () => {
      before(() => {
        process.env.AWS_EXECUTION_ENV = 'AWS_LambdaIncorrectStartString';
      });

      after(() => {
        delete process.env.AWS_EXECUTION_ENV;
      });

      it('returns null', () => {
        expect(getFAASEnv()).to.be.null;
      });
    });

    describe('when there is no FAAS provider data in the env', () => {
      it('returns null', () => {
        expect(getFAASEnv()).to.be.null;
      });
    });

    describe('when there is data from multiple cloud providers in the env', () => {
      describe('unrelated environments', () => {
        before(() => {
          // aws
          process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_non_empty_string';
          // azure
          process.env.FUNCTIONS_WORKER_RUNTIME = 'non_empty_string';
        });

        after(() => {
          delete process.env.AWS_EXECUTION_ENV;
          delete process.env.FUNCTIONS_WORKER_RUNTIME;
        });

        it('returns null', () => {
          expect(getFAASEnv()).to.be.null;
        });
      });

      describe('vercel and aws which share env variables', () => {
        before(() => {
          // vercel
          process.env.VERCEL = 'non_empty_string';
          // aws
          process.env.AWS_EXECUTION_ENV = 'non_empty_string';
          process.env.AWS_LAMBDA_RUNTIME_API = 'non_empty_string';
        });

        after(() => {
          delete process.env.VERCEL;
          delete process.env.AWS_EXECUTION_ENV;
          delete process.env.AWS_LAMBDA_RUNTIME_API;
        });

        it('parses vercel', () => {
          expect(getFAASEnv()?.get('name')).to.equal('vercel');
        });
      });
    });
  });

  describe('makeClientMetadata()', () => {
    describe('when no FAAS environment is detected', () => {
      it('does not append FAAS metadata', () => {
        const metadata = makeClientMetadata({ driverInfo: {} });
        expect(metadata).not.to.have.property(
          'env',
          'faas metadata applied in a non-faas environment'
        );
        expect(metadata).to.deep.equal({
          driver: {
            name: 'nodejs',
            version: NODE_DRIVER_VERSION
          },
          os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
          },
          platform: `Node.js ${process.version}, ${os.endianness()}`
        });
      });
    });

    describe('when driverInfo.platform is provided', () => {
      it('throws an error if driverInfo.platform is too large', () => {
        expect(() => makeClientMetadata({ driverInfo: { platform: 'a'.repeat(512) } })).to.throw(
          MongoInvalidArgumentError,
          /platform/
        );
      });

      it('appends driverInfo.platform to the platform field', () => {
        const options = {
          driverInfo: { platform: 'myPlatform' }
        };
        const metadata = makeClientMetadata(options);
        expect(metadata).to.deep.equal({
          driver: {
            name: 'nodejs',
            version: NODE_DRIVER_VERSION
          },
          os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
          },
          platform: `Node.js ${process.version}, ${os.endianness()}|myPlatform`
        });
      });
    });

    describe('when driverInfo.name is provided', () => {
      it('throws an error if driverInfo.name is too large', () => {
        expect(() => makeClientMetadata({ driverInfo: { name: 'a'.repeat(512) } })).to.throw(
          MongoInvalidArgumentError,
          /name/
        );
      });

      it('appends driverInfo.name to the driver.name field', () => {
        const options = {
          driverInfo: { name: 'myName' }
        };
        const metadata = makeClientMetadata(options);
        expect(metadata).to.deep.equal({
          driver: {
            name: 'nodejs|myName',
            version: NODE_DRIVER_VERSION
          },
          os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
          },
          platform: `Node.js ${process.version}, ${os.endianness()}`
        });
      });
    });

    describe('when driverInfo.version is provided', () => {
      it('throws an error if driverInfo.version is too large', () => {
        expect(() => makeClientMetadata({ driverInfo: { version: 'a'.repeat(512) } })).to.throw(
          MongoInvalidArgumentError,
          /version/
        );
      });

      it('appends driverInfo.version to the version field', () => {
        const options = {
          driverInfo: { version: 'myVersion' }
        };
        const metadata = makeClientMetadata(options);
        expect(metadata).to.deep.equal({
          driver: {
            name: 'nodejs',
            version: `${NODE_DRIVER_VERSION}|myVersion`
          },
          os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
          },
          platform: `Node.js ${process.version}, ${os.endianness()}`
        });
      });
    });

    describe('when no custom driverInto is provided', () => {
      const metadata = makeClientMetadata({ driverInfo: {} });

      it('does not append the driver info to the metadata', () => {
        expect(metadata).to.deep.equal({
          driver: {
            name: 'nodejs',
            version: NODE_DRIVER_VERSION
          },
          os: {
            type: os.type(),
            name: process.platform,
            architecture: process.arch,
            version: os.release()
          },
          platform: `Node.js ${process.version}, ${os.endianness()}`
        });
      });

      it('does not set the application field', () => {
        expect(metadata).not.to.have.property('application');
      });
    });

    describe('when app name is provided', () => {
      describe('when the app name is over 128 bytes', () => {
        const longString = 'a'.repeat(300);
        const options = {
          appName: longString,
          driverInfo: {}
        };
        const metadata = makeClientMetadata(options);

        it('truncates the application name to <=128 bytes', () => {
          expect(metadata.application?.name).to.be.a('string');
          // the above assertion fails if `metadata.application?.name` is undefined, so
          // we can safely assert that it exists
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(Buffer.byteLength(metadata.application!.name, 'utf8')).to.equal(128);
        });
      });

      describe('TODO(NODE-5150): fix appName truncation when multi-byte unicode charaters straddle byte 128', () => {
        const longString = '€'.repeat(300);
        const options = {
          appName: longString,
          driverInfo: {}
        };
        const metadata = makeClientMetadata(options);

        it('truncates the application name to 129 bytes', () => {
          expect(metadata.application?.name).to.be.a('string');
          // the above assertion fails if `metadata.application?.name` is undefined, so
          // we can safely assert that it exists
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(Buffer.byteLength(metadata.application!.name, 'utf8')).to.equal(129);
        });
      });

      describe('when the app name is under 128 bytes', () => {
        const options = {
          appName: 'myApplication',
          driverInfo: {}
        };
        const metadata = makeClientMetadata(options);

        it('sets the application name to the value', () => {
          expect(metadata.application?.name).to.equal('myApplication');
        });
      });
    });

    describe('when globalThis indicates alternative runtime', () => {
      describe('deno', () => {
        afterEach(() => {
          expect(delete globalThis.Deno, 'failed to delete Deno global').to.be.true;
        });

        it('sets platform to Deno', () => {
          globalThis.Deno = { version: { deno: '1.2.3' } };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Deno v1.2.3, LE');
        });

        it('sets platform to Deno with driverInfo.platform', () => {
          globalThis.Deno = { version: { deno: '1.2.3' } };
          const metadata = makeClientMetadata({ driverInfo: { platform: 'myPlatform' } });
          expect(metadata.platform).to.equal('Deno v1.2.3, LE|myPlatform');
        });

        it('ignores version if Deno.version.deno is not a string', () => {
          globalThis.Deno = { version: { deno: 1 } };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Deno v0.0.0-unknown, LE');
        });

        it('ignores version if Deno.version does not have a deno property', () => {
          globalThis.Deno = { version: { somethingElse: '1.2.3' } };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Deno v0.0.0-unknown, LE');
        });

        it('ignores version if Deno.version is null', () => {
          globalThis.Deno = { version: null };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Deno v0.0.0-unknown, LE');
        });

        it('ignores version if Deno is nullish', () => {
          globalThis.Deno = null;
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Deno v0.0.0-unknown, LE');
        });
      });

      describe('bun', () => {
        afterEach(() => {
          expect(delete globalThis.Bun, 'failed to delete Bun global').to.be.true;
        });

        it('sets platform to Bun', () => {
          globalThis.Bun = class {
            static version = '1.2.3';
          };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Bun v1.2.3, LE');
        });

        it('sets platform to Bun with driverInfo.platform', () => {
          globalThis.Bun = class {
            static version = '1.2.3';
          };
          const metadata = makeClientMetadata({ driverInfo: { platform: 'myPlatform' } });
          expect(metadata.platform).to.equal('Bun v1.2.3, LE|myPlatform');
        });

        it('ignores version if Bun.version is not a string', () => {
          globalThis.Bun = class {
            static version = 1;
          };
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata.platform).to.equal('Bun v0.0.0-unknown, LE');
        });

        it('ignores version if Bun.version is not a string and sets driverInfo.platform', () => {
          globalThis.Bun = class {
            static version = 1;
          };
          const metadata = makeClientMetadata({ driverInfo: { platform: 'myPlatform' } });
          expect(metadata.platform).to.equal('Bun v0.0.0-unknown, LE|myPlatform');
        });

        it('ignores version if Bun is nullish', () => {
          globalThis.Bun = null;
          const metadata = makeClientMetadata({ driverInfo: { platform: 'myPlatform' } });
          expect(metadata.platform).to.equal('Bun v0.0.0-unknown, LE|myPlatform');
        });
      });
    });
  });

  describe('FAAS metadata application to handshake', () => {
    const tests = {
      aws: [
        {
          context: 'no additional metadata',
          env: [['AWS_EXECUTION_ENV', 'AWS_Lambda_non_empty_string']],
          outcome: {
            name: 'aws.lambda'
          }
        },
        {
          context: 'AWS_REGION provided',
          env: [
            ['AWS_EXECUTION_ENV', 'AWS_Lambda_non_empty_string'],
            ['AWS_REGION', 'non-null']
          ],
          outcome: {
            name: 'aws.lambda',
            region: 'non-null'
          }
        },
        {
          context: 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE provided',
          env: [
            ['AWS_EXECUTION_ENV', 'AWS_Lambda_non_empty_string'],
            ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '3']
          ],
          outcome: {
            name: 'aws.lambda',
            memory_mb: new Int32(3)
          }
        }
      ],
      azure: [
        {
          context: 'no additional metadata',
          env: [['FUNCTIONS_WORKER_RUNTIME', 'non-empty']],
          outcome: {
            name: 'azure.func'
          }
        }
      ],
      gcp: [
        {
          context: 'no additional metadata',
          env: [['FUNCTION_NAME', 'non-empty']],
          outcome: {
            name: 'gcp.func'
          }
        },
        {
          context: 'FUNCTION_MEMORY_MB provided',
          env: [
            ['FUNCTION_NAME', 'non-empty'],
            ['FUNCTION_MEMORY_MB', '1024']
          ],
          outcome: {
            name: 'gcp.func',
            memory_mb: new Int32(1024)
          }
        },
        {
          context: 'FUNCTION_REGION provided',
          env: [
            ['FUNCTION_NAME', 'non-empty'],
            ['FUNCTION_REGION', 'region']
          ],
          outcome: {
            name: 'gcp.func',
            region: 'region'
          }
        },
        {
          context: 'FUNCTION_TIMEOUT_SEC provided',
          env: [
            ['FUNCTION_NAME', 'non-empty'],
            ['FUNCTION_TIMEOUT_SEC', '12345']
          ],
          outcome: {
            name: 'gcp.func',
            timeout_sec: new Int32(12345)
          }
        }
      ],
      vercel: [
        {
          context: 'no additional metadata',
          env: [['VERCEL', 'non-empty']],
          outcome: {
            name: 'vercel'
          }
        },
        {
          context: 'VERCEL_REGION provided',
          env: [
            ['VERCEL', 'non-empty'],
            ['VERCEL_REGION', 'region']
          ],
          outcome: {
            name: 'vercel',
            region: 'region'
          }
        }
      ]
    };
    for (const [provider, testsForEnv] of Object.entries(tests)) {
      for (const { context: title, env: faasVariables, outcome } of testsForEnv) {
        describe(`${provider} - ${title}`, () => {
          beforeEach(() => {
            sinon.stub(process, 'env').get(() => Object.fromEntries(faasVariables));
          });

          it(`returns ${inspect(outcome)} under env property`, () => {
            const { env } = makeClientMetadata({ driverInfo: {} });
            expect(env).to.deep.equal(outcome);
          });

          it('places name as the last key in map', () => {
            const keys = Array.from(getFAASEnv()?.keys() ?? []);
            expect(keys).to.have.property(`${keys.length - 1}`, 'name');
          });
        });
      }
    }

    describe('when a numeric FAAS env variable is not numerically parsable', () => {
      before(() => {
        process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_non_empty_string';
        process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '123not numeric';
      });

      after(() => {
        delete process.env.AWS_EXECUTION_ENV;
        delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      });

      it('does not attach it to the metadata', () => {
        expect(makeClientMetadata({ driverInfo: {} })).not.to.have.nested.property('aws.memory_mb');
      });
    });
  });

  describe('metadata truncation', function () {
    describe('when faas region is too large', () => {
      beforeEach('1. Omit fields from `env` except `env.name`.', () => {
        sinon.stub(process, 'env').get(() => ({
          AWS_EXECUTION_ENV: 'AWS_Lambda_iLoveJavaScript',
          AWS_REGION: 'a'.repeat(512)
        }));
      });

      it('only includes env.name', () => {
        const metadata = makeClientMetadata({ driverInfo: {} });
        expect(metadata).to.not.have.nested.property('env.region');
        expect(metadata).to.have.nested.property('env.name', 'aws.lambda');
        expect(metadata.env).to.have.all.keys('name');
      });
    });

    describe('when os information is too large', () => {
      describe('release too large', () => {
        beforeEach('2. Omit fields from `os` except `os.type`.', () => {
          sinon.stub(process, 'env').get(() => ({
            AWS_EXECUTION_ENV: 'AWS_Lambda_iLoveJavaScript',
            AWS_REGION: 'abc'
          }));
          sinon.stub(os, 'release').returns('a'.repeat(512));
        });

        it('only includes env.name', () => {
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata).to.have.property('env');
          expect(metadata).to.have.nested.property('env.region', 'abc');
          expect(metadata.os).to.have.all.keys('type');
        });
      });

      describe('os.type too large', () => {
        beforeEach(() => {
          sinon.stub(process, 'env').get(() => ({
            AWS_EXECUTION_ENV: 'iLoveJavaScript',
            AWS_REGION: 'abc'
          }));
          sinon.stub(os, 'type').returns('a'.repeat(512));
        });

        it('omits os information', () => {
          const metadata = makeClientMetadata({ driverInfo: {} });
          expect(metadata).to.not.have.property('os');
        });
      });
    });

    describe('when there is no space for FaaS env', () => {
      beforeEach('3. Omit the `env` document entirely.', () => {
        sinon.stub(process, 'env').get(() => ({
          AWS_EXECUTION_ENV: 'iLoveJavaScript',
          AWS_REGION: 'abc'
        }));
        sinon.stub(os, 'type').returns('a'.repeat(50));
      });

      it('omits the faas env', () => {
        const metadata = makeClientMetadata({ driverInfo: { name: 'a'.repeat(350) } });
        expect(metadata).to.not.have.property('env');
      });
    });
  });
});
