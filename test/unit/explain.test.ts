import { expect } from 'chai';
import { it, test } from 'mocha';

import { Explain, ExplainVerbosity } from '../mongodb';

describe('class Explain {}', function () {
  describe('static .fromOptions()', function () {
    test('when no options are provided, it returns undefined', function () {
      expect(Explain.fromOptions()).to.be.undefined;
    });

    test('explain=true constructs an allPlansExecution explain', function () {
      const explain = Explain.fromOptions({ explain: true });
      expect(explain).to.have.property('verbosity', ExplainVerbosity.allPlansExecution);
      expect(explain).to.have.property('maxTimeMS').to.be.undefined;
    });

    test('explain=false constructs an allPlansExecution explain', function () {
      const explain = Explain.fromOptions({ explain: false });
      expect(explain).to.have.property('verbosity', ExplainVerbosity.queryPlanner);
      expect(explain).to.have.property('maxTimeMS').to.be.undefined;
    });

    test('explain=<type string> constructs an explain with verbosity set to the string', function () {
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

      test('when a maxTimeMS is provided, it constructs an explain with the maxTImeMS value', function () {
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
});
