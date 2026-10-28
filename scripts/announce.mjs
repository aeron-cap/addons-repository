#!/usr/bin/env node
// Prepare from validated, published packages without webhook credentials. Send
// separately, so package inspection never receives the Discord secret.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { inspectDirectory } from './check.mjs'

const REPOSITORY = 'https://github.com/hibigarden/addons-repository'
const ROLE = '1550310045068296262'
const SHA = /^[0-9a-f]{40}$/
const CHECKPOINT = 'refs/remotes/origin/addon-announcements-state'

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH },
    maxBuffer: 8 * 1024 * 1024,
  }).trim()
}

export function announcementBase(root) {
  let base
  try {
    base = git(root, 'rev-parse', '--verify', '--quiet', CHECKPOINT)
  } catch (error) {
    if (error.status !== 1) throw error
    // Start just before this notifier was introduced; old catalog entries do
    // not become new announcements when the checkpoint is first created.
    const introduced = git(
      root,
      'log',
      '--first-parent',
      '--diff-merges=first-parent',
      '--reverse',
      '--diff-filter=A',
      '--format=%H',
      'HEAD',
      '--',
      'scripts/announce.mjs',
    ).split('\n')[0]
    if (!SHA.test(introduced))
      throw new Error('cannot find announcement bootstrap commit')
    base = git(root, 'rev-parse', `${introduced}^`)
  }
  if (!SHA.test(base)) throw new Error('invalid announcement checkpoint')
  try {
    git(root, 'merge-base', '--is-ancestor', base, 'HEAD')
  } catch {
    throw new Error(
      'announcement checkpoint is not an ancestor of this publication',
    )
  }
  return base
}

export function readSnapshot(root, revision) {
  if (!SHA.test(revision)) throw new Error('expected a full commit sha')
  if (/^0+$/.test(revision)) return []
  const catalog = JSON.parse(git(root, 'show', `${revision}:catalog.json`))
  const paths = new Set(
    git(
      root,
      'ls-tree',
      '-r',
      '--name-only',
      revision,
      '--',
      'signatures',
    ).split('\n'),
  )
  return catalog.map((entry) => {
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(entry.id))
      throw new Error('invalid historical addon id')
    const path = `signatures/${entry.id}.json`
    if (!paths.has(path)) return { entry, files: null }
    const envelope = JSON.parse(git(root, 'show', `${revision}:${path}`))
    const statement = JSON.parse(
      Buffer.from(envelope.statement, 'base64').toString('utf8'),
    )
    return { entry, version: statement.addonVersion, files: statement.files }
  })
}

// Signed file hashes include the manifest, code, assets and readme, but not
// signatures. Re-signing or changing only catalog presentation is silent.
export function classifyChanges(before, after) {
  const previous = new Map(before.map((item) => [item.entry.id, item]))
  return after.flatMap(({ entry, version, files }) => {
    if (!files) throw new Error('cannot announce an unsigned package')
    const old = previous.get(entry.id)
    if (!old?.files) return [{ entry, files, kind: 'added' }]
    if (old.version === version && isDeepStrictEqual(old.files, files))
      return []
    return [{ entry, files, kind: 'updated', previousVersion: old.version }]
  })
}

function escapeText(value, limit) {
  const chars = Array.from(
    value
      .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  )
  return (chars.slice(0, limit).join('') + (chars.length > limit ? '…' : ''))
    .replace(/@/g, '@\u200b')
    .replace(/[\\`*_{}[\]()<>~|#!+-]/g, '\\$&')
}

function linkUrl(value, fallback) {
  const url = new URL(value).href.replace(
    /[\\()[\]<>`]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return url.length <= 1000 ? url : fallback
}

export function announcementPayloads(changes, revision) {
  if (!SHA.test(revision)) throw new Error('expected a full commit sha')
  const payloads = []
  let description = ''
  const flush = () => {
    if (!description) return
    payloads.push({
      content: payloads.length
        ? 'addon additions and updates (continued).'
        : `<@&${ROLE}> addon additions and updates.`,
      allowed_mentions: { parse: [], roles: [ROLE] },
      embeds: [
        {
          title: '🦋',
          description,
          color: 9568176,
          footer: {
            text: 'these addons are reviewed and signed. refresh the addon manager to see them.',
          },
        },
      ],
      attachments: [],
    })
    description = ''
  }
  for (const {
    entry,
    files,
    kind,
    previousVersion,
    previousRevision,
  } of changes) {
    const catalogUrl = `${REPOSITORY}/blob/${revision}/catalog.json`
    const source = entry.path
      ? `${REPOSITORY}/tree/${revision}/${entry.path}`
      : entry.repository
        ? `${entry.repository.url.replace(/\/$/, '')}/tree/${entry.repository.commit}${entry.repository.path ? `/${entry.repository.path}` : ''}`
        : entry.download.url
    const packageUrl = linkUrl(source, catalogUrl)
    const changelog = Object.keys(files).find((path) =>
      /^(changelog|changes|history)\.md$/i.test(path),
    )
    const links = [
      `[changes](${previousRevision ? `${REPOSITORY}/compare/${previousRevision}...${revision}` : `${REPOSITORY}/commit/${revision}`})`,
    ]
    if (changelog && !entry.download)
      links.push(
        `[changelog](${linkUrl(`${source}/${changelog}`, catalogUrl)})`,
      )
    const version =
      previousVersion && previousVersion !== entry.version
        ? `${escapeText(previousVersion, 40)} → ${escapeText(entry.version, 40)}`
        : escapeText(entry.version, 40)
    const line = `**${kind}** [${escapeText(entry.name, 100)}](${packageUrl}) · **${version}**\n${escapeText(entry.description, 300)}\n${links.join(' · ')}`
    if (description.length + line.length + 2 > 4096) flush()
    description += `${description ? '\n\n' : ''}${line}`
  }
  flush()
  return payloads
}

export async function prepareAnnouncements(
  root,
  base = announcementBase(root),
  options = {},
) {
  const revision = git(root, 'rev-parse', 'HEAD')
  const results = await inspectDirectory(root, { ...options, remote: true })
  const problem = results.find((result) => result.problem)?.problem
  if (problem) throw new Error(problem)
  const after = results.map(({ entry, hashes }) => ({
    entry,
    version: entry.version,
    files: hashes,
  }))
  const changes = classifyChanges(readSnapshot(root, base), after)
  for (const change of changes)
    change.previousRevision =
      git(
        root,
        'log',
        '-1',
        '--format=%H',
        base,
        '--',
        `signatures/${change.entry.id}.json`,
      ) || undefined
  return announcementPayloads(changes, revision)
}

export async function sendAnnouncements(
  webhookUrl,
  payloads,
  { fetch: send = globalThis.fetch, sleep = setTimeout } = {},
) {
  if (!webhookUrl) {
    console.log(
      '::notice::HIBI_ADDONS_WEBHOOK_URL is unset; skipping announcement.',
    )
    return false
  }
  if (!payloads.length) return false
  let url
  try {
    url = new URL(webhookUrl)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'discord.com' ||
      url.username ||
      url.password ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w.-]+$/.test(url.pathname)
    )
      throw new Error()
    url.searchParams.set('wait', 'true')
  } catch {
    throw new Error('invalid addon webhook url')
  }
  for (const [index, payload] of payloads.entries()) {
    for (let attempt = 0; ; attempt++) {
      let response
      try {
        response = await send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        })
      } catch {
        throw new Error(
          `addon webhook request failed at batch ${index + 1}/${payloads.length}; delivery is uncertain, inspect Discord before retrying`,
        )
      }
      // Only a rejected rate-limited request is safe to retry automatically.
      if (response.status === 429 && attempt < 2) {
        const retry = Number(response.headers.get('retry-after'))
        if (Number.isFinite(retry) && retry > 0 && retry <= 60) {
          await sleep(Math.ceil(retry * 1000))
          continue
        }
      }
      if (!response.ok)
        throw new Error(
          `addon webhook failed: HTTP ${response.status} at batch ${index + 1}/${payloads.length}`,
        )
      break
    }
  }
  return true
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === 'prepare') {
      const payloads = await prepareAnnouncements(process.cwd())
      writeFileSync('announcements.json', JSON.stringify(payloads))
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `published=${git(process.cwd(), 'rev-parse', 'HEAD')}\n`,
        )
      console.log(`prepared ${payloads.length} announcement batches`)
    } else if (process.argv[2] === 'send') {
      const delivered = await sendAnnouncements(
        process.env.HIBI_ADDONS_WEBHOOK_URL,
        JSON.parse(readFileSync('announcements.json', 'utf8')),
      )
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `delivered=${delivered}\n`)
    } else {
      throw new Error('usage: node scripts/announce.mjs prepare|send')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
