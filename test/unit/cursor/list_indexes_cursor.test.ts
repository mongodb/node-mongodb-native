import { expect } from 'chai';

import { ListIndexesCursor, MongoClient } from '../../mongodb';

describe('class ListIndexesCursor', () => {
  context('constructor()', () => {
    it('does not throw when given frozen options', () => {
      const client = new MongoClient('mongodb://localhost:27017');
      const options = Object.freeze({ timeoutMS: 100 });

      expect(() => new ListIndexesCursor(client.db().collection('test'), options)).to.not.throw();
    });
  });
});
