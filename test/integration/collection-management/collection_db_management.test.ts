import { assert as test, setupDatabase } from '../shared';

describe('Collection Management and Db Management', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly createCollection using Promise', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient({}, { maxPoolSize: 5 });

    client
      .db(configuration.db)
      .createCollection('promiseCollection')
      .then(function (col) {
        test.ok(col != null);

        client.close(done);
      })
      .catch(function (err) {
        test.ok(err != null);
      });
  });

  it('Should correctly rename and drop collection using Promise', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient({}, { maxPoolSize: 5 });

    const db = client.db(configuration.db);

    db.createCollection('promiseCollection1').then(function (col) {
      test.ok(col != null);
      const db = client.db(configuration.db);

      db.renameCollection('promiseCollection1', 'promiseCollection2').then(function (col) {
        test.ok(col != null);

        db.dropCollection('promiseCollection2').then(function (r) {
          test.ok(r);

          client.close(done);
        });
      });
    });
  });

  it('Should correctly drop database using Promise', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient({}, { maxPoolSize: 5 });

    client
      .db(configuration.db)
      .dropDatabase()
      .then(function (r) {
        test.ok(r);

        client.close(done);
      })
      .catch(function (e) {
        test.ok(e != null);
      });
  });

  it('Should correctly createCollections and call collections with Promise', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient({}, { maxPoolSize: 5 });
    const db = client.db(configuration.db);

    db.createCollection('promiseCollectionCollections1').then(function (col) {
      test.ok(col != null);

      db.createCollection('promiseCollectionCollections2').then(function (col) {
        test.ok(col != null);

        db.collections().then(function (r) {
          test.ok(Array.isArray(r));

          client.close(done);
        });
      });
    });
  });
});
