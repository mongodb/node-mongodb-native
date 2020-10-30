//@ts-check
'use strict';
const mocha = require('mocha');
const chalk = require('chalk').default;
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
    /** @type {Map<string, {suite: Mocha.Suite, stdout?: any, stderr?: any}>} */
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
    if (ctrlC) console.log('emergency exit!');
    const output = { testSuites: [] };

    for (const [id, [className, { suite }]] of [...this.suites.entries()].entries()) {
      let totalSuiteTime = 0;
      let testCases = [];
      let failureCount = 0;

      for (const test of suite.tests) {
        let time = Reflect.get(test, 'elapsedTime') / 1000;
        time = Number.isNaN(time) ? 0 : time;

        totalSuiteTime += time;
        failureCount += test.state === 'failed' ? 1 : 0;

        let startTime = Reflect.get(test, 'startTime');
        startTime = startTime ? startTime.toISOString() : 0;

        let endTime = Reflect.get(test, 'endTime');
        endTime = endTime ? endTime.toISOString() : 0;

        let error = Reflect.get(test, 'error');
        let failure = error
          ? {
              type: error.constructor.name,
              message: error.message,
              stack: error.stack
            }
          : undefined;

        let skipped = !!Reflect.get(test, 'skipped');

        testCases.push({ name: test.title, className, time, startTime, endTime, skipped, failure });
      }

      let timestamp = Reflect.get(suite, 'timestamp');
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
        stdout: Reflect.get(suite, 'stdout'),
        stderr: Reflect.get(suite, 'stderr')
      });
    }

    if (!this.xunitWritten) {
      fs.writeFileSync('xunit.xml', outputToXML(output), { encoding: 'utf8' });
    }
    this.xunitWritten = true;
    console.log(chalk.bold('wrote xunit.xml'));
  }

  /**
   * @param {Mocha.Suite} suite
   */
  onSuite(suite) {
    if (suite.root) return;
    if (!this.suites.has(suite.fullTitle())) {
      Reflect.set(suite, 'timestamp', new Date());
      this.suites.set(suite.fullTitle(), {
        suite,
        stdout: captureStream(process.stdout),
        stderr: captureStream(process.stderr)
      });
    } else {
      console.warn(`${chalk.yellow('WARNING:')}: ${suite.fullTitle()} started twice`);
    }
  }

  /**
   * @param {Mocha.Suite} suite
   */
  suiteEnd(suite) {
    if (suite.root) return;
    const currentSuite = this.suites.get(suite.fullTitle());
    if (!currentSuite) {
      console.error('Suite never started >:(');
      process.exit(1);
    }
    if (currentSuite.stdout || currentSuite.stderr) {
      Reflect.set(suite, 'stdout', currentSuite.stdout.unhook());
      Reflect.set(suite, 'stderr', currentSuite.stderr.unhook());
      delete currentSuite.stdout;
      delete currentSuite.stderr;
    }
  }

  /**
   * @param {Mocha.Test} test
   */
  onTest(test) {
    Reflect.set(test, 'startTime', new Date());
  }

  /**
   * @param {Mocha.Test} test
   */
  testEnd(test) {
    Reflect.set(test, 'endTime', new Date());
    Reflect.set(
      test,
      'elapsedTime',
      Number(Reflect.get(test, 'endTime') - Reflect.get(test, 'startTime'))
    );
  }

  /**
   * @param {Mocha.Test} test
   */
  pass(test) {
    if (REPORT_TO_STDIO) console.log(chalk.green(`✔ ${test.fullTitle()}`));
  }

  /**
   * @param {Mocha.Test} test
   * @param {{ message: any; }} error
   */
  fail(test, error) {
    if (REPORT_TO_STDIO) console.log(chalk.red(`⨯ ${test.fullTitle()} -- ${error.message}`));
    Reflect.set(test, 'error', error);
  }

  /**
   * @param {Mocha.Test} test
   */
  pending(test) {
    if (REPORT_TO_STDIO) console.log(chalk.cyan(`↬ ${test.fullTitle()}`));
    Reflect.set(test, 'skipped', true);
  }
}

module.exports = MongoDBMochaReporter;

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
function outputToXML(output) {
  function cdata(str) {
    return `<![CDATA[${str.split(ANSI_ESCAPE_REGEX).join('').split(']]>').join('\\]\\]\\>')}]]>`;
  }

  function makeTag(name, attributes, selfClose, content) {
    const attributesString = Object.entries(attributes || {})
      .map(([k, v]) => `${k}="${String(v).split('"').join("'")}"`)
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
