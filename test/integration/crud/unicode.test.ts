import { expect } from 'chai';
import * as process from 'process';
import { satisfies } from 'semver';

import type { MongoClient } from '../../../src';
import { assert as test, setupDatabase } from '../shared';

describe('Unicode', function () {
  let client: MongoClient;

  before(function () {
    return setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client?.close();
  });

  it('should correctly insert unicode containing document', async function () {
    if (satisfies(process.versions.node, '22.7.0')) {
      this.skipReason = 'Node.js 22.7.0 has a UTF-8 encoding bug';
      this.skip();
    }

    const configuration = this.configuration;
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
      profile_background_image_url: 'http://s.twimg.com/a/1268354287/images/themes/theme8/bg.gif',
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
      profile_image_url: 'http://a3.twimg.com/profile_images/107142257/passbild-square_normal.jpg'
    };

    const collection = await db.createCollection(
      'test_should_correctly_insert_unicode_containing_document'
    );
    doc['_id'] = 'felixge';

    await collection.insertOne(doc, { writeConcern: { w: 1 } });
    const document = await collection.findOne();
    test.equal('felixge', document._id);
  });

  it('should correctly insert unicode characters', async function () {
    const db = client.db(this.configuration.db);
    const collection = await db.createCollection('unicode_test_collection');
    const test_strings = ['ouooueauiOUOOUEAUI', 'öüóőúéáűíÖÜÓŐÚÉÁŰÍ', '本荘由利地域に洪水警報'];
    await collection.insertOne({ id: 0, text: test_strings[0] }, { writeConcern: { w: 1 } });
    await collection.insertOne({ id: 1, text: test_strings[1] }, { writeConcern: { w: 1 } });

    const documents = await collection.find().toArray();
    expect(documents[0]).property('text').to.equal(test_strings[documents[0].id]);
    expect(documents[1]).property('text').to.equal(test_strings[documents[1].id]);
  });

  it('should create object with Chinese object name', async function () {
    const object = { 客家话: 'Hello' };

    const configuration = this.configuration;
    const db = client.db(configuration.db);
    await db.createCollection('create_object_with_chinese_object_name');
    const collection = db.collection('create_object_with_chinese_object_name');
    await collection.insertOne(object, { writeConcern: { w: 1 } });
    const item = await collection.findOne();
    test.equal(object['客家话'], item['客家话']);

    const items = await collection.find().toArray();
    test.equal(object['客家话'], items[0]['客家话']);
  });

  it('should correctly handle UTF8 key names', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('test_utf8_key_name');
    await collection.insertOne({ šđžčćŠĐŽČĆ: 1 }, { writeConcern: { w: 1 } });
    const items = await collection.find({}).project({ šđžčćŠĐŽČĆ: 1 }).toArray();
    test.equal(1, items[0]['šđžčćŠĐŽČĆ']);
  });
});
