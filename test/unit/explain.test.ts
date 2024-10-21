import { expect } from 'chai';
import { it } from 'mocha';

import { Explain, ExplainVerbosity, FindCursor, MongoClient, MongoDBNamespace } from '../mongodb';

describe('class Explain {}', function () {
  describe('static .fromOptions()', function () {
    it('when no options are provided, it returns undefined', function () {
      expect(Explain.fromOptions()).to.be.undefined;
    });

    it('explain=true constructs an allPlansExecution explain', function () {
      const explain = Explain.fromOptions({ explain: true });
      expect(explain).to.have.property('verbosity', ExplainVerbosity.allPlansExecution);
      expect(explain).to.have.property('maxTimeMS').to.be.undefined;
    });

    it('explain=false constructs an allPlansExecution explain', function () {
      const explain = Explain.fromOptions({ explain: false });
      expect(explain).to.have.property('verbosity', ExplainVerbosity.queryPlanner);
      expect(explain).to.have.property('maxTimeMS').to.be.undefined;
    });

    it('explain=<type string> constructs an explain with verbosity set to the string', function () {
      const explain = Explain.fromOptions({ explain: 'some random string' });
      expect(explain).to.have.property('verbosity', 'some random string');
      expect(explain).to.have.property('maxTimeMS').to.be.undefined;
    });

    describe('when explain is an object', function () {
      it('uses the verbosity from the object', function () {
        const explain = Explain.fromOptions({
          explain: {
            verbosity: 'some random string'
          }
        });
        expect(explain).to.have.property('verbosity', 'some random string');
        expect(explain).to.have.property('maxTimeMS').to.be.undefined;
      });

      it('when a maxTimeMS is provided, it constructs an explain with the maxTImeMS value', function () {
        const explain = Explain.fromOptions({
          explain: {
            verbosity: 'some random string',
            maxTimeMS: 2000
          }
        });
        expect(explain).to.have.property('verbosity', 'some random string');
        expect(explain).to.have.property('maxTimeMS', 2000);
      });
    });
  });

  describe('parseTimeoutOptions()', function () {
    const cursor = new FindCursor(
      new MongoClient('mongodb://localhost:27027'),
      MongoDBNamespace.fromString('foo.bar'),
      {},
      {}
    );

    it('parseTimeoutOptions()', function () {
      const { timeout, explain } = cursor.resolveExplainTimeoutOptions();
      expect(timeout).to.be.undefined;
      expect(explain).to.be.undefined;
    });

    it('parseTimeoutOptions(<timeout options>)', function () {
      const { timeout, explain } = cursor.resolveExplainTimeoutOptions({ timeoutMS: 1_000 });
      expect(timeout).to.deep.equal({ timeoutMS: 1_000 });
      expect(explain).to.be.undefined;
    });

    it('parseTimeoutOptions(<explain options>)', function () {
      const { timeout, explain } = cursor.resolveExplainTimeoutOptions({
        verbosity: 'queryPlanner'
      });
      expect(timeout).to.be.undefined;
      expect(explain).to.deep.equal({ verbosity: 'queryPlanner' });
    });

    it('parseTimeoutOptions(<explain options, timeout options>)', function () {
      const { timeout, explain } = cursor.resolveExplainTimeoutOptions(
        { verbosity: 'queryPlanner' },
        { timeoutMS: 1_000 }
      );
      expect(timeout).to.deep.equal({ timeoutMS: 1_000 });
      expect(explain).to.deep.equal({ verbosity: 'queryPlanner' });
    });
  });
});
