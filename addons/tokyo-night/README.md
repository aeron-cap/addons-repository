# tokyo night

an unofficial hibi adaptation of [tokyo-night/tokyo-night-vscode-theme](https://github.com/tokyo-night/tokyo-night-vscode-theme), ported by [schmayterling](https://github.com/schmayterling).

## use

install **tokyo night** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose light or dark appearance and select **tokyo night**, **tokyo night storm**, **tokyo night light** from the matching colorscheme list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.

the light variant uses the upstream surface color for code blocks and the active-tab color for selected controls, so these remain visible against the page.

## source and license

the upstream palette is pinned to commit `7c0f11eaef322f293621ca7befe462214b7ea468`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [themes/tokyo-night-color-theme.json](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-color-theme.json)
- [themes/tokyo-night-storm-color-theme.json](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-storm-color-theme.json)
- [themes/tokyo-night-light-color-theme.json](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/7c0f11eaef322f293621ca7befe462214b7ea468/themes/tokyo-night-light-color-theme.json)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| night | muted | `#787c99` | `#8689a3` |
| night | accent | `#6183bb` | `#6384bc` |
| night | syntax-link | `#6183bb` | `#6384bc` |
| night | syntax-quote | `#51597d` | `#7d839e` |
| night | syntax-comment | `#51597d` | `#7d839e` |
| night | status-danger | `#db4b4b` | `#e06262` |
| storm | muted | `#8089b3` | `#929abe` |
| storm | accent | `#668ac4` | `#6f91c8` |
| storm | syntax-link | `#668ac4` | `#6f91c8` |
| storm | syntax-quote | `#5f6996` | `#878fb0` |
| storm | syntax-comment | `#5f6996` | `#878fb0` |
| storm | status-danger | `#db4b4b` | `#e57c7c` |
| storm | status-info | `#0da0ba` | `#23a9c0` |
| light | muted | `#707280` | `#5c5d69` |
| light | syntax-quote | `#888b94` | `#5b5d63` |
| light | syntax-number | `#965027` | `#904d25` |
| light | syntax-comment | `#888b94` | `#5b5d63` |
| light | syntax-type | `#006c86` | `#00677f` |
| light | status-warning | `#8f5e15` | `#815513` |
| light | status-danger | `#bd4040` | `#a63838` |
| light | status-info | `#0da0ba` | `#086879` |
