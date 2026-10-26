# everforest light

an unofficial hibi adaptation of [sainnhe/everforest](https://github.com/sainnhe/everforest), ported by [schmayterling](https://github.com/schmayterling).

## use

install **everforest light** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose **light** appearance and select **everforest light soft**, **everforest light medium**, **everforest light hard** from the **light colorscheme** list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.

soft uses the most muted paper background, medium is the upstream default, and hard uses the brightest paper background. all three variants use light appearance.

## source and license

the upstream palette is pinned to commit `85a86eb62409e3ec88713bff3d1b9d7374e112e4`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [autoload/everforest.vim](https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/autoload/everforest.vim)
- [palette.md](https://github.com/sainnhe/everforest/blob/85a86eb62409e3ec88713bff3d1b9d7374e112e4/palette.md)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. hovered and selected rows use an upstream green tint that remains visible on both sidebar and menu backgrounds. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| soft | ink | `#5c6a72` | `#57656c` |
| soft | muted | `#939f91` | `#5d645b` |
| soft | accent | `#8da101` | `#5c6901` |
| soft | code-ink | `#5c6a72` | `#5a6870` |
| soft | selection-ink | `#5c6a72` | `#58666d` |
| soft | syntax-heading | `#f57d26` | `#9d5018` |
| soft | syntax-link | `#3a94c5` | `#2a6c90` |
| soft | syntax-code | `#8da101` | `#5e6c01` |
| soft | syntax-meta | `#df69ba` | `#9a4880` |
| soft | syntax-quote | `#939f91` | `#60675e` |
| soft | syntax-strong | `#5c6a72` | `#5a6870` |
| soft | syntax-emphasis | `#5c6a72` | `#5a6870` |
| soft | syntax-keyword | `#f85552` | `#b33d3b` |
| soft | syntax-string | `#8da101` | `#5e6c01` |
| soft | syntax-number | `#df69ba` | `#9a4880` |
| soft | syntax-comment | `#939f91` | `#60675e` |
| soft | syntax-type | `#dfa000` | `#845e00` |
| soft | syntax-function | `#8da101` | `#5e6c01` |
| soft | syntax-variable | `#3a94c5` | `#2a6c90` |
| soft | syntax-operator | `#f57d26` | `#9d5018` |
| soft | status-success | `#8da101` | `#5c6901` |
| soft | status-warning | `#dfa000` | `#7f5b00` |
| soft | status-danger | `#f85552` | `#ab3b39` |
| soft | status-info | `#3a94c5` | `#29688a` |
| medium | muted | `#939f91` | `#646c63` |
| medium | accent | `#8da101` | `#616f01` |
| medium | syntax-heading | `#f57d26` | `#a9561a` |
| medium | syntax-link | `#3a94c5` | `#2d739a` |
| medium | syntax-code | `#8da101` | `#667401` |
| medium | syntax-meta | `#df69ba` | `#a54e8a` |
| medium | syntax-quote | `#939f91` | `#676f66` |
| medium | syntax-keyword | `#f85552` | `#bf413f` |
| medium | syntax-string | `#8da101` | `#667401` |
| medium | syntax-number | `#df69ba` | `#a54e8a` |
| medium | syntax-comment | `#939f91` | `#676f66` |
| medium | syntax-type | `#dfa000` | `#8f6600` |
| medium | syntax-function | `#8da101` | `#667401` |
| medium | syntax-variable | `#3a94c5` | `#2d739a` |
| medium | syntax-operator | `#f57d26` | `#a9561a` |
| medium | status-success | `#8da101` | `#616f01` |
| medium | status-warning | `#dfa000` | `#8a6300` |
| medium | status-danger | `#f85552` | `#b83f3d` |
| medium | status-info | `#3a94c5` | `#2c7096` |
| hard | muted | `#939f91` | `#656e64` |
| hard | accent | `#8da101` | `#647201` |
| hard | syntax-heading | `#f57d26` | `#ae591b` |
| hard | syntax-link | `#3a94c5` | `#2e769e` |
| hard | syntax-code | `#8da101` | `#687701` |
| hard | syntax-meta | `#df69ba` | `#a9508d` |
| hard | syntax-quote | `#939f91` | `#6a7268` |
| hard | syntax-keyword | `#f85552` | `#c44341` |
| hard | syntax-string | `#8da101` | `#687701` |
| hard | syntax-number | `#df69ba` | `#a9508d` |
| hard | syntax-comment | `#939f91` | `#6a7268` |
| hard | syntax-type | `#dfa000` | `#916800` |
| hard | syntax-function | `#8da101` | `#687701` |
| hard | syntax-variable | `#3a94c5` | `#2e769e` |
| hard | syntax-operator | `#f57d26` | `#ae591b` |
| hard | status-success | `#8da101` | `#647201` |
| hard | status-warning | `#dfa000` | `#8c6500` |
| hard | status-danger | `#f85552` | `#bc413e` |
| hard | status-info | `#3a94c5` | `#2d739a` |
