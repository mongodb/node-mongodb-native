import { OperationBase } from './operation';
import { indexInformation } from './common_functions';

class IndexInformationOperation extends OperationBase {
  db: any;
  name: any;

  constructor(db: any, name: any, options: any) {
    super(options);

    this.db = db;
    this.name = name;
  }

  execute(callback: Function) {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    indexInformation(db, name, options, callback);
  }
}

export = IndexInformationOperation;
