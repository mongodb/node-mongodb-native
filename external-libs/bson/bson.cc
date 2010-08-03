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
#include "long.h"

using namespace v8;
using namespace node;

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

// Exporting function
extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  BSON::Initialize(target);
  Long::Initialize(target);
}

// NODE_MODULE(bson, BSON::Initialize);
// NODE_MODULE(l, Long::Initialize);