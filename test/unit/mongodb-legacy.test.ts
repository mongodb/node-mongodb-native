import { expect } from 'chai';

import { Db } from '../mongodb';

describe('mongodb-legacy', () => {
  it('imports a Db with the legacy symbol', () => {
    expect(Db.prototype).to.have.property(Symbol.for('@@mdb.callbacks.toLegacy'));
  });
});
