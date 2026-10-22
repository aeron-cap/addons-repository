# Hibi addon repository

This repository is a directory of community addons for [Hibi](https://hibi.garden). Hibi's addon browser and [hibi.garden/addons](https://www.hibi.garden/addons/) read `catalog.json` to show what is available.

A directory entry can point to one of three places:

- a ready-to-install package in this repository, in `addons/<id>/`;
- a package in another public Git repository, pinned to a reviewed commit;
- a ZIP file that someone publishes elsewhere, pinned to its size and SHA-256 digest.

Listing an addon here helps people find it. It does not sign the addon or vouch for it. When someone installs an addon, Hibi checks its signature as usual. Addons without a Hibi signature install only after the person turns on **Allow unsigned addons** under **Settings → Addon Manager → Security**.

## Install an addon from this repository

In Hibi's Addon Manager, choose **Install from URL** and enter `https://github.com/hibigarden/addons-repository`. Hibi lists every package in `addons/` so you can choose the ones you want. For an addon that lives in another repository or ZIP file, use the link in its catalog entry instead.

## Add an addon

Read [CONTRIBUTING.md](CONTRIBUTING.md). To start a new addon, use the [addon starter](https://github.com/hibigarden/addon-starter), which contains an example extension and theme.

Run the checks with Node.js 22.18 or later. The repository has no dependencies.

```sh
npm run check
npm test
```

`npm run check:remote` also downloads the linked manifests and ZIP files and compares them with the catalog.

## License

The catalog, scripts, and documentation in this repository are available under the [MIT License](LICENSE). Each addon has its own license, stated in its catalog entry and included in its folder.
