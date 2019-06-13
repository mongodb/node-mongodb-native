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
                "base64": "AQICAHhQNmWG2CzOm1dq3kWLM+iDUZhEqnhJwH9wZVpuZ94A8gF9FSYZL9Ze8TvTA3WBd3nmAAAAwjCBvwYJKoZIhvcNAQcGoIGxMIGuAgEAMIGoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDLV3GHktEO8AlpsYBwIBEIB7ho0DQF7hEQPRz/8b61AHm2czX53Y9BNu5z+oyGYsoP643M58aTGsaHQzkTaAmGKlZTAEOjJkRJ4gZoabVuv4g6aJqf4k4w8pK7iIgHwMNy4nbUAqOWmqtnKpHZgy6jcFN2DzZzHIi4SNFsCkFc6Aw30ixtvqIDQPAXMW",
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
    "local": {
        "_id": {
            "$binary": {
                "base64": "AAAAAAAAAAAAAAAAAAAAAA==",
                "subType": "04"
            }
        },
        "keyMaterial": {
            "$binary": {
                "base64": "db27rshiqK4Jqhb2xnwK4RfdFb9JuKeUe6xt5aYQF4o62tS75b7B4wxVN499gND9UVLUbpVKoyUoaZAeA895OENP335b8n8OwchcTFqS44t+P3zmhteYUQLIWQXaIgon7gEgLeJbaDHmSXS6/7NbfDDFlB37N7BP/2hx1yCOTN6NG/8M1ppw3LYT3CfP6EfXVEttDYtPbJpbb7nBVlxD7w==",
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
                    "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACtsdOjHK3CkpNjAAMznkYbeR6Z+yLzCRv4zOb7VfKnJdmU0W5MD8GVODx8K+KuBoCbE1SfGfPgX6NhS/RKpQ12w==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAC1ijPpI+oG1mNiFChFAz7heo3R150yDhxZ7nOnPUwDM+aEvPRBuU6rXtgkVt7mgLd2H9rq9iChCAV46YKcpNrFw==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACKScltsm9Kw6AsyC/GQ8HZosvXZkixhFqNimPmzaSKu1b0IdTubAjsEG3TAxL5aTsQfT5mtr63hvvXpjMef8jzQ==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAACKWM29kOcLsfSLfJJ3SSmLr+wgrTtpu1lads1NzDz80AjMyrstw/GMdCuzX+AS+JS84Si2cT1WPMemTkBdVdGAw==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAHIwWYUBoGNSA7MnAqobBNVYee0mqtNZF1AQiTvXkR1B9a6XXEJR32Ttbbe2PLR/us/dmcne84BEYSq8h+j26lIA==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAOEpZwd/k1BQjT1owTq9NgQAoANKKQFbpfwDllEyFxjehyN/pTt1Rav51OAgbA5Bgg90Zpcvd0kHhA/S40bHZxXw==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAQWPxV7BQ88Q5vW9HnPheOJyN29G/M7hhnCFmKL4oa+yzSPJhy4Xyxdbn4U80RXvDQMNz03ij5zbXFgrLz8BJIpg==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAASHSS/JTyJK5d4CErUaVyI4F/Tl00a6J7KdTfgzXQKGhxKVupFpaanbuEvMOUiMbQfaWD4kv+uHrJxdm1Oyl46cg==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAF22b7ESSyoBVv1Igu5PRd0Ya/WZ4QPWzB1D/HZ4dmA/Zl7+FunNK5jnG2AjYxfdijpskLfjFSclvuolPwTiTrig==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAANRHRbeR9tKL4SzZmgcMZXiGNBk/Kb7CKG72rAnwywbq45V3Upy2kK9royiRQR9Gwqm/3Idw5U86Zp/kXdQuzXng==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAARlcbjVBI9YtvKM/ZuonWoF3mXV9C8LuYRNh0CM9nKjkmAMoIZTtqfhWM78hS1UORnUwcnZT+YuuO3QjuVDy8Esw==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAALsSf4Z6nvjeVO7+AXjuYYamWMg/z8+W1HYdOaZfWuH24sCKSc1hvFm72acUJx77mTzQ8Ap94rzYMk1/FF7wbB/A==",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAMowf5nUEkdLoNHUa+xRaBpKZItT4x+u/29ZESu+jQoCcA/V42/nev8UVBnVNfEpQPos39HeuwieVBeK02V8iqDZEbWXWmzRKNw3YNU6GZafw=",
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
                "base64": "AQAAAAAAAAAAAAAAAAAAAAAJipr5TW6wma9Z0Xa90u+w4hcRLeEE99BNy45oyzM07NaO42g5lLzbqyIkSO1q3dIbqIHd1hJ4s3a53bUjrh+2lQ==",
                "subType": "06"
            }
        }
    }
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
        "key": {"$binary": {"base64": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "subType": "00"}}
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
