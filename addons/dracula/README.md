# dracula

an unofficial hibi adaptation of [dracula/visual-studio-code](https://github.com/dracula/visual-studio-code), ported by [schmayterling](https://github.com/schmayterling).

## use

install **dracula** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose **dark** appearance and select **dracula** from the **dark colorscheme** list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.



## source and license

the upstream palette is pinned to commit `b50e62e320906d5f57a8bf05fd6ddf23b890d6dd`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [src/dracula.yml](https://github.com/dracula/visual-studio-code/blob/b50e62e320906d5f57a8bf05fd6ddf23b890d6dd/src/dracula.yml)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| dark | muted | `#6272a4` | `#adb6d0` |
| dark | syntax-quote | `#6272a4` | `#8390b7` |
| dark | syntax-comment | `#6272a4` | `#8390b7` |
| dark | status-danger | `#ff5555` | `#ff9b9b` |
