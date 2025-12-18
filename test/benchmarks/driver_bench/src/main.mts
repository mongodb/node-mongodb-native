/* eslint-disable no-console */
import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import events from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import util from 'node:util';

import {
  type Metric,
  type MetricInfo,
  metrics,
  MONGODB_BSON_PATH,
  MONGODB_BSON_REVISION,
  MONGODB_BSON_VERSION,
  MONGODB_CLIENT_OPTIONS,
  MONGODB_DRIVER_PATH,
  MONGODB_DRIVER_REVISION,
  MONGODB_DRIVER_VERSION,
  snakeToCamel,
  TAG
} from './driver.mjs';

const __dirname = import.meta.dirname;

export const alphabetically = (a: unknown, b: unknown) => {
  const res = `${a}`.localeCompare(`${b}`, 'en-US', {
    usage: 'sort',
    numeric: true,
    ignorePunctuation: false
  });
  return res < 0 ? -1 : res > 0 ? 1 : 0;
};

/** Find every mjs file in the suites folder */
async function getBenchmarks(): Promise<{
  tests: Record<string, Record<string, string>>;
  total: number;
}> {
  let total = 0;
  const tests: Record<string, Record<string, string>> = Object.create(null);
  const suites = await fs.readdir(path.join(__dirname, 'suites'));
  suites.sort(alphabetically);

  for (const suite of suites) {
    const benchmarks = await fs.readdir(path.join(__dirname, 'suites', suite));
    benchmarks.sort(alphabetically);

    for (const benchmark of benchmarks) {
      if (!benchmark.endsWith('.mjs')) continue;
      tests[suite] ??= Object.create(null);
      tests[suite][benchmark] = path.join('suites', suite, benchmark);
      total += 1;
    }
  }
  return { tests, total };
}

const hw = os.cpus();
const ram = os.totalmem() / 1024 ** 3;
const platform = { name: hw[0].model, cores: hw.length, ram: `${ram}GB` };

const { tests, total } = await getBenchmarks();

const earliest = new Date(Date.now() + total * 60 * 1000); // plus one min per bench
const latest = new Date(Date.now() + total * 6 * 60 * 1000); // plus six min per bench (if we overshoot the 5 min limit)

const systemInfo = () =>
  [
    `\n- cpu: ${platform.name}`,
    `- cores: ${platform.cores}`,
    `- arch: ${os.arch()}`,
    `- os: ${os.platform()} (${os.release()})`,
    `- ram: ${platform.ram}`,
    `- node: ${process.version}`,
    `- running ${total} benchmarks`,
    `  - finishes soonest: ${earliest.toLocaleTimeString('en-US', { timeZoneName: 'short' })}`,
    `             latest:  ${latest.toLocaleTimeString('en-US', { timeZoneName: 'short' })}`,
    `- driver: ${MONGODB_DRIVER_VERSION} (${MONGODB_DRIVER_REVISION}): ${MONGODB_DRIVER_PATH}`,
    `  - options ${util.inspect(MONGODB_CLIENT_OPTIONS)}`,
    `- bson: ${MONGODB_BSON_VERSION} (${MONGODB_BSON_REVISION}): (${MONGODB_BSON_PATH})\n`
  ].join('\n');

console.log(systemInfo());

const runnerPath = path.join(__dirname, 'runner.mjs');

let results: MetricInfo[] = [];

for (const [suite, benchmarks] of Object.entries(tests)) {
  console.group(snakeToCamel(suite));

  for (const [benchmark, benchFile] of Object.entries(benchmarks)) {
    console.log(snakeToCamel(path.basename(benchmark, '.mjs')));

    const runner = child_process.fork(runnerPath, [benchFile], { stdio: 'inherit' });

    const [exitCode] = await events.once(runner, 'close');
    if (exitCode !== 0) {
      throw new Error(`Benchmark exited with failure: ${exitCode}`);
    }

    const result = JSON.parse(
      await fs.readFile(`results_${path.basename(benchmark, '.mjs')}.json`, 'utf8')
    );

    results.push(result);
  }

  console.groupEnd();
}

const metricInfoFilterByName =
  (testName: string) =>
    ({ info: { test_name } }: MetricInfo) =>
      test_name === testName;

const isMBsMetric = ({ name }: Metric) => name === 'megabytes_per_second';

function calculateCompositeBenchmarks(results: MetricInfo[]) {
  const composites = {
    singleBench: ['findOne', 'smallDocInsertOne', 'largeDocInsertOne'],
    multiBench: [
      'findManyAndEmptyCursor',
      'gridFsDownload',
      'gridFsUpload',
      'largeDocBulkInsert',
      'smallDocBulkInsert'
    ],
    parallelBench: [
      'ldjsonMultiFileUpload',
      'ldjsonMultiFileExport',
      'gridfsMultiFileUpload',
      'gridfsMultiFileDownload'
    ],
    readBench: [
      'findOne',
      'findManyAndEmptyCursor',
      'gridFsDownload',
      'gridfsMultiFileDownload',
      'ldjsonMultiFileExport'
    ],
    writeBench: [
      'smallDocInsertOne',
      'largeDocInsertOne',
      'smallDocBulkInsert',
      'largeDocBulkInsert',
      'gridFsUpload',
      'ldjsonMultiFileUpload',
      'gridfsMultiFileUpload'
    ]
  };

  let readBenchResult;
  let writeBenchResult;

  console.group('composite scores');

  const compositeResults: MetricInfo[] = [];
  for (const [compositeName, compositeTests] of Object.entries(composites)) {
    console.group(`${compositeName}: ${compositeTests.join(', ')}`);

    let sum = 0;
    for (const testName of compositeTests) {
      const testScore = results.find(metricInfoFilterByName(testName));
      assert.ok(testScore, `${compositeName} suite requires ${testName} for composite score`);

      const metric = testScore.metrics.find(isMBsMetric);
      assert.ok(metric, `${testName} is missing a megabytes_per_second metric`);

      sum += metric.value;
    }

    const compositeAverage = sum / compositeTests.length;

    if (compositeName === 'readBench') readBenchResult = compositeAverage;
    if (compositeName === 'writeBench') writeBenchResult = compositeAverage;

    compositeResults.push(metrics(compositeName, compositeAverage, [TAG.spec]));

    console.log('avg:', compositeAverage, 'mb/s');

    console.groupEnd();
  }

  assert.ok(typeof readBenchResult === 'number');
  assert.ok(typeof writeBenchResult === 'number');

  const driverBench = (readBenchResult + writeBenchResult) / 2;

  console.group('driverBench: readBench, writeBench');
  console.log('avg:', driverBench, 'mb/s');
  console.groupEnd();

  compositeResults.push(metrics('driverBench', driverBench, [TAG.spec]));

  console.groupEnd();
  return [...results, ...compositeResults];
}

function calculateNormalizedResults(results: MetricInfo[]): MetricInfo[] {
  const baselineBench = results.find(metricInfoFilterByName('cpuBaseline'));
  const pingBench = results.find(metricInfoFilterByName('ping'));

  assert.ok(pingBench, 'ping bench results not found!');
  assert.ok(baselineBench, 'cpuBaseline results not found!');

  const cpuBaseline = baselineBench.metrics.find(isMBsMetric);
  const pingThroughput = pingBench.metrics.find(isMBsMetric);

  assert.ok(cpuBaseline, 'cpu benchmark does not have a MB/s metric');
  assert.ok(pingThroughput, 'ping does not have a MB/s metric');

  for (const bench of results) {
    if (bench.info.test_name === 'cpuBaseline') continue;

    const currentMetric = bench.metrics.find(isMBsMetric);
    assert.ok(currentMetric, `${bench.info.test_name} does not have a MB/s metric`);

    if (bench.info.test_name === 'ping') {
      bench.metrics.push({
        name: 'normalized_throughput',
        value: currentMetric.value / cpuBaseline.value,
        metadata: {
          tags: currentMetric.metadata.tags,
          improvement_direction: 'up'
        }
      });
    } else {
      // Compute normalized_throughput of benchmarks against ping bench
      bench.metrics.push({
        name: 'normalized_throughput',
        value: currentMetric.value / pingThroughput.value,
        metadata: {
          tags: currentMetric.metadata.tags,
          improvement_direction: 'up'
        }
      });
    }
  }

  return results;
}

results = calculateCompositeBenchmarks(results);
results = calculateNormalizedResults(results);

await fs.writeFile('results.json', JSON.stringify(results, undefined, 2), 'utf8');
