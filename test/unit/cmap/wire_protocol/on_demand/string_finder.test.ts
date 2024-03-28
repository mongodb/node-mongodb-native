import { expect } from 'chai';

import { BSON, StringFinder } from '../../../../mongodb';

describe('class StringFinder', () => {
  context('includes', () => {
    it('returns true for a matching string sequence', () => {
      const doc = BSON.serialize({ iLoveJavascript: 1 });
      expect(StringFinder.includes(doc, 'iLoveJavascript', 5)).to.be.true;
    });

    it('returns false for a non-matching string sequence', () => {
      const doc = BSON.serialize({ iLoveJavascript: 1 });
      expect(StringFinder.includes(doc, 'iHateJavascript', 5)).to.be.false;
    });

    it('caches the byte sequence of the search string', () => {
      expect(StringFinder.includes(new Uint8Array(), 'iLikeJavascript', 0)).to.be.false;
      expect(StringFinder)
        .to.have.nested.property('cache.iLikeJavascript')
        .that.deep.equal(Uint8Array.from('iLikeJavascript', c => c.charCodeAt(0)));
    });
  });
});
