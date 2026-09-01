# Browser Amp — Historical First-Release Plan

Status: superseded

This records the original release scope. For the current chain and module contracts, use [Audio path](docs/audio-path-spec.md) and the linked module specifications.

This plan defines the first usable Browser Amp release. Domain terms are defined in [CONTEXT.md](./CONTEXT.md), and the AudioEngine seam is recorded in [ADR 0001](./docs/adr/0001-keep-web-audio-behind-a-deep-audio-engine.md).

## Outcome

A player can open the site in Chrome on macOS, connect a browser-visible guitar interface, see the incoming signal, shape it through a fixed Amp Chain, and explicitly enable Processed Monitoring.

The first-release Amp Chain is:

```text
Live Guitar Input
  → Clean Gain
  → Three-Band EQ
  → Compression
  → Reverb
  → Master Volume
  → Processed Monitoring
```

The Noise Gate is intentionally deferred. It will eventually occupy the first position in the Amp Chain, but it is the only planned stage requiring custom real-time DSP and is not needed to validate the first release.

## Platform and hardware scope

### Supported

- Current Chrome on macOS.
- Any audio interface Chrome exposes as an input device.
- Chrome-visible output-device selection when `AudioContext.setSinkId()` is available.
- Local development on `http://localhost`.

### Validation Interfaces

- iRig HD 2.
- Available Scarlett interface.
- Available USB instrument cable.

These devices form a validation set, not an exhaustive compatibility claim.

### Experimental, non-blocking

- Current Chrome on iPhone.
- Current Safari on iPhone.

iPhone support must not be claimed until physical testing proves that samples come from the connected interface rather than the built-in microphone and that the system routes output correctly. Failure on iPhone does not block the first desktop release.

## Explicitly out of scope

- Demo performances or bundled guitar audio.
- Uploaded audio.
- Recording, exporting, or sharing.
- Accounts, cloud storage, or a backend.
- Analytics or transmission of guitar audio.
- A reorderable signal graph or pedalboard.
- Authentic modeling of a named amplifier, compressor, or reverb unit.
- Saturation or distortion.
- Noise Gate in the first release.
- A limiter or hearing-safety guarantee.
- PWA installation or offline support.
- First-release support guarantees for Windows, Android, or Firefox.

## User experience

### Page layout

Build a simple, responsive web application rather than a physical-amplifier simulation.

The page presents, in signal-flow order:

1. Input connection and input-device controls.
2. Input Level Meter and optional Input Channel selection.
3. Clean Gain.
4. Three-Band EQ.
5. Compression.
6. Reverb.
7. Master Volume.
8. Output Level Meter, output routing, and monitoring control.

Use straightforward panels, native-looking sliders, numeric fields, clear labels, and restrained styling. Preserve the same order vertically on narrow screens. Do not use fake knobs, photorealistic amp hardware, or ornamental animation.

### Startup and monitoring

1. Every load starts disconnected and muted.
2. `Connect Input` requests microphone permission and begins capture.
3. After permission, refresh the device list because labels and non-default devices may only become available then.
4. If multiple input devices are available, let the player select one.
5. If the captured track contains multiple channels, show `Input Channel`; otherwise hide it.
6. Begin the Input Level Meter as soon as input is connected.
7. Keep audio output silent until the player activates `Enable Monitoring`.
8. On the first monitoring attempt, remind the player to disable Hardware Direct Monitoring and use headphones. Allow this reminder to be dismissed permanently.

The input and monitoring actions remain separate. Connecting input must never make the guitar audible by itself.

### Application states

The application and AudioEngine share this explicit lifecycle:

```text
disconnected → connecting → connected-muted → monitoring
```

Permission failure, device loss, browser suspension, or routing failure moves the application into a specific visible error or interrupted state. From any such state:

- Silence output immediately.
- Preserve control values and bypass states.
- Explain the detected problem.
- Never silently switch to a built-in microphone.
- Require an explicit reconnect or resume action.

### Saved settings

Save these locally:

- Every slider/numeric value.
- Compression and Reverb bypass states.
- Dismissal of the Hardware Direct Monitoring reminder.

Do not persist or restore:

- An active Input Connection.
- Enabled Processed Monitoring.
- Captured samples.
- A durable input- or output-device identifier.

`Reset Controls` restores all first-use control defaults. It does not alter browser permissions, reconnect input, enable monitoring, or redisplay dismissed guidance.

## Controls

Every continuous control has a synchronized slider and numeric field with a visible unit. Clamp typed values to the allowed range. Support arrow-key adjustment and accessible labels.

| Stage | Control | Range | Step | Default | Bypass default |
|---|---|---:|---:|---:|---|
| Clean Gain | Gain | −12 to +24 dB | 0.1 dB | 0 dB | Not bypassable |
| Three-Band EQ | Bass | −12 to +12 dB | 0.1 dB | 0 dB | Not bypassable |
| Three-Band EQ | Middle | −12 to +12 dB | 0.1 dB | 0 dB | Not bypassable |
| Three-Band EQ | Treble | −12 to +12 dB | 0.1 dB | 0 dB | Not bypassable |
| Compression | Amount | 0–100% | 1% | 25% | Off |
| Reverb | Amount | 0–100% | 1% | 20% | Off |
| Master Volume | Volume | −60 to 0 dB | 0.1 dB | −18 dB | Not bypassable |

`Enable Monitoring` is separate from Master Volume. Disabling monitoring silences output without changing any control value.

### Control updates and bypass

- Apply short parameter ramps to avoid zipper noise and clicks.
- Compression and Reverb switches preserve their Amount values.
- Compression bypass removes its native compressor latency from the active path.
- Reverb bypass may chop the current tail, but the transition must not pop.
- Master Volume never boosts above unity.

## Meter behavior

Provide Input and Output Level Meters with the same visual scale:

- Range: −60 to 0 dBFS.
- Green: below −12 dBFS.
- Yellow: −12 through −3 dBFS.
- Red: above −3 dBFS.
- Moving peak hold: approximately one second.
- Output overload: latch `CLIP` when the output reaches 0 dBFS.
- The player clears the latched `CLIP` indicator explicitly.

The Input Level Meter observes the selected channel before the Amp Chain. The Output Level Meter observes the signal after Master Volume and before browser output.

There is no final limiter. Safety comes from muted startup, bounded control ranges, a non-boosting Master Volume, conservative defaults, output metering, and explicit overload feedback. These measures do not control physical headphone or speaker volume and are not a hearing-safety guarantee.

## Capture and routing

### Input capture

Use `navigator.mediaDevices.getUserMedia()` from a user gesture. Request instrument-oriented capture with:

- `echoCancellation: false`
- `noiseSuppression: false`
- `autoGainControl: false`

Feature-detect the constraints and inspect the returned track settings. Warn when the browser refuses a requested raw-capture setting.

Select devices by `deviceId`, listen for `devicechange`, and refresh enumeration after permission. Do not assume a selected USB device exposes every physical jack.

### Input channels

Request a useful channel count without making connection fail when stereo is unavailable. Inspect the returned track settings:

- One returned channel: process it and hide channel selection.
- Multiple returned channels: split them and let the player select one mono Input Channel.
- Do not mix multiple interface channels automatically.

Process the selected channel in mono through Clean Gain, EQ, and Compression. Reverb may create a stereo wet field; the signal remains stereo through Master Volume and output.

### Output routing

On Chrome macOS, feature-detect `AudioContext.setSinkId()` and offer a selector for permitted output devices. Default to the system route. On iPhone, rely on the system route and do not promise an in-app output selector.

## DSP starting point

These are tunable implementation starting points rather than permanent modeling claims.

### Clean Gain

- Use `GainNode`.
- Convert displayed decibels to linear gain centrally.
- Add no intentional saturation in the first release.

### Three-Band EQ

Use three serial `BiquadFilterNode`s:

- Bass: low shelf at 120 Hz.
- Middle: peaking filter at 800 Hz with Q 0.8.
- Treble: high shelf at 3.2 kHz.

### Compression

Use `DynamicsCompressorNode`. For normalized Amount `t = amount / 100`, start with:

- Threshold: `−36 × t` dB.
- Ratio: `1 + 5 × t`, ranging from 1:1 to 6:1.
- Attack: 10 ms.
- Release: 150 ms.
- Knee: a fixed moderate value, initially 12 dB.

The native node adds approximately 6 ms of lookahead latency when Compression is active. It is a musical dynamics stage, not an output limiter.

### Reverb

Use `ConvolverNode` with a deterministic, procedurally generated stereo impulse:

- Plate-inspired rather than an authentic plate model.
- Approximately 1.5 seconds long.
- Generated at the active AudioContext sample rate.
- Filtered, decaying stereo noise with a stable seed.
- Explicit gain calibration rather than relying on hidden normalization.
- Dry signal remains present while Amount raises the wet contribution from none to a strong but usable maximum.

### Meters

Use `AnalyserNode` and calculate display peaks from float time-domain data on the UI update loop. Metering must not change the audio path.

### Deferred Noise Gate

After the first release, implement the gate in an AudioWorklet rather than scheduling GainNode changes from the main thread.

Planned player-facing behavior:

- Position: before Clean Gain.
- Threshold: −80 to −20 dB.
- Default threshold: −55 dB.
- Step: 0.1 dB.
- Default bypass state: off.
- Fixed attack, hold, and release initially.

The gate milestone must add deterministic offline tests for opening, closing, hysteresis, attack, hold, release, and bypass.

## Architecture

### Stack

- Vite.
- TypeScript with strict checking.
- Plain DOM APIs.
- Tailwind CSS.
- No UI framework.
- No third-party DSP library.

### AudioEngine module

Keep all browser-audio complexity behind one deep module. Its interface should expose user intent and observable state—not individual AudioNodes.

An illustrative interface shape is:

```ts
interface AudioEngine {
  dispatch(command: AudioCommand): Promise<void>;
  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void;
  destroy(): Promise<void>;
}
```

Typed commands cover connection, disconnection, input/output selection, channel selection, complete Amp settings, monitoring, and resume. Snapshots contain lifecycle status, enumerated capabilities, applied capture settings, recoverable errors, and meter values.

The module owns:

- Media permission and capture lifecycle.
- Device enumeration and changes.
- Channel selection.
- AudioContext lifecycle.
- Web Audio graph construction.
- DSP parameter mapping and smoothing.
- Stage bypass.
- Output routing.
- Meter sampling.
- Immediate silence and recovery behavior.

The module does not own:

- DOM rendering.
- CSS.
- Local settings persistence.
- User-facing explanatory copy.

Tests and page code use the same AudioEngine interface. DOM code must not reach past the seam to inspect or manipulate AudioNodes.

## Privacy and security

- All signal processing occurs locally in the browser.
- Guitar audio is never uploaded, recorded, or retained.
- No backend or analytics is required.
- Production must use HTTPS.
- Production runs as a top-level page rather than a cross-origin embed.
- Avoid mixed-content assets.
- Request input only while the document is active and in response to `Connect Input`.

## Deployment

Deploy the static Vite build to GitHub Pages with GitHub Actions.

- Repository: `jdyck/browser-amp`.
- Project-site path: `/browser-amp/`.
- Vite configuration: `base: "/browser-amp/"`.
- Expected site: `https://jdyck.github.io/browser-amp/` after Pages is enabled.
- Build artifact: `dist/`.
- Resolve scripts, styles, Worklet modules, and generated/static assets correctly beneath the project-site base path.

Use the canonical Pages deployment for physical iPhone testing. A Mac may use `http://localhost` during local development, but an iPhone visiting an unsecured LAN IP is not equivalent to localhost and should not be the test environment.

## Verification strategy

### Unit tests

Test without browser audio hardware:

- dB-to-linear conversion.
- Value clamping and numeric-field synchronization.
- Compression Amount mapping.
- Default settings and Reset Controls.
- Saved-settings migration and invalid-data fallback.
- Application state transitions.
- Error-to-message mapping.

### Offline audio tests

Use deterministic buffers and `OfflineAudioContext`, with tolerances rather than cross-browser bit equality:

- Fixed Amp Chain ordering.
- Gain and Master levels.
- EQ boost/cut response at representative frequencies.
- Compression bypass and increasing Amount behavior.
- Reverb dry/wet routing, deterministic generation, and tail duration.
- Hard Reverb bypass without retained tail.
- Input and output peak calculations.
- Default headroom with calibrated fixtures.

### Browser UI tests

Use synthetic media where practical to cover:

- Disconnected and muted startup.
- Permission success, denial, and retry presentation.
- Device and Input Channel selector visibility.
- Slider and numeric-field synchronization.
- Keyboard control and labels.
- Saved settings and Reset Controls.
- Monitoring confirmation and Direct Monitor guidance.
- Device loss and interrupted-state presentation.
- Responsive ordering.

Browser automation does not substitute for physical-device validation.

### Chrome macOS physical checklist

Run the checklist with every Validation Interface:

1. Grant permission and confirm the expected device label appears.
2. Confirm the selected device supplies guitar rather than the Mac microphone.
3. For a multichannel interface, inject signal into each physical input and verify channel selection.
4. Inspect applied capture settings and confirm voice processing is disabled or visibly warned about.
5. Confirm the Input Level Meter responds while output remains silent.
6. Disable Hardware Direct Monitoring and enable Processed Monitoring with headphones.
7. Confirm the selected output route is used.
8. Exercise every control and verify its intended audible effect.
9. Toggle Compression and Reverb without clicks; confirm Reverb bypass chops the tail without popping.
10. Confirm default settings do not overload with a normally adjusted interface.
11. Cause a deliberate processed overload and confirm the output `CLIP` indicator latches and clears.
12. Unplug and reconnect the interface; ensure the app silences and never falls back silently.
13. Background and restore the tab; verify explicit resume behavior when needed.
14. Run continuously for at least 15 minutes without dropouts.
15. Confirm monitoring feels playable without an obvious echo.
16. Reload and verify settings return while connection and monitoring remain off.

### Experimental iPhone checklist

Repeat separately in current Chrome and Safari using the deployed HTTPS site:

- Verify actual USB/interface samples rather than trusting the selected device label.
- Verify input after connecting before launch, after launch, and after reconnecting.
- Check system output routing to interface headphones, handset routes, and other available outputs.
- Confirm monitoring does not unexpectedly switch to or feed back through the phone microphone/speaker.
- Test interruption, orientation change, background/foreground, screen lock, and resume.
- Evaluate audible latency and dropouts.

Record results, but do not block the desktop release on them.

## Milestones

### 1. Foundation

- Scaffold Vite, TypeScript, tests, and CSS.
- Define Amp settings, commands, snapshots, and lifecycle states.
- Implement defaults, validation, persistence, and Reset Controls.
- Build the responsive static interface without live audio.

### 2. Connection and monitoring

- Implement the AudioEngine seam.
- Add permission, enumeration, device changes, and raw-capture constraints.
- Add capability-driven Input Channel selection.
- Add input/output meters.
- Add output routing where supported.
- Implement disconnected, connected-muted, monitoring, interruption, and error flows.

### 3. Native Amp Chain

- Implement Clean Gain, EQ, Compression, Reverb, and Master Volume.
- Add parameter smoothing and stage bypass behavior.
- Add deterministic offline DSP tests.
- Tune starter values with a Validation Interface.

### 4. Hardening

- Complete accessibility and responsive behavior.
- Add browser UI coverage.
- Finish permission, device-loss, routing, and resume recovery.
- Verify production builds under `/browser-amp/`.
- Document the physical-device checklist in an executable format.

### 5. Desktop release

- Run the full Chrome macOS checklist on all available Validation Interfaces.
- Fix release-blocking capture, routing, stability, latency, and overload-feedback defects.
- Configure GitHub Actions and GitHub Pages.
- Deploy and repeat a production smoke test.

### 6. Later releases

- Add the Noise Gate AudioWorklet and its tests.
- Run experimental iPhone validation in Safari and Chrome.
- Promote an iPhone browser to supported only after capture and routing pass physically.
- Explore Subtle Saturation only after the clean chain is stable.

## First-release completion criteria

The desktop release is complete when:

- The planned UI, controls, persistence, recovery, and native Amp Chain are implemented.
- Automated unit, offline-audio, and browser tests pass.
- All three available Validation Interfaces pass the Chrome macOS physical checklist, except for explicitly documented hardware limitations that do not undermine the generic-device claim.
- Input is never audible without explicit monitoring consent.
- Default settings are stable and do not overload with a normally adjusted interface.
- Deliberate overload is clearly visible.
- A 15-minute session is stable and monitoring feels playable.
- The GitHub Pages production build passes the same core smoke test as localhost.

No product decisions remain open. DSP starting values may be tuned during implementation without changing the accepted scope or architecture.
