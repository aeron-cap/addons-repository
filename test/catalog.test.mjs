import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkDirectory } from '../scripts/check.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const catalog = () =>
  JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
    .filter(({ id }) => ['hibi-doom', 'typing-speed'].includes(id))

function scratch(t, entries) {
  const directory = mkdtempSync(join(tmpdir(), 'hibi-directory-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'addons'))
  cpSync(join(root, 'addons/typing-speed'), join(directory, 'addons/typing-speed'), {
    recursive: true,
  })
  mkdirSync(join(directory, 'signatures'))
  for (const { id } of entries)
    if (existsSync(join(root, 'signatures', `${id}.json`)))
      cpSync(
        join(root, 'signatures', `${id}.json`),
        join(directory, 'signatures', `${id}.json`),
      )
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify(entries))
  return directory
}

test('the catalog and nested packages are valid', async () => {
  assert.deepEqual(
    (await checkDirectory(root, { pending: true })).map((entry) => entry.id),
    [
      'dracula',
      'everforest-light',
      'fatass-horse',
      'fnaf-jumpscare',
      'github-theme',
      'hibi-doom',
      'one-dark-pro',
      'oneko',
      'rose-pine-dawn',
      'tokyo-night',
      'typing-speed',
    ],
  )
})

test('entries name exactly one source', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [{ ...doom, path: 'addons/hibi-doom' }, typing])),
    /exactly one of path, repository, or download/,
  )
  const { repository, ...metadata } = doom
  await assert.rejects(
    checkDirectory(scratch(t, [metadata, typing])),
    /exactly one of path, repository, or download/,
  )
})

test('repository entries pin a full commit', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(
      scratch(t, [
        { ...doom, repository: { ...doom.repository, commit: 'main' } },
        typing,
      ]),
    ),
    /full 40-character commit/,
  )
})

test('download entries bind a digest and size', async (t) => {
  const [doom, typing] = catalog()
  const { repository, ...metadata } = doom
  const download = {
    url: 'https://example.com/doom.zip',
    sha256: 'a'.repeat(64),
    size: 10,
  }
  assert.ok(
    await checkDirectory(scratch(t, [{ ...metadata, download }, typing])),
  )
  await assert.rejects(
    checkDirectory(
      scratch(t, [
        { ...metadata, download: { ...download, sha256: 'A'.repeat(64) } },
        typing,
      ]),
    ),
    /lowercase sha256/,
  )
})

test('nested entries match their manifest and every folder is listed', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [doom, { ...typing, version: '9.9.9' }])),
    /version does not match/,
  )
  await assert.rejects(
    checkDirectory(scratch(t, [doom])),
    /addons\/typing-speed is not listed/,
  )
})

test('unknown fields and duplicate ids are refused', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [{ ...doom, signed: true }, typing])),
    /unknown field: signed/,
  )
  await assert.rejects(
    checkDirectory(scratch(t, [doom, doom, typing])),
    /more than once/,
  )
})

test('entries Hibi would refuse fail here too', async (t) => {
  const [doom, typing] = catalog()
  const refused = [
    [
      {
        ...doom,
        repository: { ...doom.repository, url: 'https://gitlab.com/a/b' },
      },
      /github\.com/,
    ],
    [
      { ...doom, repository: { ...doom.repository, path: 'addon/con' } },
      /optional folder path/,
    ],
    [{ ...doom, authors: [{ displayName: 'A', discordId: 1 }] }, /authors/],
    [
      { ...doom, authors: [{ displayName: 'A', discordId: '1234' }] },
      /authors/,
    ],
    [{ ...doom, authors: [{ displayName: 'A', github: '-a' }] }, /authors/],
    [{ ...doom, authors: [{ displayName: 'A', email: 'a@b.c' }] }, /authors/],
    [
      { ...doom, authors: Array(21).fill({ displayName: 'A' }) },
      /1 to 20 authors/,
    ],
  ]
  for (const [entry, message] of refused)
    await assert.rejects(checkDirectory(scratch(t, [entry, typing])), message)
})

test('nested packages stay within Hibi package limits', async (t) => {
  const [doom, typing] = catalog()
  const large = scratch(t, [doom, typing])
  writeFileSync(
    join(large, 'addons/typing-speed/big.txt'),
    Buffer.alloc(5 * 1024 * 1024 + 1),
  )
  await assert.rejects(checkDirectory(large), /larger than 5 MiB/)
  const named = scratch(t, [doom, typing])
  writeFileSync(join(named, 'addons/typing-speed/50%.md'), '')
  await assert.rejects(checkDirectory(named), /50%\.md is not a valid path/)
})
