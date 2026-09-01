# Audio path

Keep one fixed, easy-to-follow signal chain. Modules may change internally, but their order stays the same.

This is the target path. Input conditioning and Noise Suppression remain planned; the implemented stages keep the same relative order.

## Full path

```text
Selected mono input
→ Input meter
→ Input trim and conditioning
   ├─→ Noise-suppression detector
   └─→ Amp Type
        1. Input voicing
        2. Preamp stage 1
        3. Tone stack
        4. Preamp stage 2 / phase inverter
        5. Power-amp stage
→ Cabinet
→ Noise-suppression gain
→ Studio compression
→ Studio EQ
→ Reverb
→ Master
→ Output meter
→ Monitoring mute
→ Selected output
```

The path stays mono through Amp, Cabinet, Noise Suppression, Compression, and Studio EQ. Reverb may create stereo; Master and output monitoring preserve it.

## 1. Input

- Capture one selected interface channel.
- Request browser echo cancellation, noise suppression, and automatic gain control off.
- Input meter shows the raw selected channel before processing.
- Connecting input never enables monitoring.

## 2. Input trim and conditioning

- Apply the player's calibration trim.
- Remove DC/rumble and unnecessary extreme highs.
- Feed both the Amp Type and the noise-suppression detector.
- Keep this global; changing amps does not change calibration.

## 3. Amp Type

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

The Amp Type does not contain cabinet response, noise suppression, studio effects, reverb, or final Master.

## 4. Cabinet

- Apply the selected speaker/cab/microphone response after the full amp model.
- Direct / Full Range is a unity bypass with no convolver.
- Cabinet choice never changes automatically with Amp Type.

## 5. Noise suppression

- Detect playing from the clean, conditioned input.
- Apply gentle downward expansion after Amp and Cabinet so amplified interface noise is reduced.
- Sit before Reverb so closing the suppressor does not chop an existing reverb tail.
- Bypass is unity gain.

## 6. Studio compression

- Control peaks and consistency after the amp/cab sound is complete.
- Keep it subtle or bypassed by default for jazz dynamics.
- Bypass removes the compressor from the active path.

## 7. Studio EQ

- Provide broad final polish after compression.
- Do not use it to create the basic identity of an amp or cabinet.
- Bypass is a flat unity path.

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
- [Swappable module architecture](research/swappable-audio-module-architecture.md)
