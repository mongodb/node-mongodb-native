import { expect } from 'chai';

import {
  AuthMechanism,
  MongoAPIError,
  MongoCredentials,
  MongoInvalidArgumentError
} from '../../../mongodb';

describe('MongoCredentials', function () {
  describe('validate()', function () {
    it('does not include the ENVIRONMENT value when a username is combined with a non-azure ENVIRONMENT', function () {
      const credentials = new MongoCredentials({
        username: 'user',
        password: '',
        source: '$external',
        mechanism: AuthMechanism.MONGODB_OIDC,
        mechanismProperties: { ENVIRONMENT: 'gcp' }
      });

      expect(() => credentials.validate())
        .to.throw(MongoInvalidArgumentError)
        .with.property('message')
        .that.does.not.include('gcp');
    });

    it('does not include the ENVIRONMENT value when a password is combined with a username', function () {
      const credentials = new MongoCredentials({
        username: 'user',
        password: 'pass',
        source: '$external',
        mechanism: AuthMechanism.MONGODB_OIDC,
        mechanismProperties: { ENVIRONMENT: 'azure' }
      });

      expect(() => credentials.validate())
        .to.throw(MongoInvalidArgumentError)
        .with.property('message')
        .that.does.not.include('azure');
    });

    it('does not include the source when it is not $external for an external mechanism', function () {
      const credentials = new MongoCredentials({
        username: 'user',
        password: '',
        source: 'SECRETsource',
        mechanism: AuthMechanism.MONGODB_X509,
        mechanismProperties: {}
      });

      expect(() => credentials.validate())
        .to.throw(MongoAPIError)
        .with.property('message')
        .that.does.not.include('SECRETsource');
    });

    it('does not include the CANONICALIZE_HOST_NAME value when it is invalid', function () {
      const credentials = new MongoCredentials({
        username: 'user',
        password: '',
        source: '$external',
        mechanism: AuthMechanism.MONGODB_GSSAPI,
        // @ts-expect-error: testing an invalid value
        mechanismProperties: { CANONICALIZE_HOST_NAME: 'SECRETvalue' }
      });

      expect(() => credentials.validate())
        .to.throw(MongoAPIError)
        .with.property('message')
        .that.does.not.include('SECRETvalue');
    });
  });

  describe('toJSON()', function () {
    it('replaces the username and password with a marker', function () {
      const credentials = new MongoCredentials({
        username: 'SECRETuser',
        password: 'SECRETpass',
        source: 'admin',
        mechanismProperties: {}
      });

      const representation = JSON.stringify(credentials);

      expect(representation).to.not.include('SECRETuser');
      expect(representation).to.not.include('SECRETpass');
      expect(representation).to.include('"username":"<redacted>"');
      expect(representation).to.include('"password":"<redacted>"');
    });

    it('replaces the AWS_SESSION_TOKEN mechanism property with a marker', function () {
      const credentials = new MongoCredentials({
        username: 'user',
        password: 'pass',
        source: 'admin',
        mechanismProperties: { AWS_SESSION_TOKEN: 'SECRETtoken' }
      });

      const representation = JSON.stringify(credentials);

      expect(representation).to.not.include('SECRETtoken');
      expect(representation).to.include('"AWS_SESSION_TOKEN":"<redacted>"');
    });
  });
});
