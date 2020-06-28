import FindAndModifyOperation = require('./find_and_modify');

class FindOneAndDeleteOperation extends FindAndModifyOperation {
  constructor(collection: any, filter: any, options: any) {
    // Final options
    const finalOptions = Object.assign({}, options);
    finalOptions.fields = options.projection;
    finalOptions.remove = true;

    super(collection, filter, finalOptions.sort, null, finalOptions);
  }
}

export = FindOneAndDeleteOperation;
