import { expect } from 'chai';

import { mergeKMSProviders } from '../../tools/unified-spec-runner/unified-utils';

describe('parseOptions', function () {
  context('aws providers', function () {
    it('throws if none is given', function () {
      expect(() => {
        mergeKMSProviders({}, {});
      }).to.throw();
    });

    it('throws if an empty object is supplied', function () {
      expect(() => {
        mergeKMSProviders({ aws: {} }, {});
      }).to.throw();
    });

    it('replaces a $$placeholder value with the value from the environment', function () {
      const parsedProviders = mergeKMSProviders(
        {
          aws: {
            accessKeyId: { $$placeholder: 1 },
            secretAccessKey: 'secretAccessKey'
          }
        },
        {
          aws: { accessKeyId: 'accessKeyId' }
        }
      );
      expect(parsedProviders.aws).deep.equal({
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey'
      });
    });

    it('throws if required field is not present in the kmsProviders', function () {
      expect(() => {
        mergeKMSProviders(
          {
            aws: {
              accessKeyId: { $$placeholder: 1 }
            }
          },
          {
            aws: { accessKeyId: 'accessKeyId' }
          }
        );
      }).to.throw();
    });

    it('configures the provider with the exact credentials from the test', function () {
      const parsedProviders = mergeKMSProviders(
        {
          aws: {
            accessKeyId: 'accessKeyId',
            secretAccessKey: 'secretAccessKey',
            sessionToken: 'sessionToken'
          }
        },
        {
          aws: {
            accessKeyId: 'accessKeyIdFromEnvironment',
            secretAccessKey: 'secretAccessKeyFromEnvironment',
            sessionToken: 'sessionTokenFromEnvironment'
          }
        }
      );
      expect(parsedProviders.aws).deep.equal({
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken'
      });
    });
  });
  context('local providers', function () {
    it('throws if none is given', function () {
      expect(() => {
        mergeKMSProviders({}, {});
      }).to.throw();
    });

    it('configures the provider without credentials if an empty object is supplied', function () {
      const parsedProviders = mergeKMSProviders(
        {
          local: {}
        },
        {}
      );
      expect(parsedProviders.local).deep.equal({});
    });

    it('replaces a $$placeholder value with the value from the environment', function () {
      const parsedProviders = mergeKMSProviders(
        {
          local: {
            key: { $$placeholder: 1 }
          }
        },
        {
          local: { key: 'key' }
        }
      );
      expect(parsedProviders.local).deep.equal({
        key: 'key'
      });
    });

    it('configures the provider with the exact credentials from the test', function () {
      const parsedProviders = mergeKMSProviders(
        {
          local: {
            key: 'key'
          }
        },
        {
          local: {
            key: 'keyFromEnvironment'
          }
        }
      );
      expect(parsedProviders.local).deep.equal({
        key: 'key'
      });
    });
  });

  context('azure', function () {
    it('throws if none is given', function () {
      expect(() => {
        mergeKMSProviders({}, {});
      }).to.throw();
    });

    it('throws if an empty object is supplied', function () {
      expect(() => {
        mergeKMSProviders({ azure: {} }, {});
      }).to.throw();
    });

    it('replaces a $$placeholder value with the value from the environment', function () {
      const parsedProviders = mergeKMSProviders(
        {
          azure: {
            tenantId: 'tenantId',
            clientId: { $$placeholder: 1 },
            clientSecret: 'clientSecret',
            identityPlatformEndpoint: 'identifyPlatformEndpoint'
          }
        },
        {
          azure: {
            clientId: 'clientId'
          }
        }
      );
      expect(parsedProviders.azure).deep.equal({
        tenantId: 'tenantId',
        clientId: 'clientId',
        clientSecret: 'clientSecret',
        identityPlatformEndpoint: 'identifyPlatformEndpoint'
      });
    });

    it('throws if required field is not present in the kmsProviders', function () {
      expect(() => {
        mergeKMSProviders(
          {
            azure: {
              tenantId: 'tenantId',
              clientSecret: 'clientSecret',
              identityPlatformEndpoint: 'identifyPlatformEndpoint'
            }
          },
          {}
        );
      }).to.throw();
    });

    it('configures the provider with the exact credentials from the test otherwise', function () {
      const parsedProviders = mergeKMSProviders(
        {
          azure: {
            tenantId: 'tenantId',
            clientId: 'clientId',
            clientSecret: 'clientSecret',
            identityPlatformEndpoint: 'identifyPlatformEndpoint'
          }
        },
        {
          azure: {
            tenantId: 'tenantIdFromEnvironment',
            clientId: 'clientIdFromEnvironment',
            clientSecret: 'clientSecretFromEnvironment',
            identityPlatformEndpoint: 'identifyPlatformEndpointFromEnvironment'
          }
        }
      );
      expect(parsedProviders.azure).deep.equal({
        tenantId: 'tenantId',
        clientId: 'clientId',
        clientSecret: 'clientSecret',
        identityPlatformEndpoint: 'identifyPlatformEndpoint'
      });
    });
  });

  context('gcp', function () {
    it('throws if none is given', function () {
      expect(() => {
        mergeKMSProviders({}, {});
      }).throw();
    });

    it('throws if an empty object is supplied', function () {
      expect(() => {
        mergeKMSProviders(
          {
            gcp: {}
          },
          {}
        );
      }).to.throw();
    });

    it('replaces a $$placeholder value with the value from the environment', function () {
      const parsedProviders = mergeKMSProviders(
        {
          gcp: {
            email: 'email',
            privateKey: { $$placeholder: 1 },
            endPoint: 'endPoint'
          }
        },
        {
          gcp: {
            privateKey: 'privateKeyFromEnvironment'
          }
        }
      );
      expect(parsedProviders.gcp).deep.equal({
        email: 'email',
        privateKey: 'privateKeyFromEnvironment',
        endPoint: 'endPoint'
      });
    });

    it('throws if required field is not present in the kmsProviders', function () {
      expect(() => {
        mergeKMSProviders(
          {
            gcp: {
              email: 'email',
              endPoint: 'endPoint'
            }
          },
          {}
        );
      }).to.throw();
    });

    it('configures the provider with the exact credentials from the test otherwise', function () {
      const parsedProviders = mergeKMSProviders(
        {
          gcp: {
            email: 'email',
            privateKey: 'privateKey',
            endPoint: 'endPoint'
          }
        },
        {
          gcp: {
            email: 'emailFromEnvironment',
            privateKey: 'privateKeyFromEnvironment',
            endPoint: 'endPointFromEnvironment'
          }
        }
      );
      expect(parsedProviders.gcp).deep.equal({
        email: 'email',
        privateKey: 'privateKey',
        endPoint: 'endPoint'
      });
    });
  });

  context('kmip', function () {
    it('throws if none is given', function () {
      expect(() => {
        mergeKMSProviders({}, {});
      }).to.throw();
    });

    it('configures the provider without credentials if an empty object is supplied', function () {
      const parsedProviders = mergeKMSProviders(
        {
          kmip: {}
        },
        {}
      );
      expect(parsedProviders.kmip).deep.equal({});
    });

    it('replaces a $$placeholder value with the value from the environment', function () {
      const parsedProviders = mergeKMSProviders(
        {
          kmip: {
            endpoint: { $$placeholder: 1 }
          }
        },
        {
          kmip: {
            endpoint: 'endpointFromEnvironment'
          }
        }
      );
      expect(parsedProviders.kmip).deep.equal({
        endpoint: 'endpointFromEnvironment'
      });
    });

    it('configures the provider with the exact credentials from the test otherwise', function () {
      const parsedProviders = mergeKMSProviders(
        {
          kmip: {
            endpoint: 'endpoint'
          }
        },
        {
          kmip: {
            endpoint: 'endpointFromEnvironment'
          }
        }
      );
      expect(parsedProviders.kmip).deep.equal({
        endpoint: 'endpoint'
      });
    });
  });
});
