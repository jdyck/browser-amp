# Browser Amp

Browser Amp is a static Clean Amp Workbench for connecting a Live Guitar Input, shaping a fixed clean Amp Chain, and explicitly enabling Processed Monitoring.

The canonical release is <https://jdyck.github.io/browser-amp/>. Current Google Chrome on macOS is the supported first-release target; iPhone browsers remain experimental.

## Amp models

Choose **Clean Voice** for transparent gain, **Clean Tube** for gentle tube-inspired saturation and a softer high end, or **Clean Tube Warm** for fuller low mids, darker highs, and earlier breakup. With either tube model selected, raise Clean Gain to approach breakup and use Master for listening volume. The selection is saved; Reset Controls returns to Clean Voice. These are original voicings, not replicas of named amps. See [Clean Tube model notes](docs/clean-tube-model.md) for the signal paths and validation limits.

Amp selection and reverb bypass share [stage switching](docs/audio-stage-switching.md): unused amp paths are retired after a fade, and bypassed reverb has no live convolver. EQ and Compression retain their existing bypass behavior.

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
