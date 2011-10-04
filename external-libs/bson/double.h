#ifndef DOUBLE_H_
#define DOUBLE_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class Double : public ObjectWrap {  
  public:    
    Persistent<Object> value;
    
    Double(Persistent<Object> value);
    ~Double();    

    // Has instance check
    static inline bool HasInstance(Handle<Value> val) {
      if (!val->IsObject()) return false;
      Local<Object> obj = val->ToObject();
      return constructor_template->HasInstance(obj);
    }    

    // Functions available from V8
    static void Initialize(Handle<Object> target);    
    static Handle<Value> ToString(const Arguments &args);
    static Handle<Value> Inspect(const Arguments &args);

    // Constructor used for creating new Long objects from C++
    static Persistent<FunctionTemplate> constructor_template;
    
    // Setters and Getters for internal properties
    static Handle<Value> ValueGetter(Local<String> property, const AccessorInfo& info);
    static void ValueSetter(Local<String> property, Local<Value> value, const AccessorInfo& info);
    
  private:
    static Handle<Value> New(const Arguments &args);
};

#endif  // DOUBLE_H_