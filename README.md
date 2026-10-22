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

`npm run check` also verifies each signature in `signatures/` with Hibi's public keys and compares it with the files in `addons/`. `npm run check:remote` reads each linked repository folder at its pinned commit and each ZIP file, without running anything from them, and checks every file against the catalog entry and its signature. Add `-- --pending` to either command to report a missing or outdated signature instead of failing; pull requests run them that way because merged entries are signed automatically. An invalid signature always fails.

## How addons are signed

Maintainers review each pull request: the package source, its manifest, and the access it asks for. Merging a pull request accepts the entry. The [sign workflow](.github/workflows/sign.yml) then signs every entry whose signature is missing or no longer matches its files, checks the whole directory strictly, and commits the new signatures to `main`. Entries with a valid signature are left unchanged.

The workflow signs with the directory's own key, which Hibi trusts for addon packages. That private key exists only as a secret of the `addon-signing` environment, which runs only on `main`. The job that holds it can read the repository but not change it; a separate job without the key commits only files in `signatures/` and `hibi-addon.sig.json`. Pull requests, including those from forks, never receive the key. Nothing from a listed package runs at any step. The directory workflow never receives or uses Hibi's offline root private key.

To sign one entry again even though its signature is valid, run the sign workflow on `main` from the Actions tab and enter its id.

Maintainers can also sign by hand with `node scripts/addon-signing.mjs sign <folder> --key <private key>` from a [Hibi](https://github.com/schmayterling/hibi) checkout, then copy the resulting `hibi-addon.sig.json` to `signatures/<id>.json`. `npm run check` and `npm run check:remote` fail if a signature does not match the listed files exactly.

## License

The catalog, scripts, and documentation in this repository are available under the [MIT License](LICENSE). Each addon has its own license, stated in its catalog entry and included in its folder.
