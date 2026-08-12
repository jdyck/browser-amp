# Reverb used to record jazz guitar, 1950s to today

Status: research and implementation recommendation, 2026-08-11

## Answer in one paragraph

There is no defensible source-backed way to name one unit or algorithm as **the** most common jazz-guitar reverb over seventy-five years: session logs rarely identify the effect on the guitar channel, reverb may come from the room, the guitar amp, or a mix send, and no primary-source corpus counts those choices. The strongest historical conclusion is a changing family: **recording-room ambience and echo chambers** in the 1950s; **plate plus chamber**, joined by increasingly common **amp spring reverb**, from the late 1950s through the 1970s; **digital algorithmic room/hall/plate** from the late 1970s onward; and today all of those sounds reproduced by hardware, algorithms, convolution, or plug-ins. If Browser Amp needs one default that travels across eras, use a restrained **short, dark room/chamber**. If it needs the most recognizable guitar-attached sound, add **spring**. Keep the existing **plate-inspired** sound as a studio-color option, not as the universal historical default.

That ranking is a reasoned product conclusion from the evidence below, not a measured frequency count of jazz sessions.

## Claim boundary

This note separates three different things that are often all called “the guitar reverb”:

1. **Captured acoustic space:** amp and/or instrument heard by room microphones in the studio, club, hall, or church.
2. **Amp-side effect:** principally a spring tank in the guitar amplifier, printed while tracking or recorded as part of the amp sound.
3. **Post-amp studio send effect:** chamber, plate, or digital processor fed from the console after the guitar/amp capture and mixed around its dry or close-miked signal.

They can coexist on one recording. A finished record cannot reliably reveal which path produced its ambience by listening alone, and available first-party histories establish availability and practice more often than a guitar-channel assignment. Accordingly, the era table says **documented infrastructure/practice** where the source proves it and **inference** where the recommendation extrapolates to jazz guitar.

## Era and type taxonomy

| Era | Reverb families most plausible/common in professional jazz-guitar recording | What is directly documented | Confidence and caveat |
|---|---|---|---|
| 1950–1956 | Natural room/hall; purpose-built echo chamber | Capitol’s official history describes dedicated concrete chambers below the 1956 tower; Abbey Road says its Studio Two chamber was converted in the mid-1950s. A chamber sends a mixer feed to a loudspeaker in a reflective room and returns one or more microphones ([Capitol Studios](https://www.capitolstudios.com/), [Abbey Road chamber history](https://www.abbeyroad.com/news/studio-two-echo-chamber-gearthatmadeus-3114), [Abbey Road technique overview](https://www.abbeyroad.com/news/how-to-use-abbey-roads-plate-and-chamber-reverb-effectively-in-your-music-2585)). | **High** for major-studio practice; **medium** for any particular jazz-guitar track. Natural ambience also follows simply from recording an amp/instrument in a room, but the wet/dry balance depends on microphone layout. |
| 1957–early 1960s | Chamber and natural room remain; EMT-style plate becomes a major studio alternative | EMT’s own 1981 history dates the EMT 140 to 1957, describes a 2 m², 0.5 mm steel plate, and dates its two-pickup stereo version to 1961 ([EMT Courier, 1981](https://www.technicalaudio.com/pdf/EMT/EMT_Courier_iss_35a_April_1981_251.pdf)). Abbey Road installed four EMT 140s in 1957 to complement its fixed-time chambers ([Abbey Road plates](https://www.abbeyroad.com/audio-products/28/modal)). | **High** for the technology and studio adoption; **medium** for jazz guitar specifically. Plate is a credible period studio sound, not proof that it was on every guitar recording. |
| 1961–1970s | Natural room, chamber, plate; amp spring increasingly available and genre-portable | Fender dates its standalone tube-driven Hammond-design spring Reverb Unit to 1961 and the Deluxe Reverb amplifier to 1963; its historical material identifies licensed Hammond spring technology ([Fender effects history](https://www.fender.com/articles/behind-the-scenes/vintage-fender-effects-from-the-1950s-1980s), [Fender tube/model chronology](https://support.fender.com/hc/en-us/articles/42507659450779-What-tubes-are-in-my-amp)). The modern George Benson signature amp still specifies Fender spring reverb, direct first-party evidence that this family belongs in a jazz-guitar signal chain ([Fender GB Hot Rod Deluxe](https://www.fender.com/products/gb-hot-rod-deluxe/)). | **High** that spring became a standard amp-side option and remains a jazz-guitar option; **low-to-medium** for how often players printed it on specific 1960s/70s sessions. Plate/chamber were controlled by the engineer; spring could be part of the player's amp sound. |
| Late 1970s–1990s | Natural room, plate, spring; digital algorithmic halls, rooms, and plates become studio standards | EMT’s first-party history dates the practical EMT 250 digital reverberator to 1976 ([EMT Courier](https://www.technicalaudio.com/pdf/EMT/EMT_Courier_iss_35a_April_1981_251.pdf)). Lexicon’s own history identifies the late-1970s 224 and the later PCM60, PCM70, 480L, and 960L line ([Lexicon Pantheon manual](https://lexiconpro.com/en/product_documents/pantheon_manual_180246bpdf)); the 480L documentation exposes Concert Hall and Rich Plate algorithms with decay, low-frequency time, crossover, predelay, high-frequency cut, diffusion, definition, size, and wet/dry parameters ([480L Classic Cart manual](https://lexiconpro.com/en-US/product_documents/480l_classiccart_rev0_userpdf)). | **High** for studio availability and algorithm families; **medium** for prevalence on jazz-guitar records. The exact preset is a production choice, not a genre invariant. |
| 2000s–today | Natural rooms and amp springs persist; algorithmic and convolution versions of room/chamber/plate/spring dominate practical workflows; ambient/modulated reverbs are an optional modern voice | Fender’s current Deluxe Reverb still uses a physical spring tank, while its digital Tone Master explicitly uses **convolution spring reverb** ([’65 Deluxe Reverb](https://www.fender.com/products/65-deluxe-reverb), [Tone Master Deluxe Reverb](https://www.fender.com/products/tone-master-deluxe-reverb)). Abbey Road says its physical plates remain in use and have also been captured as software ([Abbey Road plates](https://www.abbeyroad.com/news/abbey-road-and-waves-release-the-legendary-plates-reverb-2085)). ECM documents Ralph Towner deliberately performing with a church’s natural reverberation as part of the guitar sound in 2005 ([ECM, *Time Line*](https://ecmrecords.com/product/time-line-ralph-towner/)). | **High** that all major families coexist today. Product availability is much broader than evidence about the most-used setting. Long modulated/shimmer/“infinite” ambience is real in contemporary guitar, but should be a creative profile rather than the straight-ahead default. |

## The five useful types

### 1. Natural room or short studio ambience — best cross-era default

A room return contains a direct/early-reflection pattern followed by a denser, frequency-dependent decay. It may have little obvious “effect” while still placing a close amp in a believable shared space. Eventide’s current first-party documentation describes room reverbs as the choice when natural ambience is wanted without a distinct reverb effect being audible ([Eventide H9000 Rooms](https://cdn.eventideaudio.com/manuals/h9000/2.2.11/content/appendix/algorithms/47_Reverbs_Rooms.html)). ECM’s *Time Line* supplies guitar-specific evidence at the opposite, spacious end: Ralph Towner says he projected into a large church and consciously played with its natural reverberation as part of the total sound ([ECM](https://ecmrecords.com/product/time-line-ralph-towner/)).

**Historical inference:** room sound is the only family that spans the whole period without requiring a particular installed effect, and restrained ambience is compatible with intimate small-group jazz. That makes it the safest universal default, not a claim that room mics were the largest wet component on most records.

**Browser Amp emulation:** add a `room` profile using a measured/licensed stereo IR or a purpose-built synthetic IR with sparse early reflections (roughly 5–35 ms), fast density build-up, short RT60 (starting range about 0.45–0.9 s), and high-frequency decay shorter than low/mid decay. A stereo IR may run in the existing `ConvolverNode`; Web Audio explicitly identifies convolution as a high-quality method for simulating acoustic space ([Web Audio convolution architecture](https://webaudio.github.io/web-audio-api/convolution.html)). For a tiny ambience, do not reuse the current 12 ms silence followed immediately by diffuse noise: encode geometry-like early taps first.

### 2. Echo chamber — strongest 1950s studio-effect profile

An echo chamber is a real reflective room used as an effects send: loudspeaker playback, microphone recapture, then a return to the console. Abbey Road notes that small chambers have little predelay and a dense quality, and that engineers filtered low frequencies to control low-mid buildup; its S.T.E.E.D. process additionally inserted tape delay and EQ ([Abbey Road technique overview](https://www.abbeyroad.com/news/how-to-use-abbey-roads-plate-and-chamber-reverb-effectively-in-your-music-2585)). Capitol documents trapezoidal reinforced-concrete chambers, unique speaker/microphone choices, and up to five seconds of reverberation ([Capitol Studios](https://www.capitolstudios.com/)).

**Browser Amp emulation:** add a `chamber` profile as a captured or licensed IR. Pre-filter the send with high-pass and low-pass biquads and expose `tone`; optionally put a short `DelayNode` before the convolver for tape/pre-delay variants. For a synthetic version, combine distinct early reflections with a dense, smooth, darker tail around 0.8–2.2 s. Chamber should sound spatial and somewhat room-like, not like the current uniform noise field. A later “vintage chamber” advanced mode could add tape-delay feedback, but that requires an `AudioWorklet` or carefully bounded `DelayNode` feedback loop and should not be part of the core reverb control.

### 3. Plate — canonical late-1950s-through-modern studio color

The EMT 140 drives bending waves through a suspended steel plate and captures one or two pickup signals. EMT’s source dates stereo pickup outputs to 1961; Abbey Road describes the damper-controlled decay and its four individually modified plates ([EMT Courier](https://www.technicalaudio.com/pdf/EMT/EMT_Courier_iss_35a_April_1981_251.pdf), [Abbey Road gear](https://www.abbeyroad.com/gear-instruments?search=The+Dark+Side+of+the+Moon)). Universal Audio’s technical history characterizes the result as dense and heavily diffused and notes the normal studio practice of return EQ ([UA EMT history](https://www.uaudio.com/blogs/ua/emt-reverb-history)).

**Browser Amp emulation:** the existing generator is already explicitly plate-inspired: deterministic stereo filtered noise, a 1.5 s tail, and 12 ms of leading predelay ([current generator](../../src/audio/reverb.ts)). Preserve it as `studio-plate`, but deepen it before calling it an EMT emulation:

- add a rapid, non-geometric modal/diffuse onset instead of only silence-then-noise;
- make decay and damping profile parameters rather than constants;
- use independent, decorrelated stereo pickup responses;
- add send/return high-pass and shelving EQ;
- preferably replace or calibrate the synthetic tail with legally distributable measurements from a documented plate.

Convolution is well suited to a fixed plate state. If continuously variable damping is required, crossfade between a small IR bank or move to a modal/feedback network rather than regenerating and swapping one convolver during playing.

### 4. Spring — most recognizable guitar-specific profile

The spring is historically distinct from a studio plate. Fender’s first-party history documents a 1961 tube-driven standalone unit using Hammond-licensed spring technology, and its current Deluxe Reverb specifies a 4-spring, 8-ohm 4AB3C1B tank ([Fender effects history](https://www.fender.com/articles/behind-the-scenes/vintage-fender-effects-from-the-1950s-1980s), [’65 Deluxe Reverb specification](https://www.fender.com/products/65-deluxe-reverb)). The George Benson signature combo specifies Fender spring reverb, a direct bridge to jazz guitar ([GB Hot Rod Deluxe](https://www.fender.com/products/gb-hot-rod-deluxe/)). Archived Polytone manufacturer manuals likewise identify a Hammond three-spring reverb on jazz-oriented Mini-Brute amplifiers; the project’s existing Polytone research records those primary sources and the corresponding driver/recovery topology ([Polytone research](./polytone-amp-simulator-feasibility.md#reverb-and-signal-access-points-are-documented)).

**Browser Amp emulation:** add two distinct spring profiles rather than one generic one:

- `fender-spring`: brighter, splashier, relatively long tank response;
- `polytone-3-spring`: darker/controlled, tied to a future Polytone amp voice.

A measured/licensed wet-path IR is the lowest-risk first implementation and is validated by Fender’s own use of convolution spring reverb in the Tone Master ([Fender Tone Master](https://www.fender.com/products/tone-master-deluxe-reverb)). A static IR captures one level/state but not drive-dependent tank/driver behavior, spring dispersion, “boing,” or mechanical crash. If those matter, use an `AudioWorklet` with dispersive all-pass/waveguide branches, frequency-dependent loss, multiple slightly different spring paths, and bounded saturation in the driver/recovery. Julius O. Smith’s physical-audio text covers wave-digital spring elements and the broader waveguide/feedback-delay toolkit ([wave-digital spring](https://www.dsprelated.com/freebooks/pasp/Wave_Digital_Spring.html), [book contents](https://www.dsprelated.com/freebooks/pasp/)). Do not relabel the present plate-like noise IR as spring.

### 5. Digital algorithmic room/hall/plate — defining flexible studio option since the late 1970s

Early commercial digital reverbs did not merely sample rooms. They synthesized decay from delay/filter networks and exposed musical controls. Lexicon’s official documentation traces the 224 and later line and shows the 480L’s Concert Hall and Rich Plate algorithms with separate low/mid decay, crossover, predelay, HF cut, diffusion, definition, size, and mix ([Lexicon history](https://lexiconpro.com/en/product_documents/pantheon_manual_180246bpdf), [480L Classic Cart](https://lexiconpro.com/en-US/product_documents/480l_classiccart_rev0_userpdf)). That control vocabulary is more useful to this project than an unsupported “1980s jazz preset.”

**Browser Amp emulation:** create `digital-room`, `digital-hall`, and later `digital-plate` profiles behind one algorithmic engine. An `AudioWorklet` feedback-delay network (FDN) is the scalable implementation: modulated, mutually prime delay lines; an energy-preserving feedback matrix; per-line damping; early-reflection taps; separate low/high decay; and stereo output matrix. A simpler Schroeder/Moorer network can prototype the UI; Smith documents a practical structure using parallel filtered-feedback combs plus serial allpasses and stereo offsets ([Freeverb analysis](https://www.dsprelated.com/freebooks/pasp/Freeverb.html)). Algorithmic processing is preferable to one IR when `size`, `decay`, `diffusion`, or modulation must move continuously.

For straight-ahead jazz guitar, start short and dark (roughly 0.8–1.6 s, modest predelay, low wet level). Longer modulated hall should be an explicit contemporary/ambient preset, not the default. Those numbers are design seeds, not historical measurements.

## Recommended product shape

The current app exposes only `reverbAmount` and `reverbBypassed`, generates one plate-inspired impulse, keeps dry at unity, and raises only the wet contribution ([controls](../../src/controls.ts), [generator](../../src/audio/reverb.ts), [routing](../../src/audio/AudioEngine.ts#L241-L269)). Retain that simple first-level experience and add a profile selector:

```ts
type ReverbProfile =
  | 'jazz-room'
  | 'studio-chamber'
  | 'studio-plate'
  | 'fender-spring'
  | 'polytone-spring'
  | 'digital-room'
  | 'digital-hall';

interface ReverbSettings {
  bypassed: boolean;
  amount: number;
  profile: ReverbProfile;
  // Advanced controls can be profile-derived initially:
  decay?: number;
  predelayMs?: number;
  tone?: number;
}
```

Keep implementation detail behind `AudioEngine`, consistent with the architecture decision ([ADR 0001](../adr/0001-keep-web-audio-behind-a-deep-audio-engine.md)). Internally, a profile can select one of three engines:

```text
captured/synthetic space or plate IR -> ConvolverNode
fixed spring v1                       -> ConvolverNode
variable spring or digital reverb     -> AudioWorklet algorithm
```

All profiles should preserve the direct dry path. A predelay belongs only on the wet send, so it does not add deliberate latency to the player's attack; this matches the existing routing and latency analysis ([latency research](./realtime-effect-latency.md#reverb)). Add send/return filters around each engine rather than baking every tonal choice into `Amount`.

### Tail and switching policy

The present hard bypass disconnects and replaces the convolver, which chops the current tail ([replacement path](../../src/audio/AudioEngine.ts#L548-L562)). For a musical reverb selector:

1. Bypass or profile change should fade the old wet input/return while allowing its tail to finish.
2. Create the new engine in parallel and crossfade returns; the Web Audio specification recommends replacing a convolver by constructing a new one and crossfading rather than changing its buffer in place ([`ConvolverNode.buffer`](https://webaudio.github.io/web-audio-api/#dom-convolvernode-buffer)).
3. Retire the old engine after its known maximum tail, not after only the gain-smoothing interval.
4. Keep `normalize = false` and calibrate every IR/profile to a comparable wet loudness, as the project does now.

### Delivery order

1. Rename the current profile `Studio Plate` and add the selector without changing its sound.
2. Add `Jazz Room` as the default candidate: a short, dark, measured/licensed or well-structured synthetic stereo IR.
3. Add `Fender Spring` from a legally distributable, documented tank/amp wet-path IR.
4. Add `Studio Chamber`, including send filtering and optional predelay.
5. Correct tail-preserving bypass/profile crossfades and add offline tests for onset, decay, stereo decorrelation, wet loudness, and switching discontinuity.
6. Add a worklet FDN for variable digital room/hall only if listening tests justify controls beyond fixed profiles.
7. Add the more expensive dispersive spring model only after reference IRs and recordings define what the static version fails to reproduce.

## Suggested presets, explicitly not historical measurements

These are restrained starting points for listening tests, derived from the documented character and controls above rather than claimed settings from named records.

| Preset | Engine | Starting character | Best use |
|---|---|---|---|
| Jazz Room | Convolution | 0.6 s, early reflections, dark tail, 0–8 ms predelay | Cross-era clean default; creates space without an obvious effect |
| 1950s Chamber | Convolution | 1.2 s, near-zero predelay, HP/LP-filtered send, dense mono-in/stereo-out | Vintage studio depth |
| Studio Plate | Convolution | Existing 1.5 s/12 ms profile initially; later calibrated plate IR | Smooth sustain and polish |
| Fender Spring | Convolution, later dispersive model | Bright/splashy onset, 1.5–2.5 s irregular decay, mono tank/stereo presentation optional | Amp-attached 1960s-to-modern guitar identity |
| Polytone Spring | Convolution | Darker three-spring reference, restrained return | Solid-state jazz-combo voice |
| Digital Room | Worklet FDN | 0.8–1.4 s, controllable size/damping/diffusion | Clean 1980s-to-modern studio sound |
| Ambient Hall | Worklet FDN | 2.5–5 s, predelay and gentle modulation | Contemporary spacious/creative jazz, opt-in |

## Bottom line

Do not search for one “correct jazz reverb.” The historically honest product is a small set of spaces with clear provenance. **Jazz Room** should be the neutral default, **Spring** the essential guitar-specific addition, **Plate** the enduring studio color already approximated by this project, **Chamber** the early-studio voice, and **Digital Room/Hall** the flexible late-1970s-to-current voice. Convolution covers fixed rooms, chambers, plates, and first-pass springs efficiently; use an `AudioWorklet` only where continuously variable algorithmic decay or genuinely dispersive/dynamic spring behavior earns the complexity.

## Primary and first-party sources

- Abbey Road Studios, [Studio Two Echo Chamber history](https://www.abbeyroad.com/news/studio-two-echo-chamber-gearthatmadeus-3114), [plate history](https://www.abbeyroad.com/audio-products/28/modal), and [plate/chamber operating overview](https://www.abbeyroad.com/news/how-to-use-abbey-roads-plate-and-chamber-reverb-effectively-in-your-music-2585).
- Capitol Studios, [official studio and echo-chamber description](https://www.capitolstudios.com/).
- EMT Franz GmbH, [*EMT Courier* 35a, April 1981](https://www.technicalaudio.com/pdf/EMT/EMT_Courier_iss_35a_April_1981_251.pdf).
- Fender, [vintage-effects history](https://www.fender.com/articles/behind-the-scenes/vintage-fender-effects-from-the-1950s-1980s), [’65 Deluxe Reverb](https://www.fender.com/products/65-deluxe-reverb), [Tone Master Deluxe Reverb](https://www.fender.com/products/tone-master-deluxe-reverb), and [George Benson Hot Rod Deluxe](https://www.fender.com/products/gb-hot-rod-deluxe/).
- Lexicon, [Pantheon owner’s manual/history](https://lexiconpro.com/en/product_documents/pantheon_manual_180246bpdf) and [480L Classic Cart manual](https://lexiconpro.com/en-US/product_documents/480l_classiccart_rev0_userpdf).
- ECM Records, Ralph Towner, [*Time Line* recording note and artist statement](https://ecmrecords.com/product/time-line-ralph-towner/).
- W3C Web Audio Community Group, [`ConvolverNode` and convolution architecture](https://webaudio.github.io/web-audio-api/convolution.html).
- Julius O. Smith III/CCRMA, [*Physical Audio Signal Processing*](https://www.dsprelated.com/freebooks/pasp/), including [Freeverb](https://www.dsprelated.com/freebooks/pasp/Freeverb.html) and [wave-digital spring](https://www.dsprelated.com/freebooks/pasp/Wave_Digital_Spring.html).

Manufacturer explanations from Universal Audio and Eventide are used for mechanism/implementation vocabulary, not as evidence that their products were used on a particular jazz recording: [UA EMT history](https://www.uaudio.com/blogs/ua/emt-reverb-history), [Eventide room algorithms](https://cdn.eventideaudio.com/manuals/h9000/2.2.11/content/appendix/algorithms/47_Reverbs_Rooms.html).
