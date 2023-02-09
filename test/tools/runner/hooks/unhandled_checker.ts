import { expect } from 'chai';

const unhandled: {
  rejections: Error[];
  exceptions: Error[];
} = {
  rejections: [],
  exceptions: []
};

const uncaughtExceptionListener = (error, origin) => {
  if (origin === 'uncaughtException') {
    unhandled.exceptions.push(error);
  }
};

const uncaughtRejectionListener = error => {
  unhandled.exceptions.push(error as Error);
};

function beforeEachUnhandled() {
  unhandled.rejections = [];
  unhandled.exceptions = [];
  process.addListener('uncaughtException', uncaughtExceptionListener);
  process.addListener('unhandledRejection', uncaughtRejectionListener);
}

function afterEachUnhandled() {
  process.removeListener('uncaughtException', uncaughtExceptionListener);
  process.removeListener('unhandledRejection', uncaughtRejectionListener);
  expect(unhandled.rejections).to.have.lengthOf(0);
  expect(unhandled.exceptions).to.have.lengthOf(0);
}

module.exports = { mochaHooks: { beforeEach: beforeEachUnhandled, afterEach: afterEachUnhandled } };
