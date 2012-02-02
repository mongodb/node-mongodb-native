var ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager;

var mongo = require('../../lib/mongodb'),
  // website = new mongo.Db('simplereach_website_production', new mongo.Server('localhost', 27017, {auto_reconnect:true, poolSize:5})),
  // adserver = new mongo.Db('adserver', new mongo.Server('localhost', 27017, {auto_reconnect:true, poolSize:5})),
  accounts = [], accountsCollection, contentCollection, count = 0;

RS = new ReplicaSetManager({retries:120, secondary_count:1, passive_count:0, arbiter_count:1});
RS.startSet(true, function(err, result) {      
  // Replica configuration
  var replSet = new mongo.ReplSetServers( [ 
      new mongo.Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new mongo.Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new mongo.Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, read_secondary:true, readPreference:mongo.Server.READ_SECONDARY_ONLY}
  );

  // Replica configuration
  var replSet2 = new mongo.ReplSetServers( [ 
      new mongo.Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new mongo.Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new mongo.Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, read_secondary:true, readPreference:mongo.Server.READ_SECONDARY_ONLY}
  );

  var adserver = new mongo.Db('adserver', replSet);
  var website = new mongo.Db('simplereach_website_production', replSet2);
  
  website.on('error', function(err){
    console.log(err); process.exit(1);
  });

  adserver.on('error', function(err){
    console.log(err); process.exit(1);
  });

  /**
   * loads content for accounts in the array
   */
  function loadContent(){
    var account = accounts.shift();
        fields = ['account_id','avg_ctr','cat','channels','ckw','ctr','published','topics','url', 'updated_at', 'disabled'],
        sort = [['published','desc']],
        criteria = { account_id:account, $or:[ { end_date: null }, { end_date:{ $gte:new Date() }} ]};

    if(account === undefined){
      process.exit(1);
      // no more accounts to process
      // the return here goes into limbo
      return;	
    }
    console.log('GETTING CONTENT');
    contentCollection.find(criteria, {fields:fields, limit:100000, sort:sort}, function(err, cursor){

      cursor.each(function(err, doc) {      
        if(err){ console.log(err); process.exit(1); }
        if(doc === null){
          //once this account is done, load the next
          console.log('FINISHED ACCOUNT', account, 'WITH', count, 'ITEMS');
          count = 0;
          process.nextTick(function() {
            loadContent();                
          })
        } else {
          count += 1;
        }
      });    
    });
  }

  /**
   * loads content for accounts in the array
   */
  function loadContentParallel(account, callback){
    var fields = ['account_id','avg_ctr','cat','channels','ckw','ctr','published','topics','url', 'updated_at', 'disabled'],
        sort = [['published','desc']],
        criteria = { account_id:account, $or:[ { end_date: null }, { end_date:{ $gte:new Date() }} ]};

    if(account === undefined){
      process.exit(1);

      // no more accounts to process
      // the return here goes into limbo
      return;	
    }
    console.log('GETTING CONTENT');
    contentCollection.find(criteria, {fields:fields, limit:100000, sort:sort}, function(err, cursor){        
      cursor.each(function(err, doc) {      
        if(err){ 
          return callback(err, account);
        }

        if(doc === null){
          //once this account is done, load the next
          console.log('FINISHED ACCOUNT', account, 'WITH', count, 'ITEMS');
          count = 0;
          callback(null, account);
        } else {
          count += 1;
        }
      });    
    });
  }

  /**
   * Loads account ids and pushes them onto an array
   **/
  function loadAccountsParallel(){
    accountsCollection.find({active:{$ne:null}}, { fields:{'_id':1, 'a':1}}).toArray(function(err, accounts) {
      // keep track of the number of accounts
      var numberOfFinishedAccount = accounts.length;

      for(var i = 0; i < accounts.length; i++) {
        loadContentParallel(accounts[i].a, function(err, result) {
          numberOfFinishedAccount = numberOfFinishedAccount - 1;

          if(numberOfFinishedAccount == 0) process.exit(0);
        });
      }    
    });
  }

  /**
   * Loads account ids and pushes them onto an array
   **/
  function loadAccounts(){
    accountsCollection.find({active:{$ne:null}}, { fields:{'_id':1, 'a':1}}, function(err, cursor) {
      if(err){ console.log(err); process.exit(1); }
      console.log('GETTING ACCOUNTS');
      cursor.each(function(err, doc){
        if(err){ console.log(err); process.exit(1); }
        if(doc !== null){
          accounts.push(doc.a);        
        } else {
          console.log('FOUND', accounts.length, 'ACCOUNTS');
          loadContent();
        }
      });
    });
  }

  console.log('OPENING CONNECTION TO WEBSITE');
  website.open(function(err, wsClient){
    if(err){console.log(err); process.exit(1); }
    console.log('OPENING CONNECTION TO ADSERVER');
    adserver.open(function(err, asClient){
      if(err){ console.log(err); process.exit(1); }

      // Get collections and remove the content
      accountsCollection = asClient.collection('accounts');
      accountsCollection.remove();

      contentCollection = asClient.collection('content');
      contentCollection.remove();

      // insert a bunch of account docs to trigger flows
      var accountDocs = [];
      for(var i = 0; i < 1000; i++) {
        accountDocs.push({a:i, active:true});
      }

      // insert a bunch of account docs to trigger flows
      var contentDocs = [];
      for(var i = 0; i < 1000; i++) {
        var a_id = Math.floor(Math.random()*1000);
        contentDocs.push({a:1, end_date:null, account_id:a_id});
      }

      // Just insert some test data
      accountsCollection.insert(accountDocs, {safe:{w:2, wtimout:1000}}, function(err, r) {      
        contentCollection.insert(contentDocs, {safe:{w:2, wtimout:1000}}, function(err, r) {      
          // process.exit(0);
          loadAccounts();
          // loadAccountsParallel();
        });
      });
    });
  });  
});

