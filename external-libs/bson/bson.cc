#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "bson.h"

using namespace v8;
using namespace node;

// BSON MAX VALUES
const int32_t BSON_INT32_MAX = 2147483648;
const int32_t BSON_INT32_MIN = -2147483648;
const int64_t BSON_INT32_ = pow(2, 32);

const double LN2 = 0.6931471805599453;

// Max Values
const int64_t BSON_INT64_MAX = 9223372036854775807;
const int64_t BSON_INT64_MIN = -(9223372036854775807);

// Constant objects used in calculations
Long* MIN_VALUE = Long::fromBits(0, 0x80000000 | 0);
Long* MAX_VALUE = Long::fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long* ZERO = Long::fromInt(0);
Long* ONE = Long::fromInt(1);
Long* NEG_ONE = Long::fromInt(-1);

// BSON DATA TYPES
const uint32_t BSON_DATA_NUMBER = 1;
const uint32_t BSON_DATA_STRING = 2;
const uint32_t BSON_DATA_OBJECT = 3;
const uint32_t BSON_DATA_ARRAY = 4;
const uint32_t BSON_DATA_BINARY = 5;
const uint32_t BSON_DATA_OID = 7;
const uint32_t BSON_DATA_BOOLEAN = 8;
const uint32_t BSON_DATA_DATE = 9;
const uint32_t BSON_DATA_NULL = 10;
const uint32_t BSON_DATA_REGEXP = 11;
const uint32_t BSON_DATA_CODE_W_SCOPE = 15;
const uint32_t BSON_DATA_INT = 16;
const uint32_t BSON_DATA_TIMESTAMP = 17;
const uint32_t BSON_DATA_LONG = 18;

// BSON BINARY DATA SUBTYPES
const uint32_t BSON_BINARY_SUBTYPE_FUNCTION = 1;
const uint32_t BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
const uint32_t BSON_BINARY_SUBTYPE_UUID = 3;
const uint32_t BSON_BINARY_SUBTYPE_MD5 = 4;
const uint32_t BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

#define max(a,b) ({ typeof (a) _a = (a); typeof (b) _b = (b); _a > _b ? _a : _b; })

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

void BSON::Initialize(v8::Handle<v8::Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  
  // Set up function relationships for the template
  t->Inherit(EventEmitter::constructor_template);
  t->InstanceTemplate()->SetInternalFieldCount(1);
  
  // Map up functions to the object visible to Node
  NODE_SET_PROTOTYPE_METHOD(t, "serialize", BSONSerialize);
  NODE_SET_PROTOTYPE_METHOD(t, "deserialize", BSONDeserialize);
  
  // Create a V8 Class with attached methods from FunctionTemplate
  target->Set(String::NewSymbol("BSON"), t->GetFunction());
}

// Create a new instance of BSON and assing it the existing context
Handle<Value> BSON::New(const Arguments &args) {
  HandleScope scope;
  
  BSON *bson = new BSON();
  bson->Wrap(args.This());
  return args.This();
}

Handle<Value> BSON::BSONSerialize(const Arguments &args) {
  const char* value = "BSONSerialize::Hello world!";
  return String::New(value);
}

Handle<Value> BSON::BSONDeserialize(const Arguments &args) {
   HandleScope scope;
  // Ensure that we have an parameter
  if(Buffer::HasInstance(args[0]) && args.Length() > 1) return VException("One argument required - buffer1.");
  if(args[0]->IsString() && args.Length() != 2) return VException("Two argument required - string and encoding.");
  // Throw an exception if the argument is not of type Buffer
  if(!Buffer::HasInstance(args[0]) && !args[0]->IsString()) return VException("Argument must be a Buffer or String.");
  
  // Define pointer to data
  char *data;
  uint32_t length;      
  
  // If we passed in a buffer, let's unpack it, otherwise let's unpack the string
  if(Buffer::HasInstance(args[0])) {
    Buffer *buffer = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject());
    data = buffer->data();        
    uint32_t length = buffer->length();
  } else {
    // Let's fetch the encoding
    enum encoding enc = ParseEncoding(args[1]);
    // The length of the data for this encoding
    ssize_t len = DecodeBytes(args[0], enc);
    // Let's define the buffer size
    data = new char[len];
    // Write the data to the buffer from the string object
    ssize_t written = DecodeWrite(data, len, args[0], BINARY);
    // Assert that we wrote the same number of bytes as we have length
    assert(written == len);
  }
  
  // Deserialize the content
  return BSON::deserialize(data, length, NULL);
}

// Deserialize the stream
Handle<Value> BSON::deserialize(char *data, uint32_t length, bool is_array_item) {
  HandleScope scope;
  // Holds references to the objects that are going to be returned
  Local<Object> return_data = Object::New();
  Local<Array> return_array = Array::New();      
  // The current index in the char data
  uint32_t index = 0;
  // Decode the size of the BSON data structure
  uint32_t size = BSON::deserialize_int32(data, index);
  // printf("C:: ============================ BSON:SIZE:%d\n", size);            
  // Adjust the index to point to next piece
  index = index + 4;      

  for(int n = 0; n < size; n++) {
    printf("C:: ============ %02x\n",(unsigned char)data[n]);
  }
  
  // for(int n = 0; s_value[n] != '\0'; n++) {
  //   printf("C:: ============ %02x\n",(unsigned char)s_value[n]);                      
  // }
  
  // While we have data left let's decode
  while(index < size) {
    // Read the first to bytes to indicate the type of object we are decoding
    uint16_t type = BSON::deserialize_int8(data, index);
    printf("C:: ============================ BSON:TYPE:%d\n", type);
    // Handles the internal size of the object
    uint32_t insert_index = 0;
    // Adjust index to skip type byte
    index = index + 1;
    
    if(type == BSON_DATA_STRING) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Need to handle arrays here
      // TODO TODO TODO           
      // TODO TODO TODO           
      // TODO TODO TODO           
      
      // Read the length of the string (next 4 bytes)
      uint32_t string_size = BSON::deserialize_int32(data, index);
      // Adjust index to point to start of string
      index = index + 4;
      // Decode the string and add zero terminating value at the end of the string
      char *value = (char *)malloc((string_size * sizeof(char)) + 1);
      strncpy(value, (data + index), string_size);
      *(value + string_size) = '\0';          
      // Adjust the index for the size of the string
      index = index + string_size;
      // Add the value to the data
      if(is_array_item) {
        
      } else {
        return_data->Set(String::New(string_name), String::New(value));
      }
    } else if(type == BSON_DATA_INT) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Need to handle arrays here
      // TODO TODO TODO           
      // TODO TODO TODO           
      // TODO TODO TODO          
      
      // Decode the integer value
      long value = 0;
      memcpy(&value, (data + index), 4);
      // Adjust the index for the size of the value
      index = index + 4;
      // Add the element to the object
      if(is_array_item) {
        
      } else {
        return_data->Set(String::New(string_name), Integer::New(value));
      }          
    } else if(type == BSON_DATA_LONG) {
      // Read the null terminated index String
      char *string_name = BSON::extract_string(data, index);
      if(string_name == NULL) return VException("Invalid C String found.");
      // Let's create a new string
      index = index + strlen(string_name) + 1;
      // Need to handle arrays here
      // TODO TODO TODO           
      // TODO TODO TODO           
      // TODO TODO TODO          
      
      // Decode the integer value
      int64_t value = 0;
      memcpy(&value, (data + index), 8);

      for(int n = 0; n < 8; n++) {
        printf("C:: ============ %02x\n",(unsigned char)data[index  + n]);
      }

      // printf("====================================== value: %lld\n", value);

      // Adjust the index for the size of the value
      index = index + 8;
      
      // printf("====================================== value: %d\n", (data + index));
      // 
      // for(int n = 0; n < 8; n++) {
      //   printf("C:: ============ %02x\n",(int)*(data + index + n));
      // }
      
      // Add the element to the object
      if(is_array_item) {
        
      } else {
        return_data->Set(String::New(string_name), Integer::New(value));
      }
    }        
  }

  // Return the data object to javascript
  if(is_array_item) {
    return scope.Close(return_array);
  } else {
    return scope.Close(return_data);
  }
}

// Search for 0 terminated C string and return the string
char* BSON::extract_string(char *data, uint32_t offset) {
  char *prt = strchr((data + offset), '\0');
  if(prt == NULL) return NULL;
  // Figure out the length of the string
  uint32_t length = (prt - data) - offset;      
  // Allocate memory for the new string
  char *string_name = (char *)malloc((length * sizeof(char)) + 1);
  // Copy the variable into the string_name
  strncpy(string_name, (data + offset), length);
  // Ensure the string is null terminated
  *(string_name + length) = '\0';
  // Return the unpacked string
  return string_name;
}

// Decode a signed byte
int BSON::deserialize_sint8(char *data, uint32_t offset) {
  return (signed char)(*(data + offset));
}

int BSON::deserialize_sint16(char *data, uint32_t offset) {
  return BSON::deserialize_sint8(data, offset) + (BSON::deserialize_sint8(data, offset + 1) << 8);
}

long BSON::deserialize_sint32(char *data, uint32_t offset) {
  return (long)BSON::deserialize_sint8(data, offset) + (BSON::deserialize_sint8(data, offset + 1) << 8) +
    (BSON::deserialize_sint8(data, offset + 2) << 16) + (BSON::deserialize_sint8(data, offset + 3) << 24);
}

// Decode a byte
uint16_t BSON::deserialize_int8(char *data, uint32_t offset) {
  uint16_t value = 0;
  value |= *(data + offset + 0);              
  return value;
}

// Requires a 4 byte char array
uint32_t BSON::deserialize_int32(char* data, uint32_t offset) {
  uint32_t value = 0;
  value |= *(data + offset + 0);        
  value |= *(data + offset + 1) << 8;
  value |= *(data + offset + 2) << 16;
  value |= *(data + offset + 3) << 24;
  return value;
}

// ==========================================================================================
//
//  BSON TYPES
//
// ==========================================================================================
Persistent<FunctionTemplate> Long::constructor_template;

Long::Long(int32_t low_bits, int32_t high_bits) : ObjectWrap() {
  this->low_bits = low_bits;
  this->high_bits = high_bits;
}

Long::~Long() {}

Handle<Value> Long::New(const Arguments &args) {
  HandleScope scope;

  // Ensure that we have an parameter
  if(args.Length() != 2) return VException("One argument required - number.");
  if(!args[0]->IsNumber()) return VException("Argument passed in must be a number.");  

  // Unpack the variable
  int32_t low_bits = args[0]->IntegerValue();
  int32_t high_bits = args[1]->IntegerValue();
  
  // printf("============ low_bits: %d\n", low_bits);
  // printf("============ high_bits: %d\n", high_bits);
  
  // Create an instance of long
  Long *l = new Long(low_bits, high_bits);
  // Wrap it in the object wrap
  l->Wrap(args.This());
  // Return the context
  return args.This();
}

void Long::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Long"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "isZero", IsZero);
  
  // Class methods
  NODE_SET_METHOD(constructor_template->GetFunction(), "fromNumber", FromNumber);
  
  // Add class to scope
  target->Set(String::NewSymbol("Long"), constructor_template->GetFunction());
}

bool Long::isZero() {
  int32_t low_bits = this->low_bits;
  int32_t high_bits = this->high_bits;
  return low_bits == 0 && high_bits == 0;
}

bool Long::isNegative() {
  int32_t low_bits = this->low_bits;
  int32_t high_bits = this->high_bits;
  return high_bits < 0;
}

bool Long::equals(Long *l) {
  int32_t low_bits = this->low_bits;
  int32_t high_bits = this->high_bits;  
  return (high_bits == l->high_bits) && (low_bits == l->low_bits);
}

Handle<Value> Long::IsZero(const Arguments &args) {
  HandleScope scope;      
    
  // Let's unpack the Long instance that contains the number in low_bits and high_bits form
  Long *l = ObjectWrap::Unwrap<Long>(args.This());
  return Boolean::New(l->isZero());
}

int32_t Long::toInt() {
  return this->low_bits;
}

char *Long::toString(int32_t opt_radix) {
  // printf("C:: =================================== ToString\n");
  // printf("C:: ------------------------------------------------- THIS: %lli\n", this->toNumber());
  // Set the radix
  int32_t radix = opt_radix;
  // Check if we have a zero value
  if(this->isZero()) {
    // Allocate a string to return
    char *result = (char *)malloc(1 * sizeof(char) + 1);
    // Set the string to the character 0
    *(result) = '0';
    // Terminate the C String
    *(result + 1) = '\0';
    return result;
  }
  
  // printf("C:: =================================== ToString1\n");
  // If the long is negative we need to perform som arithmetics
  if(this->isNegative()) {
    // printf("C:: =================================== ToString:isNegative\n");
    // Min value object
    Long *minLong = new Long(0, 0x80000000 | 0);
    
    if(this->equals(minLong)) {
      // printf("C:: =================================== ToString:div_results: START0\n");
      // We need to change the exports.Long value before it can be negated, so we remove
      // the bottom-most digit in this base and then recurse to do the rest.
      Long *radix_long = Long::fromNumber(radix);
      // printf("C:: =================================== ToString:radix_long: START1 %lli\n", radix_long->toNumber());
      // printf("C:: =================================== ToString:l: START1 %lli\n", this->toNumber());
      Long *div = this->div(radix_long);
      // printf("======================================= OWOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO\n");
      // printf("C:: =================================== ToString:div: START2 %lli\n", div->toNumber());
      // printf("C:: =================================== ToString:div_results: START3\n");
      Long *rem = div->multiply(radix_long)->subtract(this);
      // printf("C:: =================================== ToString:div: START3 %lli\n", rem->toNumber());
      // Fetch div result      
      // // printf("C:: =================================== ToString:div_results: START %f\n", div->toNumber());
      char *div_result = div->toString(radix);
      // // printf("C:: =================================== ToString:div_results: %s\n", div_result);
      // // Unpack the rem result and convert int to string
      char *int_buf = (char *)malloc(50 * sizeof(char) + 1);
      uint32_t rem_int = rem->toInt();
      sprintf(int_buf, "%d", rem_int);
      // Final bufferr
      char *final_buffer = (char *)malloc(50 * sizeof(char) + 1);
      strncat(final_buffer, div_result, strlen(div_result));
      strncat(final_buffer + strlen(div_result), int_buf, strlen(div_result));
      // Release some memory
      free(int_buf);
      return final_buffer;
    } else {
      // printf("C:: =================================== ToString:not equals min Long\n");
      char *buf = (char *)malloc(50 * sizeof(char) + 1);
      *(buf) = '\0';
      char *result = this->negate()->toString(radix);      
      strncat(buf, "-", 1);
      strncat(buf + 1, result, strlen(result));
      return buf;
    }  
  }
  
  // // printf("=============================================== TOSTRING::0\n");
  // 
  // Do several (6) digits each time through the loop, so as to
  // minimize the calls to the very expensive emulated div.
  Long *radix_to_power = Long::fromInt(pow(radix, 6));
  Long *rem = this;
  char *result = (char *)malloc(1024 * sizeof(char) + 1);
  // Ensure the allocated space is null terminated to ensure a proper CString
  *(result) = '\0';
  
  while(true) {
    // printf("C:: =================================== ToString2\n");
    // printf("C:: ToString:: ============ rem: %f\n", rem->toNumber());
    Long *rem_div = rem->div(radix_to_power);
    // printf("C:: =================================== ToString2-1\n");
    int32_t interval = rem->subtract(rem_div->multiply(radix_to_power))->toInt();
    // Convert interval into string
    char digits[50];    
    sprintf(digits, "%d", interval);
    // printf("C:: =================================== ToString2-2\n");
    
    rem = rem_div;
    if(rem->isZero()) {
      // printf("C:: =================================== ToString3\n");
      // Join digits and result to create final result
      int total_length = strlen(digits) + strlen(result);      
      char *new_result = (char *)malloc(total_length * sizeof(char) + 1);
      *(new_result) = '\0';
      // printf("C:: ================== result: %s:%d\n", result, (int)strlen(result));      
      // printf("C:: ================== digits: %s:%d\n", digits, (int)strlen(digits));      
      strncat(new_result, digits, strlen(digits));
      strncat(new_result + strlen(digits), result, strlen(result));
      // Free the existing structure
      free(result);
      // printf("C:: ================== new_result: %s:%d\n", new_result, (int)strlen(new_result));      
      return new_result;
    } else {
      // printf("C:: =================================== ToString4\n");
      // Allocate some new space for the number
      char *new_result = (char *)malloc(1024 * sizeof(char) + 1);
      *(new_result) = '\0';
      int digits_length = (int)strlen(digits);
      int index = 0;
      // Pad with zeros
      while(digits_length < 6) {
        strncat(new_result + index, "0", 1);
        digits_length = digits_length + 1;
        index = index + 1;
      }
  
      // printf("C:: ================== result: %s:%d\n", result, (int)strlen(result));      
      strncat(new_result + index, digits, strlen(digits));
      // printf("C:: ================== new_result: %s\n", new_result);
      strncat(new_result + strlen(digits) + index, result, strlen(result));
      
      free(result);
      result = new_result;
    }
    
    
    // printf("C:: ============== digits: %s:%d\n", digits, (int)strlen(digits));
    // printf("C:: ============== result: %s:%d\n", result, (int)strlen(result));
  }  
  // return "Hello";
}

Handle<Value> Long::ToString(const Arguments &args) {
  HandleScope scope;

  // Let's unpack the Long instance that contains the number in low_bits and high_bits form
  Long *l = ObjectWrap::Unwrap<Long>(args.This());
  // Let's create the string from the Long number
  char *result = l->toString(10);
  // Package the result in a V8 String object and return
  return String::New(result);
}

Long *Long::shiftRight(int32_t number_bits) {
  number_bits &= 63;
  if(number_bits == 0) {
    return this;
  } else {
    int32_t high_bits = this->high_bits;
    if(number_bits < 32) {
      int32_t low_bits = this->low_bits;
      return Long::fromBits((low_bits >> number_bits) | (high_bits << (32 - number_bits)), high_bits >> number_bits);
    } else {
      return Long::fromBits(high_bits >> (number_bits - 32), high_bits >= 0 ? 0 : -1);
    }
  }
}

Long *Long::shiftLeft(int32_t number_bits) {
  number_bits &= 63;
  if(number_bits == 0) {
    return this;
  } else {
    int32_t low_bits = this->low_bits;
    if(number_bits < 32) {
      int32_t high_bits = this->high_bits;
      return Long::fromBits(low_bits << number_bits, (high_bits << number_bits) | (low_bits >> (32 - number_bits)));
    } else {
      return Long::fromBits(0, low_bits << (number_bits - 32));
    }
  }  
}

Long *Long::div(Long *other) {
  // printf("C:: =================================== div-0\n");
  // If we are about to do a divide by zero throw an exception
  if(other->isZero()) {
    throw "division by zero";
  } else if(this->isZero()) {
    return new Long(0, 0);
  }
    
  if(this->equals(MIN_VALUE)) {    
    // printf("C:: =================================== div-3\n");
    if(other->equals(ONE) || other->equals(NEG_ONE)) {
      // printf("C:: =================================== div-3-1\n");
      return Long::fromBits(0, 0x80000000 | 0);
    } else if(other->equals(MIN_VALUE)) {
      // printf("C:: =================================== div-3-2\n");
      return Long::fromNumber(1);
    } else {
      // printf("C:: =================================== div-3-3\n");
      Long *half_this = this->shiftRight(1);
      Long *approx = half_this->div(other)->shiftLeft(1);
      if(approx->equals(ZERO)) {
        return other->isNegative() ? Long::fromNumber(0) : Long::fromNumber(-1);
      } else {
        Long *rem = this->subtract(other->multiply(approx));
        Long *result = approx->add(rem->div(other));
        return result;
      }
    }    
  } else if(other->equals(MIN_VALUE)) {
    // printf("C:: =================================== div-4\n");
    return new Long(0, 0);
  }
  
  // If the value is negative
  if(this->isNegative()) {
    // printf("C:: =================================== div-5\n");
    if(other->isNegative()) {
      // printf("C:: =================================== div-5-1\n");
      return this->negate()->div(other->negate());
    } else {
      // printf("C:: =================================== div-5-2\n");
      // printf("C:: =================================== this:%lli\n", this->toNumber());
      // printf("C:: =================================== this->negate():%lli\n", this->negate()->toNumber());
      // printf("C:: =================================== div-5-2\n");
      // printf("C:: =================================== div-5-2\n");
      return this->negate()->div(other)->negate();
    }    
  } else if(other->isNegative()) {
    // printf("C:: =================================== div-6\n");
    return this->div(other->negate())->negate();
  }  
  
  
  int64_t this_number = this->toNumber();
  int64_t other_number = other->toNumber();
  int64_t result = this_number / other_number;
  // printf("=================================== this_number::%lli\n", this_number);
  // printf("=================================== other_number::%lli\n", other_number);
  // printf("C:: =================================== RESULT::[%lli/%lli] = [%lli]\n", this_number, other_number, result);
  
  // Split into the 32 bit valu
  int32_t low32, high32;
  high32 = (uint64_t)result >> 32;
  low32 = (int32_t)result;
  return Long::fromBits(low32, high32);
  // return Long::fromInt(result);
  
  // printf("C:: =================================== div-1\n");
  // printf("C:: =================================== result: [%lli/%lli] = [%lli]\n", this_number, other_number, result);
  // Long *l = Long::fromNumber(result);
  // printf("C:: =================================== div-2: %lli\n", l->toNumber());
  // return l;
  
  //   printf("C:: =================================== div-1\n");
  // 
  // // If we have the minimum value for the current long or the div long
  // if(this->equals(MIN_VALUE)) {    
  //   printf("C:: =================================== div-2\n");
  //   // printf("C:: =================================== div-3\n");
  //   if(other->equals(ONE) || other->equals(NEG_ONE)) {
  //     printf("C:: =================================== div-3\n");
  //     return Long::fromBits(0, 0x80000000 | 0);
  //   } else if(other->equals(MIN_VALUE)) {
  //     printf("C:: =================================== div-4\n");
  //     return Long::fromNumber(1);
  //   } else {
  //     printf("C:: =================================== div-5\n");
  //     Long *half_this = this->shiftRight(1);
  //     Long *approx = half_this->div(other)->shiftLeft(1);
  //     if(approx->equals(ZERO)) {
  //       return other->isNegative() ? Long::fromNumber(0) : Long::fromNumber(-1);
  //     } else {
  //       Long *rem = this->subtract(other->multiply(approx));
  //       Long *result = approx->add(rem->div(other));
  //       return result;
  //     }
  //   }    
  // } else if(other->equals(MIN_VALUE)) {
  //   printf("C:: =================================== div-6\n");
  //   // printf("C:: =================================== div-4\n");
  //   return new Long(0, 0);
  // }
  // 
  // // If the value is negative
  // if(this->isNegative()) {
  //   printf("C:: =================================== div-7\n");
  //   // printf("C:: ========================================= NEGATIVE 1\n");
  //   if(other->isNegative()) {
  //     // printf("C:: ========================================= NEGATIVE 1-1\n");
  //     return this->negate()->div(other->negate());
  //   } else {
  //     // printf("C:: ========================================= NEGATIVE 1-2\n");
  //     // printf("C:: ========================================= this: %lli\n", this->toNumber());
  //     // printf("C:: ========================================= this->negate(): %lli\n", this->negate()->toNumber());
  //     // printf("C:: ========================================= this->negate()->div(other): %lli\n", this->negate()->div(other)->toNumber());
  //     // printf("C:: ========================================= this->negate()->div(other)->negate(): %lli\n", this->negate()->div(other)->negate()->toNumber());
  //     return this->negate()->div(other)->negate();
  //   }    
  // } else if(other->isNegative()) {
  //   printf("C:: =================================== div-8\n");
  //   // printf("C:: ========================================= NEGATIVE 2\n");
  //   return this->div(other->negate())->negate();
  // }
  // 
  // // Repeat the following until the remainder is less than other:  find a
  // // floating-point that approximates remainder / other *from below*, add this
  // // into the result, and subtract it from the remainder.  It is critical that
  // // the approximate value is less than or equal to the real value so that the
  // // remainder never becomes negative.
  // Long *res = ZERO;
  // Long *rem = this;
  // 
  // while(rem->greaterThanOrEqual(other)) {
  //   printf("----------------------------------------------------------------------------------\n");
  //   printf("C:: =================================== div-9\n");
  //   // Approximate the result of division. This may be a little greater or
  //   // smaller than the actual value.
  //   // printf("C:: =================================== rem->toNumber(): %lli\n", rem->toNumber());
  //   // printf("C:: =================================== other->toNumber(): %lli\n", other->toNumber());
  // 
  //   int64_t a = rem->toNumber();
  //   int64_t b = other->toNumber();
  //   int64_t c = a / b;
  //   printf("C:: =================================== rem->toNumber(): %lli\n", a);
  //   printf("C:: =================================== other->toNumber(): %lli\n", b);
  //   printf("C:: =================================== rem->toNumber() / other->toNumber(): %lli\n", c);
  //   printf("C:: =================================== floor(c): %f\n", floor(c));
  //   printf("C:: =================================== max(1, floor(c)): %f\n", max(1, floor(c)));
  // 
  //   int64_t approx = (int64_t)max(1, floor(a / b));
  //   
  //   // int64_t approx = max(1, floor(rem->toNumber() / other->toNumber()));
  //   printf("C:: =================================== div-10\n");
  //   printf("C:: ======================================= approx: %lli\n", approx);
  //   // printf("C:: ======================================= rem->toNumber(): %f\n", rem->toNumber());
  //   // printf("C:: ======================================= other->toNumber(): %f\n", other->toNumber());
  //   // printf("C:: ======================================= approx: %lli\n", approx);
  //   // printf("C:: ======================================= floor: %f\n", floor(rem->toNumber() / other->toNumber()));
  // 
  //   // We will tweak the approximate result by changing it in the 48-th digit or
  //   // the smallest non-fractional digit, whichever is larger.
  //   int64_t log2 = ceil(log(approx) / LN2);
  //   printf("C:: ======================================= log2: %lli\n", log2);
  //   int64_t delta = (log2 <= 48) ? 1 : pow(2, (log2 - 48));
  //   // printf("C:: ======================================= delta: %lli\n", delta);
  //   
  //   // Decrease the approximation until it is smaller than the remainder.  Note
  //   // that if it is too large, the product overflows and is negative.
  //   Long *approxRes = Long::fromNumber(approx);
  //   Long *approxRem = approxRes->multiply(other);
  //   // printf("C:: =================================== div-9\n");
  // 
  //   printf("C:: ======================================= approxRes: %lli\n", approxRes->toNumber());
  //   printf("C:: ======================================= approxRem: %lli\n", approxRem->toNumber());
  //   printf("C:: ======================================= rem: %lli\n", rem->toNumber());
  //   printf("C:: ======================================= approxRem->isNegative(): %s\n", approxRem->isNegative() ? "true" : "false");
  //   printf("C:: ======================================= approxRem->greaterThan(rem): %s\n", approxRem->greaterThan(rem) ? "true" : "false");
  // 
  //   while(approxRem->isNegative() || approxRem->greaterThan(rem)) {
  //     printf("C:: =================================== div-10\n");
  //     approx -= delta;
  //     // printf("C:: ======================================= approx: %lli\n", approx);
  //     approxRes = Long::fromNumber(approx);
  //     approxRem = approxRes->multiply(other);
  //   }
  //   
  //   // We know the answer can't be zero... and actually, zero would cause
  //   // infinite recursion since we would make no progress.
  //   if(approxRes->isZero()) {
  //     approxRes = ONE;
  //   }
  //   
  //   res = res->add(approxRes);
  //   printf("C:: ======================================= res: %lli\n", res->toNumber());
  //   
  //   
  //   rem = rem->subtract(approxRem);
  // }  
  //   
  // return res;
}

Long *Long::multiply(Long *other) {
  if(this->isZero() || other->isZero()) {
    return new Long(0, 0);    
  }
  
  int64_t this_number = this->toNumber();
  int64_t other_number = other->toNumber();
  int64_t result = this_number * other_number;
  
  // Split into the 32 bit valu
  int32_t low32, high32;
  high32 = (uint64_t)result >> 32;
  low32 = (int32_t)result;
  return Long::fromBits(low32, high32);
  
  // return Long::fromInt(result);
  
  // if(this->equals(MIN_VALUE)) {
  //   return other->isOdd() ? MIN_VALUE : ZERO; 
  // } else if(other->equals(MIN_VALUE)) {
  //   return this->isOdd() ? MIN_VALUE : ZERO;
  // }
  // 
  // if(this->isNegative()) {
  //   if(other->isNegative()) {
  //     return this->negate()->multiply(other->negate());
  //   } else {
  //     return this->negate()->multiply(other)->negate();
  //   }
  // } else if(other->isNegative()) {
  //   return this->multiply(other->negate())->negate();
  // }
  // 
  // // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
  // // We can skip products that would overflow.
  // int32_t a48 = this->high_bits >> 16;
  // int32_t a32 = this->high_bits & 0xFFFF;
  // int32_t a16 = this->low_bits >> 16;
  // int32_t a00 = this->low_bits & 0xFFFF;
  // 
  // int32_t b48 = other->high_bits >> 16;
  // int32_t b32 = other->high_bits & 0xFFFF;
  // int32_t b16 = other->low_bits >> 16;
  // int32_t b00 = other->low_bits & 0xFFFF;
  // 
  // int32_t c48 = 0;
  // int32_t c32 = 0;
  // int32_t c16 = 0;
  // int32_t c00 = 0;
  // 
  // c00 += a00 * b00;
  // c16 += c00 >> 16;
  // c00 &= 0xFFFF;
  // c16 += a16 * b00;
  // c32 += c16 >> 16;
  // c16 &= 0xFFFF;
  // c16 += a00 * b16;
  // c32 += c16 >> 16;
  // c16 &= 0xFFFF;
  // c32 += a32 * b00;
  // c48 += c32 >> 16;
  // c32 &= 0xFFFF;
  // c32 += a16 * b16;
  // c48 += c32 >> 16;
  // c32 &= 0xFFFF;
  // c32 += a00 * b32;
  // c48 += c32 >> 16;
  // c32 &= 0xFFFF;
  // c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  // c48 &= 0xFFFF;
  // // Return the new number
  // return Long::fromBits((c16 << 16) | c00, (c48 << 16) | c32);
}

bool Long::isOdd() {
  return (this->low_bits & 1) == 1;
}

int64_t Long::toNumber() {
  // printf("C:: -------------------------------------------------------------------------- TONUMBER\n");
  // printf("C:: ======================================= low_bits: %d\n", this->low_bits);
  // printf("C:: ======================================= low_bits: %lli\n", this->getLowBitsUnsigned());
  // printf("C:: ======================================= high_bits: %d\n", this->high_bits);
  // printf("C:: -----------------------------------------------------------------------------------\n");
  return (int64_t)(this->high_bits * BSON_INT32_ + this->getLowBitsUnsigned());
}

int64_t Long::getLowBitsUnsigned() {
  return (this->low_bits >= 0) ? this->low_bits : BSON_INT32_ + this->low_bits;
}

int64_t Long::compare(Long *other) {
  // printf("C:: ============== COMPARE ================== %lli = %lli\n", this->toNumber(), other->toNumber());
  
  if(this->equals(other)) {
    return 0;
  }
  
  bool this_neg = this->isNegative();
  bool other_neg = other->isNegative();
  if(this_neg && !other_neg) {
    return -1;
  }
  if(!this_neg && other_neg) {
    return 1;
  }
  
  // At this point, the signs are the same, so subtraction will not overflow
  if(this->subtract(other)->isNegative()) {
    return -1;
  } else {
    return 1;
  }
}

Long *Long::negate() {
  if(this->equals(MIN_VALUE)) {
    return MIN_VALUE;
  } else {
    // return this->not_()->add(ONE);
    return this->not_()->add(ONE);
  }
}

Long *Long::not_() {
  return new Long(~this->low_bits, ~this->high_bits);
}

Long *Long::add(Long *other) {
  int64_t this_number = this->toNumber();
  int64_t other_number = other->toNumber();
  int64_t result = this_number + other_number;
  // printf("======================= LONG:ADD: %lli=%lli\n", result, Long::fromNumbe(result)->toNumber());
  
  // Split into the 32 bit valu
  int32_t low32, high32;
  high32 = (uint64_t)result >> 32;
  low32 = (int32_t)result;
  return Long::fromBits(low32, high32);
  
  // return Long::fromInt(result);
  // 
  // int32_t a48 = this->high_bits >> 16;
  // int32_t a32 = this->high_bits & 0xFFFF;
  // int32_t a16 = this->low_bits >> 16;
  // int32_t a00 = this->low_bits & 0xFFFF;
  // 
  // int32_t b48 = other->high_bits >> 16;
  // int32_t b32 = other->high_bits & 0xFFFF;
  // int32_t b16 = other->low_bits >> 16;
  // int32_t b00 = other->low_bits & 0xFFFF;
  // 
  // int32_t c48 = 0;
  // int32_t c32 = 0;
  // int32_t c16 = 0;
  // int32_t c00 = 0;
  // 
  // c00 += a00 + b00;
  // c16 += c00 >> 16;
  // c00 &= 0xFFFF;
  // c16 += a16 + b16;
  // c32 += c16 >> 16;
  // c16 &= 0xFFFF;  
  // c32 += a32 + b32;
  // c48 += c32 >> 16;
  // c32 &= 0xFFFF;
  // c48 += a48 + b48;
  // c48 &= 0xFFFF;
  // 
  // printf("====================================== [%lli] + [%lli]\n", this_number, other_number);
  // printf("====================================== [%lli] = [%lli]\n", result, Long::fromBits((c16 << 16) | c00, (c48 << 16) | c32)->toNumber());
  // 
  // // Return the new value
  // return Long::fromBits((c16 << 16) | c00, (c48 << 16) | c32);
}

Long *Long::subtract(Long *other) {
  int64_t this_number = this->toNumber();
  int64_t other_number = other->toNumber();
  int64_t result = this_number - other_number;
  // return Long::fromInt(result);

  // Split into the 32 bit valu
  int32_t low32, high32;
  high32 = (uint64_t)result >> 32;
  low32 = (int32_t)result;
  return Long::fromBits(low32, high32);
  
  // Long *negated = other->negate();
  // return this->add(negated);
}

bool Long::greaterThan(Long *other) {
  return this->compare(other) > 0;  
}

bool Long::greaterThanOrEqual(Long *other) {
  return this->compare(other) >= 0;
}

Long *Long::fromInt(int64_t value) {
  return new Long((value | 0), (value < 0 ? -1 : 0));
}

Long *Long::fromBits(int32_t low_bits, int32_t high_bits) {
  return new Long(low_bits, high_bits);
}

Long *Long::fromNumber(int64_t value) {
  // Ensure we have a valid ranged number
  if(std::isinf(value) || std::isnan(value)) {
    return Long::fromBits(0, 0);
  } else if(value <= BSON_INT64_MIN) {
    return Long::fromBits(0, 0x80000000 | 0);
  } else if(value >= BSON_INT64_MAX) {
    return Long::fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
  } else if(value < 0) {
    return Long::fromNumber(-value)->negate();
  } else {
    return Long::fromBits((value % BSON_INT32_) | 0, (value / BSON_INT32_) | 0);
  }  
}

Handle<Value> Long::FromNumber(const Arguments &args) {
  HandleScope scope;
  
  // Ensure that we have an parameter
  if(args.Length() != 1) return VException("One argument required - number.");
  if(!args[0]->IsNumber()) return VException("Arguments passed in must be numbers.");  
  // Unpack the variable as a 64 bit integer
  int64_t value = args[0]->IntegerValue();
  double double_value = args[0]->NumberValue();
  // uint64_t value3 = (int64_t)value2;
  // double value = args[0]->NumberValue();
  // printf("C:: =================================== value %lli\n", value);
  // printf("C:: =================================== value %f\n", double_value);
  // printf("C:: =================================== value %lli\n", value3);
  // printf("C:: =================================== max %lli\n", BSON_INT64_MAX);
  // static __int64 iMax(0x43DFFFFFFFFFFFFF);

  // static int64_t iMax(0x43DFFFFFFFFFFFFF);
  // static const double dMax = *reinterpret_cast<double*>(&iMax);
  // static const double dMin = -dMax;
  // static const bool is_IEEE754 = std::numeric_limits<double>::is_specialized && std::numeric_limits<double>::is_iec559;
  
  // Ensure we have a valid ranged number
  if(std::isinf(double_value) || std::isnan(double_value)) {
    // printf("C:: ========================================================= 1\n");
    Local<Value> argv[] = {Integer::New(0), Integer::New(0)};
    Local<Object> long_obj = constructor_template->GetFunction()->NewInstance(2, argv);
    return scope.Close(long_obj);
  } else if(double_value <= BSON_INT64_MIN) {
    // printf("C:: ========================================================= 2\n");
    Local<Value> argv[] = {Integer::New(0), Integer::New(0x80000000 | 0)};
    Local<Object> long_obj = constructor_template->GetFunction()->NewInstance(2, argv);    
    return scope.Close(long_obj);    
  } else if(double_value >= BSON_INT64_MAX) {
    // printf("C:: ========================================================= 3\n");
    Local<Value> argv[] = {Integer::New(0xFFFFFFFF | 0), Integer::New(0x7FFFFFFF | 0)};
    Local<Object> long_obj = constructor_template->GetFunction()->NewInstance(2, argv);    
    return scope.Close(long_obj);        
  } else if(double_value < 0) {
    // printf("C:: ========================================================= 4\n");
    Local<Value> argv[] = {Integer::New((value % BSON_INT32_) | 0), Integer::New((value / BSON_INT32_) | 0)};
    Local<Object> long_obj = constructor_template->GetFunction()->NewInstance(2, argv);    
    return scope.Close(long_obj);    
  } else {
    // printf("C:: ========================================================= 5\n");
    Local<Value> argv[] = {Integer::New((value % BSON_INT32_) | 0), Integer::New((value / BSON_INT32_) | 0)};
    Local<Object> long_obj = constructor_template->GetFunction()->NewInstance(2, argv);    
    return scope.Close(long_obj);    
  }
}
    
// Exporting function
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  BSON::Initialize(target);
  Long::Initialize(target);
}

// NODE_MODULE(bson, BSON::Initialize);
// NODE_MODULE(l, Long::Initialize);