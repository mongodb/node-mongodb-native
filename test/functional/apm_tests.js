"use strict";

var f = require('util').format;

// exports['Correctly receive the APM events for an insert'] = {
//   metadata: { requires: { topology: ['single'] } },

//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var started = [];
//     var succeeded = [];
//     var failed = [];

//     var listener = require('../..').instrument();
//     listener.on('started', function(event) {
//       if(event.commandName == 'insert')
//         started.push(event);
//     });

//     listener.on('succeeded', function(event) {
//       if(event.commandName == 'insert')
//         succeeded.push(event);
//     });

//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       db.collection('apm_test').insertOne({a:1}).then(function(r) {
//         test.equal(1, r.insertedCount);
//         test.equal(1, started.length);
//         test.equal(1, succeeded.length);

//         db.close();
//         test.done();
//       });
//     });
//   }
// }

// exports['Should correctly instrument driver with callback=true, promise=false, returns=null, static=false'] = {
//   metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var methodsCalled = {};

//     require('../..').instrument(function(err, instrumentations) {
//       instrumentations.forEach(function(obj) {
//         var object = obj.obj;
        
//         // Iterate over all the methods that are just callback with no return
//         obj.instrumentations.forEach(function(instr) {
//           var options = instr.options;

//           if(options.callback 
//             && !options.promise 
//             && !options.returns && !options.static) {

//             // Method name
//             instr.methods.forEach(function(method) {
//               var applyMethod = function(_method) {
//                 var func = object.prototype[_method];
//                 object.prototype[_method] = function() {
//                   if(!methodsCalled[_method]) methodsCalled[_method] = 0;
//                   methodsCalled[_method] = methodsCalled[_method] + 1;
//                   var args = Array.prototype.slice.call(arguments, 0);
//                   func.apply(this, args);                
//                 }                
//               }

//               applyMethod(method);
//             });
//           }
//         });
//       });
//     });

//     var MongoClient = require('../..');
//     MongoClient.connect(configuration.url(), function(err, client) {
//       client.collection('apm1').insertOne({a:1}, function(err, r) {
//         test.equal(null, err);
//         test.equal(1, r.insertedCount);
//         test.equal(1, methodsCalled.insertOne);

//         client.close();
//         test.done();
//       });
//     });
//   }
// }

// exports['Correctly receive the APM events for a find with getmore and killcursor'] = {
//   metadata: { requires: { topology: ['single'] } },

//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var ReadPreference = configuration.require.ReadPreference;
//     var started = [];
//     var succeeded = [];
//     var failed = [];

//     var listener = require('../..').instrument();
//     listener.on('started', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         started.push(event);
//     });

//     listener.on('succeeded', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         succeeded.push(event);
//     });

//     listener.on('failed', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         failed.push(event);
//     });

//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       test.equal(null, err);

//       // Drop the collection
//       db.collection('apm_test_1').drop(function(err, r) {

//         // Insert test documents
//         db.collection('apm_test_1').insertMany([{a:1}, {a:1}, {a:1}, {a:1}, {a:1}, {a:1}]).then(function(r) {
//           test.equal(6, r.insertedCount);

//           db.collection('apm_test_1').find({a:1})
//             .sort({a:1})
//             .project({_id: 1, a:1})
//             .hint({'_id':1})
//             .skip(1)
//             .limit(100)
//             .batchSize(2)
//             .comment('some comment')
//             .maxScan(1000)
//             .maxTimeMS(5000)
//             .setReadPreference(ReadPreference.PRIMARY)
//             .addCursorFlag('noCursorTimeout', true)
//             .toArray().then(function(docs) {
//               // Assert basic documents
//               test.equal(5, docs.length);
//               test.equal(3, started.length);
//               test.equal(3, succeeded.length);
//               test.equal(0, failed.length);

//               // Success messages
//               test.equal(2, succeeded[0].reply.length);
//               test.equal(succeeded[0].operationId, succeeded[1].operationId);
//               test.equal(succeeded[0].operationId, succeeded[2].operationId);
//               test.equal(2, succeeded[1].reply.length);
//               test.equal(1, succeeded[2].reply.length);

//               // Started
//               test.equal(started[0].operationId, started[1].operationId);
//               test.equal(started[0].operationId, started[2].operationId);

//               db.close();
//               test.done();
//           }).catch(function(err) {
//             console.dir(err)
//           });
//         }).catch(function(e) {
//           console.dir(e)
//         });
//       });
//     });
//   }
// }

// exports['Correctly receive the APM failure event for find'] = {
//   metadata: { requires: { topology: ['single'] } },

//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var ReadPreference = configuration.require.ReadPreference;
//     var started = [];
//     var succeeded = [];
//     var failed = [];

//     var listener = require('../..').instrument();
//     listener.on('started', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         started.push(event);
//     });

//     listener.on('succeeded', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         succeeded.push(event);
//     });

//     listener.on('failed', function(event) {
//       if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
//         failed.push(event);
//     });

//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       test.equal(null, err);

//       // Drop the collection
//       db.collection('apm_test_2').drop(function(err, r) {

//         // Insert test documents
//         db.collection('apm_test_2').insertMany([{a:1}, {a:1}, {a:1}, {a:1}, {a:1}, {a:1}]).then(function(r) {
//           test.equal(6, r.insertedCount);

//           db.collection('apm_test_2').find({$illegalfield:1})
//             .project({_id: 1, a:1})
//             .hint({'_id':1})
//             .skip(1)
//             .limit(100)
//             .batchSize(2)
//             .comment('some comment')
//             .maxScan(1000)
//             .maxTimeMS(5000)
//             .setReadPreference(ReadPreference.PRIMARY)
//             .addCursorFlag('noCursorTimeout', true)
//             .toArray().then(function(docs) {
//           }).catch(function(err) {
//             test.equal(1, failed.length);

//             db.close();
//             test.done();
//           });
//         }).catch(function(e) {
//           console.dir(e)
//         });
//       });
//     });
//   }
// }

// exports['Correctly receive the APM events for a bulk operation'] = {
//   metadata: { requires: { topology: ['single'] } },

//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var started = [];
//     var succeeded = [];
//     var failed = [];

//     var listener = require('../..').instrument();
//     listener.on('started', function(event) {
//       // console.log(JSON.stringify(event, null, 2))
//       if(event.commandName == 'insert' || event.commandName == 'update' || event.commandName == 'delete')
//         started.push(event);
//     });

//     listener.on('succeeded', function(event) {
//       if(event.commandName == 'insert' || event.commandName == 'update' || event.commandName == 'delete')
//         succeeded.push(event);
//     });

//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       db.collection('apm_test_3').bulkWrite([
//             { insertOne: { a: 1 } }
//           , { updateOne: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
//           , { deleteOne: { q: {c:1} } }
//         ], {ordered:true}).then(function(r) {
//         test.equal(3, started.length);
//         test.equal(3, succeeded.length);
//         test.equal(started[0].operationId, started[1].operationId);
//         test.equal(started[0].operationId, started[2].operationId);
//         test.equal(succeeded[0].operationId, succeeded[1].operationId);
//         test.equal(succeeded[0].operationId, succeeded[2].operationId);

//         db.close();
//         test.done();
//       }).catch(function(err) {
//         console.dir(err)
//       });
//     });
//   }
// }

// exports['Should correctly instrument driver with all possibilities'] = {
//   metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var methodsCalled = {};

//     require('../..').instrument(function(err, instrumentations) {
//       instrumentations.forEach(function(obj) {
//         var object = obj.obj;
        
//         // Iterate over all the methods that are just callback with no return
//         obj.instrumentations.forEach(function(instr) {
//           var options = instr.options;

//           if(options.callback // Prototype Callback no return value
//             && !options.promise 
//             && options.returns == null && !options.static ) {

//             instr.methods.forEach(function(method) {
//               var applyMethod = function(_method) {
//                 var func = object.prototype[_method];
//                 object.prototype[_method] = function() {
//                   // console.log(f("================ %s:%s callback:%s, promise:%s, returns:%s, static:%s"
//                   //   , obj.name, _method, options.callback
//                   //   , options.promise
//                   //   , options.returns != null
//                   //   , options.static == null ? false : options.static));
//                   if(!methodsCalled[_method]) methodsCalled[_method] = 0;
//                   methodsCalled[_method] = methodsCalled[_method] + 1;

//                   // Set up and handle the callback
//                   var self = this;
//                   var args = Array.prototype.slice.call(arguments, 0);
//                   var callback = args.pop();

//                   // We passed no callback
//                   if(typeof callback != 'function') {
//                     args.push(callback);
//                     return func.apply(this, args);
//                   }
                
//                   // Intercept the method callback
//                   args.push(function() {
//                     var args = Array.prototype.slice.call(arguments, 0);
//                     callback.apply(self, args);
//                   });

//                   // Execute the method
//                   func.apply(this, args);                
//                 }                
//               }

//               applyMethod(method);
//             });

//           } else if(options.callback // Static Callback no return value
//             && !options.promise 
//             && options.returns == null && options.static ) {

//             instr.methods.forEach(function(method) {
//               var applyMethod = function(_method) {
//                 var func = object[_method];
//                 object[_method] = function() {
//                   // console.log(f("================ %s:%s callback:%s, promise:%s, returns:%s, static:%s"
//                   //   , obj.name, _method, options.callback
//                   //   , options.promise
//                   //   , options.returns != null
//                   //   , options.static == null ? false : options.static));
//                   if(!methodsCalled[_method]) methodsCalled[_method] = 0;
//                   methodsCalled[_method] = methodsCalled[_method] + 1;

//                   // Set up and handle the callback
//                   var self = this;
//                   var args = Array.prototype.slice.call(arguments, 0);
//                   var callback = args.pop();

//                   // We passed no callback
//                   if(typeof callback != 'function') {
//                     args.push(callback);
//                     return func.apply(this, args);
//                   }
                
//                   // Intercept the method callback
//                   args.push(function() {
//                     var args = Array.prototype.slice.call(arguments, 0);
//                     callback.apply(self, args);
//                   });

//                   // Execute the method
//                   func.apply(this, args);                
//                 }                
//               }

//               applyMethod(method);
//             });
          
//           } else if(options.callback // Prototype Callback returning non-promise value
//             && !options.promise
//             && options.returns != null && !options.static ){

//             instr.methods.forEach(function(method) {
//               var applyMethod = function(_method) {
//                 var func = object.prototype[_method];
//                 object.prototype[_method] = function() {
//                   // console.log(f("================ %s:%s callback:%s, promise:%s, returns:%s, static:%s"
//                   //   , obj.name, _method, options.callback
//                   //   , options.promise
//                   //   , options.returns != null
//                   //   , options.static == null ? false : options.static));
//                   if(!methodsCalled[_method]) methodsCalled[_method] = 0;
//                   methodsCalled[_method] = methodsCalled[_method] + 1;

//                   // Set up and handle the callback
//                   var self = this;
//                   var args = Array.prototype.slice.call(arguments, 0);
//                   var callback = args.pop();

//                   // We passed no callback
//                   if(typeof callback != 'function') {
//                     args.push(callback);
//                     return func.apply(this, args);
//                   }
                
//                   // Intercept the method callback
//                   args.push(function() {
//                     var args = Array.prototype.slice.call(arguments, 0);
//                     callback.apply(self, args);
//                   });

//                   // Execute the method
//                   func.apply(this, args);                
//                 }                
//               }

//               applyMethod(method);
//             });
          
//           } else if(options.callback // Static Callback returning non-promise value
//             && !options.promise
//             && options.returns != null && options.static ){

//             instr.methods.forEach(function(method) {
//               var applyMethod = function(_method) {
//                 var func = object[_method];
//                 object[_method] = function() {
//                   // console.log(f("================ %s:%s callback:%s, promise:%s, returns:%s, static:%s"
//                   //   , obj.name, _method, options.callback
//                   //   , options.promise
//                   //   , options.returns != null
//                   //   , options.static == null ? false : options.static));
//                   if(!methodsCalled[_method]) methodsCalled[_method] = 0;
//                   methodsCalled[_method] = methodsCalled[_method] + 1;

//                   // Set up and handle the callback
//                   var self = this;
//                   var args = Array.prototype.slice.call(arguments, 0);
//                   var callback = args.pop();

//                   // We passed no callback
//                   if(typeof callback != 'function') {
//                     args.push(callback);
//                     return func.apply(this, args);
//                   }
                
//                   // Intercept the method callback
//                   args.push(function() {
//                     var args = Array.prototype.slice.call(arguments, 0);
//                     callback.apply(self, args);
//                   });

//                   // Execute the method
//                   func.apply(this, args);                
//                 }                
//               }

//               applyMethod(method);
//             });
          
//           // } else if(!options.callback // Prototype method returning a promise
//           //   && options.promise && !options.static ){

//           //   instr.methods.forEach(function(method) {
//           //   });
          
//           // } else if(!options.callback // Static method returning a promise
//           //   && options.promise && options.static ){

//           //   instr.methods.forEach(function(method) {
//           //   });

//           }
//         });
//       });
//     });

//     var MongoClient = require('../..');
//     MongoClient.connect(configuration.url(), function(err, client) {
//       client.collection('apm1').insertOne({a:1}, function(err, r) {
//         // console.log("--------------------------------------------------")
//         test.equal(null, err);
//         test.equal(1, r.insertedCount);
//         test.equal(1, methodsCalled.insertOne);

//         client.close();
//         test.done();
//       });
//     });
//   }
// }
