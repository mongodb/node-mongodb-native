import { expect } from 'chai';

import { Decimal128 } from '../../mongodb';
import { assert as test, setupDatabase } from '../shared';

describe('Decimal128', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly insert decimal128 value', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db = client.db(configuration.db);
    const object = {
      id: 1,
      value: Decimal128.fromString('1.28')
    };

    db.collection('decimal128').insertOne(object, function (err) {
      expect(err).to.not.exist;

      db.collection('decimal128').findOne(
        {
          id: 1
        },
        function (err, doc) {
          expect(err).to.not.exist;
          test.ok(doc.value instanceof Decimal128);
          test.equal('1.28', doc.value.toString());

          client.close(done);
        }
      );
    });
  });
});
