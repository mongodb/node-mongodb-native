const { expect } = require('chai');

let startingMemoryUsage;

const compareString = (a, b) => String.prototype.localeCompare.call(String(a), String(b));
const sorted = array => {
  const copy = Array.from(array);
  copy.sort((a, b) => (typeof a === 'number' ? a - b : compareString(a, b)));
  return copy;
};

async function mochaGlobalSetup() {
  const activeHandles = process._getActiveHandles();
  const activeRequests = process._getActiveRequests();

  expect(sorted(activeHandles.map(({ fd }) => fd))).to.deep.equal([1, 2]);
  expect(activeRequests).to.have.a.lengthOf(0);

  startingMemoryUsage = process.memoryUsage();
}

async function mochaGlobalTeardown() {
  const endingMemoryUsage = process.memoryUsage();
  const activeHandles = process._getActiveHandles();
  const activeRequests = process._getActiveRequests();

  try {
    expect(activeHandles).to.have.a.lengthOf(2); // should on
    expect(activeRequests).to.have.a.lengthOf(0);
    // Very generous check to double memory usage by the end of testing
    // should catch wildly unbounded allocations only
    expect(endingMemoryUsage.heapUsed).to.be.lessThan(startingMemoryUsage.heapUsed * 2);
  } catch (error) {
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { mochaGlobalTeardown, mochaGlobalSetup };
