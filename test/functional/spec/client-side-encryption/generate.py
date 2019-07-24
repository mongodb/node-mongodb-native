from bson import json_util
import bson
import os
import sys
import json
import yaml
from jinja2 import Template
description = """Generates YAML/JSON tests from a template file.

This keeps key documents, JSONSchemas, and ciphertexts out of the
handwritten test files to make them more readable and easier
to change.
"""


if sys.version_info < (3, 0):
    print("Use Python 3")
    sys.exit(1)

if len(sys.argv) != 2:
    print(description)
    print("usage: python generate.py /path/to/<filename>.yml.template")
    sys.exit(1)

filepath = sys.argv[1]
filedir = os.path.dirname(filepath)
(filename, ext) = os.path.splitext(os.path.basename(filepath))
if ext != ".template":
    print("Input file must end with .yml.template")
    sys.exit(1)
(filename, ext) = os.path.splitext(filename)
if ext != ".yml":
    print("Input file must end with .yml.template")
    sys.exit(1)

master_keys = {
    "aws": {
        "provider": "aws",
        "key": "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        "region": "us-east-1"
    },
    "local": {}
}

keys = {
    "basic": {
        "status": 1,
        "_id": {
            "$binary": {
                "base64": "AAAAAAAAAAAAAAAAAAAAAA==",
                "subType": "04"
            }
        },
        "masterKey": master_keys["aws"],
        "updateDate": {
            "$date": {
                "$numberLong": "1552949630483"
            }
        },
        "keyMaterial": {
            "$binary": {
                "base64": "AQICAHhQNmWG2CzOm1dq3kWLM+iDUZhEqnhJwH9wZVpuZ94A8gEqnsxXlR51T5EbEVezUqqKAAAAwjCBvwYJKoZIhvcNAQcGoIGxMIGuAgEAMIGoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDHa4jo6yp0Z18KgbUgIBEIB74sKxWtV8/YHje5lv5THTl0HIbhSwM6EqRlmBiFFatmEWaeMk4tO4xBX65eq670I5TWPSLMzpp8ncGHMmvHqRajNBnmFtbYxN3E3/WjxmdbOOe+OXpnGJPcGsftc7cB2shRfA4lICPnE26+oVNXT6p0Lo20nY5XC7jyCO",
                "subType": "00"
            }
        },
        "creationDate": {
            "$date": {
                "$numberLong": "1552949630483"
            }
        },
        "keyAltNames": ["altname", "another_altname"]
    },
    "different_id": {
        "status": 1,
        "_id": {
            "$binary": {
                "base64": "BBBBBBBBBBBBBBBBBBBBBB==",
                "subType": "04"
            }
        },
        "masterKey": master_keys["aws"],
        "updateDate": {
            "$date": {
                "$numberLong": "1552949630483"
            }
        },
        "keyMaterial": {
            "$binary": {
                "base64": "AQICAHhQNmWG2CzOm1dq3kWLM+iDUZhEqnhJwH9wZVpuZ94A8gF9FSYZL9Ze8TvTA3WBd3nmAAAAwjCBvwYJKoZIhvcNAQcGoIGxMIGuAgEAMIGoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDLV3GHktEO8AlpsYBwIBEIB7ho0DQF7hEQPRz/8b61AHm2czX53Y9BNu5z+oyGYsoP643M58aTGsaHQzkTaAmGKlZTAEOjJkRJ4gZoabVuv4g6aJqf4k4w8pK7iIgHwMNy4nbUAqOWmqtnKpHZgy6jcFN2DzZzHIi4SNFsCkFc6Aw30ixtvqIDQPAXMW",
                "subType": "00"
            }
        },
        "creationDate": {
            "$date": {
                "$numberLong": "1552949630483"
            }
        },
        "keyAltNames": []
    },
    "local": {
        "_id": {
            "$binary": {
                "base64": "AAAAAAAAAAAAAAAAAAAAAA==",
                "subType": "04"
            }
        },
        "keyMaterial": {
            "$binary": {
                "base64": r"Ce9HSz/HKKGkIt4uyy+jDuKGA+rLC2cycykMo6vc8jXxqa1UVDYHWq1r+vZKbnnSRBfB981akzRKZCFpC05CTyFqDhXv6OnMjpG97OZEREGIsHEYiJkBW0jJJvfLLgeLsEpBzsro9FztGGXASxyxFRZFhXvHxyiLOKrdWfs7X1O/iK3pEoHMx6uSNSfUOgbebLfIqW7TO++iQS5g1xovXA==",
                "subType": "00"
            }
        },
        "creationDate": {"$date": {"$numberLong": "1232739599082000"}},
        "updateDate": {"$date": {"$numberLong": "1232739599082000"}},
        "status": {"$numberInt": "0"},
        "masterKey": {"provider": "local"}
    }
}

schemas = {
    "basic": {
        "properties": {
            "encrypted_w_altname": {
                "encrypt": {
                    "keyId": "/altname",
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
                }
            },
            "encrypted_string": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
                }
            },
            "random": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                }
            },
            # Same exact as fields as "encrypted_string"
            "encrypted_string_equivalent": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
                }
            }
        },
        "bsonType": "object"
    },
    "encrypted_id": {
        "properties": {
            "_id": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
                }
            }
        }
    },
    "local": {
        "properties": {
            "encrypted_string": {
                "encrypt": {
                    "keyId": [keys["local"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
                }
            },
            "random": {
                "encrypt": {
                    "keyId": [keys["local"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                }
            }
        },
        "bsonType": "object"
    },
    "invalid_array": {
        "properties": {
            "encrypted_string": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
                }
            }
        },
        "bsonType": "array"
    },
    "invalid_omitted_type": {
        "properties": {
            "foo": {
                "properties": {
                    "bar": {
                        "encrypt": {
                            "keyId": [keys["basic"]["_id"]],
                            "bsonType": "string",
                            "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
                        }
                    }
                }
            }
        }
    },
    "invalid_siblings": {
        "properties": {
            "encrypted_string": {
                "encrypt": {
                    "keyId": [keys["basic"]["_id"]],
                    "bsonType": "string",
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
                },
                "bsonType": "object"
            }
        }
    },
    "logical_keywords": {
        "anyOf": [
            {
                "properties": {
                    "encrypted_string": {
                        "encrypt": {
                            "keyId": [keys["basic"]["_id"]],
                            "bsonType": "string",
                            "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
                        }
                    }
                }
            }
        ]
    },
    "noencryption": {
        "properties": {
            "test": {
                "bsonType": "string"
            }
        },
        "bsonType": "object",
        "required": ["test"]
    },
}

ciphertexts = [
    {
        "schema": "basic",
        "field": "encrypted_string",
        "plaintext": "string0",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACwj+3zkv2VM+aTfk60RqhXq6a/77WlLwu/BxXFkL7EppGsju/m8f0x5kBDD3EZTtGALGXlym5jnpZAoSIkswHoA==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_string",
        "plaintext": "string1",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACDdw4KFz3ZLquhsbt7RmDjD0N67n0uSXx7IGnQNCLeIKvot6s/ouI21Eo84IOtb6lhwUNPlSEBNY0/hbszWAKJg==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_string",
        "plaintext": "string2",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACQ76HWOut3DZtQuV90hp1aaCpZn95vZIaWmn+wrBehcEtcFwyJlBdlyzDzZTWPZCPgiFq72Wvh6Y7VbpU9NAp3A==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "local",
        "field": "encrypted_string",
        "plaintext": "string0",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACV/+zJmpqMU47yxS/xIVAviGi7wHDuFwaULAixEAoIh0xHz73UYOM3D8D44gcJn67EROjbz4ITpYzzlCJovDL0Q==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_objectId",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAHmkTPqvzfHMWpvS1mEsrjOxVQ2dyihEgIFWD5E0eNEsiMBQsC0GuvjdqYRL5DHLFI1vKuGek7EYYp0Qyii/tHqA==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_symbol",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAOOmvDmWjcuKsSCO7U/7t9HJ8eI73B6wduyMbdkvn7n7V4uTJes/j+BTtneSdyG2JHKHGkevWAJSIU2XoO66BSXw==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_int32",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAQPNXJVXMEjGZnftMuf2INKufXCtQIRHdw5wTgn6QYt3ejcoAXyiwI4XIUizkpsob494qpt2in4tWeiO7b9zkA8Q==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_int64",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACKWM29kOcLsfSLfJJ3SSmLr+wgrTtpu1lads1NzDz80AjMyrstw/GMdCuzX+AS+JS84Si2cT1WPMemTkBdVdGAw==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_binData",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAFB/KHZQHaHHo8fctcl7v6kR+sLkJoTRx2cPSSck9ya+nbGROSeFhdhDRHaCzhV78fDEqnMDSVPNi+ZkbaIh46GQ==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_javascript",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAANrvMgJkTKWGMc9wt3E2RBR2Hu5gL9p+vIIdHe9FcOm99t1W480/oX1Gnd87ON3B399DuFaxi/aaIiQSo7gTX6Lw==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_timestamp",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAARJHaM4Gq3MpDTdBasBsEolQaOmxJQU1wsZVaSFAOLpEh1QihDglXI95xemePFMKhg+KNpFg7lw1ChCs2Wn/c26Q==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_regex",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAALVnxM4UqGhqf5eXw6nsS08am3YJrTf1EvjKitT8tyyMAbHsICIU3GUjuC7EBofCHbusvgo7pDyaClGostFz44nA==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_dbPointer",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACKWM29kOcLsfSLfJJ3SSmLr+wgrTtpu1lads1NzDz80AjMyrstw/GMdCuzX+AS+JS84Si2cT1WPMemTkBdVdGAw==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "encrypted_date",
        "plaintext": "test",
        "data": {
            "$binary": {
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAJ5sN7u6l97+DswfKTqZAijSTSOo5htinGKQKUD7pHNJYlLXGOkB4glrCu7ibu0g3344RHQ5yUp4YxMEa8GD+Snw==",
                "subType": "06"
            }
        }
    },
    {
        "schema": "basic",
        "field": "random",
        "plaintext": "abc",
        "data": {
            "$binary": {
                "base64": "AgAAAAAAAAAAAAAAAAAAAAACyfp+lXvKOi7f5vh6ZsCijLEaXFKq1X06RmyS98ZvmMQGixTw8HM1f/bGxZjGwvYwjXOkIEb7Exgb8p2KCDI5TQ==",
                "subType": "06"
            }
        }
    },
]


def schema(name="basic"):
    return schemas[name]


def schema_w_type(type):
    schema = {
        "properties": {},
        "bsonType": "object"
    }
    schema["properties"]["encrypted_" + type] = {"encrypt": {
        "keyId": [keys["basic"]["_id"]],
        "bsonType": type,
        "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
    }
    }
    return schema


def key(name="basic"):
    return keys[name]


def ciphertext(plaintext, field, schema="basic"):
    for ciphertext in ciphertexts:
        if schema == ciphertext["schema"] and field == ciphertext["field"] and plaintext == ciphertext["plaintext"]:
            return ciphertext["data"]
    raise Exception("Ciphertext needs to be pre-generated")


def local_provider():
    return {
        "key": {"$binary": {"base64": "Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk", "subType": "00"}}
    }


template = Template(open(filepath, "r").read())
injections = {
    "schema": schema,
    "ciphertext": ciphertext,
    "key": key,
    "local_provider": local_provider,
    "schema_w_type": schema_w_type
}

rendered = template.render(**injections)
# check for valid YAML.
parsed = yaml.load(rendered)
# print as JSON.
as_json = json.dumps(parsed, indent=4)
open(f"{os.path.join(filedir,filename + '.yml')}", "w").write(rendered)
open(f"{os.path.join(filedir,filename + '.json')}", "w").write(as_json)
print(f"Generated {os.path.join(filedir,filename)}.yml|json")
