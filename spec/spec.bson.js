//
//  Tests for BSON protocol, modeled after test_bson.rb
//
describe 'BSON'
  before_each
  end
  
  describe 'BSON'
    it 'Should Correctly Deserialize object'
      var bytes = [95,0,0,0,2,110,115,0,42,0,0,0,105,110,116,101,103,114,97,116,105,111,110,95,116,101,115,116,115,95,46,116,101,115,116,95,105,110,100,101,120,95,105,110,102,111,114,109,97,116,105,111,110,0,8,117,110,105,113,117,101,0,0,3,107,101,121,0,12,0,0,0,16,97,0,1,0,0,0,0,2,110,97,109,101,0,4,0,0,0,97,95,49,0,0];
      var serialized_data = '';
      var parser = new BinaryParser();
      // Convert to chars
      for(var i = 0; i < bytes.length; i++) {
        serialized_data = serialized_data + BinaryParser.fromByte(bytes[i]);
      }
      var object = new BSON().deserialize(serialized_data);
      object.get('name').should.eql "a_1"
      object.get('unique').should.eql false
      object.get('key').get('a').should.eql 1
    end
        
    it 'Should Correctly Deserialize object with all types'
      var bytes = [26,1,0,0,7,95,105,100,0,161,190,98,75,118,169,3,0,0,3,0,0,4,97,114,114,97,121,0,26,0,0,0,16,48,0,1,0,0,0,16,49,0,2,0,0,0,16,50,0,3,0,0,0,0,2,115,116,114,105,110,103,0,6,0,0,0,104,101,108,108,111,0,3,104,97,115,104,0,19,0,0,0,16,97,0,1,0,0,0,16,98,0,2,0,0,0,0,9,100,97,116,101,0,161,190,98,75,0,0,0,0,7,111,105,100,0,161,190,98,75,90,217,18,0,0,1,0,0,5,98,105,110,97,114,121,0,7,0,0,0,2,3,0,0,0,49,50,51,16,105,110,116,0,42,0,0,0,1,102,108,111,97,116,0,223,224,11,147,169,170,64,64,11,114,101,103,101,120,112,0,102,111,111,98,97,114,0,105,0,8,98,111,111,108,101,97,110,0,1,15,119,104,101,114,101,0,25,0,0,0,12,0,0,0,116,104,105,115,46,120,32,61,61,32,51,0,5,0,0,0,0,3,100,98,114,101,102,0,37,0,0,0,2,36,114,101,102,0,5,0,0,0,116,101,115,116,0,7,36,105,100,0,161,190,98,75,2,180,1,0,0,2,0,0,0,10,110,117,108,108,0,0]
      var serialized_data = ''
      var parser = new BinaryParser()
      // Convert to chars
      for(var i = 0; i < bytes.length; i++) {
        serialized_data = serialized_data + BinaryParser.fromByte(bytes[i])
      }
      var object = new BSON().deserialize(serialized_data)
      object.get('string').should.eql "hello"
      object.get('array').should.eql [1,2,3]
      object.get('hash').get('a').should.eql 1
      object.get('hash').get('b').should.eql 2
      object.get('date').should.not.be_null
      object.get('oid').should.not.be_null()
      object.get('binary').should.not.be_null()
      object.get('int').should.eql 42
      object.get('float').should.eql 33.3333
      object.get('regexp').should.not.be_null()
      object.get('boolean').should.eql true
      object.get('where').should.not.be_null()
      object.get('dbref').should.not.be_null()
      object.get('null').should.be_null()
    end
      
    it 'Should Serialize and Deserialze String'
      var test_string = {hello: 'world'}
      var serialized_data = new BSON().serialize(test_string)
      test_string.should.eql new BSON().deserialize(serialized_data).unorderedHash()
    end
    
    it 'Should Correctly Serialize and Deserialize Integer'
      var test_number = {doc: 5}
      var serialized_data = new BSON().serialize(test_number)
      test_number.doc.should.eql new BSON().deserialize(serialized_data).get('doc')
    end    
    
    it 'Should Correctly Serialize and Deserialize null value'
      var test_null = {doc:null}
      var serialized_data = new BSON().serialize(test_null)
      var object = new BSON().deserialize(serialized_data)
      object.get('doc').should.be_null
    end
    
    it 'Should Correctly Serialize and Deserialize Number'
      var test_number = {doc: 5.5}
      var serialized_data = new BSON().serialize(test_number)
      test_number.should.eql new BSON().deserialize(serialized_data).unorderedHash()
    end
    
    it 'Should Correctly Serialize and Deserialize Integer'
      var test_int = {doc: 42}
      var serialized_data = new BSON().serialize(test_int)
      test_int.doc.should.eql new BSON().deserialize(serialized_data).get('doc')
    
      test_int = {doc: -5600}
      serialized_data = new BSON().serialize(test_int)
      test_int.doc.should.eql new BSON().deserialize(serialized_data).get('doc')
    
      test_int = {doc: 2147483647}
      serialized_data = new BSON().serialize(test_int)
      test_int.doc.should.eql new BSON().deserialize(serialized_data).get('doc')
          
      test_int = {doc: -2147483648}
      serialized_data = new BSON().serialize(test_int)
      test_int.doc.should.eql new BSON().deserialize(serialized_data).get('doc')
    end
    
    it 'Should Correctly Serialize and Deserialize Object'
      var doc = {doc: {age: 42, name: 'Spongebob', shoe_size: 9.5}}
      var serialized_data = new BSON().serialize(doc)
      doc.doc.age.should.eql new BSON().deserialize(serialized_data).get('doc').get('age')
      doc.doc.name.should.eql new BSON().deserialize(serialized_data).get('doc').get('name')
      doc.doc.shoe_size.should.eql new BSON().deserialize(serialized_data).get('doc').get('shoe_size')
    end
    
    it 'Should Correctly Serialize and Deserialize Array'
      var doc = {doc: [1, 2, 'a', 'b']}
      var serialized_data = new BSON().serialize(doc)
      doc.doc.should.eql [1, 2, 'a', 'b']
    end   
    
    it 'Should Correctly Serialize and Deserialize A Boolean'
      var doc = {doc: true}
      var serialized_data = new BSON().serialize(doc)
      doc.should.eql new BSON().deserialize(serialized_data).unorderedHash()
    end
    
    it 'Should Correctly Serialize and Deserialize a Date'
      var date = new Date()
      //(2009, 11, 12, 12, 00, 30)
      date.setUTCDate(12)
      date.setUTCFullYear(2009)
      date.setUTCMonth(11 - 1)
      date.setUTCHours(12)
      date.setUTCMinutes(0)
      date.setUTCSeconds(30)
      var doc = {doc: date}
      var serialized_data = new BSON().serialize(doc)
      doc.date.should.eql new BSON().deserialize(serialized_data).unorderedHash().date      
    end    
        
    it 'Should Correctly Serialize and Deserialize Oid'
      var doc = {doc: new ObjectID()}
      var serialized_data = new BSON().serialize(doc)
      doc.should.eql new BSON().deserialize(serialized_data).unorderedHash()
    end    
        
    it 'Should Correctly encode Empty Hash'
      var test_code = {}
      var serialized_data = new BSON().serialize(test_code)
      test_code.should.eql new BSON().deserialize(serialized_data).unorderedHash()
    end        
    
    it 'Should Correctly Serialize and Deserialize Ordered Hash'
      var doc = {doc: new OrderedHash().add('b', 1).add('a', 2).add('c', 3).add('d', 4)};
      var serialized_data = new BSON().serialize(doc)
      var decoded_hash = new BSON().deserialize(serialized_data).get('doc')
      decoded_hash.keys().should.eql ['b', 'a', 'c', 'd']
    end
    
    it 'Should Correctly Serialize and Deserialize Regular Expression'
      // Serialize the regular expression
      var doc = {doc: /foobar/mi}
      var serialized_data = new BSON().serialize(doc)
      var doc2 = new BSON().deserialize(serialized_data).unorderedHash()
      doc.should.eql doc2         
      doc.doc.toString().should.eql doc2.doc.toString()
    end
    
    it 'Should Correctly Serialize and Deserialize a Binary object'
      var bin = new Binary()
      var string = 'binstring'
      for(var index = 0; index < string.length; index++) {
        bin.put(string.charAt(index))
      }
      var doc = {doc: bin}
      var serialized_data = new BSON().serialize(doc)
      var deserialized_data = new BSON().deserialize(serialized_data)
      doc.doc.value().should.eql deserialized_data.get('doc').value()
    end
    
    it "Should Correctly Serialize and Deserialize DBRef"
      var oid = new ObjectID()
      var doc = {}
      doc['dbref'] = new DBRef('namespace', oid, null)      
      var serialized_data = new BSON().serialize(doc)
      var doc2 = new BSON().deserialize(serialized_data)
      doc2.get('dbref').should.be_an_instance_of DBRef
      doc2.get('dbref').namespace.should.eql 'namespace'
      doc2.get('dbref').oid.should.eql oid
    end
    
    it 'Should Correctly Serialize and Deserialize Long Integer'
      var test_int = {doc: Long.fromNumber(9223372036854775807)}
      var serialized_data = new BSON().serialize(test_int)
      var deserialized_data = new BSON().deserialize(serialized_data).unorderedHash()
      test_int.should.eql deserialized_data
      
      test_int = {doc: Long.fromNumber(-9223372036854775)}
      serialized_data = new BSON().serialize(test_int)
      deserialized_data = new BSON().deserialize(serialized_data).unorderedHash()
      test_int.doc.should.eql deserialized_data.doc
      
      test_int = {doc: Long.fromNumber(-9223372036854775809)}
      serialized_data = new BSON().serialize(test_int)
      deserialized_data = new BSON().deserialize(serialized_data).unorderedHash()
      test_int.doc.should.eql deserialized_data.doc      
    end
    
    it 'Should Always put the id as the first item in a hash'
      var hash = {doc: new OrderedHash().add('not_id', 1).add('_id', 2)}
      var serialized_data = new BSON().serialize(hash)
      var deserialized_data = new BSON().deserialize(serialized_data)
      
      deserialized_data.get('doc').keys()[0].should.eql '_id'      
    end
    
    it 'Should Correctly Serialize and Deserialize a User defined Binary object'
      var bin = new Binary()
      bin.sub_type = BSON.BSON_BINARY_SUBTYPE_USER_DEFINED
      var string = 'binstring'
      for(var index = 0; index < string.length; index++) {
        bin.put(string.charAt(index))
      }
      var doc = {doc: bin}
      var serialized_data = new BSON().serialize(doc)
      var deserialized_data = new BSON().deserialize(serialized_data)
      deserialized_data.get('doc').sub_type.should.eql BSON.BSON_BINARY_SUBTYPE_USER_DEFINED
      doc.doc.value().should.eql deserialized_data.get('doc').value()
    end
    
    it 'Should Correclty Serialize and Deserialize a Code object' 
      var doc = {'doc': new Code('this.a > i', new OrderedHash().add('i', 1))};
      var serialized_data = new BSON().serialize(doc)
      var deserialized_data = new BSON().deserialize(serialized_data)
      deserialized_data.get('doc').code.should.eql(doc.doc.code);
      deserialized_data.get('doc').scope.get('i').should.eql(doc.doc.scope.get('i'));
    end
  end
end















