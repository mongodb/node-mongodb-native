import { expect } from 'chai';

const unhandled: {
  rejections: Error[];
  exceptions: Error[];
  unknown: unknown[];
} = {
  rejections: [],
  exceptions: [],
  unknown: []
};

const uncaughtExceptionListener: NodeJS.UncaughtExceptionListener = (error, origin) => {
  if (origin === 'uncaughtException') {
    unhandled.exceptions.push(error);
  } else if (origin === 'unhandledRejection') {
    unhandled.rejections.push(error);
  } else {
    unhandled.unknown.push(error);
  }
};

function beforeEachUnhandled() {
  unhandled.rejections = [];
  unhandled.exceptions = [];
  unhandled.unknown = [];
  process.addListener('uncaughtExceptionMonitor', uncaughtExceptionListener);
}

function afterEachUnhandled() {
  process.removeListener('uncaughtExceptionMonitor', uncaughtExceptionListener);
  try {
    expect(unhandled).property('rejections').to.have.lengthOf(0);
    expect(unhandled).property('exceptions').to.have.lengthOf(0);
    expect(unhandled).property('unknown').to.have.lengthOf(0);
  } catch (error) {
    this.test.error(error);
  }
  unhandled.rejections = [];
  unhandled.exceptions = [];
  unhandled.unknown = [];
}

export const mochaHooks = { beforeEach: beforeEachUnhandled, afterEach: afterEachUnhandled };
