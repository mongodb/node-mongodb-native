#ifndef LONG_H_
#define LONG_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

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
    int64_t toNumber();
    int32_t toInt();
    int64_t compare(Long *other);
    int64_t getLowBitsUnsigned();
    char *toString(int32_t radix);
    Long *shiftRight(int32_t number_bits);
    Long *shiftLeft(int32_t number_bits);

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

#endif  // LONG_H_