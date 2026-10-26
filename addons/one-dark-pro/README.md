# one dark pro

an unofficial hibi adaptation of [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro), ported by [schmayterling](https://github.com/schmayterling).

## use

install **one dark pro** from **settings → addon manager → hibi garden**, then enable it. open **settings → appearance**, choose **dark** appearance and select **one dark pro** from the **dark colorscheme** list. system mode uses your chosen palette whenever your computer switches to its matching appearance.

to remove these colors, disable this addon in **settings → addon manager**. hibi returns to its default palette and remembers your choice for when you enable it again.



## source and license

the upstream palette is pinned to commit `ce79c5f7116607d635e06b7ef4413d85a77905e4`. it uses the mit license; the full original copyright and permission notices are preserved without changes in [license.txt](LICENSE.txt) and in each palette's license information.

- [themes/OneDark-Pro.json](https://github.com/Binaryify/OneDark-Pro/blob/ce79c5f7116607d635e06b7ef4413d85a77905e4/themes/OneDark-Pro.json)

## hibi adaptation

colors are mapped to hibi's sidebar, controls, selections, code blocks, syntax, and status messages. base backgrounds are preserved. this package contains color data and needs no javascript or network access.

this is a readable adaptation of the upstream palette. body, dim, syntax, and status text meet 4.5:1 on their backgrounds, including hover and selected controls where those roles appear. accent text meets 4.5:1 on base surfaces; the caret and focus accents meet 3:1. pastel foregrounds may be noticeably deeper than upstream so they remain readable.

all foreground changes are listed below:

| palette | role | upstream | hibi |
| --- | --- | --- | --- |
| dark | selection-ink | `#abb2bf` | `#b7bdc8` |
| dark | syntax-heading | `#e06c75` | `#e47e86` |
| dark | syntax-quote | `#7f848e` | `#999da5` |
| dark | syntax-keyword | `#c678dd` | `#c97fdf` |
| dark | syntax-comment | `#7f848e` | `#999da5` |
| dark | syntax-variable | `#e06c75` | `#e47e86` |
| dark | status-danger | `#ff616e` | `#ff747f` |
