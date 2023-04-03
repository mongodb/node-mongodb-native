import { expect } from 'chai';
import * as os from 'os';

import {
  ClientMetadata,
  determineCloudProvider,
  FAASProvider,
  makeClientMetadata,
  truncateClientMetadata,
  TruncatedClientMetadata
} from '../../../mongodb';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../../package.json').version;

describe('client metadata module', () => {
  describe('determineCloudProvider()', function () {
    const tests: Array<[string, FAASProvider]> = [
      ['AWS_EXECUTION_ENV', 'aws'],
      ['AWS_LAMBDA_RUNTIME_API', 'aws'],
      ['FUNCTIONS_WORKER_RUNTIME', 'azure'],
      ['K_SERVICE', 'gcp'],
      ['FUNCTION_NAME', 'gcp'],
      ['VERCEL', 'vercel']
    ];
    for (const [envVariable, provider] of tests) {
      context(`when ${envVariable} is in the environment`, () => {
        before(() => {
          process.env[envVariable] = 'non empty string';
        });
        after(() => {
          delete process.env[envVariable];
        });
        it('determines the correct provider', () => {
          expect(determineCloudProvider()).to.equal(provider);
        });
      });
    }

    context('when there is no FAAS provider data in the env', () => {
      it('parses no FAAS provider', () => {
        expect(determineCloudProvider()).to.equal('none');
      });
    });

    context('when there is data from multiple cloud providers in the env', () => {
      before(() => {
        process.env.AWS_EXECUTION_ENV = 'non-empty-string';
        process.env.FUNCTIONS_WORKER_RUNTIME = 'non-empty-string';
      });
      after(() => {
        delete process.env.AWS_EXECUTION_ENV;
        delete process.env.FUNCTIONS_WORKER_RUNTIME;
      });
      it('parses no FAAS provider', () => {
        expect(determineCloudProvider()).to.equal('none');
      });
    });
  });

  describe('makeClientMetadata()', () => {
    context('when no FAAS environment is detected', () => {
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
    context('when driverInfo.platform is provided', () => {
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

    context('when driverInfo.name is provided', () => {
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

    context('when driverInfo.version is provided', () => {
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

    context('when no custom driverInto is provided', () => {
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

    context('when app name is provided', () => {
      context('when the app name is over 128 bytes', () => {
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

      context(
        'TODO(NODE-5150): fix appName truncation when multi-byte unicode charaters straddle byte 128',
        () => {
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
        }
      );

      context('when the app name is under 128 bytes', () => {
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
  });

  describe('FAAS metadata application to handshake', () => {
    const tests = {
      aws: [
        {
          context: 'no additional metadata',
          env: [['AWS_EXECUTION_ENV', 'non-empty string']],
          outcome: {
            name: 'aws.lambda'
          }
        },
        {
          context: 'AWS_REGION provided',
          env: [
            ['AWS_EXECUTION_ENV', 'non-empty string'],
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
            ['AWS_EXECUTION_ENV', 'non-empty string'],
            ['AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '3']
          ],
          outcome: {
            name: 'aws.lambda',
            memory_mb: 3
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
            memory_mb: 1024
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
          context: 'VERCEL_URL provided',
          env: [
            ['VERCEL', 'non-empty'],
            ['VERCEL_URL', 'provided-url']
          ],
          outcome: {
            name: 'vercel',
            url: 'provided-url'
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

    for (const [provider, _tests] of Object.entries(tests)) {
      context(provider, () => {
        for (const { context, env: _env, outcome } of _tests) {
          it(context, () => {
            for (const [k, v] of _env) {
              if (v != null) {
                process.env[k] = v;
              }
            }

            const { env } = makeClientMetadata({ driverInfo: {} });
            expect(env).to.deep.equal(outcome);

            for (const [k] of _env) {
              delete process.env[k];
            }
          });
        }
      });
    }

    context('when a numeric FAAS env variable is not numerically parsable', () => {
      before(() => {
        process.env['AWS_EXECUTION_ENV'] = 'non-empty-string';
        process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE'] = 'not numeric';
      });

      after(() => {
        delete process.env['AWS_EXECUTION_ENV'];
        delete process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE'];
      });

      it('does not attach it to the metadata', () => {
        expect(makeClientMetadata({ driverInfo: {} })).not.to.have.nested.property('aws.memory_mb');
      });
    });
  });

  describe('metadata truncation order', function () {
    /**
     * These tests demonstrate that the order in which metadata truncation occurs is spec
     * compliant.  There are tests in `connection_string.test.ts` that demonstrate that when
     * the metadata is greater than 512 bytes, the metadata is truncated.
     *
     * Together, these tests demonstrate that
     * - truncation happens in the correct order
     * - truncation occurs when necessary
     */

    const longDocument = 'a'.repeat(512);

    const tests: Array<[string, ClientMetadata, TruncatedClientMetadata]> = [
      [
        'only removes platform first',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: longDocument,
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        },
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        }
      ],
      [
        'truncates environment metadata after platform',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: { name: 'applicationName' },
          env: {
            name: 'aws.lambda',
            region: longDocument
          }
        },
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        }
      ],
      [
        'truncates os metadata after env metadata',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: longDocument,
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        },
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: { type: 'Darwin' },
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        }
      ],
      [
        'removes env after truncating os metadata',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: { name: 'applicationName' },
          env: {
            name: longDocument as any
          }
        },
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: { type: 'Darwin' },
          application: { name: 'applicationName' }
        }
      ],
      [
        'removes os after removing env',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: longDocument,
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        },
        {
          application: { name: 'applicationName' },
          driver: { name: 'nodejs', version: '5.1.0' }
        }
      ],
      [
        'removes driver after removing env',
        {
          driver: {
            name: longDocument,
            version: '5.1.0'
          },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: { name: 'applicationName' },
          env: { name: 'aws.lambda' }
        },
        { application: { name: 'applicationName' } }
      ],
      [
        'returns nothing when everything is too large (should never happen)',
        {
          driver: { name: 'nodejs', version: '5.1.0' },
          os: {
            type: 'Darwin',
            name: 'darwin',
            architecture: 'x64',
            version: '21.6.0'
          },
          platform: 'Node.js v16.17.0, LE',
          application: {
            name: longDocument
          },
          env: { name: 'aws.lambda' }
        },
        {}
      ]
    ];

    for (const [description, input, expected] of tests) {
      it(description, function () {
        expect(truncateClientMetadata(input)).to.deep.equal(expected);
      });
    }
  });
});
