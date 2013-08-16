/**
 * @ignore
 */
exports.shouldCorrectlyLogContent = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var loggedOutput = false;
    var logger = {
      doDebug:true,
      doError:true,
      doLog:true,
      
      error:function(message, object) {},       
      log:function(message, object) {}, 
      
      debug:function(message, object) {
        loggedOutput = true;
      }
    }
        
    var automatic_connect_client = configuration.newDbInstance({w:0, retryMiliSeconds:50, logger:logger}, {poolSize:1});
    automatic_connect_client.open(function(err, automatic_connect_client) {
      automatic_connect_client.close();
      test.equal(true, loggedOutput);
      test.done();
    });    
  }
}