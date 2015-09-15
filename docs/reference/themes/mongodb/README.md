# MongoDB Hugo Theme

## Quick Start

 1. Install hugo
 2. Create your new site: `hugo new site <SITENAME>`
 3. Copy this theme to: `<SITENAME>/themes/mongodb`
 4. Add `theme = mongodb` to config.toml
 5. Create `<SITENAME>/data/mongodb.toml` and configure
 6. Create content

## Requirements
Hugo version 0.13 [download here](https://github.com/spf13/hugo/releases/tag/v0.13)
<br>
Check out the hugo [quickstart guide](http://gohugo.io/overview/quickstart/).

## Running the server
To run the server call the hugo command:

    hugo server --baseUrl=http://localhost/ --buildDrafts --watch

| Options explained           ||
| --------------------------- |--------------------------------------------------------------------------|
| server                      | Hugo runs its own webserver to render the files                          |
| --baseUrl=http://localhost/ | Normally the base url will be /mongo-java-driver for gh-pages            |
| --buildDrafts               | Include draft posts in the output - these won't be published to gh-pages |
| -- watch                    | Automatically reloads on file change                                     |


All generated content will appear in the `./public` folder, so you can also check the filesystem and browse it locally.<br>
For more hugo server options run: `hugo --help`

### Data

You *should* create `./data/mongodb.toml` and copy the `themes/mongodb/data/mongodb.toml` file and set the values as needed.

## Creating new content

Handy [markdown cheat sheet](https://github.com/adam-p/markdown-here/wiki/Markdown-Here-Cheatsheet) will help with markdown issues and in markdown you can fall back to html if needed.

To create new content run: `hugo new <contentFileName>.md`  and the new file will created in the `./content` directory and marked as a `draft`.

Its a good idea to group similar content together by placing it in a directory which can also be done by the `new` command eg: `hugo new tutorial/newTutorial.md`

### Menus
Menu configuration generally goes in the content
[front matter](http://gohugo.io/content/front-matter/).  See the hugo [menu](http://gohugo.io/extras/menus/) docs, menus can also be configured in the top level `config.toml`.

The weight parameter relates to where it will appear in the menu starting with the lowest at the top and the highest at the bottom (heavy things sink).

## MongoDB Theme
**Do not delete / change anything in themes**.<br>
Currently, `./themes/mongodb` provides all templates and configuration.  You can override *anything* by providing a top level version in the top level directory (`data, layouts, static`), so feel free to copy or add your own layouts.  

You shouldn't edit the mongodb theme directly as it will be updated and any changes will be lost.
