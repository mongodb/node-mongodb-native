import { expect } from 'chai';

import { ListCollectionsCursor, MongoClient } from '../../mongodb';

describe('class ListCollectionsCursor', () => {
  context('constructor()', () => {
    it('does not throw when given frozen options', () => {
      const client = new MongoClient('mongodb://localhost:27017');
      const options = Object.freeze({ timeoutMS: 100 });

      expect(() => new ListCollectionsCursor(client.db(), {}, options)).to.not.throw();
    });
  });
});
