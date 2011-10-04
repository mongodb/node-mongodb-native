#ifndef MINKEY_H_
#define MINKEY_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class MinKey : public ObjectWrap {  
  public:    
    Persistent<Object> value;
    
    MinKey();
    ~MinKey();    

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

    // Public constructor
    static MinKey* New();
    
  private:
    static Handle<Value> New(const Arguments &args);
};

#endif  // MINKEY_H_