/**
 * Created by jorgecuesta on 4/5/16.
 */
var MongoClient = require('./').MongoClient,
    test = require('assert'),
    async = require('async');

MongoClient.connect('mongodb://localhost:27017/sys_test', function (err, db) {
    var connection = this;

    // try to authenticate with same connection using adminDb different users created
    // on previous steps.
    async.parallel([
        function tenantA(done) {
            // Use the admin database for the operation
            var adminDb = db.admin();

            // Authenticate using the newly added user
            adminDb.authenticate('tenantA', 'RandomPasswordForTenant').then(function onAuthSuccess(valid) {
                test.ok(valid);
                done(null, valid);
            }).catch(function onAuthError(error) {
                done(error);
            });
        },
        function tenantB(done) {
            // Use the admin database for the operation
            var adminDb = db.admin();

            // Authenticate using the newly added user
            adminDb.authenticate('tenantB', 'RandomPasswordForTenant').then(function onAuthSuccess(valid) {
                test.ok(valid);
                done(null, valid);
            }).catch(function onAuthError(error) {
                done(error);
            });
        }
    ], function(errors, results) {
      console.log("--------------")
      console.dir(errors)
      console.dir(results)
      db.close();
    });

    // async.auto({
    //     a: function (done) {
    //         console.log("------------------------------- a: 0")
    //         // Add a user to the database
    //         db.admin().addUser('tenantA', 'RandomPasswordForTenant', {
    //             // here I apply a custom role to only access some collections
    //             // for test reason that is not important because can't authenticate user.
    //             roles: [{db: "sys_test", role: "dbOwner"}]
    //         }).then(function onAddUserSuccess(results) {
    //             console.log("------------------------------- a: 1")
    //             console.dir(results)
    //             done(null, results[0]);
    //         }).catch(function onAddUserError(error) {
    //             console.log("------------------------------- a: 2")
    //             console.dir(error)
    //             if (error.code === 11000) {
    //                 // user already exists.
    //                 return done(null, {
    //                     user: 'tenantA',
    //                     pwd: ''
    //                 });
    //             }
    //
    //             done(error);
    //         });
    //     },
    //     b: ['a', function (results, done) {
    //         console.log("------------------------------- b: 0")
    //         // Add a user to the database
    //         db.admin().addUser('tenantB', 'RandomPasswordForTenant', {
    //             // here I apply a custom role to only access some collections
    //             // for test reason that is not important because can't authenticate user.
    //             roles: [{db: "sys_test", role: "dbOwner"}]
    //         }).then(function onAddUserSuccess(results) {
    //             console.log("------------------------------- b: 1")
    //             console.dir(results)
    //             done(null, results[0]);
    //         }).catch(function onAddUserError(error) {
    //             console.log("------------------------------- b: 2")
    //             if (error.code === 11000) {
    //                 // user already exists.
    //                 return done(null, {
    //                     user: 'tenantB',
    //                     pwd: ''
    //                 });
    //             }
    //
    //             done(error);
    //         })
    //     }],
    //     test: ['b', function (results, done) {
    //         // try to authenticate with same connection using adminDb different users created
    //         // on previous steps.
    //         async.parallel([
    //             function tenantA(done) {
    //                 // Use the admin database for the operation
    //                 var adminDb = db.admin();
    //
    //                 // Authenticate using the newly added user
    //                 adminDb.authenticate('tenantA', 'RandomPasswordForTenant').then(function onAuthSuccess(valid) {
    //                     test.ok(valid);
    //                     done(null, valid);
    //                 }).catch(function onAuthError(error) {
    //                     done(error);
    //                 });
    //             },
    //             function tenantB(done) {
    //                 // Use the admin database for the operation
    //                 var adminDb = db.admin();
    //
    //                 // Authenticate using the newly added user
    //                 adminDb.authenticate('tenantB', 'RandomPasswordForTenant').then(function onAuthSuccess(valid) {
    //                     test.ok(valid);
    //                     done(null, valid);
    //                 }).catch(function onAuthError(error) {
    //                     done(error);
    //                 });
    //             }
    //         ], done);
    //     }]
    // }, function (error, results) {
    //     if (error) {
    //         console.error(error);
    //         return process.exit(1);
    //     }
    //
    //     if (results)console.info(results);
    //     process.exit(0);
    // });
})
;
