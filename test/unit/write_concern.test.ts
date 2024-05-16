import { expect } from 'chai';

import { WriteConcern } from '../mongodb';

describe('WriteConcern', function () {
  describe('#constructor', function () {
    describe('when w is provided', function () {
      describe('when w is a number', function () {
        const writeConcern = new WriteConcern(1);

        it('sets the w property', function () {
          expect(writeConcern.w).to.equal(1);
        });
      });

      describe('when w is a string number', function () {
        const writeConcern = new WriteConcern('10');

        it('sets the w property to a number', function () {
          expect(writeConcern.w).to.equal(10);
        });
      });

      describe('when w is a string', function () {
        const writeConcern = new WriteConcern('majority');

        it('sets the w property to the string', function () {
          expect(writeConcern.w).to.equal('majority');
        });
      });
    });

    describe('when wtimeoutMS is provided', function () {
      const writeConcern = new WriteConcern(1, 50);

      it('sets the wtimeoutMS property', function () {
        expect(writeConcern.wtimeoutMS).to.equal(50);
      });

      it('sets the wtimeout property', function () {
        expect(writeConcern.wtimeout).to.equal(50);
      });
    });

    describe('when journal is provided', function () {
      const writeConcern = new WriteConcern(1, 50, true);

      it('sets the journal property', function () {
        expect(writeConcern.journal).to.be.true;
      });

      it('sets the j property', function () {
        expect(writeConcern.j).to.be.true;
      });
    });

    describe('when fsync is provided', function () {
      const writeConcern = new WriteConcern(1, 50, false, true);

      it('sets the journal property', function () {
        expect(writeConcern.journal).to.be.true;
      });

      it('sets the j property', function () {
        expect(writeConcern.j).to.be.true;
      });
    });
  });

  describe('.apply', function () {
    describe('when no options are set', function () {
      const document = {};
      const writeConcern = new WriteConcern();

      it('returns an empty write concern', function () {
        expect(WriteConcern.apply(document, writeConcern)).to.deep.equal({ writeConcern: {} });
      });
    });

    describe('when w is in the write concern', function () {
      const document = {};
      const writeConcern = new WriteConcern(2);

      it('adds w to the write concern document', function () {
        expect(WriteConcern.apply(document, writeConcern)).to.deep.equal({
          writeConcern: { w: 2 }
        });
      });
    });

    describe('when wtimeoutMS is in the write concern', function () {
      const document = {};
      const writeConcern = new WriteConcern(2, 30);

      it('adds wtimeout to the write concern document', function () {
        expect(WriteConcern.apply(document, writeConcern)).to.deep.equal({
          writeConcern: { w: 2, wtimeout: 30 }
        });
      });
    });

    describe('when journal is in the write concern', function () {
      const document = {};
      const writeConcern = new WriteConcern(2, 30, true);

      it('adds j to the write concern document', function () {
        expect(WriteConcern.apply(document, writeConcern)).to.deep.equal({
          writeConcern: { w: 2, wtimeout: 30, j: true }
        });
      });
    });

    describe('when fsync is in the write concern', function () {
      const document = {};
      const writeConcern = new WriteConcern(2, 30, true, false);

      it('overwrites j to the write concern document', function () {
        expect(WriteConcern.apply(document, writeConcern)).to.deep.equal({
          writeConcern: { w: 2, wtimeout: 30, j: false }
        });
      });
    });
  });
});
