import { expect } from 'chai';

import { ValidateCollectionOperation } from '../../../src/operations/validate_collection';

describe('ValidateCollectionOperation', function () {
  let client;

  beforeEach(function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  describe('buildCommandDocument()', function () {
    it('builds the base command when no options are provided', function () {
      client = this.configuration.newClient();
      const op = new ValidateCollectionOperation(client.db('foo').admin(), 'bar', {});

      const doc = op.buildCommandDocument({} as any, {} as any);
      expect(doc).to.deep.equal({
        validate: 'bar'
      });
    });

    it('supports background=true', function () {
      client = this.configuration.newClient();
      const op = new ValidateCollectionOperation(client.db('foo').admin(), 'bar', {
        background: true
      });

      const doc = op.buildCommandDocument({} as any, {} as any);
      expect(doc).to.deep.equal({
        validate: 'bar',
        background: true
      });
    });

    it('supports background=false', function () {
      client = this.configuration.newClient();
      const op = new ValidateCollectionOperation(client.db('foo').admin(), 'bar', {
        background: false
      });

      const doc = op.buildCommandDocument({} as any, {} as any);
      expect(doc).to.deep.equal({
        validate: 'bar',
        background: false
      });
    });

    it('attaches all options to the command document', function () {
      client = this.configuration.newClient();
      const op = new ValidateCollectionOperation(client.db('foo').admin(), 'bar', {
        background: false,
        a: 1,
        b: 2,
        c: 3
      });

      const doc = op.buildCommandDocument({} as any, {} as any);
      expect(doc).to.deep.equal({
        validate: 'bar',
        background: false,
        a: 1,
        b: 2,
        c: 3
      });
    });

    it('does not attach session command document', function () {
      client = this.configuration.newClient();
      const op = new ValidateCollectionOperation(client.db('foo').admin(), 'bar', {
        session: client.startSession()
      });

      const doc = op.buildCommandDocument({} as any, {} as any);
      expect(doc).to.deep.equal({
        validate: 'bar'
      });
    });
  });
});
