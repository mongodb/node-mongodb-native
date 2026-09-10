import { expect } from 'chai';

import { formatSort } from '../mongodb';

describe('formatSort', function () {
  context('when the sort is a [field, direction] pair', function () {
    it('formats a numeric direction', function () {
      expect(formatSort(['alpha', -1])).to.deep.equal(new Map([['alpha', -1]]));
    });

    it('formats a string direction', function () {
      expect(formatSort(['alpha', 'asc'])).to.deep.equal(new Map([['alpha', 1]]));
    });

    it('preserves a $meta direction', function () {
      expect(formatSort(['alpha', { $meta: 'textScore' }])).to.deep.equal(
        new Map([['alpha', { $meta: 'textScore' }]])
      );
    });
  });
});
