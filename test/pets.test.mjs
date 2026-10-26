import assert from 'node:assert/strict'
import test from 'node:test'
import createCat from '../addons/oneko/index.js'
import createHorse from '../addons/fatass-horse/index.js'

function target() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    emit(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    },
  }
}

function browser(t, reduced = false) {
  const frames = new Map()
  const elements = new Map()
  const positions = new Map()
  const motion = Object.assign(target(), { matches: reduced })
  let next = 0
  let now = 0
  const window = Object.assign(target(), {
    innerWidth: 800, innerHeight: 600,
    matchMedia: () => motion,
    requestAnimationFrame: (callback) => {
      frames.set(++next, callback)
      return next
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  })
  const document = Object.assign(target(), {
    hidden: false,
    body: { appendChild: (el) => elements.set(el.id, el) },
    createElement: () => ({
      style: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value },
      remove() { elements.delete(this.id) },
    }),
  })
  const storage = {
    getItem: (key) => positions.get(key) ?? null,
    setItem: (key, value) => positions.set(key, value),
  }
  for (const [name, value] of Object.entries({ window, document, localStorage: storage })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => {
      if (old) Object.defineProperty(globalThis, name, old)
      else delete globalThis[name]
    })
  }
  return {
    window, document, motion, frames, elements, positions, storage,
    move: (x, y) => document.emit('mousemove', { clientX: x, clientY: y }),
    frame(ms = 100) {
      now += ms
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(now)
    },
  }
}

const pets = [
  ['oneko', createCat, 32, {
    N: '-32px -96px', NE: '0px -96px', E: '-96px -32px',
    SE: '-160px -64px', S: '-224px -64px', SW: '-192px -32px',
    W: '-128px -96px', NW: '-32px -32px',
  }],
  ['fatass-horse', createHorse, 120, {
    N: '-120px -720px', NE: '-120px -840px', E: '-120px 0px',
    SE: '-120px -120px', S: '-120px -240px', SW: '-120px -360px',
    W: '-120px -480px', NW: '-120px -600px',
  }],
]

for (const [id, create, size, poses] of pets) {
  test(`${id} moves toward all eight cursor directions with the matching sprite`, (t) => {
    const env = browser(t)
    const directions = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
      S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] }
    for (const [direction, [dx, dy]] of Object.entries(directions)) {
      env.positions.set(`hibi-${id}-position`, JSON.stringify({ x: 400, y: 300 }))
      const addon = create()
      addon.start()
      const el = env.elements.get(`hibi-${id}`)
      assert.equal(el.attributes['aria-hidden'], 'true')
      assert.equal(el.style.pointerEvents, 'none')
      assert.match(el.style.backgroundImage, new RegExp(`${id}\\.(gif|png)`))
      env.move(400 + dx * 200, 300 + dy * 200)
      env.frame()
      const [left, top] = el.style.transform.match(/-?[\d.]+/g).map(Number)
      assert.equal(Math.sign(left + size / 2 - 400), dx)
      assert.equal(Math.sign(top + size / 2 - 300), dy)
      assert.equal(el.style.backgroundPosition, poses[direction])
      if (id === 'fatass-horse') assert.equal(el.style.backgroundSize, '1080px 960px')
      addon.stop()
      addon.stop()
      assert.equal(env.frames.size, 0)
      assert.equal(env.elements.size, 0)
      assert.equal(env.document.count() + env.window.count() + env.motion.count(), 0)
    }
  })

  test(`${id} respects live reduced motion, visibility, and resize`, (t) => {
    let addon
    t.after(() => addon?.stop())
    const env = browser(t, true)
    env.positions.set(`hibi-${id}-position`, '{"x":99999,"y":-99999}')
    addon = create()
    addon.start()
    const el = env.elements.get(`hibi-${id}`)
    assert.equal(el.hidden, true)
    assert.equal(env.frames.size, 0)
    env.motion.matches = false
    env.motion.emit('change')
    assert.equal(el.hidden, false)
    assert.equal(env.frames.size, 1)
    env.document.hidden = true
    env.document.emit('visibilitychange')
    assert.equal(env.frames.size, 0)
    env.document.hidden = false
    env.document.emit('visibilitychange')
    assert.equal(env.frames.size, 1)
    env.window.innerWidth = 200
    env.window.innerHeight = 160
    env.window.emit('resize')
    const [left, top] = el.style.transform.match(/-?[\d.]+/g).map(Number)
    assert.ok(left >= 0 && left + size <= 200)
    assert.ok(top >= 0 && top + size <= 160)
    env.motion.matches = true
    env.motion.emit('change')
    assert.equal(el.hidden, true)
    assert.equal(env.frames.size, 0)
  })

  test(`${id} survives malformed or unavailable position storage`, (t) => {
    const env = browser(t)
    env.positions.set(`hibi-${id}-position`, 'broken json')
    const addon = create()
    assert.doesNotThrow(() => addon.start())
    addon.stop()
    env.storage.getItem = () => { throw new Error('unavailable') }
    env.storage.setItem = () => { throw new Error('quota exceeded') }
    assert.doesNotThrow(() => addon.start())
    assert.doesNotThrow(() => addon.stop())
    assert.equal(env.frames.size + env.elements.size, 0)
    assert.equal(env.document.count() + env.window.count() + env.motion.count(), 0)
  })
}

test('pets coexist and stop independently; the horse fades near the cursor', (t) => {
  let cat, horse
  t.after(() => { cat?.stop(); horse?.stop() })
  const env = browser(t)
  cat = createCat()
  horse = createHorse()
  cat.start()
  horse.start()
  for (let frame = 0; frame < 50; frame++) env.frame()
  assert.equal(env.elements.get('hibi-fatass-horse').style.opacity, '0.3')
  cat.stop()
  assert.deepEqual([...env.elements.keys()], ['hibi-fatass-horse'])
  assert.equal(env.frames.size, 1)
  env.move(750, 550)
  env.frame()
  assert.ok(+env.elements.get('hibi-fatass-horse').style.opacity > 0.3)
  cat.start()
  assert.equal(env.elements.size, 2)
  assert.equal(env.frames.size, 2)
})

test('oneko sleeps while idle and wakes before moving again', (t) => {
  let cat
  t.after(() => cat?.stop())
  const env = browser(t)
  t.mock.method(Math, 'random', () => 0)
  cat = createCat()
  cat.start()
  const el = env.elements.get('hibi-oneko')
  for (let frame = 0; frame < 23; frame++) env.frame()
  assert.match(el.style.backgroundPosition, /^-64px (0|-32)px$/)
  const before = el.style.transform
  env.move(750, 550)
  for (let frame = 0; frame < 6; frame++) {
    env.frame()
    assert.equal(el.style.backgroundPosition, '-224px -96px')
    assert.equal(el.style.transform, before)
  }
  env.frame()
  assert.notEqual(el.style.transform, before)
})

test('oneko gets tired, sleeps at a four-tick cadence, then returns to idle', (t) => {
  let cat
  t.after(() => cat?.stop())
  const env = browser(t)
  let random = 0
  t.mock.method(Math, 'random', () => random++ < 2 ? 0 : 0.99)
  cat = createCat()
  cat.start()
  const el = env.elements.get('hibi-oneko')
  for (let frame = 0; frame < 10; frame++) env.frame()
  assert.equal(el.style.backgroundPosition, '-96px -96px')
  for (let frame = 0; frame < 8; frame++) {
    env.frame()
    assert.equal(el.style.backgroundPosition, '-96px -64px')
  }
  for (let frame = 0; frame < 4; frame++) {
    env.frame()
    assert.equal(el.style.backgroundPosition, '-64px 0px')
  }
  env.frame()
  assert.equal(el.style.backgroundPosition, '-64px -32px')
  for (let frame = 0; frame < 185; frame++) env.frame()
  assert.equal(el.style.backgroundPosition, '-96px -96px')
})
