import { expect } from 'chai';
import * as os from 'os';

import { makeClientMetadata } from '../../../mongodb';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../../package.json').version;

describe('ClientMetadata [module]', function () {
  describe('.makeClientMetadata', function () {
    context('when options are provided', function () {
      context('when driver info is provided', function () {
        const options = {
          driverInfo: { platform: 'myPlatform', name: 'myName', version: 'myVersion' }
        };
        const metadata = makeClientMetadata(options);

        it('appends the driver info to the metadata', function () {
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
            platform: `Node.js ${process.version}, ${os.endianness()} (unified)|myPlatform`,
            version: `${NODE_DRIVER_VERSION}|myVersion`
          });
        });
      });

      context('when driver info is not provided', function () {
        const metadata = makeClientMetadata({});

        it('does not append the driver info to the metadata', function () {
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
            platform: `Node.js ${process.version}, ${os.endianness()} (unified)`
          });
        });
      });

      context('when app name is provided', function () {
        context('when the app name is over 128 bytes', function () {
          const longString = new Array(300).join('a');
          const exactString = new Array(128 + 1).join('a');
          const options = {
            appName: longString
          };
          const metadata = makeClientMetadata(options);

          it('truncates the application name to 128 bytes', function () {
            expect(metadata.application?.name).to.equal(exactString);
          });
        });

        context('when the app name is under 128 bytes', function () {
          const options = {
            appName: 'myApplication'
          };
          const metadata = makeClientMetadata(options);

          it('sets the application name to the value', function () {
            expect(metadata.application?.name).to.equal('myApplication');
          });
        });
      });
    });
  });
});
