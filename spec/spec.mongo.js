//
//  Tests for BSON protocol, modeled after test_bson.rb
//
describe 'BSON'
  before_each
  end
  
  describe 'BSON'
    it 'Should Correctly connect to Mongo DB'
      require('jspec.timers')
      //     
      // var mongo = new Mongo('127.0.0.1', 27017)
      // mongo.connect()
      // tick(5000)
      // mongo.disconnect()
      // require('jspec.timers')
      // get('pants', function() {
      //   setTimeout(function() {
      //     halt('asynchronous thing done')
      //   }, 50)
      // })
      // var response = get('pants')
      // response.body.should.be_null

      setTimeout(function() {
        var mongo = new Mongo('127.0.0.1', 27017)
        mongo.connect()
      }, 50)

  
      tick(50)
      // response.body.should.eql 'asynchronous thing done'
      // response.status.should.eql 200
      // response.headers['content-type'].should.eql 'text/html'

    end  
  end
end