# fnaf jumpscare

a third-party hibi port of [schmayterling/fnaf-jumpscare](https://github.com/schmayterling/fnaf-jumpscare).

this addon plays a sudden fredbear animation and sound, followed by flashing static. it is disabled by default. reduced motion disables both the automatic scare and the play command.

## use

1. install **fnaf jumpscare** from **settings → addon manager → hibi garden**.
2. enable it in **settings → addon manager**.
3. use hibi normally. the addon waits until you have clicked or pressed a key in the window and only plays while hibi is visible and focused.

the automatic event follows the original extension: every random interval below ten seconds, it has a 3% chance to queue a decision. once queued, it checks at random intervals below five seconds and has a 50% chance to back out. it makes one decision per activation. disable and re-enable the addon, or restart hibi, to reset it. waiting pauses while hibi is hidden, unfocused, or reduced motion is enabled.

choose **play fnaf jumpscare** in the command palette to play it immediately. this consumes the pending automatic attempt, and the command can replay it.

the animation lasts 1.5 seconds, then static lasts 1.5 seconds. press **escape** or click **dismiss jumpscare** to end it sooner. changing windows, enabling reduced motion, or disabling the addon immediately removes the effect and stops its sound. the overlay does not change notes or block typing.

to disable it, turn it off in **settings → addon manager**. it uses no network access, native permissions, or saved settings.

## credits and license

ported by [schmayterling](https://github.com/schmayterling), version 1.0.0.

code and bundled media come from [schmayterling/fnaf-jumpscare at b77762392e2b1da3eec5f4ea7cd1bb5ee58df0e5](https://github.com/schmayterling/fnaf-jumpscare/tree/b77762392e2b1da3eec5f4ea7cd1bb5ee58df0e5). the upstream repository is mit-licensed, copyright © 2024 ryanamay; its complete notice is preserved in [LICENSE.txt](LICENSE.txt) and hibi's open-source licenses.

the upstream media files are included unchanged. the repository records no separate media credits or license notices. five nights at freddy's and its characters belong to their respective owners; this is an unofficial port.

the hibi port replaces chrome-specific tab checks and asset urls with window focus checks and bundled asset urls. unlike the original's permanent static overlay, this version dismisses automatically and cleans up on disable.
