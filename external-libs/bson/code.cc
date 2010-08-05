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

#include "code.h"

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> Code::constructor_template;

Code::Code() : ObjectWrap() {
}

Code::~Code() {}

Handle<Value> Code::New(const Arguments &args) {
  HandleScope scope;
  
  printf("=================================================================== 2\n");
  
  if(args.Length() != 1 && args.Length() != 3) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");
  }
  
  if(args.Length() == 1 && !args[0]->IsString()) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");    
  }
  
  if(args.Length() == 2 && !args[0]->IsString() && !args[1]->IsObject()) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");        
  }  

  // Binary *binary;
  // 
  // if(args.Length() > 2) {
  //   return VException("Argument must be either none, a string or a sub_type and string");    
  // }
  // 
  // if(args.Length() == 0) {
  //   char *oid_string_bytes = (char *)malloc(1);
  //   *(oid_string_bytes) = '\0';
  //   binary = new Binary(BSON_BINARY_SUBTYPE_BYTE_ARRAY, oid_string_bytes);
  // } else if(args.Length() == 1 && args[0]->IsString()) {
  //   Local<String> str = args[0]->ToString();
  //   // Contains the bytes for the data
  //   char *oid_string_bytes = (char *)malloc(str->Length() + 1);
  //   *(oid_string_bytes + str->Length()) = '\0';
  //   // Decode the data from the string
  //   node::DecodeWrite(oid_string_bytes, str->Length(), str, node::BINARY);    
  //   // Create a binary object
  //   binary = new Binary(BSON_BINARY_SUBTYPE_BYTE_ARRAY, oid_string_bytes);
  // } else if(args.Length() == 2 && args[0]->IsNumber() && args[1]->IsString()) {
  //   Local<Integer> intr = args[0]->ToInteger();
  //   Local<String> str = args[1]->ToString();
  //   // Contains the bytes for the data
  //   char *oid_string_bytes = (char *)malloc(str->Length() + 1);
  //   *(oid_string_bytes + str->Length()) = '\0';
  //   // Decode the data from the string
  //   node::DecodeWrite(oid_string_bytes, str->Length(), str, node::BINARY);        
  //   // Decode the subtype
  //   uint32_t sub_type = intr->Uint32Value();
  //   binary = new Binary(sub_type, oid_string_bytes);
  // } else {
  //   return VException("Argument must be either none, a string or a sub_type and string");        
  // }

  Code *code = new Code();
  // Wrap it
  code->Wrap(args.This());
  // Return the object
  return args.This();    
}

void Code::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Code"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("Code"), constructor_template->GetFunction());
}

Handle<Value> Code::Inspect(const Arguments &args) {
  HandleScope scope;
  
  // Unpack the Binary object
  // Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  // Return the raw data  
  // return String::New(binary->data);  
  return String::New("Code::Inspect");
}

Handle<Value> Code::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the Binary object
  // Binary *binary = ObjectWrap::Unwrap<Binary>(args.This());
  // Return the raw data  
  // return String::New(binary->data);  
  return String::New("Code::ToString");
}









