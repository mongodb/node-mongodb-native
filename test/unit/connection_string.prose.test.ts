import { expect } from 'chai';
import { inspect } from 'util';

import { MongoClient } from '../mongodb';

describe('Connection String - Credential Disclosure Prose Tests', function () {
  describe('1. Redacted string representation', function () {
    it('does not include the username or password in a representation of the client', function () {
      const client = new MongoClient(
        'mongodb://SENTINELuser5678:SENTINELpassword1234@localhost:27017/db'
      );

      for (const representation of [String(client), inspect(client, { depth: Infinity })]) {
        expect(representation).to.not.include('SENTINELuser5678');
        expect(representation).to.not.include('SENTINELpassword1234');
      }
    });

    it('does not include the username or password in a representation of the options', function () {
      const client = new MongoClient(
        'mongodb://SENTINELuser5678:SENTINELpassword1234@localhost:27017/db'
      );

      // The options have no prototype, so they have no string conversion to check
      const representation = inspect(client.options, { depth: Infinity });

      expect(representation).to.not.include('SENTINELuser5678');
      expect(representation).to.not.include('SENTINELpassword1234');
    });

    it('replaces the username and password of the credentials with the same marker', function () {
      const client = new MongoClient(
        'mongodb://SENTINELuser5678:SENTINELpassword1234@localhost:27017/db'
      );

      const representation = inspect(client.options.credentials);

      expect(representation).to.not.include('SENTINELuser5678');
      expect(representation).to.not.include('SENTINELpassword1234');
      expect(representation).to.include("username: '<redacted>'");
      expect(representation).to.include("password: '<redacted>'");
    });

    it('replaces the username and password of the serialized credentials with the same marker', function () {
      const client = new MongoClient(
        'mongodb://SENTINELuser5678:SENTINELpassword1234@localhost:27017/db'
      );

      const representation = JSON.stringify(client.options.credentials);

      expect(representation).to.not.include('SENTINELuser5678');
      expect(representation).to.not.include('SENTINELpassword1234');
      expect(representation).to.include('"username":"<redacted>"');
      expect(representation).to.include('"password":"<redacted>"');
    });
  });

  // 2. Explicitly named unredacted API: not applicable. The connection string is only kept on
  // `client.s.url`, which is internal and not part of the driver's API, so there is nothing to assert.

  describe('3. Canonical authentication mechanism diagnostic', function () {
    it('uses the canonical name of a recognized mechanism, not the supplied spelling', function () {
      expect(() => new MongoClient('mongodb://localhost/?authMechanism=gSsApI&authSource=admin'))
        .to.throw()
        .with.property('message')
        .that.includes('GSSAPI')
        .and.does.not.include('gSsApI');
    });
  });

  describe('4. Parsed integer diagnostic', function () {
    it('formats the parsed integer, not the supplied spelling', function () {
      expect(() => new MongoClient('mongodb://localhost/?maxPoolSize=-05'))
        .to.throw()
        .with.property('message')
        .that.includes('-5')
        .and.does.not.include('-05');
    });

    it('does not include an argument that fails integer conversion', function () {
      expect(() => new MongoClient('mongodb://localhost/?maxPoolSize=SENTINELpassword1234'))
        .to.throw()
        .with.property('message')
        .that.does.not.include('SENTINELpassword1234');
    });
  });

  describe('5. Representation of a connection string that did not parse', function () {
    it('does not construct a client, and reports neither the username nor the password', function () {
      // No object exists after parsing fails, so there is no representation to inspect
      const error = (() => {
        try {
          new MongoClient('mongodb://SENTINELuser5678:SENTINELpassword1234@localhost:99999/db');
        } catch (error) {
          return error;
        }
      })();

      expect(error).to.be.instanceOf(Error);
      for (const representation of [error.message, inspect(error)]) {
        expect(representation).to.not.include('SENTINELuser5678');
        expect(representation).to.not.include('SENTINELpassword1234');
      }
    });
  });
});
