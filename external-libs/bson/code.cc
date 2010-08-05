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

Code::Code(char *code, Handle<Value> scope_object) : ObjectWrap() {
  this->code = code;
  this->scope_object = scope_object;
}

Code::~Code() {}

Handle<Value> Code::New(const Arguments &args) {
  HandleScope scope;
  
  char *code;
  Local<Object> scope_object;
  
  if(args.Length() != 1 && args.Length() != 2) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");
  }
  
  if(args.Length() == 1 && !args[0]->IsString()) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");    
  }
  
  if(args.Length() == 2 && !args[0]->IsString() && !args[1]->IsObject()) {
    return VException("There must be either 1 or 2 arguments passed in where the first argument is a string and the second a object for the scope");        
  }  
  
  // Decode the string
  Local<String> str = args[0]->ToString();
  // Set up the string
  code = (char *)malloc(str->Length() * sizeof(char) + 1);
  *(code + str->Length()) = '\0';
  // Copy over
  node::DecodeWrite(code, str->Length(), str, node::BINARY);  
  // Decode the scope
  if(args.Length() == 2) {
    scope_object = args[1]->ToObject();
  } else {
    scope_object = Object::New();    
  }
  
  // Create code object
  Code *code_obj = new Code(code, scope_object);
  // Wrap it
  code_obj->Wrap(args.This());
  // Return the object
  return args.This();    
}

static Persistent<String> code_symbol;
static Persistent<String> scope_symbol;

void Code::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Code"));
  
  // Propertry symbols
  code_symbol = NODE_PSYMBOL("code");
  scope_symbol = NODE_PSYMBOL("scope");

  // Getters for correct serialization of the object  
  constructor_template->InstanceTemplate()->SetAccessor(code_symbol, CodeGetter, CodeSetter);
  constructor_template->InstanceTemplate()->SetAccessor(scope_symbol, ScopeGetter, ScopeSetter);
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("Code"), constructor_template->GetFunction());
}

Handle<Value> Code::CodeGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  // Unpack object reference
  Local<Object> self = info.Holder();
  // Fetch external reference (reference to Code object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Extract value doing a cast of the pointer to Long and accessing code
  char *code = static_cast<Code *>(ptr)->code;
  // Return the string
  return scope.Close(String::New(code));
}

void Code::CodeSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  if(value->IsString()) {
    // Unpack object reference
    Local<Object> self = info.Holder();
    // Fetch external reference (reference to Code object)
    Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
    // Get pointer to the object
    void *ptr = wrap->Value();
    // Convert the value to a string
    Local<String> str = value->ToString();
    // Set up the string
    char *code = (char *)malloc(str->Length() * sizeof(char) + 1);
    *(code + str->Length()) = '\0';
    // Copy over
    node::DecodeWrite(code, str->Length(), str, node::BINARY);  
    // Return the code
    static_cast<Code *>(ptr)->code = code;
  }
}

Handle<Value> Code::ScopeGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  // Unpack object reference
  Local<Object> self = info.Holder();
  // Fetch external reference (reference to Long object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Extracting value doing a cast of the pointer to Long
  Handle<Value> scope_obj = static_cast<Code *>(ptr)->scope_object;
  return scope.Close(scope_obj);
}

void Code::ScopeSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  if(value->IsObject()) {
    // Unpack object reference
    Local<Object> self = info.Holder();
    // Fetch external reference (reference to Long object)
    Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
    // Get pointer to the object
    void *ptr = wrap->Value();
    // Set the low bits
    static_cast<Code *>(ptr)->scope_object = value;
  }
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









