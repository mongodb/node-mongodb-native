import { expect } from 'chai';
import * as dns from 'dns';

import { MongoClient } from '../../mongodb';
import sinon = require('sinon');

describe.only('Initial DNS Seedlist Discovery (Prose Tests)', () => {
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

  afterEach(async () => {
    sinon.restore();
  });

  it('1.1 Driver should not throw error on SRV URI with two parts', async () => {
    // 1. stub dns resolution to always pass
    makeSrvStub();
    // 2. assert that creating a MongoClient with the uri 'mongodb+srv://mongodb.localhost' does not cause an error
    //const client = new MongoClient('mongodb+srv://mongodb.localhost', {});
    const client = new MongoClient('mongodb+srv://mongodb.localhost');
    // 3. assert that connecting the client from 2. to the server does not cause an error
    await client.connect();
  });

  it('1.2 Driver should not throw error on SRV URI with one part', async () => {
    // 1. stub dns resolution to always pass
    makeSrvStub();
    // 2. assert that creating a MongoClient with the uri 'mongodb+srv//localhost' does not cause an error
    const client = new MongoClient('mongodb+srv://localhost', {});
    // 3. assert that connecting the client from 2. to the server does not cause an error
    await client.connect();
  });
});
