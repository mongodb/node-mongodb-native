'use strict';
const { setupDatabase } = require('../shared');
const { expect } = require('chai');

describe('Collation', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('cursor count method should return the correct number when used with collation set', {
    metadata: { requires: { mongodb: '>=3.4.0' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.connect().then(() => {
        const db = client.db(configuration.db);
        const docs = [
          { _id: 0, name: 'foo' },
          { _id: 1, name: 'Foo' }
        ];
        const collation = { locale: 'en_US', strength: 2 };
        let collection, cursor;
        const close = e => cursor.close(() => client.close(() => done(e)));

        Promise.resolve()
          .then(() => db.createCollection('cursor_collation_count'))
          .then(() => (collection = db.collection('cursor_collation_count')))
          .then(() => collection.insertMany(docs))
          .then(() => collection.find({ name: 'foo' }).collation(collation))
          .then(_cursor => (cursor = _cursor))
          .then(() => cursor.count())
          .then(val => expect(val).to.equal(2))
          .then(() => close())
          .catch(e => close(e));
      });
    }
  });

  /******************************************************************************
  .___        __                              __  .__
  |   | _____/  |_  ____   ________________ _/  |_|__| ____   ____
  |   |/    \   __\/ __ \ / ___\_  __ \__  \\   __\  |/  _ \ /    \
  |   |   |  \  | \  ___// /_/  >  | \// __ \|  | |  (  <_> )   |  \
  |___|___|  /__|  \___  >___  /|__|  (____  /__| |__|\____/|___|  /
          \/          \/_____/            \/                    \/
  ******************************************************************************/
  it('Should correctly create index with collation', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.3.12' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(() => {
        const db = client.db(configuration.db);
        const col = db.collection('collation_test');

        return col
          .createIndexes([
            {
              key: { a: 1 },
              collation: { locale: 'nn' },
              name: 'collation_test'
            }
          ])
          .then(() => col.listIndexes().toArray())
          .then(r => {
            const indexes = r.filter(i => i.name === 'collation_test');
            expect(indexes).to.have.length(1);
            expect(indexes[0]).to.have.property('collation');
            expect(indexes[0].collation).to.exist;
            return client.close();
          });
      });
    }
  });

  it('Should correctly create collection with collation', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.3.12' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(() => {
        const db = client.db(configuration.db);

        return db
          .createCollection('collation_test2', { collation: { locale: 'nn' } })
          .then(() => db.listCollections({ name: 'collation_test2' }).toArray())
          .then(collections => {
            expect(collections).to.have.length(1);
            expect(collections[0].name).to.equal('collation_test2');
            expect(collections[0].options.collation).to.exist;
            return client.close();
          });
      });
    }
  });
});
