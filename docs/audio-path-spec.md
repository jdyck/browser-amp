# Audio path

Keep one fixed, easy-to-follow signal chain. Modules may change internally, but their order stays the same.

## Full path

```text
Selected mono input
→ Input meter
→ Input trim
   ├─→ Noise Suppression detector
   └─→ Amp Model
        1. Input voicing
        2. Preamp stage 1
        3. Tone stack
        4. Preamp stage 2 / phase inverter
        5. Power-amp stage
→ Cabinet
→ Noise Suppression gain
→ Studio Compression
→ Studio EQ
→ Reverb
→ Master
→ Output meter
→ Monitoring mute
→ Selected output
```

The path stays mono through Amp Model, Cabinet, Noise Suppression, Studio Compression, and Studio EQ. Reverb may create stereo; Master and output monitoring preserve it.

## 1. Input

- Capture one selected interface channel.
- Request browser echo cancellation, noise suppression, and automatic gain control off.
- Input meter shows the raw selected channel before processing.
- Connecting input never enables monitoring.

## 2. Input trim

- Apply the player's calibration trim.
- Feed both the Amp Model and the Noise Suppression detector.
- Keep this global; changing amps does not change calibration.

## 3. Amp Model

Every amp contains the same five conceptual stages, but each model supplies its own filters, gains, nonlinear curves, and control mappings.

### Input voicing

- Model-specific sensitivity, high/low input behavior, and first bandwidth limits.
- Bright, Dark, Normal, or similar input options live here when the amp provides them.

### Preamp stage 1

- First gain and nonlinear contribution.
- May remain nearly linear in high-headroom models.
- Filters before this stage decide which frequencies drive it hardest.

### Tone stack

- Model-specific Tone or Bass/Middle/Treble behavior.
- Preserve control interaction and insertion loss where appropriate.
- This is part of the amp sound, not the later Studio EQ.

### Preamp stage 2 / phase inverter

- Adds further gain, filtering, and harmonics.
- Receives the already-shaped tone-stack output.
- May be bypassed or kept nearly linear when the model does not need it.

### Power-amp stage

- Controls final amp headroom, feedback, Presence/Cut behavior, compression, and eventual breakup.
- Sag or bias movement belongs here if implemented.
- Ends with a calibrated amp output trim, not the player's Master.

The Amp Model does not contain cabinet response, noise suppression, studio effects, reverb, or final Master.

## 4. Cabinet

- Apply the selected speaker/cab/microphone response after the full amp model.
- Direct / Full Range is a unity bypass with no convolver.
- Cabinet choice never changes automatically with Amp Model.

## 5. Noise Suppression

- Detect playing from the trimmed input.
- Apply gentle downward expansion after Amp and Cabinet so amplified interface noise is reduced.
- Sit before Reverb so closing the suppressor does not chop an existing reverb tail.
- Bypass is unity gain.
- Expose a −80 to −20 dB threshold, defaulting to −55 dB in 0.1 dB steps.
- Keep detection and gain movement sample-accurate inside an `AudioWorklet`: 5 ms opening, 60 ms hold, and 6 dB hysteresis.
- Expose maximum Range from 0–24 dB (default 9 dB) and Release from 50–1,000 ms (default 200 ms).
- Show the current reduction without driving DSP from the UI update loop.

## 6. Studio Compression

- Control peaks and consistency after the amp/cab sound is complete.
- Keep it subtle or bypassed by default for jazz dynamics.
- Bypass removes the compressor from the active path.

## 7. Studio EQ

- Provide broad final polish after compression.
- Use four serial bands: fixed 120 Hz Low shelf, sweepable 180–500 Hz Low Mid bell, sweepable 600 Hz–2 kHz Upper Mid bell, and fixed 3.2 kHz High shelf.
- Keep both bell bandwidths broad and fixed at Q 0.8; expose gain for all four bands and frequency only for the two bells.
- Do not use it to create the basic identity of an amp or cabinet.
- Bypass is a flat unity path.

The complete control and persistence contract is in [Studio EQ controls](studio-eq-controls-spec.md).

## 8. Reverb

- Keep the dry path at unity and add reverb in parallel.
- Predelay affects only the wet path.
- Reverb is the first stage allowed to turn mono into stereo.
- Bypass removes the wet processor without changing the dry signal.

## 9. Master and output

- Master controls final listening level and never boosts above unity.
- Output meter sits after Master and before Monitoring Mute.
- Monitoring Mute silences output without changing any control.
- Switching output devices does not rebuild the processing chain.

## Module rules

- Use one `AudioContext` for the live session.
- Each module exposes one input, one output, complete state updates, and `dispose()`.
- A module owns and disconnects every node it creates.
- Keep one selected implementation per slot at steady state.
- Crossfade briefly when replacing Amp, Cabinet, or Reverb; allow at most two paths during the switch.
- Validate and prepare a replacement before touching the audible path.
- A failed switch leaves the old module playing and selected.
- Switching one module never resets or reconnects another.

## Done when

- Tests confirm the exact order shown above.
- Input and output meters observe the stated points.
- Direct/bypassed modules are unity paths within test tolerance.
- Reverb changes mono to stereo without delaying the dry attack.
- Amp and Cabinet switches do not recapture input or change monitoring.
- Rapid switching does not click, leak nodes, or leave more than one steady-state module per slot.
- Disconnect releases every module and buffer owned by the audio session.

## Related notes

- [Jazz amp models](jazz-amp-models-spec.md)
- [Jazz cabinet models](jazz-cabinet-models-spec.md)
- [Audio stage switching](audio-stage-switching.md)
