import pymongo
from bson.json_util import dumps
from datetime import datetime

client = pymongo.MongoClient("")
change_stream = client['test']['test-collection'].watch()
for change in change_stream:
    print(datetime.now(), change["operationType"], change["fullDocument"] if "fullDocument" in change is not None else "")
    print('') # for readability only
