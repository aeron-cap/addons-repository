# rosé pine dawn

an unofficial hibi adaptation of [rose-pine/neovim](https://github.com/rose-pine/neovim), ported by [schmayterling](https://github.com/schmayterling).

## use

install **rosé pine dawn** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose **light** appearance and select **rosé pine dawn** from the **light colorscheme** list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.

this addon contains the light dawn variant. it does not add the dark rosé pine or moon palettes.

## source and license

the upstream palette is pinned to commit `ff483051a47e27d84bdef47703538df1ed9f4a47`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [lua/rose-pine/palette.lua](https://github.com/rose-pine/neovim/blob/ff483051a47e27d84bdef47703538df1ed9f4a47/lua/rose-pine/palette.lua)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| dawn | muted | `#797593` | `#605c74` |
| dawn | accent | `#907aa9` | `#736287` |
| dawn | caret | `#d7827e` | `#bd726f` |
| dawn | syntax-heading | `#907aa9` | `#736287` |
| dawn | syntax-code | `#d7827e` | `#945a57` |
| dawn | syntax-meta | `#56949f` | `#417079` |
| dawn | syntax-quote | `#797593` | `#6a6781` |
| dawn | syntax-strong | `#b4637a` | `#995468` |
| dawn | syntax-emphasis | `#907aa9` | `#736287` |
| dawn | syntax-string | `#ea9d34` | `#8f6020` |
| dawn | syntax-number | `#d7827e` | `#945a57` |
| dawn | syntax-comment | `#9893a5` | `#6c6875` |
| dawn | syntax-type | `#56949f` | `#417079` |
| dawn | syntax-function | `#b4637a` | `#995468` |
| dawn | status-success | `#286983` | `#276780` |
| dawn | status-warning | `#ea9d34` | `#81561d` |
| dawn | status-danger | `#b4637a` | `#8c4d5f` |
| dawn | status-info | `#56949f` | `#3b666e` |
