import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
import {
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
import {
  announcementBase,
  announcementPayloads,
  classifyChanges,
  prepareAnnouncements,
  readSnapshot,
  sendAnnouncements,
} from '../scripts/announce.mjs'
import { checkDirectory } from '../scripts/check.mjs'
import { signDirectory, signingKey } from '../scripts/sign.mjs'

const SHA = 'a'.repeat(40)
const ROLE = '1550310045068296262'
const WEBHOOK = 'https://discord.com/api/webhooks/123/fake-test-token'
const entry = (id = 'hello', extra = {}) => ({
  id,
  name: id,
  description: 'a helpful addon.',
  version: '1.0.0',
  apiVersion: 2,
  kind: 'extension',
  authors: [{ displayName: 'author' }],
  license: 'MIT',
  path: `addons/${id}`,
  ...extra,
})
const snapshot = (
  item = entry(),
  files = { 'hibi-addon.json': 'manifest', 'index.js': 'code' },
) => ({ entry: item, version: item.version, files })
const added = (item = entry(), files = {}) => ({
  entry: item,
  files,
  kind: 'added',
})

test('classifies additions, updates, deletions and unchanged entries by id', () => {
  const old = snapshot()
  assert.deepEqual(classifyChanges([], [old]), [added(old.entry, old.files)])
  assert.deepEqual(classifyChanges([old], []), [])
  assert.deepEqual(classifyChanges([old], [structuredClone(old)]), [])
  const code = snapshot(old.entry, { ...old.files, 'index.js': 'new code' })
  assert.deepEqual(classifyChanges([old], [code]), [
    {
      ...added(code.entry, code.files),
      kind: 'updated',
      previousVersion: '1.0.0',
    },
  ])
  const two = snapshot(entry('two'))
  assert.deepEqual(classifyChanges([old, two], [two, old]), [])
  assert.deepEqual(
    classifyChanges(
      [old],
      [
        snapshot(old.entry, {
          'index.js': 'code',
          'hibi-addon.json': 'manifest',
        }),
      ],
    ),
    [],
  )
})

test('version, manifest, assets, file removal and readme changes announce', () => {
  const old = snapshot()
  assert.equal(
    classifyChanges([old], [snapshot(entry('hello', { version: '2.0.0' }))])[0]
      .kind,
    'updated',
  )
  for (const files of [
    { ...old.files, 'hibi-addon.json': 'new manifest' },
    { ...old.files, 'asset.png': 'new asset' },
    { ...old.files, 'README.md': 'new instructions' },
    { 'hibi-addon.json': 'manifest' },
  ])
    assert.equal(
      classifyChanges([old], [snapshot(old.entry, files)])[0].kind,
      'updated',
    )
})

test('cosmetic catalog fields and byte-identical source repins are silent', () => {
  const { path, ...metadata } = entry()
  const old = snapshot({
    ...metadata,
    repository: { url: 'https://github.com/example/addon', commit: SHA },
  })
  const current = snapshot({
    ...old.entry,
    homepage: 'https://example.com',
    license: 'GPL-3.0-only',
    repository: { ...old.entry.repository, commit: 'b'.repeat(40) },
  })
  assert.deepEqual(classifyChanges([old], [current]), [])
  const archive = snapshot({
    ...metadata,
    download: {
      url: 'https://example.com/old.zip',
      size: 100,
      sha256: 'a'.repeat(64),
    },
  })
  assert.deepEqual(
    classifyChanges(
      [archive],
      [
        snapshot({
          ...archive.entry,
          download: {
            ...archive.entry.download,
            url: 'https://example.com/new.zip',
          },
        }),
      ],
    ),
    [],
  )
})

test('a listing waiting for its first signature is an addition', () => {
  const old = { entry: entry(), files: null }
  assert.equal(classifyChanges([old], [snapshot()])[0].kind, 'added')
  assert.throws(() => classifyChanges([], [old]), /unsigned package/)
})

test('matches release butterfly, color, lowercase copy and role allowlist', () => {
  const [payload] = announcementPayloads([added()], SHA)
  assert.equal(payload.content, `<@&${ROLE}> addon additions and updates.`)
  assert.deepEqual(payload.allowed_mentions, { parse: [], roles: [ROLE] })
  assert.equal(payload.embeds[0].title, '🦋')
  assert.equal(payload.embeds[0].color, 9568176)
  assert.equal(
    payload.embeds[0].footer.text,
    'these addons are reviewed and signed. refresh the addon manager to see them.',
  )
  assert.deepEqual(payload.attachments, [])
  assert.deepEqual(announcementPayloads([], SHA), [])
})

test('uses current package metadata, version transition and immutable change links', () => {
  const change = {
    ...added(entry('hello', { name: 'Hello addon', version: '2.0.0' }), {
      'CHANGELOG.md': 'hash',
    }),
    kind: 'updated',
    previousVersion: '1.0.0',
    previousRevision: 'b'.repeat(40),
  }
  const text = announcementPayloads([change], SHA)[0].embeds[0].description
  assert.ok(
    text.includes(
      `**updated** [Hello addon](https://github.com/hibigarden/addons-repository/tree/${SHA}/addons/hello)`,
    ),
  )
  assert.ok(text.includes('**1.0.0 → 2.0.0**'))
  assert.ok(text.includes(`compare/${'b'.repeat(40)}...${SHA}`))
  assert.ok(text.includes(`/tree/${SHA}/addons/hello/CHANGELOG.md`))
  const { path, ...metadata } = entry()
  const remote = added({
    ...metadata,
    repository: {
      url: 'https://github.com/example/addon/',
      commit: SHA,
      path: 'package',
    },
  })
  assert.ok(
    announcementPayloads([remote], SHA)[0].embeds[0].description.includes(
      `https://github.com/example/addon/tree/${SHA}/package`,
    ),
  )
})

test('escapes markdown, controls, injected mentions, Unicode and download links', () => {
  const { path, ...metadata } = entry()
  const change = added({
    ...metadata,
    name: '日本語 🦋 **name** [bad](url) <@123> `code` \\',
    description:
      '@everyone\n@here <@&1550310045068296262> <@123> ||hidden|| # title\u0000 ok',
    download: { url: 'https://example.com/a)[injected](x).zip' },
  })
  const payload = announcementPayloads([change], SHA)[0]
  const text = payload.embeds[0].description
  assert.ok(text.includes('日本語 🦋'))
  assert.ok(text.includes('\\*\\*name\\*\\*'))
  assert.ok(text.includes('\\[bad\\]\\(url\\)'))
  assert.ok(text.includes('https://example.com/a%29%5Binjected%5D%28x%29.zip'))
  assert.ok(!text.includes('@everyone'))
  assert.ok(!text.includes('@here'))
  assert.ok(!text.includes(`<@&${ROLE}>`))
  assert.ok(!text.includes('\u0000'))
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload)
  assert.deepEqual(payload.allowed_mentions, { parse: [], roles: [ROLE] })
})

test('batches a full 500-addon catalog within every Discord limit without lost entries', () => {
  const changes = Array.from({ length: 500 }, (_, index) =>
    added(
      entry(`addon-${index}`, {
        name: '🦋'.repeat(50),
        description: '*'.repeat(499),
      }),
      { 'CHANGELOG.md': 'hash' },
    ),
  )
  const payloads = announcementPayloads(changes, SHA)
  assert.ok(payloads.length > 1)
  let rows = 0
  let pings = 0
  for (const payload of payloads) {
    assert.ok(payload.content.length <= 2000)
    assert.ok(payload.embeds.length <= 10)
    const embed = payload.embeds[0]
    assert.ok(embed.title.length <= 256)
    assert.ok(embed.description.length <= 4096)
    assert.ok(embed.footer.text.length <= 2048)
    assert.ok(
      embed.title.length +
        embed.description.length +
        embed.footer.text.length <=
        6000,
    )
    assert.ok(embed.description.isWellFormed())
    rows += [...embed.description.matchAll(/\*\*added\*\*/g)].length
    pings += payload.content.includes(`<@&${ROLE}>`) ? 1 : 0
    assert.deepEqual(payload.allowed_mentions, { parse: [], roles: [ROLE] })
  }
  assert.equal(rows, 500)
  assert.equal(pings, 1)
})

test('oversized source links fall back to the catalog without breaking message limits', () => {
  const { path, ...metadata } = entry()
  const change = added({
    ...metadata,
    download: { url: `https://example.com/${'x'.repeat(8192)}` },
  })
  const text = announcementPayloads([change], SHA)[0].embeds[0].description
  assert.ok(text.includes(`/blob/${SHA}/catalog.json`))
  assert.ok(text.length < 4096)
})

test('workflow gates require publication and all-batch delivery before checkpointing', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/sign.yml', import.meta.url),
    'utf8',
  )
  const github = {
    repository: 'hibigarden/addons-repository',
    ref: 'refs/heads/main',
    event_name: 'push',
  }
  const permits = (job, needs, context = github, cancelled = false) => {
    const block = workflow.split(`\n  ${job}:\n`)[1]
    const expression = block
      .match(/    if: >-\n([\s\S]*?)\n    runs-on:/)[1]
      .trim()
    return new Function(
      'github',
      'needs',
      'cancelled',
      'always',
      `return (${expression})`,
    )(
      context,
      needs,
      () => cancelled,
      () => true,
    )
  }
  const signed = {
    sign: { result: 'success', outputs: { signed: 'hello' } },
    commit: { result: 'success', outputs: { published: SHA } },
  }
  assert.equal(permits('notify', signed), true)
  assert.equal(
    permits('notify', {
      ...signed,
      commit: { result: 'success', outputs: { published: '' } },
    }),
    false,
  )
  assert.equal(
    permits('notify', { ...signed, sign: { result: 'failure', outputs: {} } }),
    false,
  )
  assert.equal(
    permits('notify', {
      sign: { result: 'success', outputs: { signed: '' } },
      commit: { result: 'skipped', outputs: {} },
    }),
    true,
  )
  for (const context of [
    { ...github, repository: 'fork/addons-repository' },
    { ...github, ref: 'refs/heads/feature' },
    { ...github, event_name: 'pull_request' },
    { ...github, event_name: 'workflow_dispatch' },
  ])
    assert.equal(permits('notify', signed, context), false)
  const delivered = {
    notify: { result: 'success', outputs: { delivered: 'true' } },
  }
  assert.equal(permits('checkpoint', delivered), true)
  assert.equal(permits('checkpoint', delivered, github, true), false)
  for (const result of ['failure', 'cancelled', 'skipped'])
    assert.equal(
      permits('checkpoint', {
        notify: { result, outputs: { delivered: 'true' } },
      }),
      false,
    )
  for (const value of ['', 'false'])
    assert.equal(
      permits('checkpoint', {
        notify: { result: 'success', outputs: { delivered: value } },
      }),
      false,
    )
})

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hibi-announce-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim()
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'test')
  git('config', 'user.email', 'test@example.com')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(root, 'signatures'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')
  const keyId = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  const keys = { [keyId]: raw.toString('base64') }
  const key = signingKey(
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    keys,
  )
  const writeCatalog = (entries) =>
    writeFileSync(join(root, 'catalog.json'), JSON.stringify(entries))
  const packageFiles = (item) => {
    mkdirSync(join(root, item.path), { recursive: true })
    const { path, license, ...metadata } = item
    writeFileSync(
      join(root, item.path, 'hibi-addon.json'),
      JSON.stringify({ ...metadata, entry: 'index.js' }),
    )
    writeFileSync(join(root, item.path, 'README.md'), '# hello\n')
    writeFileSync(join(root, item.path, 'LICENSE.txt'), 'MIT\n')
    // Parsing this file is allowed; executing it fails the test immediately.
    writeFileSync(
      join(root, item.path, 'index.js'),
      'throw new Error("addon code must never execute")\n',
    )
  }
  const commit = () => {
    git('add', '.')
    git('commit', '-m', 'test: fixture')
    return git('rev-parse', 'HEAD')
  }
  const sign = (resign) =>
    signDirectory(root, {
      key,
      keys,
      resign,
      now: () => new Date(resign ? '2030-01-01' : '2026-01-01'),
    })
  return { root, git, key, keys, writeCatalog, packageFiles, commit, sign }
}

test('published snapshots ignore signature timestamps and key material', async (t) => {
  const f = fixture(t)
  f.writeCatalog([entry()])
  f.packageFiles(entry())
  await f.sign()
  const before = f.commit()
  const signature = join(f.root, 'signatures/hello.json')
  const envelope = JSON.parse(readFileSync(signature, 'utf8'))
  const statement = JSON.parse(Buffer.from(envelope.statement, 'base64'))
  statement.signedAt = '2030-01-01T00:00:00.000Z'
  envelope.statement = Buffer.from(JSON.stringify(statement)).toString('base64')
  envelope.signature = 'different signature bytes'
  writeFileSync(signature, JSON.stringify(envelope))
  const after = f.commit()
  assert.deepEqual(
    classifyChanges(readSnapshot(f.root, before), readSnapshot(f.root, after)),
    [],
  )
  assert.deepEqual(readSnapshot(f.root, '0'.repeat(40)), [])
  assert.throws(() => readSnapshot(f.root, '--all'), /full commit sha/)
})

test('delayed signing covers additions and updates from superseded pushes', async (t) => {
  const f = fixture(t)
  f.writeCatalog([entry()])
  f.packageFiles(entry())
  await f.sign()
  const old = f.commit()
  f.packageFiles(entry('hello', { version: '2.0.0' }))
  f.writeCatalog([entry('hello', { version: '2.0.0' })])
  f.commit()
  f.packageFiles(entry('two'))
  f.writeCatalog([entry('hello', { version: '2.0.0' }), entry('two')])
  const base = f.commit()
  await f.sign()
  f.commit()
  const payloads = await prepareAnnouncements(f.root, base, { keys: f.keys })
  const text = payloads.map((p) => p.embeds[0].description).join('\n')
  assert.ok(text.includes('**updated** [hello]'))
  assert.ok(text.includes('**1.0.0 → 2.0.0**'))
  assert.ok(text.includes('**added** [two]'))
  assert.ok(text.includes(`compare/${old}...`))
})

test('checkpoint covers pre-signed additions and updates across coalesced pushes', async (t) => {
  const f = fixture(t)
  f.writeCatalog([entry()])
  f.packageFiles(entry())
  await f.sign()
  const delivered = f.commit()
  f.git(
    'update-ref',
    'refs/remotes/origin/addon-announcements-state',
    delivered,
  )
  f.packageFiles(entry('two'))
  f.packageFiles(entry('hello', { version: '2.0.0' }))
  f.writeCatalog([entry('hello', { version: '2.0.0' }), entry('two')])
  await f.sign()
  f.commit() // Push A, fully signed before the workflow starts.
  writeFileSync(join(f.root, 'README.md'), 'unrelated push B\n')
  const coalesced = f.commit() // A's run checks out B; B may be replaced in queue.
  assert.equal(announcementBase(f.root), delivered)
  const payloads = await prepareAnnouncements(f.root, undefined, {
    keys: f.keys,
  })
  const text = payloads
    .map((payload) => payload.embeds[0].description)
    .join('\n')
  assert.ok(text.includes('**added** [two]'))
  assert.ok(text.includes('**updated** [hello]'))
  assert.ok(text.includes('**1.0.0 → 2.0.0**'))
  f.git(
    'update-ref',
    'refs/remotes/origin/addon-announcements-state',
    coalesced,
  )
  assert.deepEqual(
    await prepareAnnouncements(f.root, undefined, { keys: f.keys }),
    [],
  )
  await f.sign('hello')
  f.commit()
  assert.deepEqual(
    await prepareAnnouncements(f.root, undefined, { keys: f.keys }),
    [],
  )
})

test('missing checkpoint bootstraps from the first-parent introduction without historical noise', async (t) => {
  const f = fixture(t)
  f.writeCatalog([entry()])
  f.packageFiles(entry())
  await f.sign()
  f.commit()
  f.git('switch', '-c', 'notifier')
  mkdirSync(join(f.root, 'scripts'))
  writeFileSync(join(f.root, 'scripts/announce.mjs'), '// notifier fixture\n')
  f.commit()
  f.git('switch', 'main')
  writeFileSync(join(f.root, 'README.md'), 'main before notifier merge\n')
  const previousMain = f.commit()
  f.git('merge', '--no-ff', 'notifier', '-m', 'test: introduce notifier')
  assert.equal(announcementBase(f.root), previousMain)
  assert.deepEqual(
    await prepareAnnouncements(f.root, undefined, { keys: f.keys }),
    [],
  )
  f.packageFiles(entry('two'))
  f.writeCatalog([entry(), entry('two')])
  await f.sign()
  f.commit()
  assert.ok(
    (
      await prepareAnnouncements(f.root, undefined, { keys: f.keys })
    )[0].embeds[0].description.includes('**added** [two]'),
  )
})

test('a checkpoint outside main ancestry fails instead of silently resetting', async (t) => {
  const f = fixture(t)
  f.writeCatalog([])
  f.commit()
  const unrelated = f.git(
    'commit-tree',
    f.git('rev-parse', 'HEAD^{tree}'),
    '-m',
    'test: unrelated',
  )
  f.git(
    'update-ref',
    'refs/remotes/origin/addon-announcements-state',
    unrelated,
  )
  assert.throws(() => announcementBase(f.root), /not an ancestor/)
})

test('preparation skips unpublished, invalid and mismatched package metadata', async (t) => {
  const f = fixture(t)
  f.writeCatalog([entry()])
  f.packageFiles(entry())
  const pending = f.commit()
  const skips = async (base) => {
    const skipped = []
    const payloads = await prepareAnnouncements(f.root, base, {
      keys: f.keys,
      skipped,
    })
    assert.deepEqual(payloads, [])
    assert.deepEqual(
      skipped.map(({ id }) => id),
      ['hello'],
    )
    return skipped[0].reason
  }
  assert.match(await skips(pending), /needs a Hibi signature/)
  await f.sign()
  const signed = f.commit()
  writeFileSync(
    join(f.root, 'addons/hello/index.js'),
    'export const changed = true\n',
  )
  assert.match(await skips(signed), /files do not match/)
  f.writeCatalog([entry('hello', { version: '3.0.0' })])
  assert.match(await skips(signed), /does not match hibi-addon.json/)
})

test('one failing addon is skipped while the rest are signed, checked and announced', async (t) => {
  const f = fixture(t)
  f.writeCatalog([])
  const base = f.commit()
  const broken = entry('broken')
  f.writeCatalog([entry(), broken])
  f.packageFiles(entry())
  f.packageFiles(broken)
  // The catalog no longer matches the package's manifest.
  f.writeCatalog([entry(), { ...broken, description: 'something else.' }])
  const skipped = []
  assert.deepEqual(
    await signDirectory(f.root, { key: f.key, keys: f.keys, skipped }),
    ['hello'],
  )
  assert.deepEqual(
    skipped.map(({ id }) => id),
    ['broken'],
  )
  assert.match(skipped[0].reason, /description does not match/)
  assert.equal(existsSync(join(f.root, 'signatures/broken.json')), false)
  await assert.rejects(checkDirectory(f.root, { keys: f.keys }), /broken/)
  await checkDirectory(f.root, { keys: f.keys, skip: ['broken'] })
  f.commit()
  const notAnnounced = []
  const payloads = await prepareAnnouncements(f.root, base, {
    keys: f.keys,
    skipped: notAnnounced,
  })
  assert.equal(payloads.length, 1)
  assert.match(payloads[0].embeds[0].description, /\*\*added\*\* \[hello\]/)
  assert.doesNotMatch(payloads[0].embeds[0].description, /broken/)
  assert.deepEqual(
    notAnnounced.map(({ id }) => id),
    ['broken'],
  )
})

test('missing secret skips with notice; empty payloads make no requests', async (t) => {
  const send = t.mock.fn(() => {
    throw new Error('network forbidden')
  })
  const log = t.mock.method(console, 'log', () => {})
  assert.equal(await sendAnnouncements('', [added()], { fetch: send }), false)
  assert.equal(await sendAnnouncements(WEBHOOK, [], { fetch: send }), false)
  assert.equal(send.mock.callCount(), 0)
  assert.match(log.mock.calls[0].arguments[0], /unset; skipping announcement/)
})

test('sends JSON batches serially with confirmation, timeout and no redirects', async (t) => {
  const payloads = announcementPayloads(
    Array.from({ length: 30 }, (_, i) => added(entry(`addon-${i}`))),
    SHA,
  )
  const sent = []
  let active = false
  const send = t.mock.fn(async (url, init) => {
    assert.equal(active, false)
    active = true
    assert.equal(url.searchParams.get('wait'), 'true')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['Content-Type'], 'application/json')
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal instanceof AbortSignal)
    sent.push(JSON.parse(init.body))
    await Promise.resolve()
    active = false
    return new Response('{}', { status: 200 })
  })
  assert.equal(
    await sendAnnouncements(WEBHOOK, payloads, { fetch: send }),
    true,
  )
  assert.deepEqual(sent, payloads)
})

test('network failures are not retried and never expose secret URLs', async (t) => {
  const send = t.mock.fn(async () => {
    throw new Error(`failure ${WEBHOOK}`)
  })
  await assert.rejects(
    sendAnnouncements(WEBHOOK, [{}, {}], { fetch: send }),
    (error) => {
      assert.match(error.message, /batch 1\/2; delivery is uncertain/)
      assert.ok(!error.message.includes(WEBHOOK))
      assert.equal(error.cause, undefined)
      return true
    },
  )
  assert.equal(send.mock.callCount(), 1)
})

test('HTTP failures report only status and failed batch; remaining batches stop', async (t) => {
  const send = t.mock.fn(async () => new Response(WEBHOOK, { status: 500 }))
  await assert.rejects(
    sendAnnouncements(WEBHOOK, [{}, {}], { fetch: send }),
    /^Error: addon webhook failed: HTTP 500 at batch 1\/2$/,
  )
  assert.equal(send.mock.callCount(), 1)
})

test('partial delivery and cancellation never report complete delivery', async (t) => {
  let delivered = false
  const send = t.mock.fn(
    async () =>
      new Response('{}', { status: send.mock.callCount() === 0 ? 200 : 503 }),
  )
  await assert.rejects(async () => {
    delivered = await sendAnnouncements(WEBHOOK, [{}, {}, {}], { fetch: send })
  }, /HTTP 503 at batch 2\/3/)
  assert.equal(delivered, false)
  assert.equal(send.mock.callCount(), 2)
  await assert.rejects(
    sendAnnouncements(WEBHOOK, [{}], {
      fetch: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    }),
    /delivery is uncertain/,
  )
})

test('rate limits respect Retry-After with a bounded retry count', async (t) => {
  const sleep = t.mock.fn(async () => {})
  const send = t.mock.fn(async () =>
    send.mock.callCount() === 0
      ? new Response('{}', { status: 429, headers: { 'Retry-After': '0.125' } })
      : new Response('{}'),
  )
  await sendAnnouncements(WEBHOOK, [{}], { fetch: send, sleep })
  assert.deepEqual(
    sleep.mock.calls.map((call) => call.arguments),
    [[125]],
  )
  const limited = t.mock.fn(
    async () =>
      new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }),
  )
  await assert.rejects(
    sendAnnouncements(WEBHOOK, [{}], { fetch: limited, sleep }),
    /HTTP 429/,
  )
  assert.equal(limited.mock.callCount(), 3)
  for (const delay of ['', '-1', 'NaN', '61']) {
    const invalid = t.mock.fn(
      async () =>
        new Response('{}', { status: 429, headers: { 'Retry-After': delay } }),
    )
    await assert.rejects(
      sendAnnouncements(WEBHOOK, [{}], { fetch: invalid, sleep }),
      /HTTP 429/,
    )
    assert.equal(invalid.mock.callCount(), 1)
  }
})

test('bad webhook URLs fail without disclosing them or attempting a request', async (t) => {
  const send = t.mock.fn(() => {
    throw new Error('network forbidden')
  })
  for (const url of [
    'not a url',
    'http://discord.com/api/webhooks/123/token',
    'https://example.com/api/webhooks/123/token',
    'https://user:token@discord.com/api/webhooks/123/token',
  ])
    await assert.rejects(
      sendAnnouncements(url, [{}], { fetch: send }),
      /^Error: invalid addon webhook url$/,
    )
  assert.equal(send.mock.callCount(), 0)
})
