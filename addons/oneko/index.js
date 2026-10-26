// Ported from Corgi. See README.md and LICENSE.txt for upstream credits.
import { follow } from './follower.js'

const sprites = {
  idle: [[-3, -3]],
  alert: [[-7, -3]],
  scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
  tired: [[-3, -2]],
  sleeping: [[-2, 0], [-2, -1]],
  N: [[-1, -2], [-1, -3]],
  NE: [[0, -2], [0, -3]],
  E: [[-3, 0], [-3, -1]],
  SE: [[-5, -1], [-5, -2]],
  S: [[-6, -3], [-7, -2]],
  SW: [[-5, -3], [-6, -1]],
  W: [[-4, -2], [-4, -3]],
  NW: [[-1, 0], [-1, -1]],
}

function setSprite(el, direction, frame) {
  const frames = sprites[direction]
  const [x, y] = frames[frame % frames.length]
  el.style.backgroundPosition = `${x * 32}px ${y * 32}px`
}

export default () => {
  let stop
  return {
    start() {
      let idleTime = 0
      let idleAnimation = null
      let idleFrame = 0
      stop = follow({
        id: 'oneko',
        spriteUrl: new URL('./oneko.gif', import.meta.url).href,
        size: 32,
        speed: 10,
        interval: 100,
        setSprite,
        onIdle({ el }) {
          idleTime++
          if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && !idleAnimation) {
            idleAnimation = Math.random() < 0.5 ? 'sleeping' : 'scratchSelf'
            idleFrame = 0
          }
          if (!idleAnimation) {
            setSprite(el, 'idle', 0)
          } else if (idleAnimation === 'sleeping') {
            setSprite(el, idleFrame < 8 ? 'tired' : 'sleeping', Math.floor(idleFrame / 4))
            if (++idleFrame > 192) {
              idleAnimation = null
              idleFrame = 0
            }
          } else {
            setSprite(el, idleAnimation, idleFrame++)
            if (idleFrame > 9) {
              idleAnimation = null
              idleFrame = 0
            }
          }
        },
        onFrame({ el, distance }) {
          if (distance <= 48) return
          idleAnimation = null
          idleFrame = 0
          if (idleTime > 1) {
            setSprite(el, 'alert', 0)
            idleTime = Math.min(idleTime, 7) - 1
            return false
          }
          idleTime = 0
        },
      })
    },
    stop() {
      stop?.()
      stop = undefined
    },
  }
}
