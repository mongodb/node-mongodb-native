//@ts-check
'use strict';
const mocha = require('mocha');
const chalk = require('chalk');
const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_TEST_FAIL,
  EVENT_TEST_PASS,
  EVENT_SUITE_BEGIN,
  EVENT_SUITE_END,
  EVENT_TEST_PENDING,
  EVENT_TEST_BEGIN,
  EVENT_TEST_END
} = mocha.Runner.constants;

const fs = require('fs');
const os = require('os');

/**
 * @typedef {object} MongoMochaSuiteExtension
 * @property {Date} timestamp - suite start date
 * @property {string} stdout - capture of stdout
 * @property {string} stderr - capture of stderr
 * @property {MongoMochaTest} test - capture of stderr
 *
 * @typedef {object} MongoMochaTestExtension
 * @property {Date} startTime - test start date
 * @property {Date} endTime - test end date
 * @property {number} elapsedTime - difference between end and start
 * @property {Error} [error] - The possible error from a test
 * @property {true} [skipped] - Set if test was skipped
 *
 * @typedef {MongoMochaSuiteExtension & Mocha.Suite} MongoMochaSuite
 * @typedef {MongoMochaTestExtension & Mocha.Test} MongoMochaTest
 */

// Turn this on if you have to debug this custom reporter!
let REPORT_TO_STDIO = false;

function captureStream(stream) {
  var oldWrite = stream.write;
  var buf = '';
  stream.write = function (chunk) {
    buf += chunk.toString(); // chunk is a String or Buffer
    oldWrite.apply(stream, arguments);
  };

  return {
    unhook: function unhook() {
      stream.write = oldWrite;
      return buf;
    },
    captured: function () {
      return buf;
    }
  };
}

/**
 * @param {Mocha.Runner} runner
 * @this {any}
 */
class MongoDBMochaReporter extends mocha.reporters.Spec {
  constructor(runner) {
    super(runner);
    /** @type {Map<string, {suite: MongoMochaSuite, stdout?: any, stderr?: any}>} */
    this.suites = new Map();
    this.xunitWritten = false;
    runner.on(EVENT_RUN_BEGIN, () => this.start());
    runner.on(EVENT_RUN_END, () => this.end());
    runner.on(EVENT_SUITE_BEGIN, suite => this.onSuite(suite));
    runner.on(EVENT_TEST_BEGIN, test => this.onTest(test));
    runner.on(EVENT_TEST_PASS, test => this.pass(test));
    runner.on(EVENT_TEST_FAIL, (test, error) => this.fail(test, error));
    runner.on(EVENT_TEST_PENDING, test => this.pending(test));
    runner.on(EVENT_SUITE_END, suite => this.suiteEnd(suite));
    runner.on(EVENT_TEST_END, test => this.testEnd(test));

    process.on('SIGINT', () => this.end(true));
  }
  start() {}

  end(ctrlC) {
    try {
      if (ctrlC) console.log('emergency exit!');
      const output = { testSuites: [] };

      for (const [id, [className, { suite }]] of [...this.suites.entries()].entries()) {
        let totalSuiteTime = 0;
        let testCases = [];
        let failureCount = 0;

        const tests = /** @type {MongoMochaTest[]}*/ (suite.tests);
        for (const test of tests) {
          let time = test.elapsedTime / 1000;
          time = Number.isNaN(time) ? 0 : time;

          totalSuiteTime += time;
          failureCount += test.state === 'failed' ? 1 : 0;

          /** @type {string | Date | number} */
          let startTime = test.startTime;
          startTime = startTime ? startTime.toISOString() : 0;

          /** @type {string | Date | number} */
          let endTime = test.endTime;
          endTime = endTime ? endTime.toISOString() : 0;

          let error = test.error;
          let failure = error
            ? {
                type: error.constructor.name,
                message: error.message,
                stack: error.stack
              }
            : undefined;

          let skipped = !!test.skipped;

          testCases.push({
            name: test.title,
            className,
            time,
            startTime,
            endTime,
            skipped,
            failure
          });
        }

        /** @type {string | Date | number} */
        let timestamp = suite.timestamp;
        timestamp = timestamp ? timestamp.toISOString().split('.')[0] : '';

        output.testSuites.push({
          package: suite.file.includes('functional') ? 'Functional' : 'Unit',
          id,
          name: className,
          timestamp,
          hostname: os.hostname(),
          tests: suite.tests.length,
          failures: failureCount,
          errors: '0',
          time: totalSuiteTime,
          testCases,
          stdout: suite.stdout,
          stderr: suite.stderr
        });
      }

      if (!this.xunitWritten) {
        fs.writeFileSync('xunit.xml', outputToXML(output), { encoding: 'utf8' });
      }
      this.xunitWritten = true;
      console.log(chalk.bold('wrote xunit.xml'));
    } catch (error) {
      console.error(chalk.red(`Failed to output xunit report! ${error}`));
    }
  }

  /**
   * @param {MongoMochaSuite} suite
   */
  onSuite(suite) {
    if (suite.root) return;
    if (!this.suites.has(suite.fullTitle())) {
      suite.timestamp = new Date();
      this.suites.set(suite.fullTitle(), {
        suite,
        stdout: captureStream(process.stdout),
        stderr: captureStream(process.stderr)
      });
    } else {
      console.warn(`${chalk.yellow('WARNING:')} ${suite.fullTitle()} started twice`);
    }
  }

  /**
   * @param {MongoMochaSuite} suite
   */
  suiteEnd(suite) {
    if (suite.root) return;
    const currentSuite = this.suites.get(suite.fullTitle());
    if (!currentSuite) {
      console.error('Suite never started >:(');
      process.exit(1);
    }
    if (currentSuite.stdout || currentSuite.stderr) {
      suite.stdout = currentSuite.stdout.unhook();
      suite.stderr = currentSuite.stderr.unhook();
      delete currentSuite.stdout;
      delete currentSuite.stderr;
    }
  }

  /**
   * @param {MongoMochaTest} test
   */
  onTest(test) {
    test.startTime = new Date();
  }

  /**
   * @param {MongoMochaTest} test
   */
  testEnd(test) {
    test.endTime = new Date();
    test.elapsedTime = Number(test.endTime) - Number(test.startTime);
  }

  /**
   * @param {MongoMochaTest} test
   */
  pass(test) {
    if (REPORT_TO_STDIO) console.log(chalk.green(`✔ ${test.fullTitle()}`));
  }

  /**
   * @param {MongoMochaTest} test
   * @param {Error} error
   */
  fail(test, error) {
    if (REPORT_TO_STDIO) console.log(chalk.red(`⨯ ${test.fullTitle()} -- ${error.message}`));
    test.error = error;
  }

  /**
   * @param {MongoMochaTest} test
   */
  pending(test) {
    if (REPORT_TO_STDIO) console.log(chalk.cyan(`↬ ${test.fullTitle()}`));
    test.skipped = true;
  }
}

module.exports = MongoDBMochaReporter;

function replaceIllegalXMLCharacters(string) {
  // prettier-ignore
  return String(string)
    .split('"').join('＂')
    .split('<').join('﹤')
    .split('>').join('﹥')
    .split('&').join('﹠');
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
function outputToXML(output) {
  function cdata(str) {
    return `<![CDATA[${String(str)
      .split(ANSI_ESCAPE_REGEX)
      .join('')
      .split(']]>')
      .join('\\]\\]\\>')}]]>`;
  }

  function makeTag(name, attributes, selfClose, content) {
    const attributesString = Object.entries(attributes || {})
      .map(([k, v]) => `${k}="${replaceIllegalXMLCharacters(v)}"`)
      .join(' ');
    let tag = `<${name}${attributesString ? ' ' + attributesString : ''}`;
    if (selfClose) return tag + '/>\n';
    else tag += '>';
    if (content) return tag + content + `</${name}>`;
    return tag;
  }

  let s =
    '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-model href="./test/tools/reporter/xunit.xsd" ?>\n<testsuites>\n';

  for (const suite of output.testSuites) {
    s += makeTag('testsuite', {
      package: suite.package,
      id: suite.id,
      name: suite.name,
      timestamp: suite.timestamp,
      hostname: suite.hostname,
      tests: suite.tests,
      failures: suite.failures,
      errors: suite.errors,
      time: suite.time
    });
    s += '\n\t' + makeTag('properties') + '</properties>\n'; // can put metadata here?
    for (const test of suite.testCases) {
      s +=
        '\t' +
        makeTag(
          'testcase',
          {
            name: test.name,
            classname: test.className,
            time: test.time,
            start: test.startTime,
            end: test.endTime
          },
          !test.failure && !test.skipped
        );
      if (test.failure) {
        s +=
          '\n\t\t' +
          makeTag('failure', { type: test.failure.type }, false, cdata(test.failure.stack)) +
          '\n';
        s += `\t</testcase>\n`;
      }
      if (test.skipped) {
        s += makeTag('skipped', {}, true);
        s += `\t</testcase>\n`;
      }
    }
    s += '\t' + makeTag('system-out', {}, false, cdata(suite.stdout)) + '\n';
    s += '\t' + makeTag('system-err', {}, false, cdata(suite.stderr)) + '\n';
    s += `</testsuite>\n`;
  }

  return s + '</testsuites>\n';
}
