# Browser Amp

Browser Amp is a static Clean Amp Workbench for connecting a Live Guitar Input, shaping a fixed clean Amp Chain, and explicitly enabling Processed Monitoring.

The canonical release is <https://jdyck.github.io/browser-amp/>. Current Google Chrome on macOS is the supported first-release target; iPhone browsers remain experimental.

## Amp models

Choose **Studio Clean**, **Warm Jazz Combo**, **Blackface Combo**, **High-Headroom American**, **Small Tweed Combo**, or **British Chime**. Each model remembers its own controls; Reset Controls returns to Studio Clean. These are original, inspired voicings rather than hardware replicas. See the [amp model specification](docs/jazz-amp-models-spec.md).

Amp, cabinet, and reverb selection share [stage switching](docs/audio-stage-switching.md): unused paths are retired after a fade, and bypassed reverb has no live convolver. Compression and Studio EQ retain their existing bypass behavior.

## Cabinet voicings

Choose **Compact 1×12 Jazz**, **American 1×12 Open-Back**, **American 2×12 Open-Back**, **4×10 Open-Back**, or **Direct / Full Range** after the amp model. Compact 1×12 Jazz is the default. The four voiced cabinets use causal biquad filters and a calibrated output trim; Direct is a unity path with no cabinet filters. Cabinet selection is saved, and changing it does not change the amp, effects, input capture, or monitoring. See the [cabinet voicing specification](docs/jazz-cabinet-models-spec.md).

## Studio compression

Studio Compression sits between Cabinet and Studio EQ. **Amount** controls intensity, **Level Match** makes bypass comparisons fairer, and **Reduction** shows live attenuation. Settings persist while bypassed. See the [controls specification](docs/studio-compression-controls-spec.md).

## Reverb modules

Choose **Jazz Room**, **Studio Chamber**, **Studio Plate**, **Fender Spring**, **Polytone Spring**, **Digital Room**, or **Digital Hall** in the Reverb Module selector. Enable Reverb controls bypass; Amount controls only the wet return, leaving the dry signal unchanged. Main Controls opens by default, while Advanced Controls starts collapsed. Each module has its own controls and remembers its settings independently, including while bypassed. **Reset This Reverb** restores only the selected module's Main and Advanced settings to defaults, leaving other modules, shared Amount, Enable Reverb, and all other controls unchanged. Switching or resetting a module does not reconnect input or change monitoring.

Studio Plate preserves the original sound at its defaults and remains the default selection, including for older saved settings and Reset Controls. The modules expose appropriate combinations of Decay, Pre-delay, Tone, Low Cut, Damping, Size, Early/Late balance, and Diffusion. Fender Spring adds a saturating Dwell control; Digital Hall adds live stereo Modulation Depth and Rate. Both are off at their defaults. The spring names describe inspired voicings, not measured or circuit-accurate hardware. See [reverb implementation notes](docs/reverb-modules.md) for details and validation limits.

## Development

```sh
npm ci
npm run dev
```

## Verification

```sh
npm run typecheck
npm test
npm run test:browser
npm run test:production
```

`test:browser` exercises the localhost UI and OfflineAudioContext behavior. `test:production` builds the app and reruns the UI smoke suite from `/browser-amp/`, including generated-asset path checks. After Pages deploys, CI runs the same suite against the live HTTPS deployment with `PLAYWRIGHT_BASE_URL` and `npm run test:deployed`.

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for supported scope and [docs/release-validation.md](docs/release-validation.md) for the Chrome macOS production and hardware sign-off record.
