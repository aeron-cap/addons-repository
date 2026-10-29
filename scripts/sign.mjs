#!/usr/bin/env node
// Signs every catalog entry whose signature is missing or no longer matches
// its files, using the private key in HIBI_ADDON_SIGNING_KEY. Entries with a
// valid signature are left alone, so running it again changes nothing.
// Entries that fail their checks or their signing are skipped and reported;
// the rest are still signed.
// RESIGN_ID names one entry to sign again even if its signature is valid.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectDirectory,
  reportSkipped,
  signatureEnvelope,
  TRUST_KEYS,
} from './check.mjs'

/** The directory's package key; the workflow signs with this key only. */
export const CI_KEY_ID = '8dc7673025d00464'

/** Loads an Ed25519 key that Hibi already trusts; any other key is refused. */
export function signingKey(pem, keys = TRUST_KEYS) {
  const privateKey = createPrivateKey(pem)
  if (privateKey.asymmetricKeyType !== 'ed25519')
    throw new Error('The signing key must be an Ed25519 private key.')
  const raw = Buffer.from(
    createPublicKey(privateKey).export({ format: 'jwk' }).x,
    'base64url',
  )
  const keyId = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  if (keys[keyId] !== raw.toString('base64'))
    throw new Error(`Hibi does not trust signing key ${keyId}.`)
  return { privateKey, keyId }
}

/**
 * Returns the ids it signed, after checking every entry it did not skip
 * strictly. Skipped entries, with the reason, are added to `skipped`; their
 * files are left as they were.
 */
export async function signDirectory(
  root,
  {
    key,
    resign,
    fetch,
    keys = TRUST_KEYS,
    now = () => new Date(),
    skipped = [],
  } = {},
) {
  const inspect = () =>
    inspectDirectory(root, { remote: true, fetch, keys, skipFailures: true })
  const results = await inspect()
  const requested = results.find(({ entry }) => entry.id === resign)
  if (resign && !requested) throw new Error(`${resign} is not in catalog.json.`)
  if (requested?.failure) throw new Error(requested.failure)
  const signed = []
  // Each signed entry's previous files, to put back if it does not verify.
  const previous = new Map()
  for (const { entry, hashes, problem, failure } of results) {
    if (failure) {
      skipped.push({ id: entry.id, reason: failure })
      continue
    }
    if (!problem && entry.id !== resign) continue
    const paths = [join(root, 'signatures', `${entry.id}.json`)]
    const own = entry.path && join(root, entry.path, 'hibi-addon.sig.json')
    if (own && existsSync(own)) paths.push(own)
    const before = paths.map((path) =>
      existsSync(path) ? readFileSync(path) : null,
    )
    try {
      const envelope = signatureEnvelope(
        entry,
        hashes,
        key.keyId,
        (statement) => sign(null, statement, key.privateKey),
        now().toISOString(),
      )
      for (const path of paths) writeFileSync(path, envelope)
    } catch (error) {
      restore(paths, before)
      skipped.push({ id: entry.id, reason: error.message })
      continue
    }
    previous.set(entry.id, [paths, before])
    signed.push(entry.id)
  }
  if (!signed.length) return signed
  for (const { entry, problem, failure } of await inspect()) {
    if (!previous.has(entry.id) || (!problem && !failure)) continue
    restore(...previous.get(entry.id))
    signed.splice(signed.indexOf(entry.id), 1)
    skipped.push({ id: entry.id, reason: failure ?? problem })
  }
  return signed
}

function restore(paths, before) {
  paths.forEach((path, index) => {
    if (before[index]) writeFileSync(path, before[index])
    else rmSync(path, { force: true })
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  try {
    const resign = process.env.RESIGN_ID || undefined
    if (resign !== undefined && !/^[a-z][a-z0-9-]{0,47}$/.test(resign))
      throw new Error('RESIGN_ID must be a catalog entry id.')
    if (!process.env.HIBI_ADDON_SIGNING_KEY)
      throw new Error('Set HIBI_ADDON_SIGNING_KEY to the signing key.')
    const key = signingKey(process.env.HIBI_ADDON_SIGNING_KEY, {
      [CI_KEY_ID]: TRUST_KEYS[CI_KEY_ID],
    })
    const skipped = []
    const signed = await signDirectory(root, { key, resign, skipped })
    console.log(
      signed.length
        ? `signed ${signed.join(', ')} with ${key.keyId}`
        : 'every signature is current',
    )
    reportSkipped(skipped, 'Addons skipped while signing')
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `signed=${signed.join(' ')}\nskipped=${skipped.map(({ id }) => id).join(' ')}\n`,
      )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
