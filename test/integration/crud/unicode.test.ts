import { expect } from 'chai';
import * as semver from 'semver';

import { assert as test, setupDatabase } from '../shared';

describe.only('Unicode', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('shouldCorrectlyInsertUnicodeContainingDocument', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      if (semver.satisfies(process.versions.node, '22.7.0')) {
        this.skipReason = 'Node.js 22.7.0 has a UTF-8 encoding bug';
        this.skip();
      }

      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const doc = {
          statuses_count: 1687,
          created_at: 'Mon Oct 22 14:55:08 +0000 2007',
          description: 'NodeJS hacker, Cofounder of Debuggable, CakePHP core alumnus',
          favourites_count: 6,
          profile_sidebar_fill_color: 'EADEAA',
          screen_name: 'felixge',
          status: {
            created_at: 'Fri Mar 12 08:59:44 +0000 2010',
            in_reply_to_screen_name: null,
            truncated: false,
            in_reply_to_user_id: null,
            source: '<a href="http://www.atebits.com/" rel="nofollow">Tweetie</a>',
            favorited: false,
            in_reply_to_status_id: null,
            id: 10364119169,
            text: '#berlin #snow = #fail : ('
          },
          contributors_enabled: false,
          following: null,
          geo_enabled: false,
          time_zone: 'Eastern Time (US & Canada)',
          profile_sidebar_border_color: 'D9B17E',
          url: 'http://debuggable.com',
          verified: false,
          location: 'Berlin',
          profile_text_color: '333333',
          notifications: null,
          profile_background_image_url:
            'http://s.twimg.com/a/1268354287/images/themes/theme8/bg.gif',
          protected: false,
          profile_link_color: '9D582E',
          followers_count: 840,
          name: 'Felix Geisend\u00f6rfer',
          profile_background_tile: false,
          id: 9599342,
          lang: 'en',
          utc_offset: -18000,
          friends_count: 450,
          profile_background_color: '8B542B',
          profile_image_url:
            'http://a3.twimg.com/profile_images/107142257/passbild-square_normal.jpg'
        };

        db.createCollection(
          'test_should_correctly_insert_unicode_containing_document',
          function (err, collection) {
            doc['_id'] = 'felixge';

            collection.insertOne(doc, { writeConcern: { w: 1 } }, function (err) {
              expect(err).to.not.exist;
              collection.findOne(function (err, doc) {
                test.equal('felixge', doc._id);
                client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('should Correctly Insert Unicode Characters', function (done) {
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      maxPoolSize: 1
    });
    client.connect((err, client) => {
      expect(err).to.not.exist;
      const db = client.db(this.configuration.db);
      db.createCollection('unicode_test_collection', (err, collection) => {
        expect(err).to.not.exist;
        const test_strings = ['ouooueauiOUOOUEAUI', 'öüóőúéáűíÖÜÓŐÚÉÁŰÍ', '本荘由利地域に洪水警報'];
        collection.insert({ id: 0, text: test_strings[0] }, { writeConcern: { w: 1 } }, err => {
          expect(err).to.not.exist;
          collection.insert({ id: 1, text: test_strings[1] }, { writeConcern: { w: 1 } }, err => {
            expect(err).to.not.exist;
            collection.find().forEach(
              doc => {
                expect(doc).property('text').to.equal(test_strings[doc.id]);
              },
              err => {
                expect(err).to.not.exist;
                client.close(done);
              }
            );
          });
        });
      });
    });
  });

  it('shouldCreateObjectWithChineseObjectName', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const object = { 客家话: 'Hello' };

      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        db.createCollection('create_object_with_chinese_object_name', function (err) {
          expect(err).to.not.exist;
          const collection = db.collection('create_object_with_chinese_object_name');
          collection.insert(object, { writeConcern: { w: 1 } }, function (err) {
            expect(err).to.not.exist;
            collection.findOne(function (err, item) {
              test.equal(object['客家话'], item['客家话']);

              collection.find().toArray(function (err, items) {
                test.equal(object['客家话'], items[0]['客家话']);
                client.close(done);
              });
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyHandleUT8KeyNames', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        db.createCollection('test_utf8_key_name', function (err, collection) {
          collection.insert({ šđžčćŠĐŽČĆ: 1 }, { writeConcern: { w: 1 } }, function (err) {
            expect(err).to.not.exist;
            collection
              .find({})
              .project({ šđžčćŠĐŽČĆ: 1 })
              .toArray(function (err, items) {
                test.equal(1, items[0]['šđžčćŠĐŽČĆ']);
                // Let's close the db
                client.close(done);
              });
          });
        });
      });
    }
  });
});
