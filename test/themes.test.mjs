import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const themes = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
  .filter(entry => entry.kind === 'theme')
const rgb = color => [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16))
const luminance = color => rgb(color).map(value => {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05)

function composite(color, background) {
  if (color.length === 7) return color
  const alpha = Number.parseInt(color.slice(7, 9), 16) / 255
  return '#' + rgb(color).map((value, index) =>
    Math.round(value * alpha + rgb(background)[index] * (1 - alpha))
      .toString(16).padStart(2, '0'),
  ).join('')
}

for (const entry of themes) {
  const folder = join(root, entry.path)
  const manifest = JSON.parse(readFileSync(join(folder, 'hibi-addon.json'), 'utf8'))
  const notice = readFileSync(join(folder, 'LICENSE.txt'), 'utf8')

  test(`${entry.id} ships license notices and color data without executable files`, () => {
    assert.equal(manifest.kind, 'theme')
    for (const field of ['entry', 'native', 'styles', 'capabilities', 'network'])
      assert.equal(manifest[field], undefined, field)
    assert.ok(readdirSync(folder).every(file => /\.(?:json|md|txt)$/.test(file)))
    assert.match(notice, /Copyright/)
    assert.match(notice, /Permission is hereby granted/)
    for (const scheme of manifest.themes) {
      if (['rose-pine-dawn', 'everforest-light'].includes(entry.id))
        assert.equal(scheme.appearance, 'light')
      assert.equal(scheme.license.name, entry.license)
      assert.equal(scheme.license.text, notice)
      assert.match(scheme.license.source, /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/LICENSE(?:\.txt)?$/)
    }
    if (entry.id === 'github-theme') {
      assert.match(notice, /Copyright \(c\) 2020 Primer/)
      assert.match(notice, /Copyright \(c\) 2018 GitHub Inc\./)
    }
  })

  for (const scheme of manifest.themes) {
    test(`${entry.id} ${scheme.id} keeps text, selections, syntax, and caret readable`, () => {
      const c = scheme.colors
      const readable = (role, backgrounds, minimum = 4.5) => {
        for (const background of backgrounds)
          assert.ok(contrast(c[role], background) >= minimum,
            `${role} ${c[role]} on ${background}: ${contrast(c[role], background).toFixed(2)}`)
      }
      const bases = [c.background, c.surface, c.sidebar]
      const backgrounds = [...bases, ...bases.map(bg => composite(c.hover, bg)),
        ...bases.map(bg => composite(c.active, bg))]
      for (const role of ['hover', 'active'])
        assert.notEqual(composite(c[role], c.sidebar), c.sidebar, `${role} must show on the sidebar`)
      assert.notEqual(composite(c.hover, c.surface), c.surface, 'menu focus must show on its surface')
      readable('ink', backgrounds)
      readable('muted', backgrounds)
      readable('accent', bases)
      readable('accent', backgrounds, 3)
      readable('caret', [...bases, c['code-background']], 3)
      readable('code-ink', [c['code-background']])
      readable('selection-ink', [...bases, c['code-background']].map(bg => composite(c.selection, bg)))
      for (const role of Object.keys(c).filter(role => role.startsWith('syntax-')))
        readable(role, [c.background, c['code-background']])
      for (const role of Object.keys(c).filter(role => role.startsWith('status-')))
        readable(role, backgrounds)
    })
  }
}
