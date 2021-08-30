'use strict';

const expect = require('chai').expect;
const loadSpecTests = require('../spec/index').loadSpecTests;
const runUnifiedTest = require('./unified-spec-runner/runner').runUnifiedTest;
const ServerApiVersion = require('../../lib/core').ServerApiVersion;

describe('Versioned API', function() {
  describe('client option validation', function() {
    it('is supported as a client option when it is a valid ServerApiVersion string', function() {
      const validVersions = Object.values(ServerApiVersion);
      expect(validVersions.length).to.be.at.least(1);
      for (const version of validVersions) {
        const client = this.configuration.newClient('mongodb://localhost/', {
          serverApi: version
        });
        expect(client.s.options)
          .to.have.property('serverApi')
          .deep.equal({ version });
      }
    });

    it('is supported as a client option when it is an object with a valid version property', function() {
      const validVersions = Object.values(ServerApiVersion);
      expect(validVersions.length).to.be.at.least(1);
      for (const version of validVersions) {
        const client = this.configuration.newClient('mongodb://localhost/', {
          serverApi: { version }
        });
        expect(client.s.options)
          .to.have.property('serverApi')
          .deep.equal({ version });
      }
    });

    it('is not supported as a client option when it is an invalid string', function() {
      expect(() =>
        this.configuration.newClient('mongodb://localhost/', {
          serverApi: 'bad'
        })
      ).to.throw(/^Invalid server API version=bad;/);
    });

    it('is not supported as a client option when it is a number', function() {
      expect(() =>
        this.configuration.newClient('mongodb://localhost/', {
          serverApi: 1
        })
      ).to.throw(/^Invalid `serverApi` property;/);
    });

    it('is not supported as a client option when it is an object without a specified version', function() {
      expect(() =>
        this.configuration.newClient('mongodb://localhost/', {
          serverApi: {}
        })
      ).to.throw(/^Invalid `serverApi` property;/);
    });

    it('is not supported as a client option when it is an object with an invalid specified version', function() {
      expect(() =>
        this.configuration.newClient('mongodb://localhost/', {
          serverApi: { version: 1 }
        })
      ).to.throw(/^Invalid server API version=1;/);
      expect(() =>
        this.configuration.newClient('mongodb://localhost/', {
          serverApi: { version: 'bad' }
        })
      ).to.throw(/^Invalid server API version=bad;/);
    });

    it('is not supported as a URI option even when it is a valid ServerApiVersion string', function(done) {
      const client = this.configuration.newClient({ serverApi: '1' }, { useNewUrlParser: true });
      client.connect(err => {
        expect(err).to.match(/URI cannot contain `serverApi`, it can only be passed to the client/);
        client.close(done);
      });
    });
  });

  for (const versionedApiTest of loadSpecTests('versioned-api')) {
    expect(versionedApiTest).to.exist;
    context(String(versionedApiTest.description), function() {
      for (const test of versionedApiTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test() {
            return runUnifiedTest(this, versionedApiTest, test);
          }
        });
      }
    });
  }
});
