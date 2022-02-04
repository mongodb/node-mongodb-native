'use strict';

const path = require('path');
const { expect } = require('chai');
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const { loadSpecTests } = require('../../spec');

describe('Sessions spec tests', function () {
  describe('legacy suite', function () {
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

    generateTopologyTests(testSuites, testContext);
  });

  describe('unified suite', function () {
    runUnifiedSuite(loadSpecTests(path.join('sessions', 'unified')));
  });
});
