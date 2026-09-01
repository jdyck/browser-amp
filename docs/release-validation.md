# Chrome macOS release validation

Use this log to sign off one deployed commit. Do not infer hardware behavior from the automated browser simulation: record physical results for every Validation Interface that is available.

## Release candidate

| Field | Evidence |
| --- | --- |
| Commit SHA | |
| Validation date and tester | 2026-08-14 — tester not recorded |
| macOS version and Mac model | macOS — version and Mac model not recorded |
| Chrome version | Chrome — version not recorded |
| Production URL | `https://jdyck.github.io/browser-amp/` |
| GitHub Actions run | |
| Release decision | Pending / Pass / Fail |

## Automated release gate

Attach the GitHub Actions run that proves each command passed for the candidate SHA.

- [ ] `npm run typecheck`
- [ ] `npm test` — unit and AudioEngine tests
- [ ] `npm run test:browser` — localhost UI and OfflineAudioContext tests
- [ ] `npm run test:production` — the same UI behaviors against `dist` at `/browser-amp/`, plus generated-asset path checks
- [ ] The `dist` artifact deployed from that run to the `github-pages` environment
- [ ] `npm run test:deployed` — the same UI and asset checks pass against the deployed HTTPS Pages URL

## Production HTTPS smoke test

Run this section against the exact production URL in Chrome, not Vite preview.

- [ ] The page is HTTPS, renders without console errors, and makes no failed script, style, or generated-asset requests.
- [ ] Reload starts disconnected with Processed Monitoring off.
- [ ] Connect Input asks for permission and reaches connected-muted; both meters remain visible and Processed Monitoring remains off.
- [ ] Enable Processed Monitoring is a separate action and the Hardware Direct Monitoring guidance appears when not previously dismissed.
- [ ] Sliders and exact numeric fields stay synchronized and clamp to their documented ranges.
- [ ] Studio Compression, Studio EQ, and Reverb bypass preserve settings; Reverb bypass has the expected tail chop without a pop.
- [ ] Level Match survives reload and reset; Reduction reads 0 dB while bypassed and responds while playing.
- [ ] Saved Control Settings survive reload while the Input Connection and Processed Monitoring do not.
- [ ] Reset Controls restores defaults without changing connection or monitoring.
- [ ] CLIP latches under deliberate overload and Clear CLIP resets it.
- [ ] Unplugging the active input silences monitoring; reconnect and resume require explicit actions.

Notes and evidence links:

- 2026-08-14 manual hardware report: Browser Amp input and Processed Monitoring worked in Chrome on macOS with iRig HD 2, a Scarlett/Focusrite interface, and an instrument-to-USB cable. MacBook internal speakers and its headphone jack both received monitoring. The Focusrite output route initially failed, then worked after routing was adjusted; preserve the exact route in the full interface record when it is known.

## Validation Interface summary

Fill one row after completing the full interface record below. If an interface is unavailable, record why; do not mark it passed.

| Validation Interface | Available | Browser device label | Physical guitar jack / Input Channel | Capture processing reported | Intended output route | Guitar-only / no mic fallback | Result and evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| iRig HD 2 | Yes | Not recorded | Not recorded | Not recorded | MacBook internal speakers and headphone jack | Reported guitar input; no fallback issue reported | **Reported pass** — manual Chrome/macOS test on 2026-08-14; full record pending |
| Scarlett | Yes | Focusrite/Scarlett label not recorded | Not recorded | Not recorded | Focusrite output route (exact jack/routing not recorded) | Reported guitar input; no fallback issue reported | **Reported pass** — output routing initially failed, then worked after adjustment; full record pending |
| Instrument-to-USB cable | Yes | Not recorded | Integrated USB instrument input | Not recorded | MacBook internal speakers and headphone jack | Reported guitar input; no fallback issue reported | **Reported pass** — manual Chrome/macOS test on 2026-08-14; full record pending |

## Full physical interface record

Copy this section once for each available Validation Interface.

### Interface: _name_

#### Capture and routing

- [ ] The selected browser device label identifies this interface.
- [ ] The recorded physical jack and Input Channel contain the guitar signal.
- [ ] Actual guitar playing moves the Input Level Meter; a controlled ambient-sound/tap check does not reveal a silent built-in-microphone fallback.
- [ ] Applied echo cancellation, noise suppression, automatic gain control, channel count, sample rate, and reported capture latency are recorded below, including any browser warning.
- [ ] The selected/system output route is recorded and reaches the intended headphones or interface output.

| Browser-reported capture field | Value |
| --- | --- |
| `echoCancellation` | |
| `noiseSuppression` | |
| `autoGainControl` | |
| `channelCount` | |
| `sampleRate` | |
| capture `latency` | |
| warning shown by Browser Amp | |

#### Controls and recovery

- [ ] Input and Output Level Meters respond to actual guitar samples.
- [ ] Input Trim, the selected Amp Model controls, Cabinet, Studio Compression, Studio EQ, Reverb, and Master all produce the expected audible change.
- [ ] Exact numeric entry, clamping, slider synchronization, arrow keys, and focus visibility work for every continuous control.
- [ ] Studio Compression bypass preserves Amount and Level Match and switches without an obvious click.
- [ ] Reverb Stage Bypass preserves Amount and produces the expected tail chop without an obvious pop.
- [ ] Defaults provide audible headroom with Master Volume at -18 dB.
- [ ] Deliberate overload latches CLIP; Clear CLIP resets it.
- [ ] Unplugging silences output without switching to another microphone; reconnecting and monitoring again require explicit actions.
- [ ] Saved Control Settings restore after reload while connection, monitoring, devices, and Input Channel do not.

Exact values tried and observations:

#### Stability and latency

Keep Hardware Direct Monitoring off so the subjective result describes the processed browser path.

| Field | Value |
| --- | --- |
| Session start / end (at least 15 minutes) | |
| Dropouts heard | |
| Recoverable failures | |
| Unrecoverable failures | |
| Browser-reported AudioContext base latency | |
| Browser-reported output latency | |
| Browser-reported capture latency | |
| Subjective round-trip result (playable / obvious echo, with notes) | |

Do not convert the subjective result into a universal latency promise. Attach screenshots, console/DevTools captures, or a short test log as evidence.

## Final sign-off

- [ ] All available Validation Interfaces have a completed full record and a passing summary row.
- [ ] Every available interface completed a monitored session of at least 15 minutes without dropouts or unrecoverable failure.
- [ ] Production smoke and automated release gate refer to the same commit SHA.
- [ ] Release notes still name Chrome on macOS as supported and keep iPhone browsers and Noise Suppression outside the release scope.

Sign-off name, date, decision, and remaining risks:
