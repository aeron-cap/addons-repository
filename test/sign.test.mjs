import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
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
import {
  checkDirectory,
  inspectDirectory,
  reportSkipped,
  signatureEnvelope,
  TRUST_KEYS,
} from '../scripts/check.mjs'
import { CI_KEY_ID, signDirectory, signingKey } from '../scripts/sign.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const typing = JSON.parse(
  readFileSync(join(root, 'catalog.json'), 'utf8'),
).find((entry) => entry.id === 'typing-speed')

// A throwaway key stands in for the CI key; tests never touch real keys.
const pair = generateKeyPairSync('ed25519')
const raw = Buffer.from(
  pair.publicKey.export({ format: 'jwk' }).x,
  'base64url',
).toString('base64')
const keyId = createHash('sha256')
  .update(Buffer.from(raw, 'base64'))
  .digest('hex')
  .slice(0, 16)
const keys = { ...TRUST_KEYS, [keyId]: raw }
const pem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' })
const key = signingKey(pem, keys)

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hibi-sign-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'addons'))
  cpSync(join(root, 'addons/typing-speed'), join(directory, 'addons/typing-speed'), {
    recursive: true,
  })
  cpSync(
    join(root, 'signatures/typing-speed.json'),
    join(directory, 'signatures/typing-speed.json'),
  )
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify([typing]))
  return directory
}
const read = (directory, path) => readFileSync(join(directory, path), 'utf8')
const fetch = () => {
  throw new Error('No network access is expected.')
}

test('the workflow signer accepts only the directory key', () => {
  const result = spawnSync(process.execPath, ['scripts/sign.mjs'], {
    cwd: root,
    env: { PATH: process.env.PATH, HIBI_ADDON_SIGNING_KEY: pem },
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /does not trust signing key/)
  assert.throws(
    () => signingKey(pem, { [CI_KEY_ID]: TRUST_KEYS[CI_KEY_ID] }),
    /does not trust signing key/,
  )
})

test('the signer refuses keys Hibi does not trust', () => {
  assert.throws(() => signingKey(pem), /does not trust signing key/)
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
  assert.throws(
    () => signingKey(rsa.privateKey.export({ format: 'pem', type: 'pkcs8' })),
    /Ed25519/,
  )
})

test('valid signatures are left alone, so a second run changes nothing', async (t) => {
  const directory = scratch(t)
  const before = read(directory, 'signatures/typing-speed.json')
  assert.deepEqual(await signDirectory(directory, { key, keys, fetch }), [])
  assert.equal(read(directory, 'signatures/typing-speed.json'), before)
})

test('changed packages are signed and pass the strict check', async (t) => {
  const directory = scratch(t)
  writeFileSync(join(directory, 'addons/typing-speed/README.md'), '# New\n')
  await assert.rejects(checkDirectory(directory, { keys }), /do not match/)
  assert.deepEqual(
    (await checkDirectory(directory, { keys, pending: true })).map(
      (entry) => entry.id,
    ),
    ['typing-speed'],
  )
  assert.deepEqual(await signDirectory(directory, { key, keys, fetch }), [
    'typing-speed',
  ])
  const sidecar = read(directory, 'signatures/typing-speed.json')
  assert.equal(JSON.parse(sidecar).keyId, keyId)
  assert.equal(
    read(directory, 'addons/typing-speed/hibi-addon.sig.json'),
    sidecar,
  )
  await checkDirectory(directory, { keys })
  // Hibi's own keys do not include the throwaway key.
  await assert.rejects(checkDirectory(directory), /not signed with a Hibi key/)
  assert.deepEqual(await signDirectory(directory, { key, keys, fetch }), [])
})

test('missing signatures are added and one entry can be signed again on request', async (t) => {
  const directory = scratch(t)
  rmSync(join(directory, 'signatures/typing-speed.json'))
  await checkDirectory(directory, { keys, pending: true })
  assert.deepEqual(await signDirectory(directory, { key, keys, fetch }), [
    'typing-speed',
  ])
  const first = read(directory, 'signatures/typing-speed.json')
  const later = () => new Date('2030-01-01T00:00:00Z')
  assert.deepEqual(
    await signDirectory(directory, {
      key,
      keys,
      fetch,
      resign: 'typing-speed',
      now: later,
    }),
    ['typing-speed'],
  )
  assert.notEqual(read(directory, 'signatures/typing-speed.json'), first)
  await checkDirectory(directory, { keys })
  await assert.rejects(
    signDirectory(directory, { key, keys, fetch, resign: 'missing' }),
    /missing is not in catalog\.json/,
  )
})

test('forged signatures are refused, not replaced', async (t) => {
  const directory = scratch(t)
  const envelope = JSON.parse(read(directory, 'signatures/typing-speed.json'))
  const signature = Buffer.from(envelope.signature, 'base64')
  signature[0] ^= 1
  const forged = JSON.stringify({
    ...envelope,
    signature: signature.toString('base64'),
  })
  writeFileSync(join(directory, 'signatures/typing-speed.json'), forged)
  await assert.rejects(
    checkDirectory(directory, { keys, pending: true }),
    /invalid signature/,
  )
  // The signer skips the entry and reports it; it does not sign over it.
  const skipped = []
  assert.deepEqual(
    await signDirectory(directory, { key, keys, fetch, skipped }),
    [],
  )
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0].id, 'typing-speed')
  assert.match(skipped[0].reason, /invalid signature/)
  assert.equal(read(directory, 'signatures/typing-speed.json'), forged)
  await assert.rejects(
    signDirectory(directory, { key, keys, fetch, resign: 'typing-speed' }),
    /invalid signature/,
  )
})

test('pending entries are measured with the signature the signer writes', async (t) => {
  const directory = scratch(t)
  writeFileSync(join(directory, 'addons/typing-speed/README.md'), '# New\n')
  const [{ entry, hashes }] = await inspectDirectory(directory, { keys })
  const measured = signatureEnvelope(
    entry,
    hashes,
    '0'.repeat(16),
    () => Buffer.alloc(64),
    new Date(0).toISOString(),
  )
  await signDirectory(directory, { key, keys, fetch })
  assert.equal(
    Buffer.byteLength(measured),
    readFileSync(join(directory, 'signatures/typing-speed.json')).length,
  )
})

test('skipped entries are reported as warnings and in the job summary', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'hibi-report-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const summary = join(directory, 'summary.md')
  const before = process.env.GITHUB_STEP_SUMMARY
  process.env.GITHUB_STEP_SUMMARY = summary
  t.after(() => {
    if (before === undefined) delete process.env.GITHUB_STEP_SUMMARY
    else process.env.GITHUB_STEP_SUMMARY = before
  })
  const log = t.mock.method(console, 'log', () => {})
  reportSkipped([{ id: 'broken', reason: 'a | b\n100% wrong' }], 'Skipped')
  assert.deepEqual(log.mock.calls[0].arguments, [
    '::warning title=broken skipped::a | b%0A100%25 wrong',
  ])
  assert.match(read(directory, 'summary.md'), /### Skipped\n/)
  assert.match(read(directory, 'summary.md'), /\| broken \| a \\\| b 100% wrong \|/)
  reportSkipped([])
  assert.equal(log.mock.callCount(), 1)
})

test('the check passes with skipped or reported entries and stays strict for the rest', () => {
  const check = (...args) =>
    spawnSync(process.execPath, ['scripts/check.mjs', ...args], {
      cwd: root,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    })
  const unsigned = JSON.parse(read(root, 'catalog.json'))
    .map((entry) => entry.id)
    .filter((id) => !existsSync(join(root, 'signatures', `${id}.json`)))
  if (unsigned.length) {
    assert.equal(check().status, 1)
    const skipped = check(`--skip=${unsigned.join(',')}`)
    assert.equal(skipped.status, 0, skipped.stderr)
    for (const id of unsigned)
      assert.match(skipped.stdout, new RegExp(`::warning title=${id} skipped::`))
  }
  const invalid = check('--skip=Not An Id!')
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /--skip lists an invalid id/)
})
