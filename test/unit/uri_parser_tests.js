'use strict';

const parseConnectionString = require('../../lib/core/uri_parser');
const expect = require('chai').expect;

describe('New URL Parser', function() {
  /**
   * @ignore
   */
  it('should return the correct hostname when given a URL with srv', function(done) {
    parseConnectionString(
      'mongodb+srv://admin:password@compass-data-sets-e06dc.mongodb.net/admin',
      (err, result) => {
        expect(err).to.not.exist;
        expect(result.hosts.length).to.equal(1);
        expect(result.hosts[0]).to.deep.equal({
          host: 'compass-data-sets-e06dc.mongodb.net',
          port: 27017
        });
        done();
      }
    );
  });
});
