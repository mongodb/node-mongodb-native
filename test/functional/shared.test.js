'use strict';
const withMonitoredClient = require('./shared').withMonitoredClient;
const expect = require('chai').expect;

describe('shared test utilities', function () {
  context('withMonitoredClient', function () {
    it('should throw if arrow function', function () {
      expect(() => {
        withMonitoredClient(['find'], () => {});
      }).to.throw();
    });

    it('should not throw if function', function () {
      expect(() => {
        function example() {}
        withMonitoredClient(['find'], example);
      }).to.not.throw();
    });

    it('should call done and close connection with callback', function (done) {
      var e = [];
      const fakeDone = () => {
        expect(e.length).to.equal(1);
        done();
      };
      const encapsulatedTest = withMonitoredClient(['find'], function (client, events, innerDone) {
        e = events;
        client
          .db('integration_test')
          .collection('test')
          .find({})
          .toArray(() => {
            return innerDone();
          });
      }).bind(this);
      encapsulatedTest().then(fakeDone);
    });

    it('should propagate passed error to done', function (done) {
      var e = [];
      const fakeDone = err => {
        expect(err).to.be.instanceOf(Error);
        expect(e.length).to.equal(1);
        done();
      };
      const encapsulatedTest = withMonitoredClient(['find'], function (client, events, innerDone) {
        e = events;
        client
          .db('integration_test')
          .collection('test')
          .find({})
          .toArray(() => {
            return innerDone(new Error('hello world'));
          });
      }).bind(this);
      encapsulatedTest().catch(fakeDone);
    });

    it('should call done and close connection with promise', function (done) {
      var e = [];
      const fakeDone = () => {
        expect(e.length).to.equal(1);
        done();
      };
      const encapsulatedTest = withMonitoredClient(['find'], function (client, events, innerDone) {
        e = events;
        client
          .db('integration_test')
          .collection('test')
          .find({})
          .toArray()
          .then(() => {
            return innerDone();
          });
      }).bind(this);
      encapsulatedTest().then(fakeDone);
    });

    it('should propagate passed error to done from promise', function (done) {
      var e = [];
      const fakeDone = err => {
        expect(err).to.be.instanceOf(Error);
        expect(e.length).to.equal(1);
        done();
      };
      const encapsulatedTest = withMonitoredClient(['find'], function (client, events, innerDone) {
        e = events;
        client
          .db('integration_test')
          .collection('test')
          .find({})
          .toArray()
          .then(() => {
            return innerDone(new Error('hello world'));
          });
      }).bind(this);
      encapsulatedTest().catch(fakeDone);
    });
  });
});
