// Ported from Corgi. See README.md and LICENSE.txt for upstream credits.
import { follow } from './follower.js'

const directions = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 }

export default () => {
  let stop
  return {
    start() {
      let opacity = 1
      stop = follow({
        id: 'fatass-horse',
        spriteUrl: new URL('./fatass-horse.png', import.meta.url).href,
        size: 120,
        speed: 30,
        interval: 42,
        setSprite(el, direction, frame) {
          el.style.backgroundSize = '1080px 960px'
          el.style.imageRendering = 'auto'
          el.style.backgroundPosition = `${-(frame % 9) * 120}px ${-directions[direction] * 120}px`
        },
        onIdle({ el }) {
          el.style.backgroundPosition = '0px -240px'
        },
        onFrame({ el, distance }) {
          opacity += ((distance < 72 ? 0.3 : 1) - opacity) * 0.1
          el.style.opacity = String(Math.round(opacity * 100) / 100)
        },
      })
    },
    stop() {
      stop?.()
      stop = undefined
    },
  }
}
