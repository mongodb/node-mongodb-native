==================
The Node.JS MongoDB Driver API
==================

.. js:function:: $.getJSON(href, callback[, errback])

   :param string href: An URI to the location of the resource.
   :param callback: Get's called with the object.
   :param errback:
       Get's called in case the request fails. And a lot of other
       text so we need multiple lines
   :throws SomeError: For whatever reason in that case.
   :returns: Something
   
  .. code-block:: javascript
   
     var ensureConnection = function(test, numberOfTries, callback) {
       // Replica configuration
       var replSet = new ReplSetServers( [ 
           new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
           new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
           new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
         ], 
         {rs_name:RS.name}
       );

       if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);

       var db = new Db('integration_test_', replSet);
       // Print any errors
       db.on("error", function(err) {
         console.log("============================= ensureConnection caught error")
         console.dir(err)
         if(err != null && err.stack != null) console.log(err.stack)
         db.close();
       })

       // Open the db
       db.open(function(err, p_db) {
         // Close connections
         db.close();    
         // Process result
         if(err != null) {
           // Wait for a sec and retry
           setTimeout(function() {
             numberOfTries = numberOfTries - 1;
             ensureConnection(test, numberOfTries, callback);
           }, 1000);
         } else {
           return callback(null, p_db);
         }    
       })            
     }
