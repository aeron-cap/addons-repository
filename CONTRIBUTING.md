# Contributing addons

Each addon needs one entry in `catalog.json`. The entry describes the addon and says where Hibi can get it.

## Prepare the package

A package is a folder that Hibi can install without building anything. It needs:

- `hibi-addon.json`, with an ID that no built-in Hibi addon uses;
- a user-facing `README.md` that explains how to enable, use, and disable the addon;
- its license in `LICENSE.txt` or `LICENSE.md`, because Hibi installs only the package folder;
- every file the addon uses, including compiled JavaScript for extensions.

Hibi installs only `.js`, `.mjs`, `.json`, `.css`, `.md`, `.txt`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.woff`, `.woff2`, `.ttf`, `.mp3`, `.ogg`, and `.wav` files. A file without an extension, such as `LICENSE`, stops the installation. A package can hold up to 1,000 files and folders, 5 MiB per file, and 25 MiB in total. Native handlers, importers, and addon windows cannot be installed.

The [addon starter](https://github.com/hibigarden/addon-starter) follows these rules and checks them for you.

## Choose where the package lives

Put the package in this repository when you want us to host it. Add the folder as `addons/<id>/`, where `<id>` matches the ID in `hibi-addon.json`, and set `path` in the catalog entry.

Link to your own repository when you want to keep publishing there. Set `repository` to the GitHub repository URL, such as `https://github.com/you/hello-theme`, the full 40-character commit you want listed, and the folder that holds `hibi-addon.json` if it is not the repository root. When someone installs the addon from the directory, Hibi installs that exact commit, so open a new pull request to list a newer one.

Link to a ZIP file when you publish releases elsewhere. Set `download` to its HTTPS URL, its size in bytes, and its lowercase SHA-256 digest. Hibi refuses a directory download that does not match, so the file must never change. A release asset works well; a branch archive does not, because it changes with every commit.

## Write the catalog entry

Copy `id`, `name`, `description`, `version`, `apiVersion`, `kind`, and `authors` from `hibi-addon.json` exactly. Add `license` as an [SPDX expression](https://spdx.org/licenses/), and optionally a `homepage` with an HTTPS URL. Use exactly one of `path`, `repository`, or `download`.

```json
[
  {
    "id": "hello",
    "name": "Hello",
    "description": "Adds a Say hello command to the command palette.",
    "version": "1.0.0",
    "apiVersion": 2,
    "kind": "extension",
    "authors": [{ "displayName": "Your name" }],
    "license": "MIT",
    "path": "addons/hello"
  },
  {
    "id": "hello-theme",
    "name": "Hello theme",
    "description": "A warm light color scheme and a matching dark one.",
    "version": "1.0.0",
    "apiVersion": 2,
    "kind": "theme",
    "authors": [{ "displayName": "Your name" }],
    "license": "MIT",
    "homepage": "https://github.com/you/hello-theme",
    "repository": {
      "url": "https://github.com/you/hello-theme",
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "path": "addons/hello-theme"
    }
  },
  {
    "id": "hello-tools",
    "name": "Hello tools",
    "description": "More greetings.",
    "version": "2.0.0",
    "apiVersion": 2,
    "kind": "extension",
    "authors": [{ "displayName": "Your name" }],
    "license": "MIT",
    "download": {
      "url": "https://github.com/you/hello-tools/releases/download/v2.0.0/hello-tools.zip",
      "size": 4096,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  }
]
```

The catalog has no field for signatures. After a maintainer accepts your addon, they sign the exact listed files and add the signature as `signatures/<id>.json`. You do not need a key, and you do not need to sign anything yourself.

## Test and submit

1. Run `npm run check` and `npm test`. For a linked repository or download, also run `npm run check:remote`. Until a maintainer adds the signature, the checks report that your entry needs one; fix everything else they report.
2. Install the package in Hibi. Use **Install addon…** for a local folder or **Install from URL** for a repository or ZIP file. Unsigned packages need **Allow unsigned addons** under **Settings → Addon Manager → Security**.
3. Enable the addon, use it, disable it, and check that its readme explains those steps.
4. Open a pull request that describes what the addon does, which access it asks for, and how you tested it.

Reviewers read the package source and its manifest. They do not run build scripts or install dependencies from linked repositories during review. When the addon is accepted, a maintainer signs it and merges the pull request. The addon then appears on [hibi.garden/addons](https://www.hibi.garden/addons/) and in Hibi after **Refresh**; no Hibi release is needed. Each new version needs a new pull request and a new signature.

## Licenses

The catalog, scripts, and documentation in this repository use the MIT License. Each addon keeps its own license, which its catalog entry and license file must state. Submit only code you own or have permission to publish under that license, and keep the credits and notices that upstream material requires.

Code copied from Hibi is licensed under GPL-3.0-only. It keeps that license unless every relevant copyright holder agrees to another one.
