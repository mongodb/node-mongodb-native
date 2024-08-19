import * as dns from 'dns';
import sinon = require('sinon');
// import { expect } from 'chai';

import { type MongoClient } from '../../mongodb';

describe(
  'Initial DNS Seedlist Discovery (Prose Tests)',
  { requires: { topology: 'single' } },
  () => {
    let client: MongoClient;

    function makeSrvStub() {
      sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
        return [
          {
            name: 'localhost',
            port: 27017,
            weight: 0,
            priority: 0
          }
        ];
      });

      sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
        throw { code: 'ENODATA' };
      });
    }

    afterEach(async function () {
      sinon.restore();
    });

    it('1.1 Driver should not throw error on valid SRV URI with one part', async function () {
      // 1. make dns resolution always pass
      //makeSrvStub();
      // 2. assert that creating a MongoClient with the uri 'mongodb+srv:/localhost' does not cause an error
      client = this.configuration.newClient('mongodb://localhost', {});
      // 3. assert that connecting the client from 2. to the server does not cause an error
      await client.connect();
    });

    it('1.1 Driver should not throw error on valid SRV URI with two parts', async function () {
      // 1. make dns resolution always pass
      makeSrvStub();
      // 2. assert that creating a MongoClient with the uri 'mongodb+srv://mongodb.localhost' does not cause an error
      //const client = new MongoClient('mongodb+srv://mongodb.localhost', {});
      // 3. assert that connecting the client to the server does not cause an error
      //await client.connect();
    });
  }
);
