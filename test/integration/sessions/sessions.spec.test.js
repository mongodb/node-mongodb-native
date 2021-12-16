'use strict';

const path = require('path');
const { expect } = require('chai');
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { runUnifiedTest } = require('../../tools/unified-spec-runner/runner');
const { loadSpecTests } = require('../../spec');

describe('Sessions', function () {
  describe('legacy spec tests', function () {
    class SessionSpecTestContext extends TestRunnerContext {
      assertSessionNotDirty(options) {
        const session = options.session;
        expect(session.serverSession.isDirty).to.be.false;
      }

      assertSessionDirty(options) {
        const session = options.session;
        expect(session.serverSession.isDirty).to.be.true;
      }

      assertSameLsidOnLastTwoCommands() {
        expect(this.commandEvents).to.have.length.of.at.least(2);
        const lastTwoCommands = this.commandEvents.slice(-2).map(c => c.command);
        lastTwoCommands.forEach(command => expect(command).to.have.property('lsid'));
        expect(lastTwoCommands[0].lsid).to.eql(lastTwoCommands[1].lsid);
      }

      assertDifferentLsidOnLastTwoCommands() {
        expect(this.commandEvents).to.have.length.of.at.least(2);
        const lastTwoCommands = this.commandEvents.slice(-2).map(c => c.command);
        lastTwoCommands.forEach(command => expect(command).to.have.property('lsid'));
        expect(lastTwoCommands[0].lsid).to.not.eql(lastTwoCommands[1].lsid);
      }
    }

    const testContext = new SessionSpecTestContext();
    const testSuites = loadSpecTests(path.join('sessions', 'legacy'));

    after(() => testContext.teardown());
    before(function () {
      return testContext.setup(this.configuration);
    });

    function testFilter(spec) {
      const SKIP_TESTS = [
        // These two tests need to run against multiple mongoses
        'Dirty explicit session is discarded',
        'Dirty implicit session is discarded (write)'
      ];

      return SKIP_TESTS.indexOf(spec.description) === -1;
    }

    generateTopologyTests(testSuites, testContext, testFilter);
  });

  describe('unified spec tests', function () {
    for (const sessionTests of loadSpecTests(path.join('sessions', 'unified'))) {
      expect(sessionTests).to.be.an('object');
      context(String(sessionTests.description), function () {
        for (const test of sessionTests.tests) {
          it(String(test.description), {
            metadata: { sessions: { skipLeakTests: true } },
            test: async function () {
              await runUnifiedTest(this, sessionTests, test);
            }
          });
        }
      });
    }
  });
});
