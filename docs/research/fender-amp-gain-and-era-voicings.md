# Fender-style clean-to-saturation gain and era voicings

Status: research and implementation proposal, 2026-08-11

## Question and conclusion

How can Browser Amp's Gain control retain a clean Fender-style response at low settings, move progressively into compression and saturation as it is raised, and offer meaningfully different Fender-inspired voices from several decades?

The current Gain cannot saturate. It is a `GainNode` whose value is only the linear multiplier `10^(dB/20)`, and its unit and offline tests expressly require a linear result “without adding a nonlinear transfer” and “without saturation” ([local gain implementation](../../src/audio/gain.ts), [unit test](../../src/audio/gain.test.ts), [offline test](../../tests/audio/amp-cabinet.spec.ts)). The current three-band EQ is also three independent, active Web Audio filters—120 Hz low shelf, 800 Hz peaking EQ, and 3.2 kHz high shelf—rather than a passive, interactive Fender tone stack ([local graph construction](../../src/audio/AudioEngine.ts)). Raising Gain can therefore make the browser signal exceed full scale, but it cannot create a controlled transition into tube-like compression or harmonic distortion.

The recommended design is:

```text
selected mono input
  -> input trim / calibration
  -> input conditioning
  -> preamp nonlinear stage 1
  -> era-specific tone stack (location is profile-specific)
  -> preamp nonlinear stage 2 / phase-inverter contribution
  -> dynamic power-amp stage (headroom, feedback/presence, sag)
  -> era-specific speaker/cabinet IR
  -> optional studio compression and reverb effects
  -> output trim / Master -> meter -> monitor mute
```

Start with two oversampled `WaveShaperNode` stages plus filters for a shippable, low-risk version. Move the nonlinear and sag state into one `AudioWorkletProcessor` when the project needs closer circuit behavior, deterministic profile switching, or antiderivative antialiasing. A cabinet response is not optional if the intended result is an amp sound rather than a harsh direct preamp signal.

This note distinguishes **documented fact** from **implementation inference**. Every numeric DSP setting in the proposal and profile tables is an inference and a calibration seed, not a measured claim about an original amplifier.

## What Fender's own material establishes

### “Fender clean” and Fender breakup are not one transfer curve

Fender's official ’57 Deluxe manual describes a 5E3-based, approximately 12 W amp whose lower volume settings are harmonically rich and clean, while cranked settings become compressed and heavily distorted. It attributes natural compression or “sag” in part to the 5Y3 rectifier and lists a pair of 6V6 output tubes and a 12-inch alnico Jensen P-12Q. It also documents full-sensitivity Input 1 and an Input 2 that is 6 dB less sensitive and darker ([Fender ’57 Deluxe manual, pp. 6–7](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf#page=6)). These are first-party reasons to model input sensitivity, progressive nonlinear gain, power-supply dynamics, and the loudspeaker separately.

At the other end of the range, Fender says the Twin has been valued for loud clean tone. Its official history records the blackface Twin Reverb as 85 W, the silverface version as 100 W, and the 1977 ultralinear-output-transformer version as 135 W. It also dates the Twin's master volume to 1972 ([Fender Twin history](https://www.fender.com/articles/behind-the-scenes/pristine-cleans-aggressive-overdrive-the-fender-twin-story?tag=amps)). The archived 1978 owner's manual labels the family 135 W and shows a master-volume control with push/pull distortion ([Fender 1978 Twin Reverb manual, pp. 2–3](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Twin_Reverb_Silverface_1978.pdf#page=2)). Consequently, “Tweed Deluxe” and “late-’70s Twin” cannot be credible presets if they share the same saturation threshold, sag, speaker response, and only change three EQ gains.

The later Blues Deluxe architecture adds another distinct behavior. Fender documents separate clean and drive channels, Drive as preamp volume/distortion, a Master used to normalize the Drive channel, a Normal/Bright switch, three tone controls, and Presence after preamp distortion. It specifies a 40 W all-tube preamp/power amp, three 12AX7 preamp tubes, two 6L6 output tubes, and a 1x12 speaker ([Fender Blues Deluxe Reissue manual, pp. 6–7](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Blues_Deluxe_Reissue_Rev_B.pdf#page=6)). Fender's support table dates the original Blues Deluxe to 1993 ([Fender tube/amp table](https://support.fender.com/hc/en-us/articles/42507659450779-What-tubes-are-in-my-amp)). This supports a 1990s profile with a high-headroom clean path and a distinct cascaded preamp-drive mode rather than merely lowering a global clipping threshold.

### Tone-stack type and location matter, including while clean

Fender's Cyber-Twin engineering notes are unusually useful primary documentation. They identify different British, Tweed, Blackface, and Modern tone stacks, say the Blackface design was developed to make a guitar amplifier as clean and loud as possible for the available power, and illustrate how superficially similar stacks use different components ([Fender Cyber-Twin manual, pp. 50–51](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=54)). The printed circuits include:

| Fender-documented stack | Slope resistor | Treble capacitor/control | Bass capacitor/control | Mid capacitor/control |
|---|---:|---:|---:|---:|
| Early-production Bassman 5F6-A | 56 kΩ | 250 pF / 250 kΩ | 0.02 µF / 1 MΩ | 0.02 µF / 25 kΩ |
| Later-production 1959 Bassman 5F6-A | 100 kΩ | 250 pF / 250 kΩ | 0.1 µF / 1 MΩ | 0.02 µF / 25 kΩ |
| Blackface example | 100 kΩ | 250 pF / 250 kΩ | 0.1 µF / 250 kΩ | 0.047 µF / 10 kΩ |

The same engineering notes say that tone-stack location makes an “astounding” difference even when the amp is clean. They distinguish pre- and post-distortion placement and say Blackface/Hot Rod tube drives use a common-cathode gain stage for their dominant distortion characteristic, while Tweed/HMB types use a common-plate cathode follower ([Fender Cyber-Twin manual, p. 22](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=26), [engineering discussion, p. 51](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=55)). This is direct support for profile-specific topology, not just preset EQ values.

“Tweed” is not one circuit. The 5E3 Deluxe has a single Tone control and separate Instrument/Microphone volume controls, whereas the later 5F6-A Bassman has Treble, Middle, Bass, Presence, and two channel volumes. Fender lists the Bassman tone controls and places Presence after the other tone controls/effects; the same manual specifies 50 W at 5% THD and four 10-inch alnico speakers ([Fender ’59 Bassman manual, pp. 4–5](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf#page=4)). A strict 5E3 profile should therefore map the app's Treble/Tone control to the original one-knob network and hide or lock Bass and Middle. A relaxed “5E3-inspired” mode may keep all three controls for usability, but must not call that control set circuit-authentic.

### Bright and Presence are not interchangeable with a fixed high shelf

Fender documents the lower-sensitivity second inputs of both the ’57 Deluxe and ’59 Bassman as 6 dB down and darker ([’57 Deluxe manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf#page=6), [’59 Bassman manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf#page=4)). That is a useful user-facing calibration option: “Low input” should combine approximately −6 dB sensitivity with the profile's darker input response instead of only subtracting 6 dB after all processing.

Fender describes Presence as a power-amplifier feedback function: increasing it decreases high-frequency feedback, makes high notes distort more easily, and changes speaker control and distortion texture; its effect is more noticeable as the amp is driven ([Fender, “The Presence Control Explained”](https://www.fender.com/articles/parts-and-accessories/be-in-the-moment-the-presence-control-explained)). The Blues Deluxe manual likewise places Presence after preamp distortion ([manual, p. 6](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Blues_Deluxe_Reissue_Rev_B.pdf#page=6)). Presence should therefore affect the power-stage/feedback model or at least a post-distortion shelf, not be folded into the pre-distortion Treble control.

The official evidence here establishes distinct Bright switches/inputs and a Fender “no bright cap” firmware variant, but not enough component data to assert one universal curve. Fender's Tone Master Deluxe firmware explicitly offers “No Bright Cap” for smoother treble with drive/distortion pedals at lower settings ([Fender Tone Master Deluxe firmware notes](https://support.fender.com/hc/en-us/articles/42521932241819-Fender-Tone-Master-Deluxe-Reverb-Firmware-and-IR-Manager-App-Update)). **Implementation inference:** model Bright as a profile-specific, volume-dependent bypass path rather than a constant +N dB treble shelf; exact capacitance and taper require a model-specific official schematic or measurement.

### Rectifier, feedback, power stage, and cabinet are part of the clean-to-dirty transition

The ’57 Deluxe manual explicitly connects its 5Y3 rectifier to natural compression/sag and describes the cranked amp as compressed and distorted ([manual, p. 6](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf#page=6)). The ’59 Bassman manual says substituting a 5AR4 or 5U4GB tube for its reissue's solid-state rectifier slightly reduces output power, documenting that rectifier choice changes the result ([manual, p. 4](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf#page=4)). The ’68 Custom Deluxe Reverb product documentation says reduced negative feedback gives greater touch sensitivity and earlier gain onset ([Fender ’68 Custom Deluxe Reverb](https://intl.fender.com/products/68-custom-deluxe-reverb)). These sources justify three distinct profile dimensions: supply sag/recovery, power-stage headroom, and feedback amount.

The speaker/cabinet must follow the power stage. Fender specifies a 1x12 alnico Jensen P-12Q and pine cabinet for the ’57 Deluxe ([manual, p. 6](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf#page=6)), four 10-inch alnico speakers for the ’59 Bassman ([manual, p. 5](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf#page=5)), and a 1x12 Gold Label speaker for the Blues Deluxe Reissue ([manual, p. 7](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Blues_Deluxe_Reissue_Rev_B.pdf#page=7)). Fender's current Tone Master products deliberately pair modeled amp circuitry/headroom with particular speakers, and their line outputs use selectable cabinet IRs; the Deluxe manual provides flat/no-cab and two speaker/microphone IR options ([Tone Master Deluxe Reverb manual, pp. 1–2](https://www.fmicassets.com/Damroot/Original/10001/OM_22741XX000_Tone_Master_Deluxe_Reverb_EU.pdf#page=2)). This is primary evidence for treating cabinet response as an independent profile asset.

An IR captures the cabinet/microphone's linear response. It does not by itself model cone excursion, speaker compression, or the varying interaction between a tube power amp and a reactive load. If those effects are desired later, add a small dynamic stage before the convolution and a profile-specific power-amp feedback/impedance approximation. This is an implementation inference.

## Recommended control semantics

### Replace “Clean Gain dB” with Drive plus automatic level compensation

**Implementation inference:** keep one simple player-facing `Gain`/`Volume` control from 0–10, but do not expose it as a literal dB multiplier. Map it through each profile to several coordinated parameters:

1. Preamp drive, approximately 0–36 dB depending on profile.
2. The profile's volume-dependent Bright bypass.
3. A small shift in nonlinear bias/asymmetry at higher settings.
4. Power-stage drive after tone-stack loss.
5. Optional output compensation so turning up Gain changes feel and saturation much more than monitoring loudness.

Keep `Master` as final attenuation from −60 to 0 dB for hearing-safe workflow continuity. For models that historically have a preamp Drive and channel Master, expose an Advanced “Preamp/Power” split or a `Drive mode`; otherwise, the main Gain can crossfade from mostly preamp-level increase to increasing power-stage drive after the profile's nominal breakup point.

Suggested normalized mapping, where `g = Gain / 10`:

```text
driveDb       = profile.minDriveDb + profile.driveSpanDb * smoothstep(0, 1, g)
powerDriveDb  = profile.powerSpanDb * smoothstep(profile.breakup, 1, g)
brightMix     = brightEnabled ? profile.bright(g) : 0
outputTrimDb  = profile.loudnessCompensation(g) + MasterDb
```

Do not use automatic gain control on the live input; the app already requests browser `autoGainControl: false` ([local capture code](../../src/audio/AudioEngine.ts)). Input normalization here means a stable, player-controlled trim/calibration, not a time-varying AGC that erases picking dynamics.

### Input calibration and dBFS operating level

The app's input meter currently defines a sample magnitude of 1 as 0 dBFS and latches clip at `abs(sample) >= 1` ([local meter implementation](../../src/audio/meter.ts)). A fixed waveshaper threshold without input calibration would therefore break up at different knob positions for every interface, pickup, and hardware gain setting.

**Implementation inference:** add a short calibration step and store only its trim, not captured audio:

- Ask the player to strum hard with the interface set safely below hardware clipping.
- Recommend a raw input peak near −12 dBFS; accept roughly −18 to −6 dBFS.
- Set `inputTrimDb` so the calibrated hard-strum peak is −12 dBFS at the first nonlinear stage.
- Allow manual trim of −18 to +18 dB, default 0 dB, with a “Low input” option that starts 6 dB lower and selects the darker input response documented by Fender.
- Define the internal reference so a −12 dBFS calibrated peak reaches an internal amplitude of `0.25`; profile nonlinear thresholds can then be expressed relative to that value instead of browser full scale.
- Preserve at least 6 dB output headroom after makeup gain/cabinet convolution; keep Master at −18 dB by default and retain the existing output clip latch.

This target is not a historical voltage equivalence. It is a repeatable digital operating point that makes profile breakup positions portable across devices. Authentic voltage calibration would require known interface volts-to-dBFS and measurements from a reference amp.

### Suggested profile schema

**Implementation inference:** profiles should configure topology and hidden DSP, while saved player settings remain separate.

```ts
interface AmpVoiceProfile {
  id: string;
  label: string;
  era: string;
  input: { lowCutHz: number; highCutHz: number; lowInputDb: number };
  toneStack: {
    kind: 'single-tone' | '5f6a' | 'blackface' | 'hot-rod';
    location: 'between-preamp-stages' | 'after-preamp-drive';
    controlDefaults: { bass: number; middle: number; treble: number; presence: number };
  };
  drive: {
    spanDb: number;
    breakup: number;       // normalized Gain position
    knee: number;          // normalized transition width
    asymmetry: number;     // 0 symmetric; signed bias otherwise
    preampStages: 1 | 2 | 3;
  };
  power: {
    headroom: number;      // normalized internal threshold
    sagDepth: number;      // fractional rail reduction at sustained full drive
    sagAttackMs: number;
    sagReleaseMs: number;
    feedback: number;      // relative profile value
  };
  cabinetIr: string;
  outputTrimDb: number;
}
```

Avoid representing a profile as only `{ bassDb, middleDb, trebleDb }`. Fender's own Cyber-Twin separates tone-stack type, tone-stack location, and drive circuitry, which is the right conceptual boundary for this codebase too ([manual, pp. 22 and 50–51](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=26)).

## Practical era profiles and starter settings

### What the numbers mean

All numbers in the following two tables are **implementation inferences requiring listening tests and measurement calibration**. They are not factory presets, measured transfer functions, component tolerances, or claims that a browser model is an original Fender amplifier.

- Visible controls use a 0–10 scale. The first Gain number is a clean starting point; the parenthesized number is a saturated starting point.
- `Breakup` is the normalized Gain position where hard calibrated picking first produces obvious compression/harmonics.
- `Knee` is a qualitative 0–1 transition width; larger is softer/more gradual.
- `Asym.` is a signed 0–1 waveshaper bias seed. Keep it subtle and DC-block the result.
- `Sag` is maximum envelope-driven rail/gain reduction, followed by attack/release times.
- Cabinet frequency limits are only emergency synthetic fallbacks. A measured, legally distributable IR at the active sample rate is preferable.

### Player-facing starting points

| Profile | Gain clean (sat.) | Bass | Mid | Treble/Tone | Bright / Presence | Player-facing intent |
|---|---:|---:|---:|---:|---|---|
| 1957 Tweed Deluxe 5E3 | 3.0 (7.2) | locked 5 | locked 6 | Tone 5.5 | no Bright; no Presence | Warm, touch-sensitive clean; early thick compression; loose bass when pushed. Strict mode exposes only Tone. |
| 1959 Tweed Bassman 5F6-A | 3.5 (7.8) | 3.5 | 5.0 | 6.0 | Bright on; Presence 5 | Bigger, firmer tweed clean; articulate 4x10; later and less congested breakup than 5E3. |
| 1965 Blackface Deluxe Reverb | 3.8 (7.5) | 4.0 | fixed/5.0 | 6.0 | Vibrato bright cap on; Presence fixed | Scooped, sparkling clean with moderate headroom; singing 6V6-style power breakup. |
| 1977–78 Silverface Twin 135 | 4.0 (9.2) | 4.0 | 5.0 | 5.5 | Bright on; Presence fixed | Very high headroom and tight lows; Gain remains clean through most of travel; late, restrained saturation. |
| 1993 Blues Deluxe clean/drive | 3.5 clean; Drive 6.0 | 5.0 | 5.5 | 5.5 | Bright off; Presence 5 | Full 6L6 clean path; switchable cascaded preamp drive, then channel Master; brighter and more forward than blackface. |
| 2019 Tone Master Deluxe-style | 4.0 (7.5) | 4.0 | fixed/5.0 | 5.5 | stock or No-Bright-Cap option | Modern digital realization of Deluxe behavior; use selectable cab/mic IR and independent virtual power scaling. |

The historical anchors are: 5E3/12 W/5Y3/2x6V6/1x12 alnico for the ’57 Deluxe ([official manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf#page=6)); the 5F6-A stack, Presence, 50 W, and 4x10 alnico complement for the ’59 Bassman ([official manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf#page=4)); the Blackface stack's clean/loud design goal ([Cyber-Twin engineering notes](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=54)); the 135 W ultralinear Twin and its master-volume era ([Fender Twin history](https://www.fender.com/articles/behind-the-scenes/pristine-cleans-aggressive-overdrive-the-fender-twin-story?tag=amps)); the Blues Deluxe's clean/drive topology ([official manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Blues_Deluxe_Reissue_Rev_B.pdf#page=6)); and Fender's documented Tone Master circuit/headroom, power selector, and cabinet-IR approach ([official manual](https://www.fmicassets.com/Damroot/Original/10001/OM_22741XX000_Tone_Master_Deluxe_Reverb_EU.pdf#page=2)).

### Hidden DSP calibration seeds

| Profile | Drive span | Breakup | Knee | Asym. | Power headroom | Sag depth; attack/release | Feedback | Cabinet fallback |
|---|---:|---:|---:|---:|---:|---|---:|---|
| 1957 Tweed Deluxe 5E3 | 30 dB, 2 stages | 0.52 | 0.35 | +0.12 | 0.55 | 0.22; 12/180 ms | 0.10 | 1x12 open/pine, broad 95 Hz resonance, −12 dB/oct above 5.2 kHz |
| 1959 Tweed Bassman 5F6-A | 32 dB, 2 stages | 0.62 | 0.30 | +0.08 | 0.72 | 0.12; 10/130 ms | 0.38 | 4x10 open, tight 105 Hz region, −12 dB/oct above 6.2 kHz |
| 1965 Blackface Deluxe Reverb | 34 dB, 2 stages | 0.68 | 0.27 | +0.07 | 0.76 | 0.10; 8/115 ms | 0.55 | 1x12 open, modest 85 Hz resonance, scoop around 1.7 kHz, rolloff above 5.8 kHz |
| 1977–78 Silverface Twin 135 | 38 dB, 2 stages | 0.86 | 0.18 | +0.025 | 0.96 | 0.02; 5/70 ms | 0.82 | 2x12 open, firm 75–90 Hz, wide clean bandwidth, rolloff above 6.4 kHz |
| 1993 Blues Deluxe clean | 34 dB, 2 stages | 0.75 | 0.24 | +0.06 | 0.86 | 0.06; 7/95 ms | 0.60 | 1x12 open, fuller 120–250 Hz, upper-mid presence, rolloff above 5.8 kHz |
| 1993 Blues Deluxe drive | 46 dB, 3 stages | 0.40 | 0.30 | +0.11 | 0.82 | 0.06; 7/95 ms | 0.55 | same 1x12; Presence modifies post-drive/high-feedback path |
| 2019 Tone Master Deluxe-style | 34 dB, 2 stages | 0.68 | 0.27 | +0.07 | 0.76 | 0.10; 8/115 ms | 0.55 | selected Jensen-style speaker/microphone IR; off = no cabinet filter |

The Tone Master row is included as a useful modern control architecture, not a new vintage circuit voice. Fender documents a 100 W class-D output stage used to simulate 22 W tube-amp performance, a six-position power selector, and cabinet-IR choices ([Tone Master Deluxe Reverb manual, p. 2](https://www.fmicassets.com/Damroot/Original/10001/OM_22741XX000_Tone_Master_Deluxe_Reverb_EU.pdf#page=2)). Browser Amp should similarly keep virtual amp drive independent from final listening level.

### Tone-control implementation by profile

**Implementation inference:** use these behaviors rather than translating every visible 0–10 setting into independent ±12 dB filters.

| Profile family | Tone behavior |
|---|---|
| 5E3 | Strict: one interactive Tone network; hide Bass/Mid. Compatible: Tone controls overall tilt while Bass/Mid provide limited ±3 dB correction after the modeled network and are marked “extra.” |
| 5F6-A | Implement or tabulate the later 1959 stack values printed by Fender; preserve control interaction and insertion loss. Presence is a separate power-feedback parameter. |
| Blackface | Implement or tabulate the Blackface values printed by Fender; preserve its deep mid scoop and all-controls-down behavior. For models without a panel Mid control, lock Mid to the model's chosen internal value. |
| 1970s Twin | Start from the Blackface family response but increase power headroom/feedback and reduce sag. Add Master as pre-output-stage control only for the historically relevant profile. Do not imply that “silverface” itself always means a different stack; Fender says early silverface Twin circuitry initially remained the same as blackface ([Twin history](https://www.fender.com/articles/behind-the-scenes/pristine-cleans-aggressive-overdrive-the-fender-twin-story?tag=amps)). |
| Blues/Hot Rod | Use the profile-specific passive stack before/among drive stages; make Presence post-preamp-distortion. Clean and Drive must select different preamp cascades, not only change gain. |

For a fast implementation, compute the analog stack response offline at a grid such as 11×11×11 knob positions, fit stable IIR/biquad coefficients per cell, and trilinearly interpolate parameters with smoothing. For higher fidelity, solve the passive network in the AudioWorklet using a state-space, nodal, or wave-digital formulation. The lookup/fitting plan is an inference; the need to preserve type, interaction, loss, and location follows Fender's documented topologies.

## Nonlinear DSP options

### Milestone 1: native Web Audio, good enough to tune the product

The Web Audio specification defines `WaveShaperNode` as a processor for nonlinear distortion, including subtle warming, with an arbitrary curve. It offers `none`, `2x`, and `4x` oversampling ([W3C Web Audio, WaveShaperNode](https://www.w3.org/TR/webaudio-1.0/#waveshapernode)). Use that native facility before building a full circuit solver.

**Implementation inference:** add two moderate stages rather than one severe clipper:

```text
input trim
  -> high-pass 30–45 Hz and gentle RF low-pass 12–18 kHz
  -> pre-gain A
  -> asymmetric soft shaper A (`oversample = '4x'`)
  -> era tone stack
  -> pre/power gain B
  -> softer, wider shaper B (`oversample = '4x'`)
  -> DC blocker around 15–25 Hz
  -> cabinet IR
```

Use a continuous, monotonic curve such as a normalized biased `tanh` or soft rational saturator. Generate at least 8,193 curve points over [−1, 1]. Subtract the curve's zero-input output and normalize positive/negative peak magnitudes so added asymmetry does not create a persistent DC offset. Keep each stage mild enough that calibrated hard picking at the clean setting produces less than roughly 1% measured THD, then let Gain push the stages progressively.

Do not put the existing `DynamicsCompressorNode` in place of amp saturation. It changes envelope dynamics but does not supply the intended harmonic transfer. Retain it as an optional studio/effect stage and bypass it when evaluating the amp model; otherwise it can mask pick response and confuse sag calibration.

### Milestone 2: AudioWorklet dynamic model

The Web Audio specification says AudioWorklet scripts process on the rendering thread synchronously with built-in nodes, and the graph renders in 128-sample quanta ([W3C AudioWorklet concepts](https://www.w3.org/TR/webaudio-1.0/#AudioWorklet), [rendering model](https://www.w3.org/TR/webaudio-1.0/#rendering-a-graph)). This is the correct home for state that must update sample-by-sample: sag envelopes, bias shift, hysteretic or reactive feedback approximations, profile crossfades, and a custom antialiased nonlinearity.

Suggested dynamic behavior, all inferred:

- Track a rectified/energy envelope after the power-stage drive.
- Reduce the virtual rail/headroom by `sagDepth * envelope`, with the profile attack/release seeds above.
- Allow a small, much slower bias shift under sustained asymmetric drive; cap it tightly to avoid gating or DC drift.
- Make feedback reduce gain and distortion below clipping; decrease high-frequency feedback as Presence rises.
- Separate phase-inverter/power-stage saturation from preamp saturation so a high-headroom Twin profile can stay mostly clean without forcing the preamp curve to be unrealistically linear.
- Smooth every exposed parameter. The current 20 ms ramps are a reasonable UI starting point ([local smoothing implementation](../../src/audio/gain.ts)); slower state changes such as sag must follow their own physical-style time constants.

### Milestone 3: circuit-informed model only where it earns its cost

If listening tests show that two shapers plus a passive-stack model cannot separate 5E3, Bassman, blackface Deluxe, and Twin feel, implement the smallest deep model that matters:

1. A triode-like common-cathode preamp block for Blackface/Hot Rod families.
2. A cathode-follower plus passive-stack block for 5F6-A-family behavior.
3. A push-pull power stage with profile feedback and rail state.
4. A simple reactive speaker-load approximation feeding the cabinet IR.

This decomposition mirrors the distinctions Fender's Cyber-Twin engineer makes between common-cathode and cathode-follower drive types and tone-stack locations ([manual, p. 51](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=55)). It does not require modeling every resistor and tube to add useful depth.

## Aliasing, latency, and quality settings

Nonlinear processing creates harmonics above Nyquist that fold back as inharmonic aliasing. The DAFx 2024 paper states that oversampling followed by low-pass/downsampling is the common remedy, with CPU cost proportional to the oversampling factor; it also reports antiderivative antialiasing (ADAA) as effective for nonlinear audio and discusses improved interpolation for memoryless systems ([Zheleznov and Bilbao, DAFx-24](https://dafx.de/paper-archive/2024/papers/DAFx24_paper_33.pdf)). A DAFx-20 paper applies arbitrary-order ADAA to nonlinear wave-digital filters and specifically discusses clipping/limiting functions used in guitar distortion ([Albertini, Bernardini, and Sarti, DAFx-20](https://dafx2020.mdw.ac.at/proceedings/papers/DAFx2020_paper_35.pdf)).

Recommended progression:

1. Ship/tune with `WaveShaperNode.oversample = '4x'` at 44.1/48 kHz.
2. Offline-test 2x vs 4x CPU and alias energy on the project's supported Chrome/macOS hardware.
3. If 4x is too costly, use 2x for the first stage and 4x for the harder stage, or reduce curve severity rather than disabling antialiasing.
4. In the AudioWorklet version, evaluate first-order ADAA for memoryless shapers; use higher-order ADAA or oversampled WDF only after benchmark evidence.
5. Low-pass before downsampling and test guitar-like multitone/chord inputs, not only a 1 kHz sine.

Web Audio does not specify the exact WaveShaper up/downsampling filters and says they may trade quality, latency, and performance. It also warns that oversampling introduces implementation-dependent latency ([W3C WaveShaper processing](https://www.w3.org/TR/webaudio-1.0/#waveshaper-algorithm)). Therefore, measure actual end-to-end latency and discontinuity during bypass/profile changes in current Chrome; do not claim a fixed latency from the API enum.

## Cabinet, reverb, and ordering in this repository

The shipped signal order is defined by the [audio-path specification](../audio-path-spec.md). This research predates the current six-model design; current behavior belongs in the [amp-model specification](../jazz-amp-models-spec.md), rather than changing legacy saved-settings semantics silently.

**Implementation inference:** evolve the graph in compatible increments:

1. Add an `AmpVoice` module behind `AudioEngine`; DOM code continues to send complete settings through the existing deep interface.
2. Put input trim and the nonlinear/tone/power model where Clean Gain and the generic EQ currently live.
3. Put cabinet convolution immediately after the power stage.
4. Keep the existing compressor as an optional post-cab studio effect at first; offer preamp placement only if product design wants a pedal-style compressor.
5. Keep reverb post-cab during the first migration to avoid destabilizing current tests. A later “amp spring” mode may tap/return around the relevant profile's preamp/power path, while the existing plate remains a studio effect.
6. Retain Master, output analyser, monitor mute, muted startup, and clip latch exactly at the outside boundary.
7. Crossfade old/new profiles or bypass paths over 20–50 ms. Do not replace a live WaveShaper curve or cabinet IR in place without a parallel-path fade.

Fender documents spring/reverb placement as model-dependent. For example, Cyber-Twin's outboard brown-Tolex-style Fender Reverb is placed before drive and tone controls ([Cyber-Twin manual, p. 25](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF#page=29)). That is another reason not to bake reverb into one universal “Fender” topology.

## Verification and calibration plan

### Deterministic automated tests

Add offline tests before changing the UI:

- **Linearity at zero drive:** a −18 dBFS sine at the cleanest setting should produce a stable, near-linear output after accounting for the tone stack/cabinet response.
- **Progressive harmonics:** at fixed input and frequency, rising Gain must monotonically increase a defined harmonic-energy metric without a sudden hard-clipping step.
- **Input dependence:** a low-level pick should remain cleaner than a hard pick at one Gain setting.
- **Era headroom:** with normalized input, the 5E3 profile must cross the chosen THD threshold at a lower Gain than Deluxe Reverb, which must cross before the 135 W Twin profile.
- **Sag:** a sustained burst should show the configured short-term gain reduction and recovery; bypass/zero-sag profiles should not.
- **Tone-stack snapshots:** compare magnitude at a frequency grid for canonical 0/5/10 positions, including control interaction and all-controls-down behavior where appropriate.
- **Aliasing:** drive high-frequency sines and guitar-like multitones; integrate energy in bins that cannot be harmonic products below Nyquist. Compare none/2x/4x and later ADAA.
- **DC:** asymmetric profiles must settle near zero mean after the DC blocker.
- **Cabinet:** an impulse must produce the expected deterministic IR response and no unintended normalization change.
- **Transitions:** profile, Bright, low-input, and bypass changes must stay below an agreed maximum sample step and preserve reverb-tail policy.
- **Level safety:** Master at its default and every factory preset must remain below the output clip threshold for the calibrated reference performance; extreme user settings may clip visibly but must not create NaN/Infinity.

The existing `OfflineAudioContext` harness already measures gain, frequency response, reverb determinism, and transition steps ([amp and cabinet tests](../../tests/audio/amp-cabinet.spec.ts), [harness](../../tests/support/offlineAudioHarness.ts)). Extend that harness rather than creating a second DSP test route.

### Listening and measurement pass

Automated tests establish stability, not authenticity. Run a blind, level-matched pass using DI guitar performances with transient, chord, low-note, and sustained-note examples. If access to reference amps is available, reamp the same DI at several physical knob positions and capture:

- small-signal swept-sine tone-stack/cab response;
- output level and THD versus input at several frequencies;
- attack compression and recovery for short and sustained bursts;
- low/high input difference;
- Bright and Presence difference at low and high volume;
- cabinet/mic response at fixed placement.

Match loudness before judging “better.” Tune in this order: input calibration -> clean frequency response -> breakup position -> harmonic balance/asymmetry -> sag/recovery -> cabinet -> loudness compensation. Store measurement provenance and do not label an inferred profile as a clone until it has been validated against a named, dated circuit and cabinet.

## Recommended delivery order

1. **Rename and migrate semantics.** Introduce `gain` 0–10, `inputTrimDb`, `voice`, and a settings-schema migration; preserve the old clean workbench as a `Studio Clean`/legacy profile so saved settings do not unexpectedly distort.
2. **Native nonlinear prototype.** Two 4x WaveShapers, DC blocker, fixed synthetic cabinet filter, clean/default and one 5E3-inspired profile. Add progressive-harmonic and no-DC tests.
3. **Tone-stack profiles.** Implement 5E3 single Tone, later 5F6-A, and Blackface networks with appropriate location and insertion loss. Add the ’59 Bassman and ’65 Deluxe profiles.
4. **Power feel.** Add headroom, feedback/Presence, sag envelope, and output compensation; add 135 W Twin and Blues Deluxe clean/drive profiles.
5. **Cabinet IRs.** Use measured/licensed 1x12, 4x10, and 2x12 assets with explicit gain calibration. Keep a no-cab diagnostic mode hidden or advanced.
6. **AudioWorklet/ADAA only after profiling.** Move the nonlinear core when native nodes cannot meet alias, state, topology, or transition requirements. Preserve the `AudioEngine` public seam.
7. **Reference validation.** Level-matched listening/measurement, then revise factory defaults and claims.

## Sources

Primary sources used for substantive claims:

- Fender, [’57 Deluxe amplifier owner’s manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_57_Deluxe.pdf).
- Fender, [’59 Bassman amplifier owner’s manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_59_Bassman.pdf).
- Fender, [Cyber-Twin instruction manual and engineering notes](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_CyberTwin_English.PDF).
- Fender, [1978 Twin Reverb/silverface family owner’s manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Twin_Reverb_Silverface_1978.pdf).
- Fender, [“Pristine Cleans. Aggressive Overdrive. The Fender Twin Story”](https://www.fender.com/articles/behind-the-scenes/pristine-cleans-aggressive-overdrive-the-fender-twin-story?tag=amps).
- Fender, [Blues Deluxe Reissue owner’s manual](https://www.fmicassets.com/Damroot/Original/10001/OM_leg_gtramp_Blues_Deluxe_Reissue_Rev_B.pdf).
- Fender Support, [“What tubes are in my amp?”](https://support.fender.com/hc/en-us/articles/42507659450779-What-tubes-are-in-my-amp).
- Fender, [’68 Custom Deluxe Reverb product documentation](https://intl.fender.com/products/68-custom-deluxe-reverb).
- Fender, [“Be in the Moment: The Presence Control Explained”](https://www.fender.com/articles/parts-and-accessories/be-in-the-moment-the-presence-control-explained).
- Fender, [Tone Master Deluxe Reverb owner’s manual](https://www.fmicassets.com/Damroot/Original/10001/OM_22741XX000_Tone_Master_Deluxe_Reverb_EU.pdf).
- Fender Newsroom, [2019 Tone Master Series announcement](https://spotlight.fender.com/newsroom/news/713).
- Fender Support, [Tone Master Deluxe Reverb firmware/IR notes](https://support.fender.com/hc/en-us/articles/42521932241819-Fender-Tone-Master-Deluxe-Reverb-Firmware-and-IR-Manager-App-Update).
- W3C, [Web Audio API Recommendation](https://www.w3.org/TR/webaudio-1.0/).
- Victor Zheleznov and Stefan Bilbao, [“Interpolation Filters for Antiderivative Antialiasing,” DAFx-24](https://dafx.de/paper-archive/2024/papers/DAFx24_paper_33.pdf).
- Davide Albertini, Alberto Bernardini, and Augusto Sarti, [“Antiderivative Antialiasing in Nonlinear Wave Digital Filters,” DAFx-20](https://dafx2020.mdw.ac.at/proceedings/papers/DAFx2020_paper_35.pdf).
