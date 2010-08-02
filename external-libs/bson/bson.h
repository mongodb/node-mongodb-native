// #ifndef BSON_H_
// #define BSON_H_

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
    static Handle<Value> deserialize(char *data, uint32_t length, bool is_array_item);

    static char* extract_string(char *data, uint32_t offset);

    static int deserialize_sint8(char *data, uint32_t offset);
    static int deserialize_sint16(char *data, uint32_t offset);
    static long deserialize_sint32(char *data, uint32_t offset);
    static uint16_t deserialize_int8(char *data, uint32_t offset);
    static uint32_t deserialize_int32(char* data, uint32_t offset);
};

class Long : public ObjectWrap {  
  public:
    int32_t low_bits;
    int32_t high_bits;

    Long(int32_t low_bits, int32_t high_bits);
    ~Long();
    
    bool isZero();
    bool isNegative();
    bool equals(Long *other);
    Long *div(Long *other);
    Long *subtract(Long *other);
    Long *negate();
    Long *multiply(Long *other);
    Long *add(Long *other);
    Long *not_();
    bool isOdd();
    bool greaterThanOrEqual(Long *other);
    bool greaterThan(Long *other);
    double toNumber();
    int32_t toInt();
    int64_t compare(Long *other);
    int64_t getLowBitsUnsigned();

    static Long *fromInt(int64_t value);
    static Long *fromBits(int32_t low_bits, int32_t high_bits);
    static Long *fromNumber(int64_t value);
    
    static void Initialize(Handle<Object> target);    
    static Handle<Value> FromNumber(const Arguments &args);
    static Handle<Value> ToString(const Arguments &args);
    static Handle<Value> IsZero(const Arguments &args);
    
  private:

    static Persistent<FunctionTemplate> constructor_template;

    static Handle<Value> New(const Arguments &args);
};