#!/usr/bin/env node
// Validates catalog.json and the packages in addons/. With --remote, it also
// compares linked repositories and downloads with their catalog entries.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

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
const ID = /^[a-z][a-z0-9-]{0,47}$/
const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const GITHUB_REPOSITORY =
  /^https:\/\/github\.com\/[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+\/?$/
const AUTHOR_KEYS = ['displayName', 'github', 'discordId', 'role']

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
/** Hibi's validAddonPath: portable names with no hidden parts. */
const validPath = (value) =>
  typeof value === 'string' &&
  value.length < 2048 &&
  !/[%#]/.test(value) &&
  value
    .split('/')
    .every(
      (part) =>
        !!part &&
        !part.startsWith('.') &&
        !/[\\:?<>"|*]|\p{Cc}/u.test(part) &&
        !/[. ]$/.test(part) &&
        !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part),
    )
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
function checkLimits(label, folder, own) {
  const seen = new Map()
  let bytes = 0
  for (const path of own) {
    if (!validPath(path))
      throw new Error(`${label}: ${path} is not a valid path.`)
    const parts = path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const prefix = parts.slice(0, index).join('/')
      const key = prefix
        .normalize('NFC')
        .toUpperCase()
        .toLowerCase()
        .normalize('NFC')
      if (seen.has(key) && seen.get(key) !== prefix)
        throw new Error(
          `${label}: ${prefix} and ${seen.get(key)} differ only by case.`,
        )
      seen.set(key, prefix)
    }
    const size = statSync(join(folder, path)).size
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

function checkPackage(root, entry) {
  const folder = join(root, entry.path)
  const label = entry.path
  if (!existsSync(join(folder, 'hibi-addon.json')))
    throw new Error(`${label}: hibi-addon.json is missing.`)
  const own = files(folder)
  checkLimits(label, folder, own)
  for (const path of own)
    if (!ALLOWED_FILES.has(extname(path).toLowerCase()))
      throw new Error(
        `${label}: Hibi does not install ${path}. Use LICENSE.txt or LICENSE.md for licenses.`,
      )
  if (own.filter((path) => path.endsWith('hibi-addon.json')).length !== 1)
    throw new Error(
      `${label}: a package folder holds exactly one hibi-addon.json.`,
    )
  if (!own.includes('README.md')) throw new Error(`${label}: add a README.md.`)
  if (!own.some((path) => /^licen[cs]e\.(txt|md)$/i.test(path)))
    throw new Error(`${label}: add LICENSE.txt or LICENSE.md.`)
  const manifest = JSON.parse(
    readFileSync(join(folder, 'hibi-addon.json'), 'utf8'),
  )
  sameMetadata(label, entry, manifest)
  if (manifest.kind === 'extension') {
    if (!/\.m?js$/.test(manifest.entry ?? '') || !own.includes(manifest.entry))
      throw new Error(
        `${label}: "entry" must name a committed .js or .mjs file.`,
      )
    for (const path of own.filter((path) => /\.m?js$/.test(path)))
      execFileSync(process.execPath, ['--check', join(folder, path)], {
        stdio: 'pipe',
      })
  }
  for (const theme of manifest.themes ?? [])
    if (typeof theme === 'string') {
      if (!own.includes(theme))
        throw new Error(`${label}: ${theme} is missing.`)
      JSON.parse(readFileSync(join(folder, theme), 'utf8'))
    }
}

/** Reads at most `limit` bytes so a hostile link cannot exhaust CI. */
async function fetchBytes(url, limit) {
  const response = await fetch(url, {
    redirect: 'follow',
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

async function checkRemote(entry) {
  if (entry.repository) {
    const { url, commit, path } = entry.repository
    const match = new URL(url).pathname.match(
      /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    )
    const raw = `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${commit}/${path ? `${path}/` : ''}hibi-addon.json`
    sameMetadata(
      entry.id,
      entry,
      JSON.parse(
        (await fetchBytes(raw, MAX_ADDON_MANIFEST_BYTES)).toString('utf8'),
      ),
    )
  }
  if (entry.download) {
    const bytes = await fetchBytes(entry.download.url, entry.download.size)
    if (bytes.length !== entry.download.size)
      throw new Error(
        `${entry.id}: the download is ${bytes.length} bytes, not ${entry.download.size}.`,
      )
    if (
      createHash('sha256').update(bytes).digest('hex') !== entry.download.sha256
    )
      throw new Error(`${entry.id}: the download does not match its sha256.`)
  }
}

/** Returns the catalog after checking it and every nested package. */
export async function checkDirectory(root, { remote = false } = {}) {
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
  for (const entry of catalog) if (entry.path) checkPackage(root, entry)
  if (remote) for (const entry of catalog) await checkRemote(entry)
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
