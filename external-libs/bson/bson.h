#ifndef BSON_H_
#define BSON_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class BSON : public EventEmitter {
  public:    
    BSON() : EventEmitter() {}
    ~BSON() {}
    
    static void Initialize(Handle<Object> target);
    static Handle<Value> BSONSerialize(const Arguments &args);
    static Handle<Value> BSONDeserialize(const Arguments &args);
  
  private:
    static Handle<Value> New(const Arguments &args);
    static Handle<Value> deserialize(char *data, bool is_array_item);

    static char* extract_string(char *data, uint32_t offset);
    static const char* ToCString(const v8::String::Utf8Value& value);

    static int deserialize_sint8(char *data, uint32_t offset);
    static int deserialize_sint16(char *data, uint32_t offset);
    static long deserialize_sint32(char *data, uint32_t offset);
    static uint16_t deserialize_int8(char *data, uint32_t offset);
    static uint32_t deserialize_int32(char* data, uint32_t offset);
    
    // Decode function
    static Handle<Value> decodeLong(int64_t value);
    static Handle<Value> decodeOid(char *oid);
    static Handle<Value> decodeBinary(uint32_t sub_type, char *data);
    static Handle<Value> decodeCode(char *code, Handle<Value> scope);
};

#endif  // BSON_H_