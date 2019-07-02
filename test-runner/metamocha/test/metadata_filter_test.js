const expect = require('chai').expect;

describe('1=1', {
  metadata: {a: 1},

  tests: function() {
    it('should equal true', () => {
      expect(1).to.eql(1);
    });
  }
});

describe('1=2', {
  metadata: {a: 2},

  tests: function() {
    it('should equal false', () => {
      expect(1).to.not.eql(2);
    });
  }
});
