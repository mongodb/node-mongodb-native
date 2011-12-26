#ifndef BSON_H_
#define BSON_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class BSON : public ObjectWrap {
  public:    
    BSON() : ObjectWrap() {}
    ~BSON() {}
    
    static void Initialize(Handle<Object> target);
    static Handle<Value> BSONSerialize(const Arguments &args);
    static Handle<Value> BSONDeserialize(const Arguments &args);
    static Handle<Value> BSONDeserializeStream(const Arguments &args);

    // JS based objects
    static Handle<Value> BSONSerializeJS(const Arguments &args);
    static Handle<Value> BSONDeserializeJS(const Arguments &args);

    // Encode functions
    static Handle<Value> EncodeLong(const Arguments &args);
    static Handle<Value> ToLong(const Arguments &args);
    static Handle<Value> ToInt(const Arguments &args);
  
    // Calculate size of function
    static Handle<Value> CalculateObjectSize(const Arguments &args);
    static Handle<Value> CalculateObjectSizeJS(const Arguments &args);
    static Handle<Value> SerializeWithBufferAndIndex(const Arguments &args);

  	// Experimental
    static Handle<Value> CalculateObjectSize2(const Arguments &args);
    static Handle<Value> BSONSerialize2(const Arguments &args);

    // Constructor used for creating new BSON objects from C++
    static Persistent<FunctionTemplate> constructor_template;

  private:
    static Handle<Value> New(const Arguments &args);
    static Handle<Value> deserialize(char *data, uint32_t startIndex, bool is_array_item);
    static Handle<Value> deserializeJS(BSON *bson, char *data, uint32_t startIndex, bool is_array_item);
    static uint32_t serialize(char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value, bool check_key, bool serializeFunctions);
    static uint32_t serializeJS(BSON *bson, char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value, bool check_key, bool serializeFunctions);

    static char* extract_string(char *data, uint32_t offset);
    static const char* ToCString(const v8::String::Utf8Value& value);
    static uint32_t calculate_object_size(Handle<Value> object, bool serializeFunctions);
    static uint32_t calculate_object_sizeJS(BSON *bson, Handle<Value> object, bool serializeFunctions);

    static void write_int32(char *data, uint32_t value);
    static void write_int64(char *data, int64_t value);
    static void write_double(char *data, double value);
    static int deserialize_sint8(char *data, uint32_t offset);
    static int deserialize_sint16(char *data, uint32_t offset);
    static long deserialize_sint32(char *data, uint32_t offset);
    static uint16_t deserialize_int8(char *data, uint32_t offset);
    static uint32_t deserialize_int32(char* data, uint32_t offset);
    static char *check_key(Local<String> key);
    static char *decode_utf8(char * string, uint32_t length);
     
    // BSON type instantiate functions
    Persistent<Function> longConstructor;
    Persistent<Function> objectIDConstructor;
    Persistent<Function> binaryConstructor;
    Persistent<Function> codeConstructor;
    Persistent<Function> dbrefConstructor;
    Persistent<Function> symbolConstructor;
    Persistent<Function> doubleConstructor;
    Persistent<Function> timestampConstructor;
    Persistent<Function> minKeyConstructor;
    Persistent<Function> maxKeyConstructor;
    
    // Equality Objects
    Persistent<String> longString;
    Persistent<String> objectIDString;
    Persistent<String> binaryString;
    Persistent<String> codeString;
    Persistent<String> dbrefString;
    Persistent<String> symbolString;
    Persistent<String> doubleString;
    Persistent<String> timestampString;
    Persistent<String> minKeyString;
    Persistent<String> maxKeyString;
    
    // Equality speed up comparision objects
    Persistent<String> _bsontypeString;
    Persistent<String> _longLowString;
    Persistent<String> _longHighString;
    Persistent<String> _objectIDidString;
    Persistent<String> _binaryPositionString;
    Persistent<String> _binarySubTypeString;
    Persistent<String> _binaryBufferString;
        
    // Decode function
    static Handle<Value> decodeLong(char *data, uint32_t index);
    static Handle<Value> decodeTimestamp(int64_t value);
    static Handle<Value> decodeOid(char *oid);
    static Handle<Value> decodeBinary(uint32_t sub_type, uint32_t number_of_bytes, char *data);
    static Handle<Value> decodeCode(char *code, Handle<Value> scope);
    static Handle<Value> decodeDBref(Local<Value> ref, Local<Value> oid, Local<Value> db);

    // Decode JS function
    static Handle<Value> decodeLongJS(BSON *bson, char *data, uint32_t index);
    static Handle<Value> decodeTimestampJS(BSON *bson, char *data, uint32_t index);
    static Handle<Value> decodeOidJS(BSON *bson, char *oid);
    static Handle<Value> decodeBinaryJS(BSON *bson, uint32_t sub_type, uint32_t number_of_bytes, char *data);
    static Handle<Value> decodeCodeJS(BSON *bson, char *code, Handle<Value> scope);
    static Handle<Value> decodeDBrefJS(BSON *bson, Local<Value> ref, Local<Value> oid, Local<Value> db);    

		// Experimental
		static uint32_t calculate_object_size2(Handle<Value> object);
    static uint32_t serialize2(char *serialized_object, uint32_t index, Handle<Value> name, Handle<Value> value, uint32_t object_size, bool check_key);    
};

#endif  // BSON_H_
