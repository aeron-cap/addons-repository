# oneko

a pixel cat follows your cursor around hibi. when you stop moving, it may scratch itself or fall asleep. it wakes before chasing you again.

install this addon from hibi garden in **settings → addons**, then enable it. to test a local copy, use **install addon…** and choose this folder. local copies need **allow unsigned addons** in **settings → addon manager → security** until signed.

move your mouse inside hibi to lead the pet around. it ignores clicks and keyboard focus, so you can keep writing. its last position is saved locally when the addon stops or hibi closes. it pauses while the window is hidden and disappears while your system requests reduced motion.

disable this addon in **settings → addons** to remove the pet and stop its animation. you can enable either pet on its own or run both together.

## credits

ported for hibi by [schmayterling](https://github.com/schmayterling), version 1.0.0.

the sprite and animation come from [adryd325/oneko.js](https://github.com/adryd325/oneko.js), adapted through [aluminyoom/corgi](https://github.com/aluminyoom/corgi/tree/8e98444d887fbe52adae538155773489e018c366/extension/src/plugins/builtins/oneko.ts). upstream notices are preserved in [license.txt](LICENSE.txt). the follower is included in this package so it installs independently.
