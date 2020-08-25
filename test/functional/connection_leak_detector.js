'use strict';

// Disabled for now b/c it conflicts with session leak tests

// before(function() {
//   this.client = this.configuration.newClient({}, { poolSize: 1 });

//   return Promise.resolve()
//     .then(() => this.client.connect())
//     .then(() => {
//       this.adminDb = this.client.db(this.configuration.db).admin();
//       return this.adminDb.serverStatus();
//     })
//     .then(serverStatus => {
//       this._currentConnections = serverStatus.connections.current;
//       this._connectionChangedTests = [];
//     });
// });

// beforeEach(function() {
//   return Promise.resolve()
//     .then(() => this.adminDb.serverStatus())
//     .then(serverStatus => {
//       this._currentConnections = serverStatus.connections.current;
//     });
// });

// afterEach(function() {
//   return Promise.resolve()
//     .then(() => this.adminDb.serverStatus())
//     .then(serverStatus => {
//       const currentConnections = serverStatus.connections.current;
//       if (this._currentConnections !== currentConnections) {
//         console.log('connections: ', this._currentConnections, '-->', currentConnections);
//         this._connectionChangedTests.push({
//           test: this.currentTest,
//           previous: this._currentConnections,
//           current: currentConnections
//         });
//       }

//       this._currentConnections = currentConnections;
//     });
// });

// after(function() {
//   return this.client.close().then(() => {
//     if (this._connectionChangedTests.length) {
//       console.group('The following tests had unstable connection counts:');
//       console.log('| previous | current | name |');
//       console.log('| -------- | ---- | ---- |');
//       this._connectionChangedTests.forEach(({ test, previous, current }) => {
//         const name = test.fullTitle();
//         previous = previous.toString(10).padStart(8);
//         current = current.toString(10).padStart(4);
//         console.log(`| ${previous} | ${current} | ${name} |`);
//       });
//       console.groupEnd();
//     }
//   });
// });
