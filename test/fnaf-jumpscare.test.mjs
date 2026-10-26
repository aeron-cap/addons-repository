import assert from 'node:assert/strict'
import test from 'node:test'
import createAddon from '../addons/fnaf-jumpscare/index.js'

function target() {
  const listeners = new Map()
  return {
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, new Map())
      listeners.get(type).set(listener, options)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    emit(type, event = {}) {
      for (const [listener, options] of [...(listeners.get(type) ?? [])]) {
        if (options?.once) listeners.get(type).delete(listener)
        listener(event)
      }
    },
    count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  }
}

function browser(t) {
  const timers = new Map()
  const elements = new Set()
  const rolls = []
  const commands = new Map()
  const notifications = []
  const motion = Object.assign(target(), { matches: false })
  const window = Object.assign(target(), { matchMedia: () => motion })
  let focused = true
  let next = 0
  let rejectAudio = false
  const document = Object.assign(target(), {
    hidden: false,
    hasFocus: () => focused,
    body: { appendChild: el => elements.add(el) },
    createElement(tag) {
      return Object.assign(target(), {
        tag, style: {}, attributes: {}, children: [], plays: 0, pauses: 0, loads: 0,
        setAttribute(name, value) { this.attributes[name] = value },
        removeAttribute(name) { delete this[name] },
        append(...children) { this.children.push(...children) },
        remove() { elements.delete(this) },
        play() {
          this.plays++
          return rejectAudio ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve()
        },
        pause() { this.pauses++ },
        load() { this.loads++ },
      })
    },
  })
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    timers.set(++next, { callback, delay })
    return next
  })
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id))
  t.mock.method(Math, 'random', () => rolls.shift() ?? 0.5)
  const restore = []
  for (const [name, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    restore.push(() => {
      if (old) Object.defineProperty(globalThis, name, old)
      else delete globalThis[name]
    })
  }
  const context = {
    commands: {
      register(command) {
        commands.set(command.id, command)
        return () => commands.delete(command.id)
      },
    },
    notify: text => notifications.push(text),
  }
  const addon = createAddon()
  addon.start(context)
  t.after(() => {
    addon.stop()
    for (const reset of restore) reset()
  })
  return {
    addon, context, commands, notifications, timers, elements, rolls, document, window, motion,
    overlay: () => [...elements][0],
    play: () => commands.get('play').run(),
    focus(value) {
      focused = value
      window.emit(value ? 'focus' : 'blur')
    },
    blockAudio: () => { rejectAudio = true },
    next() {
      const [id, { callback, delay }] = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0]
      timers.delete(id)
      callback()
      return delay
    },
  }
}

test('random scare waits for a genuine gesture and makes only one decision', t => {
  const env = browser(t)
  env.rolls.push(0.01, 0.5)
  assert.equal(env.next(), 5000)
  env.document.emit('keydown', { isTrusted: false })
  assert.equal(env.next(), 2500)
  assert.equal(env.elements.size, 0)
  env.document.emit('pointerdown', { isTrusted: true })
  env.rolls.push(0.75)
  env.next()
  assert.equal(env.elements.size, 1)
  const [image, audio] = env.overlay().children
  image.emit('load')
  assert.equal(audio.plays, 1)
  assert.equal(env.next(), 1500)
  assert.match(image.src, /assets\/static.gif$/)
  assert.equal(env.next(), 1500)
  assert.equal(env.elements.size, 0)
  assert.equal(env.timers.size, 0)
  env.focus(false)
  env.focus(true)
  assert.equal(env.timers.size, 0)
})

test('the 50 percent back-out consumes the automatic attempt; restart resets it', t => {
  const env = browser(t)
  env.document.emit('keydown', { isTrusted: true })
  env.rolls.push(0.01, 0.5, 0.49)
  env.next()
  env.next()
  assert.equal(env.elements.size, 0)
  assert.equal(env.timers.size, 0)
  env.addon.stop()
  env.addon.start(env.context)
  assert.equal(env.timers.size, 1)
  env.rolls.push(0.01, 0.5)
  env.next()
  env.next()
  assert.equal(env.elements.size, 0, 'restart must require a fresh gesture')
})

test('focus, visibility and live reduced motion pause timers and dismiss media', t => {
  const env = browser(t)
  env.focus(false)
  assert.equal(env.timers.size, 0)
  env.play()
  assert.equal(env.elements.size, 0)
  env.focus(true)
  env.play()
  const audio = env.overlay().children[1]
  env.document.hidden = true
  env.document.emit('visibilitychange')
  assert.equal(env.elements.size, 0)
  assert.equal(audio.pauses, 1)
  assert.equal(audio.loads, 1)
  assert.equal(audio.src, undefined)
  env.document.hidden = false
  env.document.emit('visibilitychange')
  env.play()
  env.motion.matches = true
  env.motion.emit('change')
  assert.equal(env.elements.size, 0)
  assert.equal(env.timers.size, 0)
  env.play()
  assert.equal(env.notifications.length, 1)
  env.motion.matches = false
  env.motion.emit('change')
  env.play()
  env.focus(false)
  assert.equal(env.elements.size, 0)
})

test('escape and button dismiss without stale image events affecting a replay', t => {
  const env = browser(t)
  env.play()
  const [image, audio] = env.overlay().children
  let prevented = false
  let stopped = false
  env.document.emit('keydown', {
    key: 'Escape',
    preventDefault() { prevented = true },
    stopImmediatePropagation() { stopped = true },
  })
  assert.ok(prevented && stopped)
  assert.equal(env.elements.size, 0)
  env.play()
  image.emit('load')
  image.emit('error')
  assert.equal(audio.plays, 0)
  assert.equal(env.elements.size, 1)
  env.overlay().children[2].emit('click')
  assert.equal(env.elements.size, 0)
  assert.equal(env.timers.size, 0)
})

test('load failure, deadline and rejected audio never strand an overlay', async t => {
  const env = browser(t)
  env.play()
  env.overlay().children[0].emit('error')
  assert.equal(env.elements.size, 0)
  env.play()
  assert.equal(env.next(), 5000)
  assert.equal(env.elements.size, 0)
  env.blockAudio()
  env.play()
  env.overlay().children[0].emit('load')
  await Promise.resolve()
  env.next()
  env.next()
  assert.equal(env.elements.size, 0)
  assert.equal(env.timers.size, 0)
})

test('double start, stop before media load, and restart leave no owned resources', t => {
  const env = browser(t)
  const count = env.document.count()
  env.addon.start(env.context)
  assert.equal(env.document.count(), count)
  env.play()
  env.play()
  assert.equal(env.elements.size, 1)
  const [image, audio] = env.overlay().children
  env.addon.stop()
  env.addon.stop()
  image.emit('load')
  assert.equal(audio.plays, 0)
  assert.equal(env.elements.size + env.timers.size + env.commands.size, 0)
  assert.equal(env.document.count() + env.window.count() + env.motion.count(), 0)
  env.addon.start(env.context)
  env.play()
  assert.equal(env.elements.size, 1)
})
