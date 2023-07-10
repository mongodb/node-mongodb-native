# libmongocrypt example data #

This directory contains a simple example of mocked responses to test libmongocrypt and driver wrappers. Data for other scenarios and edge cases is in the `data` directory.

The HTTP reply file, kms-decrypt-reply.txt, has regular newline endings \n that MUST be replaced by \r\n endings when reading the file for testing.