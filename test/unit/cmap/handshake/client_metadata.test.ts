import { expect } from 'chai';
import * as os from 'os';

import { makeClientMetadata } from '../../../mongodb';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../../../../package.json').version;

describe('makeClientMetadata()', () => {
  context('when driverInfo.platform is provided', () => {
    it('appends driverInfo.platform to the platform field', () => {
      const options = {
        driverInfo: { platform: 'myPlatform' }
      };
      const metadata = makeClientMetadata(options);
      expect(metadata).to.have.property(
        'platform',
        `Node.js ${process.version}, ${os.endianness()} (unified)|myPlatform`
      );
    });
  });
  context('when driverInfo.name is provided', () => {
    it('appends driverInfo.name to the driver.name field', () => {
      const options = {
        driverInfo: { name: 'myName' }
      };
      const metadata = makeClientMetadata(options);
      expect(metadata).to.have.nested.property('driver.name', `nodejs|myName`);
    });
  });
  context('when driverInfo.version is provided', () => {
    it('appends driverInfo.version to the version field', () => {
      const options = {
        driverInfo: { version: 'myVersion' }
      };
      const metadata = makeClientMetadata(options);
      expect(metadata).to.have.nested.property(
        'driver.version',
        `${NODE_DRIVER_VERSION}|myVersion`
      );
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
        platform: `Node.js ${process.version}, ${os.endianness()} (unified)`
      });
    });

    it('does not set the application field', () => {
      expect(metadata).not.to.have.property('application');
    });
  });

  context('when app name is provided', () => {
    context('when the app name is over 128 bytes', () => {
      const longString = 'a'.repeat(300);
      const exactString = 'a'.repeat(128);
      const options = {
        appName: longString,
        driverInfo: {}
      };
      const metadata = makeClientMetadata(options);

      it('truncates the application name to 128 bytes', () => {
        expect(metadata.application?.name).to.equal(exactString);
        // the above assertion fails if `metadata.application?.name` is undefined, so
        // we can safely assert that it exists
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(Buffer.byteLength(metadata.application!.name, 'utf8')).to.equal(128);
      });
    });

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
