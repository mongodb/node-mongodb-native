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

#include "binary.h"

const uint32_t BSON_BINARY_SUBTYPE_FUNCTION = 1;
const uint32_t BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
const uint32_t BSON_BINARY_SUBTYPE_UUID = 3;
const uint32_t BSON_BINARY_SUBTYPE_MD5 = 4;
const uint32_t BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> Binary::constructor_template;

Binary::Binary(uint32_t sub_type, uint32_t number_of_bytes, char *data) : ObjectWrap() {
  this->sub_type = sub_type;
  this->number_of_bytes = number_of_bytes;
  this->data = data;  
}

Binary::~Binary() {}

Handle<Value> Binary::New(const Arguments &args) {
  HandleScope scope;
  Binary *binary;
  
  if(args.Length() > 2) {
    return VException("Argument must be either none, a string or a sub_type and string");    
  }
  
  if(args.Length() == 0) {
    char *oid_string_bytes = (char *)malloc(1);
    *(oid_string_bytes) = '\0';
    binary = new Binary(BSON_BINARY_SUBTYPE_BYTE_ARRAY, 0, oid_string_bytes);
  } else if(args.Length() == 1 && args[0]->IsString()) {
    Local<String> str = args[0]->ToString();
    // Contains the bytes for the data
    char *oid_string_bytes = (char *)malloc(str->Length() + 1);
    *(oid_string_bytes + str->Length()) = '\0';
    // Decode the data from the string
    node::DecodeWrite(oid_string_bytes, str->Length(), str, node::BINARY);    
    // Create a binary object
    binary = new Binary(BSON_BINARY_SUBTYPE_BYTE_ARRAY, str->Length(), oid_string_bytes);
  } else if(args.Length() == 2 && args[0]->IsNumber() && args[1]->IsString()) {    
    Local<Integer> intr = args[0]->ToInteger();
    Local<String> str = args[1]->ToString();
    // Contains the bytes for the data
    char *oid_string_bytes = (char *)malloc(str->Length());
    *(oid_string_bytes + str->Length()) = '\0';
    // Decode the data from the string
    node::DecodeWrite(oid_string_bytes, str->Length(), str, node::BINARY);        
    // Decode the subtype
    uint32_t sub_type = intr->Uint32Value();
    binary = new Binary(sub_type, str->Length(), oid_string_bytes);
  } else {
    return VException("Argument must be either none, a string or a sub_type and string");        
  }
  
  // Wrap it
  binary->Wrap(args.This());
  // Return the object
  return args.This();    
}

void Binary::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Binary"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "value", Data);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "length", Length);

  target->Set(String::NewSymbol("Binary"), constructor_template->GetFunction());
}

Handle<Value> Binary::Length(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the Binary object
  Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  return scope.Close(Integer::New(1));
}

Handle<Value> Binary::Data(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the Binary object
  Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  // Return the raw data  
  Local<Value> bin_value = Encode(binary->data, binary->number_of_bytes, BINARY);
  return scope.Close(bin_value);
}

Handle<Value> Binary::Inspect(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the Binary object
  Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  // Return the raw data  
  Local<Value> bin_value = Encode(binary->data, binary->number_of_bytes, BINARY);
  return scope.Close(bin_value);
}

Handle<Value> Binary::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the Binary object
  Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  // Return the raw data  
  Local<Value> bin_value = Encode(binary->data, binary->number_of_bytes, BINARY);
  return scope.Close(bin_value);
}









