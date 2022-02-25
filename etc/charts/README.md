# Charts and mermaid code

The `mermaid` directory contains the [mermaid](https://mermaid-js.github.io/mermaid/#/) files which serve as the source code for the svg files included in the `../errors.md`

To generate these files, there is an included script, `build_images.sh` which builds images for all the mermaid files in the `mermaid` directory.

To use this script, the [mermaid cli](https://github.com/mermaid-js/mermaid-cli) must be installed and be accessible via your $PATH variable.

**Note on mermaid installation**

It is preferable to install mermaid via npm rather than brew since brew will install node as a dependency which could interfere with nvm.
