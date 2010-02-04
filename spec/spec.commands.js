//
//  Tests for Mongo Commands
//
describe 'Mongo Commands'
  before_each
  end
  
  describe 'Insert Command'
    it 'Should Correctly Generate an Insert Command'      
      var full_collection_name = "db.users";
      var insert_command = new InsertCommand(full_collection_name);
      insert_command.add({name: 'peter pan'})
      insert_command.add({name: 'monkey king'})
      // assert the length of the binary
      insert_command.toBinary().length.should.eql 81
    end  
  end
  
  describe 'Update Command'
    it 'Should Correctly Generate an Update Command'
      var full_collection_name = "db.users";
      var flags = UpdateCommand.DB_UPSERT;
      var selector = {name: 'peter pan'};
      var document = {name: 'peter pan junior'};
      // Create the command
      var update_command = new UpdateCommand(full_collection_name, selector, document, flags);
      // assert the length of the binary
      update_command.toBinary().length.should.eql 90
    end
  end
  
  describe 'Delete Command'
    it 'Should Correctly Generate a Delete Command'
      var full_collection_name = "db.users";      
      var selector = {name: 'peter pan'};
      // Create the command
      var delete_command = new DeleteCommand(full_collection_name, selector);
      // assert the length of the binary
      delete_command.toBinary().length.should.eql 58
    end
  end
  
  describe 'Get More Command'
    it 'Should Correctly Generate a Get More Command'
      var full_collection_name = "db.users";    
      var numberToReturn = 100;
      var cursorId = Long.fromNumber(10000222);
      // Create the command
      var get_more_command = new GetMoreCommand(full_collection_name, numberToReturn, cursorId);
      // assert the length of the binary
      get_more_command.toBinary().length.should.eql 41      
    end
  end
  
  describe 'Kill Cursors Command'
    it 'Should Correctly Generate a Kill Cursors Command'
      Array.prototype.toXml = function() {}    
      var cursorIds = [Long.fromNumber(1), Long.fromNumber(10000222)];
      // Create the command
      var kill_cursor_command = new KillCursorCommand(cursorIds);
      // assert the length of the binary
      kill_cursor_command.toBinary().length.should.eql 40
    end
  end
  
  describe 'Query Command'
    it 'Should Correctly Generate a Query Command'
      var full_collection_name = "db.users";
      var options = QueryCommand.OPTS_SLAVE;
      var numberToSkip = 100;
      var numberToReturn = 200;
      var query = {name:'peter pan'};
      var query_command = new QueryCommand(full_collection_name, options, numberToSkip, numberToReturn, query, null);
      // assert the length of the binary
      query_command.toBinary().length.should.eql 62
      // Generate command with return field filter
      query_command = new QueryCommand(full_collection_name, options, numberToSkip, numberToReturn, query, { a : 1, b : 1, c : 1});
      query_command.toBinary().length.should.eql 88
    end
  end
  
  describe 'Reply Response'
    it 'Should Correctly Generate and parse a Reply Object'
      var reply_message = BinaryParser.fromInt(0) + BSON.encodeLong(Long.fromNumber(1222)) + BinaryParser.fromInt(100) + BinaryParser.fromInt(2);
      reply_message = reply_message + BSON.serialize({name:'peter pan'}) + BSON.serialize({name:'captain hook'});
      var message = BinaryParser.fromInt(reply_message.length + 4*4) + BinaryParser.fromInt(2) + BinaryParser.fromInt(1) + BinaryParser.fromInt(BaseCommand.OP_QUERY) + reply_message;
      // Parse the message into a proper reply object
      var mongo_reply = new MongoReply(message);
      mongo_reply.requestId.should.eql 2
      mongo_reply.responseTo.should.eql 1
      mongo_reply.responseFlag.should.eql 0
      mongo_reply.cursorId.should.eql Long.fromNumber(1222)
      mongo_reply.startingFrom.should.eql 100
      mongo_reply.numberReturned.should.eql 2
      mongo_reply.documents.length.should.eql 2
      mongo_reply.documents[0].unorderedHash().should.eql {name:'peter pan'}
      mongo_reply.documents[1].unorderedHash().should.eql {name:'captain hook'}
    end
  end
end