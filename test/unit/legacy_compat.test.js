'use strict';

const { expect } = require('chai');
const { MongoClient } = require('../../src');

describe('Legacy 3.x features', function () {
  it('Should have bson defined on topology', function () {
    const client = new MongoClient(this.configuration.url());
    return client
      .connect()
      .then(client => {
        expect(client.topology).to.have.property('bson');
        expect(client.topology.bson).to.have.property('serialize');
        expect(client.topology.bson).to.have.property('deserialize');
      })
      .finally(() => client.close());
  });

  it('Should allow legacy option useUnifiedTopology', function () {
    const url = this.configuration.url();
    expect(() => new MongoClient(url, { useUnifiedTopology: true })).to.not.throw;
    expect(() => new MongoClient(url, { useUnifiedTopology: false })).to.not.throw;
  });

  it('Should allow legacy option useNewUrlParser', function () {
    const url = this.configuration.url();
    expect(() => new MongoClient(url, { useNewUrlParser: true })).to.not.throw;
    expect(() => new MongoClient(url, { useNewUrlParser: false })).to.not.throw;
  });
});
