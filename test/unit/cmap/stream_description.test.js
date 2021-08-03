'use strict';

const { StreamDescription } = require('../../../src/cmap/stream_description');
const { expect } = require('chai');

describe('StreamDescription - unit/cmap', function () {
  describe('.new', function () {
    context('when options are provided', function () {
      context('when logicalSessionTimeoutMinutes is in the options', function () {
        const options = { logicalSessionTimeoutMinutes: 5 };
        const description = new StreamDescription('a:27017', options);

        it('sets the property', function () {
          expect(description.logicalSessionTimeoutMinutes).to.eq(5);
        });
      });

      context('when logicalSessionTimeoutMinutes is not in the options', function () {
        const description = new StreamDescription('a:27017', {});

        it('sets logicalSessionTimeoutMinutes to undefined', function () {
          expect(description).to.have.property('logicalSessionTimeoutMinutes', undefined);
        });
      });

      context('when loadBalanced is in the options', function () {
        context('when the value is true', function () {
          const options = { loadBalanced: true };
          const description = new StreamDescription('a:27017', options);

          it('sets the property to true', function () {
            expect(description.loadBalanced).to.be.true;
          });
        });

        context('when the value is false', function () {
          const options = { loadBalanced: false };
          const description = new StreamDescription('a:27017', options);

          it('sets the property to false', function () {
            expect(description.loadBalanced).to.be.false;
          });
        });
      });

      context('when loadBalanced is not in the options', function () {
        const description = new StreamDescription('a:27017', {});

        it('sets loadBalanced to false', function () {
          expect(description.loadBalanced).to.be.false;
        });
      });
    });

    context('when options are not provided', function () {
      const description = new StreamDescription('a:27017');

      it('defaults logicalSessionTimeoutMinutes to undefined', function () {
        expect(description).to.have.property('logicalSessionTimeoutMinutes', undefined);
      });

      it('defaults loadBalanced to false', function () {
        expect(description.loadBalanced).to.be.false;
      });
    });
  });
});
