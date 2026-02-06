const chalk = require('chalk');
const { List } = require('../../mongodb');
const { createHistogram } = require('perf_hooks');
const { process } = require('process');

const iterations = 100;
const defaultItemsSize = 100000;
const makeBigArray = (length = defaultItemsSize) => Array.from({ length }).fill(1);
const makeReadableTime = nanoseconds => (nanoseconds / 1e6).toFixed(3).padStart(7, ' ');
const printHistogram = (name, h) => {
  console.log();
  console.log(chalk.green(name));
  console.log('-'.repeat(155));
  process.stdout.write(`|  ${chalk.cyan('max')}:    ${chalk.red(makeReadableTime(h.max))} ms |`);
  process.stdout.write(`  ${chalk.cyan('min')}:    ${chalk.red(makeReadableTime(h.min))} ms |`);
  process.stdout.write(`  ${chalk.cyan('mean')}:   ${chalk.red(makeReadableTime(h.mean))} ms |`);
  process.stdout.write(`  ${chalk.cyan('stddev')}: ${chalk.red(makeReadableTime(h.stddev))} ms |`);
  process.stdout.write(
    `  ${chalk.cyan('p90th')}:  ${chalk.red(makeReadableTime(h.percentile(90)))} ms |`
  );
  process.stdout.write(
    `  ${chalk.cyan('p95th')}:  ${chalk.red(makeReadableTime(h.percentile(95)))} ms |`
  );
  process.stdout.write(
    `  ${chalk.cyan('p99th')}:  ${chalk.red(makeReadableTime(h.percentile(99)))} ms |`
  );
  console.log('\n' + '-'.repeat(155));
};

const testArrayShift = () => {
  let bigArray = makeBigArray();
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    while (bigArray.length) bigArray.shift();
    h.recordDelta();
    bigArray = makeBigArray();
  }

  printHistogram(`shift(${defaultItemsSize}) from Array`, h);
};

const testListShift = () => {
  const bigList = new List();
  bigList.pushMany(makeBigArray());
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    while (bigList.length) bigList.shift();
    h.recordDelta();
    bigList.pushMany(makeBigArray());
  }

  printHistogram(`shift(${defaultItemsSize}) from List`, h);
};

const testDenqueShift = () => {
  const Denque = require('denque');
  let bigDenque = new Denque(makeBigArray());
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    while (bigDenque.length) bigDenque.shift();
    h.recordDelta();
    bigDenque = new Denque(makeBigArray());
  }

  printHistogram(`shift(${defaultItemsSize}) from Denque`, h);
};

const testArrayPush = () => {
  const bigArray = [];
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    for (let i = 0; i < defaultItemsSize; i++) bigArray.push(1);
    h.recordDelta();
    bigArray.length = 0;
  }

  printHistogram(`push(${defaultItemsSize}) to Array`, h);
};

const testListPush = () => {
  const bigList = new List();
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    for (let i = 0; i < defaultItemsSize; i++) bigList.push(1);
    h.recordDelta();
    bigList.clear();
  }

  printHistogram(`push(${defaultItemsSize}) to List`, h);
};

const testDenquePush = () => {
  const Denque = require('denque');
  let bigDenque = new Denque([]);
  const h = createHistogram();
  for (let runs = 0; runs < iterations; runs++) {
    h.recordDelta();
    for (let i = 0; i < defaultItemsSize; i++) bigDenque.push(1);
    h.recordDelta();
    bigDenque = new Denque([]);
  }

  printHistogram(`push(${defaultItemsSize}) to Denque`, h);
};

const main = () => {
  testArrayPush();
  testListPush();
  testDenquePush();

  testArrayShift();
  testListShift();
  testDenqueShift();
};
main();
