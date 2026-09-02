# Reverb modules

`ReverbProfile` and `REVERB_PROFILES` in `src/signalChain/settings.ts` define the seven stable IDs, labels, and descriptions. `reverbProfile` and the per-module `reverbSettings` bank are part of `AmpControlSettings`; the existing version 1 preferences format accepts these additive fields. Missing or invalid stored selections fall back to `studio-plate`. Missing/malformed parameters use module defaults, finite values are clamped and rounded, and unsupported fields are dropped. Older settings preserve their sound, Amount, and bypass state. Reset Controls chooses Studio Plate with reverb bypassed and resets every module's parameters.

## Main and Advanced Controls

`src/signalChain/reverbProfiles.ts` defines the controls, ranges, defaults, help text, and typed settings for each module. The UI renders these as two native keyboard-accessible `details` accordions. Main Controls starts open and includes the shared Amount control; Advanced Controls starts closed. Open/closed state survives module changes and input lifecycle updates, but resets on page reload. Each module's sound parameters persist independently across switches and reloads. Reset This Reverb replaces only the selected module's parameters with its defaults, including collapsed Advanced Controls, and persists that change. It preserves other modules, the selected module, shared Amount, bypass, all other controls, and the live input/monitoring session. Editing or resetting module controls does not rebuild the surrounding page or lose input focus.

| Module | Main Controls, besides Amount | Advanced Controls |
| --- | --- | --- |
| Jazz Room | Decay, Tone | Size, Early/Late |
| Studio Chamber | Decay, Pre-delay, Tone | Low Cut, Diffusion |
| Studio Plate | Decay, Pre-delay, Tone | Damping |
| Bright Spring | Tone, Dwell | Decay |
| Dark Spring | Tone, Decay | Low Cut |
| Digital Room | Decay, Size, Tone | Pre-delay, Diffusion |
| Digital Hall | Decay, Pre-delay, Damping | Size, Modulation Depth, Modulation Rate |

Decay ranges from 0.2–6 s; Pre-delay from 0–200 ms; Tone from −12 to +12 dB above 3.2 kHz; Low Cut from 20–800 Hz; Modulation Rate from 0.05–5 Hz. The remaining controls use 0–100%. Early/Late spans early reflections only to late tail only. Size changes reflection/network spacing independently of the decay setting. Damping changes frequency-dependent decay; Tone filters the wet response independently of decay.

## Responses

`src/audio/reverbImpulses.ts` provides an exhaustive factory registry. All responses are original, deterministic stereo synthesis, generated at the active context's sample rate. No recordings or external assets are downloaded.

| Module ID | Response at defaults | Default buffer duration |
| --- | --- | --- |
| `jazz-room` | Sparse, filtered early reflections followed by a short, dark diffuse tail | 0.65 s |
| `studio-chamber` | More widely spaced reflections with a denser, warmer, longer tail | 1.4 s |
| `studio-plate` | Original filtered-noise stereo plate, unchanged, including its 12 ms predelay | 1.5 s |
| `bright-spring` | Three bright, dispersive chirp-echo paths with a splashy onset | 2.2 s |
| `dark-spring` | Three darker chirp-echo paths with a shorter, restrained decay | 1.3 s |
| `digital-room` | Short fixed Schroeder-style response: four damped feedback combs and three serial allpasses | 1.1 s |
| `digital-hall` | Larger, longer-decaying version of the digital network with 28 ms added predelay | 3.4 s |

Durations describe finite buffers, not measured RT60 or hardware specifications. Digital decay controls default to 0.85 s (room) and 2.8 s (hall), with longer buffers to contain their tails. Non-plate responses receive a DC-cut filter (90 Hz by default), a final 20 ms fade, and energy scaling to roughly match the original plate for broadband input. Tone is applied after energy scaling so its audible level change is preserved. The original plate response remains unchanged at its defaults. Equal impulse energy does not promise equal perceived loudness or equal response at every guitar note; listening calibration remains necessary.

The spring voices are original synthetic responses, not measured tanks or circuit models. Bright Spring's Dwell blends a clean send with a level-dependent, soft-saturating WaveShaper using 4× oversampling. At 0% no drive nodes exist; increasing Dwell changes harmonics and dynamics rather than duplicating Amount. It is not a physical tank-driver or mechanical-crash simulation.

The digital networks are rendered into impulses for the selected settings, then processed by native convolution. Hall modulation adds opposing sine-modulated stereo delays to the wet return: a 6 ms center delay with up to ±3 ms movement. Depth 0% creates no delays or oscillator, preserving the original default response. Rate controls the live oscillator, not a static impulse variation. There is no AudioWorklet or modulation inside the feedback network.

## Ownership and switching

`ReverbStage` owns the unity dry path, shared smoothed Amount gain, per-session impulse cache, and `StageSwitcher<Selection | 'off'>`. Selection contains an immutable profile/parameter snapshot; equal settings reuse its identity. The engine passes validated controls to it; the UI never touches audio nodes.

Only the selected enabled module constructs a convolver. Selecting or editing a module while bypassed only remembers settings. Each module caches its latest impulse, never all previous slider positions, for at most seven cache entries. Outgoing paths may retain older buffers during a transition. Dwell and modulation do not change the impulse cache key. Every activation creates fresh convolution history, and disconnect clears the cache.

Switching, changing module parameters, or bypassing immediately disconnects new input to the outgoing effect, fades its wet output over 20 ms, then disposes it. Disposal stops oscillators and disconnects all drive/modulation nodes as well as the convolver. The dry path remains untouched. Rapid changes use the shared switcher's two-path bound and latest queued selection. Retired tails are chopped rather than preserved; returning to a previous module never revives its old tail. Amount edits only smooth the wet gain. Input capture and monitoring are unaffected.

## Verification

- Control/settings tests cover all IDs and parameter limits, malformed or missing data, independent persistence while bypassed, and reset.
- Engine tests cover lazy construction, all seven factories, bounded overlap, cached buffers with fresh processors, coalesced selections/parameter edits, oscillator/drive disposal, and reconnection.
- OfflineAudioContext tests at 44.1, 48, and 96 kHz cover deterministic, distinct, finite stereo responses; unchanged dry attack; output matching each selected impulse; bounded energy/peaks; decay; and silence after the finite tail.
- Offline switching tests cover rapid selection, sustained dry input, bounded sample discontinuities, and no resurrection of retired history.
- Parameter tests cover every response control at its limits, intended temporal/spectral changes, nonlinear Dwell harmonics, and audible modulation Depth/Rate with an unchanged dry signal.
- Browser and production UI tests cover accordion keyboard behavior, narrow layouts, retained focus, selection, help text, bypass, independent saved settings, reset, and unchanged monitoring/capture.

These automated checks are not a hardware listening sign-off, authenticity claim, or real-time performance measurement. Long impulses use more memory and computation; generation on first use or parameter changes is synchronous on the control thread and should be auditioned on target hardware. Parameter changes crossfade fresh histories rather than continuously morphing a feedback network.
