#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "double.h"

static Handle<Value> VException(const char *msg) {
  HandleScope scope;
  return ThrowException(Exception::Error(String::New(msg)));
};

Persistent<FunctionTemplate> Double::constructor_template;

Double::Double(Persistent<Object> value) : ObjectWrap() {
  this->value = value;
}

Double::~Double() {
}

Handle<Value> Double::New(const Arguments &args) {
  HandleScope scope;  
  Persistent<Object> doublePObj;
  
  if(args.Length() != 1 && !args[0]->IsString()) {
    return VException("There must be 1 argument passed in where the first argument is a string");
  }
  
  // Decode the string
  doublePObj = Persistent<Object>::New(args[0]->ToObject());
  // Create code object
  Double *double_obj = new Double(doublePObj);
  // Wrap it
  double_obj->Wrap(args.This());
  // Return the object
  return args.This();    
}

static Persistent<String> value_Double;

void Double::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("Double"));
  
  // Propertry Doubles
  value_Double = NODE_PSYMBOL("value");

  // Getters for correct serialization of the object  
  constructor_template->InstanceTemplate()->SetAccessor(value_Double, ValueGetter, ValueSetter);
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("Double"), constructor_template->GetFunction());
}

Handle<Value> Double::ValueGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  // Unpack the long object
  Double *Double_obj = ObjectWrap::Unwrap<Double>(info.Holder());
  // Extract value doing a cast of the pointer to Long and accessing code
  // char *value = Double_obj->value;
  // Return the string
  return scope.Close(Double_obj->value);
}

void Double::ValueSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  // if(value->IsString()) {
  //   // Unpack the long object
  //   Double *Double_obj = ObjectWrap::Unwrap<Double>(info.Holder());
  //   // Convert the value to a string
  //   Local<String> str = value->ToString();
  //   // Set up the string
  //   char *Double = (char *)malloc(str->Length() * sizeof(char) + 1);
  //   *(Double + str->Length()) = '\0';
  //   // Copy over
  //   node::DecodeWrite(Double, str->Length(), str, node::BINARY);  
  //   // Free existing pointer if any
  //   if(Double_obj->value != NULL) free(Double_obj->value);
  //   // Return the code
  //   Double_obj->value = Double;
  // }
}

Handle<Value> Double::Inspect(const Arguments &args) {
  return Double::ToString(args);
}

Handle<Value> Double::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the Binary object
  Double *double_obj = ObjectWrap::Unwrap<Double>(args.This());
  // Return the raw data  
  // return String::New(Double_obj->value);
  return double_obj->value->ToString();
}









