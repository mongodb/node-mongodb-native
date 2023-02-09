import { expect } from 'chai';
import { writeSync } from 'fs';

const unhandled: {
  rejections: Error[];
  exceptions: Error[];
} = {
  rejections: [],
  exceptions: []
};

const uncaughtExceptionListener: NodeJS.UncaughtExceptionListener = (error, origin) => {
  if (origin === 'uncaughtException') {
    unhandled.exceptions.push(error);
  } else if (origin === 'unhandledRejection') {
    unhandled.rejections.push(error);
  } else {
    writeSync(
      2,
      Buffer.from(
        `\n\nWARNING!! uncaughtExceptionMonitor reporting error from unknown origin: ${origin}\n\n`,
        'utf8'
      )
    );
  }
};

function beforeEachUnhandled() {
  unhandled.rejections = [];
  unhandled.exceptions = [];
  process.addListener('uncaughtExceptionMonitor', uncaughtExceptionListener);
}

function afterEachUnhandled() {
  process.removeListener('uncaughtExceptionMonitor', uncaughtExceptionListener);
  try {
    expect(unhandled).property('rejections').to.have.lengthOf(0);
    expect(unhandled).property('exceptions').to.have.lengthOf(0);
  } catch (error) {
    this.test.error(error);
  }
  unhandled.rejections = [];
  unhandled.exceptions = [];
}

module.exports = { mochaHooks: { beforeEach: beforeEachUnhandled, afterEach: afterEachUnhandled } };
