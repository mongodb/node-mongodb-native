import { expect } from 'chai';

import { ReadPreference, Transaction } from '../mongodb';

describe('class Transaction', () => {
  describe('constructor()', () => {
    it('uses ReadPreference instance', () => {
      const transaction = new Transaction({
        readPreference: ReadPreference.nearest
      });
      expect(transaction.options)
        .to.have.property('readPreference')
        .that.is.instanceOf(ReadPreference)
        .that.has.property('mode', 'nearest');
    });

    it('transforms ReadPreferenceLike string', () => {
      const transaction = new Transaction({
        readPreference: 'nearest'
      });
      expect(transaction.options)
        .to.have.property('readPreference')
        .that.is.instanceOf(ReadPreference)
        .that.has.property('mode', 'nearest');
    });
  });
});
