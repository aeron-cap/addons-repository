import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import create from '../addons/typing-speed/index.js'
import { typingSpeed } from '../addons/typing-speed/speed.js'

test('the estimate uses typed characters and resets after a pause', () => {
  const speed = typingSpeed()
  assert.deepEqual(speed.read(0), { cpm: 0, wpm: 0 })
  speed.add(5, 0)
  speed.add(5, 2000)
  assert.deepEqual(speed.read(2000), { cpm: 300, wpm: 60 })
  assert.deepEqual(speed.read(7000), { cpm: 0, wpm: 0 })
})

test('the addon shows both estimates in the status bar and stops its timer', (t) => {
  mock.timers.enable({ apis: ['setInterval'] })
  t.after(() => mock.timers.reset())
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const items = new Map()
  let input
  const addon = create()
  addon.start({
    statusBar: {
      register: (item) => {
        items.set(item.id, item.label)
        return { update: ({ label }) => items.set(item.id, label) }
      },
    },
    editor: { onInput: (listener) => (input = listener) },
  })
  assert.deepEqual(Object.fromEntries(items), { wpm: '≈0 WPM', cpm: '≈0 CPM' })
  input({ characters: 10 })
  now = 2000
  input({ characters: 10 })
  mock.timers.tick(1000)
  assert.deepEqual(Object.fromEntries(items), {
    wpm: '≈120 wpm',
    cpm: '≈600 cpm',
  })
  addon.stop()
  input({ characters: 100 })
  mock.timers.tick(5000)
  assert.equal(items.get('cpm'), '≈600 cpm')
})

test('typing speed estimates a session rate and resets after a five-second pause', () => {
  const speed = typingSpeed()
  speed.add(5, 0)
  speed.add(15, 1000)
  assert.deepEqual(speed.read(1000), { cpm: 1200, wpm: 240 })
  assert.deepEqual(speed.read(5999), { cpm: 1200, wpm: 240 })
  assert.deepEqual(speed.read(6000), { cpm: 0, wpm: 0 })
  speed.add(5, 7000)
  assert.deepEqual(speed.read(7000), { cpm: 300, wpm: 60 })
  speed.add(5, 9000)
  assert.deepEqual(speed.read(9000), { cpm: 300, wpm: 60 })
  speed.add(1, 15000)
  assert.deepEqual(speed.read(15000), { cpm: 60, wpm: 12 })
})

test('typing speed counts every input while publishing only on the existing one-second timer', (t) => {
  const addon = create()
  t.mock.timers.enable({ apis: ['setInterval'] })
  let time = 0,
    input
  t.mock.method(performance, 'now', () => time)
  const labels = new Map(),
    updates = []
  addon.start({
    statusBar: {
      register(item) {
        labels.set(item.id, item.label)
        return {
          update(change) {
            labels.set(item.id, change.label)
            updates.push(change)
          },
        }
      },
    },
    editor: {
      onInput(listener) {
        input = listener
      },
    },
  })
  t.after(() => addon.stop())
  for (let key = 0; key < 1000; key++) {
    time = key
    input({ characters: 1 })
  }
  assert.deepEqual(updates, [])
  time = 1000
  t.mock.timers.tick(1000)
  assert.equal(updates.length, 2)
  assert.equal(labels.get('cpm'), '≈60000 cpm')
  assert.equal(labels.get('wpm'), '≈12000 wpm')
  for (time = 2000; time <= 5000; time += 1000) t.mock.timers.tick(1000)
  assert.equal(labels.get('cpm'), '≈60000 cpm')
  time = 6000
  t.mock.timers.tick(1000)
  assert.equal(labels.get('cpm'), '≈0 cpm')
  assert.equal(labels.get('wpm'), '≈0 wpm')
  const count = updates.length
  addon.stop()
  time = 7000
  t.mock.timers.tick(1000)
  assert.equal(updates.length, count)
})
