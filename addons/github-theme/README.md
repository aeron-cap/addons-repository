# github theme

an unofficial hibi adaptation of [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme), ported by [schmayterling](https://github.com/schmayterling).

## use

install **github theme** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose light or dark appearance and select **github light**, **github dark** from the matching colorscheme list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.

this also uses [primer primitives 7.10.0](https://github.com/primer/primitives/tree/f82864eb33c37f8624704bd996bc21b97d3c311b), as pinned by the vscode theme. github inc.'s separate mit notice is included in license.txt. foreground overrides follow the upstream `src/colors.js`, and hover and active states use primer's neutral colors.

## source and license

the upstream palette is pinned to commit `cd78e5e4e7bcf132a6f428ae0f32264bb1b729cf`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [src/colors.js](https://github.com/primer/github-vscode-theme/blob/cd78e5e4e7bcf132a6f428ae0f32264bb1b729cf/src/colors.js)
- [src/theme.js](https://github.com/primer/github-vscode-theme/blob/cd78e5e4e7bcf132a6f428ae0f32264bb1b729cf/src/theme.js)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| light | muted | `#656d76` | `#636b74` |
| light | syntax-comment | `#6e7781` | `#6b737d` |
| light | status-success | `#1a7f37` | `#197a35` |
| light | status-warning | `#9a6700` | `#8f6000` |
| light | status-danger | `#cf222e` | `#cd222e` |
| light | status-info | `#0969da` | `#0966d3` |
| dark | muted | `#7d8590` | `#a4aab1` |
| dark | accent | `#2f81f7` | `#3987f7` |
| dark | syntax-heading | `#1f6feb` | `#3a80ed` |
| dark | status-success | `#3fb950` | `#4ebf5e` |
| dark | status-warning | `#d29922` | `#d6a134` |
| dark | status-danger | `#f85149` | `#fa8983` |
| dark | status-info | `#2f81f7` | `#74abfa` |
