import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { checkDirectory } from '../scripts/check.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const [doom, typing] = JSON.parse(
  readFileSync(join(root, 'catalog.json'), 'utf8'),
).filter(({ id }) => ['hibi-doom', 'typing-speed'].includes(id))
const typingFolder = join(root, 'addons/typing-speed')
const typingFiles = readdirSync(typingFolder)
  .filter((name) => name !== 'hibi-addon.sig.json')
  .map((name) => [name, readFileSync(join(typingFolder, name))])

function scratch(t, entries, { addons = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hibi-signatures-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  if (addons) {
    mkdirSync(join(directory, 'addons'))
    cpSync(join(root, 'addons/typing-speed'), join(directory, 'addons/typing-speed'), {
      recursive: true,
    })
  }
  mkdirSync(join(directory, 'signatures'))
  for (const id of ['hibi-doom', 'typing-speed'])
    cpSync(join(root, 'signatures', `${id}.json`), join(directory, 'signatures', `${id}.json`))
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify(entries))
  return directory
}

const envelope = (directory, id) =>
  JSON.parse(readFileSync(join(directory, 'signatures', `${id}.json`), 'utf8'))
const writeEnvelope = (directory, id, value) =>
  writeFileSync(
    join(directory, 'signatures', `${id}.json`),
    JSON.stringify(value),
  )

test('every entry needs a signature and every signature an entry', async (t) => {
  const missing = scratch(t, [doom, typing])
  rmSync(join(missing, 'signatures/hibi-doom.json'))
  await assert.rejects(
    checkDirectory(missing),
    /hibi-doom needs a Hibi signature/,
  )
  const stale = scratch(t, [doom, typing])
  writeFileSync(join(stale, 'signatures/old.json'), '{}')
  await assert.rejects(checkDirectory(stale), /does not belong/)
})

test('signatures can be as large as any package file', async (t) => {
  const limit = 5 * 1024 * 1024
  const sized = scratch(t, [doom, typing])
  const value = JSON.stringify(envelope(sized, 'hibi-doom'))
  const pad = (size) =>
    writeFileSync(
      join(sized, 'signatures/hibi-doom.json'),
      value.padEnd(size, ' '),
    )
  pad(limit)
  await checkDirectory(sized)
  pad(limit + 1)
  await assert.rejects(checkDirectory(sized), /larger than 5 MiB/)
})

test('signatures must come from a Hibi key and cover the listed version', async (t) => {
  const forged = scratch(t, [doom, typing])
  const value = envelope(forged, 'hibi-doom')
  const signature = Buffer.from(value.signature, 'base64')
  signature[0] ^= 1
  writeEnvelope(forged, 'hibi-doom', {
    ...value,
    signature: signature.toString('base64'),
  })
  await assert.rejects(checkDirectory(forged), /invalid signature/)
  const unknown = scratch(t, [doom, typing])
  writeEnvelope(unknown, 'hibi-doom', {
    ...envelope(unknown, 'hibi-doom'),
    keyId: '0000000000000000',
  })
  await assert.rejects(checkDirectory(unknown), /not signed with a Hibi key/)
  await assert.rejects(
    checkDirectory(scratch(t, [{ ...doom, version: '0.4.2' }, typing])),
    /does not sign hibi-doom 0\.4\.2/,
  )
})

test('nested packages must match their signed files', async (t) => {
  const changed = scratch(t, [doom, typing])
  writeFileSync(join(changed, 'addons/typing-speed/README.md'), '# Changed\n')
  await assert.rejects(
    checkDirectory(changed),
    /files do not match the signature/,
  )
  const extra = scratch(t, [doom, typing])
  writeFileSync(join(extra, 'addons/typing-speed/extra.js'), '')
  await assert.rejects(checkDirectory(extra), /files do not match/)
  const copy = scratch(t, [doom, typing])
  writeFileSync(join(copy, 'addons/typing-speed/hibi-addon.sig.json'), '{}')
  await assert.rejects(checkDirectory(copy), /must match signatures/)
})

const gitBlob = (bytes) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex')

function fakeGitHub(files, { tamper } = {}) {
  const commit = 'a'.repeat(40)
  const tree = {
    sha: 'b'.repeat(40),
    truncated: false,
    tree: [
      { path: 'README.md', mode: '100644', type: 'blob', size: 1, sha: 'c' },
      { path: 'pkg', mode: '040000', type: 'tree', sha: 'd'.repeat(40) },
      ...files.map(([name, bytes]) => ({
        path: `pkg/${name}`,
        mode: '100644',
        type: 'blob',
        size: bytes.length,
        sha: gitBlob(bytes),
      })),
    ],
  }
  return {
    repository: {
      url: 'https://github.com/someone/typing',
      commit,
      path: 'pkg',
    },
    fetch: async (url, init) => {
      // GitHub reads never follow redirects.
      assert.equal(init.redirect, 'error')
      if (url.startsWith('https://api.github.com/'))
        return new Response(JSON.stringify(tree))
      const name = url.split(`/${commit}/pkg/`)[1]
      const bytes = files.find(([file]) => file === name)?.[1]
      if (!bytes) return new Response('', { status: 404 })
      return new Response(name === tamper ? Buffer.from(bytes).fill(32) : bytes)
    },
  }
}

test('remote checks bind repository files to the pinned commit and signature', async (t) => {
  const { path, ...metadata } = typing
  const github = fakeGitHub(typingFiles)
  const entry = { ...metadata, repository: github.repository }
  const local = scratch(t, [entry], { addons: false })
  rmSync(join(local, 'signatures/hibi-doom.json'))
  await checkDirectory(local, { remote: true, fetch: github.fetch })
  await assert.rejects(
    checkDirectory(local, {
      remote: true,
      fetch: fakeGitHub(typingFiles, { tamper: 'speed.js' }).fetch,
    }),
    /speed\.js does not match/,
  )
  const changed = typingFiles.map(([name, bytes]) => [
    name,
    name === 'speed.js' ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes,
  ])
  await assert.rejects(
    checkDirectory(local, {
      remote: true,
      fetch: fakeGitHub(changed).fetch,
    }),
    /files do not match the signature/,
  )
})

function storedZip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const [
    name,
    bytes,
    { declared = bytes.length, mode = 0 } = {},
  ] of files) {
    const path = Buffer.from(name)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt32LE(crc32(bytes), 14)
    header.writeUInt32LE(bytes.length, 18)
    header.writeUInt32LE(bytes.length, 22)
    header.writeUInt16LE(path.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt32LE(crc32(bytes), 16)
    entry.writeUInt32LE(bytes.length, 20)
    entry.writeUInt32LE(declared, 24)
    entry.writeUInt16LE(path.length, 28)
    entry.writeUInt32LE(mode * 0x10000, 38)
    entry.writeUInt32LE(offset, 42)
    local.push(header, path, bytes)
    central.push(entry, path)
    offset += header.length + path.length + bytes.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

test('remote checks read download archives and match them to the signature', async (t) => {
  const { path, ...metadata } = typing
  const zip = storedZip([
    ...typingFiles.map(([name, bytes]) => [`typing-speed/${name}`, bytes]),
    ['__MACOSX/._README.md', Buffer.from('x')],
  ])
  const entry = {
    ...metadata,
    download: {
      url: 'https://example.com/typing-speed.zip',
      size: zip.length,
      sha256: createHash('sha256').update(zip).digest('hex'),
    },
  }
  const directory = scratch(t, [entry], { addons: false })
  rmSync(join(directory, 'signatures/hibi-doom.json'))
  await checkDirectory(directory, {
    remote: true,
    fetch: async () => new Response(zip),
  })
  const extra = storedZip([
    ...typingFiles.map(([name, bytes]) => [`typing-speed/${name}`, bytes]),
    ['typing-speed/extra.js', Buffer.from('')],
  ])
  writeFileSync(
    join(directory, 'catalog.json'),
    JSON.stringify([
      {
        ...entry,
        download: {
          ...entry.download,
          size: extra.length,
          sha256: createHash('sha256').update(extra).digest('hex'),
        },
      },
    ]),
  )
  await assert.rejects(
    checkDirectory(directory, {
      remote: true,
      fetch: async () => new Response(extra),
    }),
    /files do not match the signature/,
  )
})

test('remote checks refuse ZIP files Hibi would refuse before inflating them', async (t) => {
  const { path, ...metadata } = typing
  const directory = scratch(t, [], { addons: false })
  rmSync(join(directory, 'signatures/hibi-doom.json'))
  const reject = async (zip, message) => {
    writeFileSync(
      join(directory, 'catalog.json'),
      JSON.stringify([
        {
          ...metadata,
          download: {
            url: 'https://example.com/typing-speed.zip',
            size: zip.length,
            sha256: createHash('sha256').update(zip).digest('hex'),
          },
        },
      ]),
    )
    await assert.rejects(
      checkDirectory(directory, {
        remote: true,
        fetch: async () => new Response(zip),
      }),
      message,
    )
  }
  const files = typingFiles.map(([name, bytes]) => [
    `typing-speed/${name}`,
    bytes,
  ])
  const huge = Array.from({ length: 13 }, (_, index) => [
    `.cache/${index}.bin`,
    Buffer.from('x'),
    { declared: 5 * 1024 * 1024 },
  ])
  await reject(storedZip([...files, ...huge]), /more than 64 MiB/)
  await reject(
    storedZip([
      ...files,
      ['typing-speed/link.js', Buffer.from('/etc/passwd'), { mode: 0o120777 }],
    ]),
    /link, special, encrypted, or invalid/,
  )
  await reject(
    storedZip([...files, ['../escape.js', Buffer.from('')]]),
    /not a valid path/,
  )
  await reject(
    storedZip([
      ...files,
      ['typing-speed/a.js', Buffer.from('')],
      ['typing-speed/A.js', Buffer.from('')],
    ]),
    /conflicts with another entry/,
  )
})

test('downloads may redirect only to HTTPS addresses', async (t) => {
  const { path, ...metadata } = typing
  const zip = storedZip(
    typingFiles.map(([name, bytes]) => [`typing-speed/${name}`, bytes]),
  )
  const directory = scratch(t, [], { addons: false })
  rmSync(join(directory, 'signatures/hibi-doom.json'))
  writeFileSync(
    join(directory, 'catalog.json'),
    JSON.stringify([
      {
        ...metadata,
        download: {
          url: 'https://example.com/typing-speed.zip',
          size: zip.length,
          sha256: createHash('sha256').update(zip).digest('hex'),
        },
      },
    ]),
  )
  await assert.rejects(
    checkDirectory(directory, {
      remote: true,
      fetch: async (_url, init) => {
        assert.equal(init.redirect, 'follow')
        return {
          ok: true,
          url: 'http://example.com/typing-speed.zip',
          body: [zip],
        }
      },
    }),
    /redirected away from HTTPS/,
  )
})

test('packages stay within Hibi limits once their signature is added', async (t) => {
  const fill = (directory, count) => {
    rmSync(join(directory, 'addons/typing-speed/hibi-addon.sig.json'))
    for (let index = 0; index < count; index++)
      writeFileSync(
        join(directory, `addons/typing-speed/extra-${index}.txt`),
        '',
      )
  }
  // Without a packaged copy, typing-speed has five files; Hibi adds the
  // signature as a sixth. 995 extra files fit as is but not with the signature.
  const fits = scratch(t, [doom, typing])
  fill(fits, 994)
  assert.deepEqual(
    (await checkDirectory(fits, { pending: true })).map((entry) => entry.id),
    ['hibi-doom', 'typing-speed'],
  )
  const over = scratch(t, [doom, typing])
  fill(over, 995)
  await assert.rejects(
    checkDirectory(over, { pending: true }),
    /with its Hibi signature: a package can contain up to 1,000 files/,
  )
})
