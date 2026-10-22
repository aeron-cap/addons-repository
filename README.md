# Hibi addon repository

This repository is a directory of community addons for [Hibi](https://hibi.garden). Hibi's addon browser and [hibi.garden/addons](https://www.hibi.garden/addons/) read `catalog.json` to show what is available. The directory publishes on its own schedule: a merged entry appears on the website and in Hibi after **Refresh**, without a new Hibi release.

A directory entry can point to one of three places:

- a ready-to-install package in this repository, in `addons/<id>/`;
- a package in another public Git repository, pinned to a reviewed commit;
- a ZIP file that someone publishes elsewhere, pinned to its size and SHA-256 digest.

Every addon in the directory has been reviewed and signed by Hibi. Its signature is in `signatures/<id>.json` and covers the exact files listed: the folder in this repository, the folder at the pinned commit, or the contents of the pinned ZIP file. When someone installs an addon from the directory, Hibi checks that signature before it installs anything, so directory addons do not need **Allow unsigned addons**.

The signature covers only those files. The same addon installed another way, such as from its own repository URL or a newer commit, is unsigned unless its author ships a Hibi signature, and needs **Allow unsigned addons** under **Settings → Addon Manager → Security**.

## Install an addon from this repository

In Hibi's Addon Manager, choose **Install from URL** and enter `https://github.com/hibigarden/addons-repository`. Hibi lists every package in `addons/` so you can choose the ones you want. For an addon that lives in another repository or ZIP file, use the link in its catalog entry instead.

## Add an addon

Read [CONTRIBUTING.md](CONTRIBUTING.md). To start a new addon, use the [addon starter](https://github.com/hibigarden/addon-starter), which contains an example extension and theme.

Run the checks with Node.js 22.18 or later. The repository has no dependencies.

```sh
npm run check
npm test
```

`npm run check` also verifies each signature in `signatures/` with Hibi's public key and compares it with the files in `addons/`. `npm run check:remote` reads each linked repository folder at its pinned commit and each ZIP file, without running anything from them, and checks every file against the catalog entry and its signature. Pull requests run all three.

## Sign an accepted addon

Only maintainers sign, after reviewing the package source and manifest. The private key stays with the maintainer; it is never committed or given to CI.

1. Put the exact files that will be listed in a folder. For `addons/<id>/`, use that folder. For a repository entry, export the listed folder at the pinned commit without running scripts, for example `git archive <commit> <folder> | tar -x -C <empty folder>`. For a download entry, extract the ZIP file.
2. From a [Hibi](https://github.com/schmayterling/hibi) checkout, run `node scripts/addon-signing.mjs sign <folder> --key <private key>`. It writes `hibi-addon.sig.json` in that folder.
3. Copy that file to `signatures/<id>.json` and commit it with the catalog entry.
4. Run `npm run check` and `npm run check:remote`. They fail if the signature does not match the listed files exactly.

Merging the pull request publishes the addon. A new version needs a new signature.

## License

The catalog, scripts, and documentation in this repository are available under the [MIT License](LICENSE). Each addon has its own license, stated in its catalog entry and included in its folder.
