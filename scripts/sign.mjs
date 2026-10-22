#!/usr/bin/env node
// Signs every catalog entry whose signature is missing or no longer matches
// its files, using the private key in HIBI_ADDON_SIGNING_KEY. Entries with a
// valid signature are left alone, so running it again changes nothing.
// RESIGN_ID names one entry to sign again even if its signature is valid.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDirectory, inspectDirectory, TRUST_KEYS } from './check.mjs'

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

/** Returns the ids it signed, after checking the whole directory strictly. */
export async function signDirectory(
  root,
  { key, resign, fetch, keys = TRUST_KEYS, now = () => new Date() } = {},
) {
  const results = await inspectDirectory(root, { remote: true, fetch, keys })
  if (resign && !results.some(({ entry }) => entry.id === resign))
    throw new Error(`${resign} is not in catalog.json.`)
  const signed = []
  for (const { entry, hashes, problem } of results) {
    if (!problem && entry.id !== resign) continue
    // The same statement shape and field order as Hibi's scripts/addon-signing.mjs.
    const statement = Buffer.from(
      JSON.stringify({
        type: 'hibi-addon-signature',
        version: 1,
        id: entry.id,
        addonVersion: entry.version,
        files: Object.fromEntries(
          Object.entries(hashes).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        ),
        signedAt: now().toISOString(),
      }),
    )
    const envelope = `${JSON.stringify(
      {
        keyId: key.keyId,
        statement: statement.toString('base64'),
        signature: sign(null, statement, key.privateKey).toString('base64'),
      },
      null,
      2,
    )}\n`
    writeFileSync(join(root, 'signatures', `${entry.id}.json`), envelope)
    const own = entry.path && join(root, entry.path, 'hibi-addon.sig.json')
    if (own && existsSync(own)) writeFileSync(own, envelope)
    signed.push(entry.id)
  }
  if (signed.length) await checkDirectory(root, { remote: true, fetch, keys })
  return signed
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
    const signed = await signDirectory(root, { key, resign })
    console.log(
      signed.length
        ? `signed ${signed.join(', ')} with ${key.keyId}`
        : 'every signature is current',
    )
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `signed=${signed.join(' ')}\n`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
