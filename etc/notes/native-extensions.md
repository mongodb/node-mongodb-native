# Native Extensions

The `kerberos` package is a C++ extension that requires a build environment to be installed on your system. You must be able to build Node.js itself in order to compile and install the `kerberos` module. Furthermore, the `kerberos` module requires the MIT Kerberos package to correctly compile on UNIX operating systems. Consult your UNIX operation system package manager for what libraries to install.

**Windows already contains the SSPI API used for Kerberos authentication. However, you will need to install a full compiler tool chain using Visual Studio C++ to correctly install the Kerberos extension.**

## Diagnosing on UNIX

If you don’t have the build-essentials, this module won’t build. In the case of Linux, you will need gcc, g++, Node.js with all the headers and Python. The easiest way to figure out what’s missing is by trying to build the Kerberos project. You can do this by performing the following steps.

```bash
git clone https://github.com/mongodb-js/kerberos
cd kerberos
npm install
```

If all the steps complete, you have the right toolchain installed. If you get the error "node-gyp not found," you need to install `node-gyp` globally:

```bash
npm install -g node-gyp
```

If it correctly compiles and runs the tests you are golden. We can now try to install the `mongod` driver by performing the following command.

```bash
cd yourproject
npm install mongodb --save
```

If it still fails the next step is to examine the npm log. Rerun the command but in this case in verbose mode.

```bash
npm --loglevel verbose install mongodb
```

This will print out all the steps npm is performing while trying to install the module.

## Diagnosing on Windows

A compiler tool chain known to work for compiling `kerberos` on Windows is the following.

- Visual Studio C++ 2010 (do not use higher versions)
- Windows 7 64bit SDK
- Python 2.7 or higher

Open the Visual Studio command prompt. Ensure `node.exe` is in your path and install `node-gyp`.

```bash
npm install -g node-gyp
```

Next, you will have to build the project manually to test it. Clone the repo, install dependencies and rebuild:

```bash
git clone https://github.com/christkv/kerberos.git
cd kerberos
npm install
node-gyp rebuild
```

This should rebuild the driver successfully if you have everything set up correctly.

## Other possible issues

Your Python installation might be hosed making gyp break. Test your deployment environment first by trying to build Node.js itself on the server in question, as this should unearth any issues with broken packages (and there are a lot of broken packages out there).

Another tip is to ensure your user has write permission to wherever the Node.js modules are being installed.
