'use strict';

const fs = require('fs');
const setupDatabase = require('./shared').setupDatabase;
const chai = require('chai');
const expect = chai.expect;
const MongoClient = require('../..').MongoClient;
const EJSON = require('mongodb-extjson');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

const testLogFile = process.cwd() + '/apm_test_log';

function removeTestLogs() {
  fs
    .readdirSync(process.cwd())
    .filter(x => x.indexOf('apm_test_log') !== -1)
    .forEach(file => {
      fs.unlinkSync(file);
    });
}

function getFileData(file) {
  return file
    .trim()
    .split('\n')
    .reduce(
      (accumulator, current) => {
        // split on spaces, unless spaces inside quotes (happens in stringified JSON)
        // https://stackoverflow.com/questions/16261635
        const split = current.match(/(?:[^\s"]+|"[^"]*")+/g);
        const type = split[1].toLowerCase();
        const entry = {
          timestamp: split[0],
          name: split[2],
          obj: EJSON.parse(split[3])
        };

        accumulator[type].push(entry);
        accumulator.numLines += 1;
        return accumulator;
      },
      { numLines: 0, command: [], sdam: [] }
    );
}

function runTestClient(context, urlOptions, closeCb) {
  const configuration = context.configuration;
  const url = configuration.url() + urlOptions;
  const client = new MongoClient(url, { w: 1, useNewUrlParser: true });

  client.connect(function(err) {
    expect(err).to.be.null;
    client.close(err => {
      setTimeout(() => {
        closeCb(err);
      }, 10);
    });
  });
}

describe('APM Logging', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  after(function() {
    removeTestLogs();
  });

  it('should only log sdam events if specified', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(6);
      expect(data.command).to.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=sdam&monitorOut=apm_test_log', cb);
  });

  it('should only log command events if specified', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(2);
      expect(data.sdam).to.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=apm_test_log', cb);
  });

  it('should log to stdout if specified', function(done) {
    const spy = sinon.spy(process.stdout, 'write');
    const cb = err => {
      expect(spy).to.have.been.calledTwice;
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=stdout', cb);
  });

  it('should log to stderr if specified', function(done) {
    const spy = sinon.spy(process.stderr, 'write');
    const cb = err => {
      expect(spy).to.have.been.calledTwice;
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=stderr', cb);
  });
});
