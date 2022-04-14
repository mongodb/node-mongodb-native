const { expect } = require('chai');

let startingMemoryUsage;

async function mochaGlobalSetup() {
  const activeHandles = process._getActiveHandles().map(({ fd }) => fd);
  activeHandles.sort();
  const activeRequests = process._getActiveRequests();

  expect(activeHandles).to.deep.equal([1, 2]);
  expect(activeRequests).to.have.a.lengthOf(0);

  startingMemoryUsage = process.memoryUsage();
}

async function mochaGlobalTeardown() {
  const endingMemoryUsage = process.memoryUsage();
  const activeHandles = process._getActiveHandles();
  const activeRequests = process._getActiveRequests();

  try {
    expect(activeHandles).to.have.a.lengthOf(0);
    expect(activeRequests).to.have.a.lengthOf(0);
    // Very generous check to double memory usage by the end of testing
    // should catch wildly unbounded allocations only
    expect(endingMemoryUsage.heapUsed).to.be.lessThan(startingMemoryUsage.heapUsed * 2);
  } finally {
    process.exit(1);
  }
}

module.exports = { mochaGlobalTeardown, mochaGlobalSetup };
