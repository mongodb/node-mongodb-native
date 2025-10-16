import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { configureMongocryptdSpawnHooks } from '../../tools/utils';

describe('class ServerDescription', function () {
  describe('when connecting to mongocryptd', { requires: { mongodb: '>=4.4' } }, function () {
    let client: MongoClient;

    const { port: mongocryptdTestPort } = configureMongocryptdSpawnHooks();

    beforeEach(async function () {
      client = new MongoClient(`mongodb://localhost:${mongocryptdTestPort}`);
    });

    afterEach(async function () {
      await client?.close();
    });

    it('iscryptd is set to true ', async function () {
      const descriptions = [];
      client.on('serverDescriptionChanged', description => descriptions.push(description));
      const hello = await client.db().command({ hello: true });
      expect(hello).to.have.property('iscryptd', true);
      expect(descriptions.at(-1)).to.have.nested.property('newDescription.iscryptd', true);
    });
  });

  describe('when connecting to anything other than mongocryptd', function () {
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client?.close();
    });

    it('iscryptd is set to false ', async function () {
      const descriptions = [];
      client.on('serverDescriptionChanged', description => descriptions.push(description));
      const hello = await client.db().command({ hello: true });
      expect(hello).to.not.have.property('iscryptd');
      expect(descriptions.at(-1)).to.have.nested.property('newDescription.iscryptd', false);
    });
  });
});
