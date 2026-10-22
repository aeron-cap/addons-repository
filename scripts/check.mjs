#!/usr/bin/env node
// Validates catalog.json, the packages in addons/, and the Hibi signature in
// signatures/ for every entry. With --remote, it also reads each linked
// repository folder and download and checks its files against the signature.
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { crc32, inflateRawSync } from 'node:zlib'

const KEYS = new Set([
  'id',
  'name',
  'description',
  'version',
  'apiVersion',
  'kind',
  'authors',
  'license',
  'homepage',
  'path',
  'repository',
  'download',
])
const SOURCES = ['path', 'repository', 'download']
const METADATA = [
  'id',
  'name',
  'description',
  'version',
  'apiVersion',
  'kind',
  'authors',
]
const ALLOWED_FILES = new Set(
  '.js .mjs .json .css .woff .woff2 .ttf .svg .png .jpg .jpeg .webp .gif .mp3 .ogg .wav .md .txt'.split(
    ' ',
  ),
)
// Limits and formats meet both Hibi's directory parser and its manifest and
// package rules (src/shared/addon-directory.ts, addon-manifest.ts, and
// addon-package.ts), so an entry that passes here cannot make Hibi reject the
// directory or the package.
const MAX_CATALOG_BYTES = 1024 * 1024
const MAX_ENTRIES = 500
const MAX_ADDON_BYTES = 25 * 1024 * 1024
const MAX_ADDON_FILE_BYTES = 5 * 1024 * 1024
const MAX_ADDON_MANIFEST_BYTES = 64 * 1024
const MAX_ADDON_ENTRIES = 1000
// Hibi's archive inventory limits (src/main/addon-inventory.ts).
const MAX_INVENTORY_ENTRIES = 5000
const MAX_INVENTORY_BYTES = 64 * 1024 * 1024
const MAX_DEPTH = 12
const ID = /^[a-z][a-z0-9-]{0,47}$/
const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const GITHUB_REPOSITORY =
  /^https:\/\/github\.com\/[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+\/?$/
const AUTHOR_KEYS = ['displayName', 'github', 'discordId', 'role']
// Public Hibi signing keys, copied from ADDON_TRUST_KEYS in Hibi's
// src/shared/addon-trust.ts. Only public keys belong here.
const TRUST_KEYS = {
  '1b43eadedb48d51d': 'JZEDarSlRAFAdC9WC++vLgpLVWI8pi9yBG8Wm73/S1w=',
}
const SIGNATURE_FILE = 'hibi-addon.sig.json'

const https = (value) => {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash
    )
  } catch {
    return false
  }
}
const text = (value, max) =>
  typeof value === 'string' && !!value.trim() && value.length <= max
/** Hibi's validAddonInventoryPath: portable names, including hidden ones. */
const inventoryPath = (value) =>
  typeof value === 'string' &&
  value.length < 2048 &&
  value
    .split('/')
    .every(
      (part) =>
        !!part &&
        part !== '.' &&
        part !== '..' &&
        !/[\\:?<>"|*]|\p{Cc}/u.test(part) &&
        !/[. ]$/.test(part) &&
        !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part),
    )
/** Hibi's validAddonPath: inventory paths with no hidden parts, % or #. */
const validPath = (value) =>
  inventoryPath(value) &&
  !/[%#]/.test(value) &&
  value.split('/').every((part) => !part.startsWith('.'))
const folded = (path) =>
  path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')
const author = (value) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => AUTHOR_KEYS.includes(key)) &&
  text(value.displayName, 100) &&
  (value.github === undefined ||
    (typeof value.github === 'string' &&
      /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value.github))) &&
  (value.discordId === undefined ||
    (typeof value.discordId === 'string' &&
      /^\d{5,24}$/.test(value.discordId))) &&
  (value.role === undefined || text(value.role, 100))
const hidden = (name) =>
  name.startsWith('.') ||
  ['node_modules', '__macosx'].includes(name.toLowerCase())

function files(root, folder = root) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => !hidden(entry.name))
    .flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink())
        throw new Error(`${relative(root, path)} is a symbolic link.`)
      return entry.isDirectory()
        ? files(root, path)
        : [relative(root, path).split(sep).join('/')]
    })
}

function checkEntry(entry, index) {
  const label = `catalog.json entry ${index + 1}${entry?.id ? ` (${entry.id})` : ''}`
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${label} must be an object.`)
  for (const key of Object.keys(entry))
    if (!KEYS.has(key))
      throw new Error(`${label} has an unknown field: ${key}.`)
  if (!ID.test(entry.id ?? '')) throw new Error(`${label} needs a valid id.`)
  if (
    !text(entry.name, 100) ||
    !text(entry.description, 500) ||
    !text(entry.version, 40)
  )
    throw new Error(`${label} needs a name, description, and version.`)
  if (entry.apiVersion !== 1 && entry.apiVersion !== 2)
    throw new Error(`${label} needs an apiVersion of 1 or 2.`)
  if (!['extension', 'theme'].includes(entry.kind))
    throw new Error(`${label} needs a kind of "extension" or "theme".`)
  if (
    !Array.isArray(entry.authors) ||
    !entry.authors.length ||
    entry.authors.length > 20 ||
    !entry.authors.every(author)
  )
    throw new Error(
      `${label} needs 1 to 20 authors with a display name and valid github, discordId, and role fields.`,
    )
  if (!text(entry.license, 128))
    throw new Error(`${label} needs an SPDX license expression.`)
  if (entry.homepage !== undefined && !https(entry.homepage))
    throw new Error(`${label} needs an HTTPS homepage.`)
  const sources = SOURCES.filter((key) => entry[key] !== undefined)
  if (sources.length !== 1)
    throw new Error(
      `${label} needs exactly one of path, repository, or download.`,
    )
  if (entry.path !== undefined && entry.path !== `addons/${entry.id}`)
    throw new Error(`${label} must use the path addons/${entry.id}.`)
  const { repository, download } = entry
  if (repository !== undefined) {
    if (
      !repository ||
      Object.keys(repository).some(
        (key) => !['url', 'commit', 'path'].includes(key),
      ) ||
      typeof repository.url !== 'string' ||
      !GITHUB_REPOSITORY.test(repository.url) ||
      repository.url
        .split('/')
        .slice(3)
        .some((part) => part === '.' || part === '..') ||
      !COMMIT.test(repository.commit ?? '') ||
      (repository.path !== undefined && !validPath(repository.path))
    )
      throw new Error(
        `${label} needs a repository with a https://github.com/<owner>/<repo> url, a full 40-character commit, and an optional folder path.`,
      )
  }
  if (download !== undefined) {
    if (
      !download ||
      Object.keys(download).some(
        (key) => !['url', 'sha256', 'size'].includes(key),
      ) ||
      !https(download.url) ||
      !SHA256.test(download.sha256 ?? '') ||
      !Number.isSafeInteger(download.size) ||
      download.size < 1 ||
      download.size > MAX_ADDON_BYTES
    )
      throw new Error(
        `${label} needs a download with an HTTPS url, a lowercase sha256, and a size up to 25 MiB.`,
      )
  }
}

function sameMetadata(label, entry, manifest) {
  for (const key of METADATA)
    if (!isDeepStrictEqual(entry[key], manifest[key]))
      throw new Error(
        `${label}: catalog.json ${key} does not match hibi-addon.json.`,
      )
}

/** Applies the path and size rules Hibi enforces when it reads a package. */
function checkLimits(label, sizes) {
  const seen = new Map()
  let bytes = 0
  for (const [path, size] of sizes) {
    if (!validPath(path))
      throw new Error(`${label}: ${path} is not a valid path.`)
    const parts = path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const prefix = parts.slice(0, index).join('/')
      const key = folded(prefix)
      if (seen.has(key) && seen.get(key) !== prefix)
        throw new Error(
          `${label}: ${prefix} and ${seen.get(key)} differ only by case.`,
        )
      seen.set(key, prefix)
    }
    bytes += size
    if (size > MAX_ADDON_FILE_BYTES)
      throw new Error(`${label}: ${path} is larger than 5 MiB.`)
    if (path === 'hibi-addon.json' && size > MAX_ADDON_MANIFEST_BYTES)
      throw new Error(`${label}: hibi-addon.json is larger than 64 KiB.`)
  }
  if (seen.size > MAX_ADDON_ENTRIES)
    throw new Error(
      `${label}: a package can contain up to 1,000 files and folders.`,
    )
  if (bytes > MAX_ADDON_BYTES)
    throw new Error(`${label}: the package is larger than 25 MiB.`)
}

/**
 * Applies Hibi's package rules to `own` (paths relative to the package folder)
 * and returns the SHA-256 of every file the signature covers.
 */
function checkFiles(label, entry, own, read, parse) {
  checkLimits(
    label,
    own.map((path) => [path, read(path).length]),
  )
  for (const path of own)
    if (!ALLOWED_FILES.has(extname(path).toLowerCase()))
      throw new Error(
        `${label}: Hibi does not install ${path}. Use LICENSE.txt or LICENSE.md for licenses.`,
      )
  if (own.filter((path) => path.endsWith('hibi-addon.json')).length !== 1)
    throw new Error(
      `${label}: a package folder holds exactly one hibi-addon.json.`,
    )
  if (!own.includes('hibi-addon.json'))
    throw new Error(`${label}: hibi-addon.json is missing.`)
  if (!own.includes('README.md')) throw new Error(`${label}: add a README.md.`)
  if (!own.some((path) => /^licen[cs]e\.(txt|md)$/i.test(path)))
    throw new Error(`${label}: add LICENSE.txt or LICENSE.md.`)
  const manifest = JSON.parse(read('hibi-addon.json').toString('utf8'))
  sameMetadata(label, entry, manifest)
  if (manifest.kind === 'extension') {
    if (!/\.m?js$/.test(manifest.entry ?? '') || !own.includes(manifest.entry))
      throw new Error(
        `${label}: "entry" must name a committed .js or .mjs file.`,
      )
    for (const path of own.filter((path) => /\.m?js$/.test(path))) parse?.(path)
  }
  for (const theme of manifest.themes ?? [])
    if (typeof theme === 'string') {
      if (!own.includes(theme))
        throw new Error(`${label}: ${theme} is missing.`)
      JSON.parse(read(theme).toString('utf8'))
    }
  return Object.fromEntries(
    own
      .filter((path) => path !== SIGNATURE_FILE)
      .map((path) => [
        path,
        createHash('sha256').update(read(path)).digest('hex'),
      ]),
  )
}

function checkPackage(root, entry) {
  const folder = join(root, entry.path)
  if (!existsSync(join(folder, 'hibi-addon.json')))
    throw new Error(`${entry.path}: hibi-addon.json is missing.`)
  return checkFiles(
    entry.path,
    entry,
    files(folder),
    (path) => readFileSync(join(folder, path)),
    (path) =>
      execFileSync(process.execPath, ['--check', join(folder, path)], {
        stdio: 'pipe',
      }),
  )
}

const canonical = (value) => {
  if (typeof value !== 'string' || !value) return null
  const bytes = Buffer.from(value, 'base64')
  return bytes.toString('base64') === value ? bytes : null
}

/** Verifies an envelope the way Hibi does and returns its signed file hashes. */
function signedFiles(label, envelope, entry) {
  const raw =
    typeof envelope?.keyId === 'string' &&
    Object.hasOwn(TRUST_KEYS, envelope.keyId)
      ? canonical(TRUST_KEYS[envelope.keyId])
      : null
  if (!raw || raw.length !== 32)
    throw new Error(`${label} is not signed with a Hibi key.`)
  const bytes = canonical(envelope.statement)
  const signature = canonical(envelope.signature)
  const key = createPublicKey({
    format: 'jwk',
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
  })
  if (
    !bytes ||
    signature?.length !== 64 ||
    !verify(null, bytes, key, signature)
  )
    throw new Error(`${label} has an invalid signature.`)
  const statement = JSON.parse(bytes.toString('utf8'))
  if (
    statement?.type !== 'hibi-addon-signature' ||
    statement.version !== 1 ||
    statement.id !== entry.id ||
    statement.addonVersion !== entry.version ||
    typeof statement.signedAt !== 'string' ||
    !Number.isFinite(Date.parse(statement.signedAt)) ||
    !statement.files ||
    typeof statement.files !== 'object' ||
    Array.isArray(statement.files)
  )
    throw new Error(`${label} does not sign ${entry.id} ${entry.version}.`)
  return statement.files
}

function sameFiles(label, signed, hashes) {
  const paths = Object.keys(hashes)
  if (
    Object.keys(signed).length !== paths.length ||
    paths.some(
      (path) => !Object.hasOwn(signed, path) || signed[path] !== hashes[path],
    )
  )
    throw new Error(`${label}: the files do not match the signature.`)
}

/** Reads at most `limit` bytes so a hostile link cannot exhaust CI. */
async function fetchBytes(url, limit, { fetch: get = fetch, headers } = {}) {
  const response = await get(url, {
    redirect: 'follow',
    headers,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.length
    if (size > limit) {
      await response.body.cancel()
      throw new Error(`${url} is larger than ${limit} bytes.`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const gitBlob = (bytes) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex')

/** Reads a pinned GitHub folder file by file; each file must match the commit's tree. */
async function repositoryFiles(entry, options) {
  const { url, commit, path } = entry.repository
  const [, owner, name] = new URL(url).pathname.match(
    /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  )
  const token = process.env.GITHUB_TOKEN
  const tree = JSON.parse(
    (
      await fetchBytes(
        `https://api.github.com/repos/${owner}/${name}/git/trees/${commit}?recursive=1`,
        16 * 1024 * 1024,
        {
          ...options,
          headers: {
            accept: 'application/vnd.github+json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        },
      )
    ).toString('utf8'),
  )
  if (tree.truncated || !Array.isArray(tree.tree))
    throw new Error(`${entry.id}: GitHub returned an incomplete file list.`)
  const prefix = path ? `${path}/` : ''
  const files = new Map()
  let bytes = 0
  for (const item of tree.tree) {
    if (!item.path.startsWith(prefix)) continue
    const relative = item.path.slice(prefix.length)
    if (relative.split('/').some(hidden) || item.type === 'tree') continue
    if (item.type !== 'blob' || item.mode === '120000')
      throw new Error(`${entry.id}: ${relative} is a link or submodule.`)
    bytes += item.size
    if (item.size > MAX_ADDON_FILE_BYTES || bytes > MAX_ADDON_BYTES)
      throw new Error(`${entry.id}: the package exceeds Hibi's size limits.`)
    const content = await fetchBytes(
      `https://raw.githubusercontent.com/${owner}/${name}/${commit}/${item.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      item.size,
      options,
    )
    if (gitBlob(content) !== item.sha)
      throw new Error(`${entry.id}: ${relative} does not match ${commit}.`)
    files.set(relative, content)
  }
  return files
}

/**
 * Reads a ZIP the way Hibi's inventory does: every entry's path, mode, and
 * declared size is checked before anything is inflated, and hidden entries are
 * checked but not kept.
 */
function zipFiles(label, zip) {
  let end = -1
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 65557); at--)
    if (zip.readUInt32LE(at) === 0x06054b50) {
      end = at
      break
    }
  if (end < 0) throw new Error(`${label}: the download is not a ZIP file.`)
  const count = zip.readUInt16LE(end + 10)
  if (count > MAX_INVENTORY_ENTRIES)
    throw new Error(`${label}: the ZIP has more than 5,000 entries.`)
  const invalid = (name) =>
    new Error(
      `${label}: ${name} is a link, special, encrypted, or invalid ZIP entry.`,
    )
  const entries = []
  const seen = new Map()
  const explicit = new Map()
  let declared = 0
  let at = zip.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== 0x02014b50)
      throw new Error(`${label}: the ZIP directory is invalid.`)
    const flags = zip.readUInt16LE(at + 8)
    const method = zip.readUInt16LE(at + 10)
    const length = zip.readUInt32LE(at + 24)
    const nameLength = zip.readUInt16LE(at + 28)
    const attributes = zip.readUInt32LE(at + 38)
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const folder = name.endsWith('/')
    const path = folder ? name.slice(0, -1) : name
    const mode = (attributes >>> 16) & 0xf000
    if (
      flags & 1 ||
      attributes & 0x400 ||
      ![0, 0x8000, 0x4000].includes(mode) ||
      (mode === 0x4000 && !folder) ||
      (mode === 0x8000 && folder) ||
      ![0, 8].includes(method) ||
      (folder && length)
    )
      throw invalid(name)
    if (!inventoryPath(path))
      throw new Error(`${label}: ${name} is not a valid path.`)
    const parts = path.split('/')
    if (explicit.has(folded(path)))
      throw new Error(`${label}: ${name} conflicts with another entry.`)
    explicit.set(folded(path), folder)
    for (let part = 1; part <= parts.length; part++) {
      const prefix = parts.slice(0, part).join('/')
      const key = folded(prefix)
      if (seen.has(key) && seen.get(key) !== prefix)
        throw new Error(`${label}: ${name} conflicts with another entry.`)
      seen.set(key, prefix)
    }
    declared += length
    if (length > MAX_ADDON_FILE_BYTES)
      throw new Error(`${label}: ${name} is larger than 5 MiB.`)
    if (declared > MAX_INVENTORY_BYTES)
      throw new Error(`${label}: the ZIP holds more than 64 MiB.`)
    const hiddenEntry = parts.some(hidden)
    if (!hiddenEntry && parts.length - (folder ? 0 : 1) > MAX_DEPTH)
      throw new Error(`${label}: ${name} is more than 12 folders deep.`)
    if (!folder)
      entries.push({
        path,
        keep: !hiddenEntry,
        method,
        length,
        crc: zip.readUInt32LE(at + 16),
        compressed: zip.readUInt32LE(at + 20),
        offset: zip.readUInt32LE(at + 42),
      })
    at +=
      46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
  }
  for (const { path } of entries) {
    const parts = path.split('/')
    for (let part = 1; part < parts.length; part++)
      if (explicit.get(folded(parts.slice(0, part).join('/'))) === false)
        throw new Error(`${label}: ${path} conflicts with another entry.`)
  }
  const files = new Map()
  for (const {
    path,
    keep,
    method,
    length,
    crc,
    compressed,
    offset,
  } of entries) {
    if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50)
      throw new Error(`${label}: the ZIP directory is invalid.`)
    const start =
      offset +
      30 +
      zip.readUInt16LE(offset + 26) +
      zip.readUInt16LE(offset + 28)
    const data = zip.subarray(start, start + compressed)
    let content
    try {
      content =
        method === 0
          ? data
          : inflateRawSync(data, { maxOutputLength: Math.max(1, length) })
    } catch {
      throw new Error(`${label}: ${path} is damaged.`)
    }
    if (content.length !== length || crc32(content) !== crc)
      throw new Error(`${label}: ${path} is damaged.`)
    if (keep) files.set(path, content)
  }
  return files
}

async function downloadFiles(entry, options) {
  const zip = await fetchBytes(entry.download.url, entry.download.size, options)
  if (zip.length !== entry.download.size)
    throw new Error(
      `${entry.id}: the download is ${zip.length} bytes, not ${entry.download.size}.`,
    )
  if (createHash('sha256').update(zip).digest('hex') !== entry.download.sha256)
    throw new Error(`${entry.id}: the download does not match its sha256.`)
  const all = [...zipFiles(entry.id, zip)]
  const manifests = all.filter(
    ([path]) => path.split('/').at(-1) === 'hibi-addon.json',
  )
  if (manifests.length !== 1)
    throw new Error(`${entry.id}: the download must hold one hibi-addon.json.`)
  const prefix = manifests[0][0].slice(0, -'hibi-addon.json'.length)
  return new Map(
    all
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, content]) => [path.slice(prefix.length), content]),
  )
}

/** Returns the catalog after checking it, every nested package, and every signature. */
export async function checkDirectory(
  root,
  { remote = false, fetch: get } = {},
) {
  const source = readFileSync(join(root, 'catalog.json'))
  if (source.length > MAX_CATALOG_BYTES)
    throw new Error('catalog.json must be 1 MiB or smaller.')
  const catalog = JSON.parse(source.toString('utf8'))
  if (!Array.isArray(catalog) || catalog.length > MAX_ENTRIES)
    throw new Error('catalog.json must contain an array of up to 500 entries.')
  catalog.forEach(checkEntry)
  const ids = catalog.map((entry) => entry.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate)
    throw new Error(`catalog.json lists ${duplicate} more than once.`)
  const listed = new Set(
    catalog.filter((entry) => entry.path).map((entry) => entry.path),
  )
  const folders = existsSync(join(root, 'addons'))
    ? readdirSync(join(root, 'addons'), { withFileTypes: true })
        .filter((entry) => !hidden(entry.name))
        .map((entry) => `addons/${entry.name}`)
    : []
  for (const folder of folders)
    if (!listed.has(folder))
      throw new Error(`${folder} is not listed in catalog.json.`)
  const signatures = existsSync(join(root, 'signatures'))
    ? readdirSync(join(root, 'signatures')).filter((name) => !hidden(name))
    : []
  for (const name of signatures)
    if (!ids.some((id) => name === `${id}.json`))
      throw new Error(`signatures/${name} does not belong to a catalog entry.`)
  const signed = new Map()
  for (const entry of catalog) {
    const hashes = entry.path && checkPackage(root, entry)
    const file = `signatures/${entry.id}.json`
    if (!signatures.includes(`${entry.id}.json`))
      throw new Error(`${entry.id} needs a Hibi signature in ${file}.`)
    const bytes = readFileSync(join(root, file))
    // Hibi reads a signature like any package file, up to 5 MiB.
    if (bytes.length > MAX_ADDON_FILE_BYTES)
      throw new Error(`${file} is larger than 5 MiB.`)
    signed.set(entry.id, signedFiles(file, JSON.parse(bytes), entry))
    if (!entry.path) continue
    sameFiles(entry.path, signed.get(entry.id), hashes)
    const own = join(root, entry.path, SIGNATURE_FILE)
    if (existsSync(own) && !readFileSync(own).equals(bytes))
      throw new Error(`${entry.path}/${SIGNATURE_FILE} must match ${file}.`)
  }
  if (remote)
    for (const entry of catalog) {
      if (entry.path) continue
      const files = entry.repository
        ? await repositoryFiles(entry, { fetch: get })
        : await downloadFiles(entry, { fetch: get })
      sameFiles(
        entry.id,
        signed.get(entry.id),
        checkFiles(entry.id, entry, [...files.keys()], (path) =>
          files.get(path),
        ),
      )
    }
  return catalog
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  try {
    for (const entry of await checkDirectory(root, {
      remote: process.argv.includes('--remote'),
    }))
      console.log(
        `ok ${entry.id} ${entry.version} (${SOURCES.find((key) => entry[key])})`,
      )
  } catch (error) {
    console.error(error.stderr?.toString() || error.message)
    process.exitCode = 1
  }
}
