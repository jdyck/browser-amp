# Polytone amp-simulator feasibility

Status: research and implementation recommendation, 2026-08-11

## Question and conclusion

Is there enough reliable technical material to add Polytone amp voices alongside the Fender-inspired voices proposed for Browser Amp?

**Yes, with a narrower claim.** There is enough manufacturer-originated material to build a credible, version-pinned **Polytone-inspired** simulator, especially for the clean channel and the older diode-clipped overdrive family. Archived Polytone owner manuals document the controls and their behavior, and an archived Polytone service page links Polytone-labeled preamp and PA378B power-amplifier drawings with component values ([later Mini-Brute manual](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20Sonic%20Circ..PDF), [older Brute manual](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF), [service index](https://www.murchmusic.com/polytoneserviceinfo.htm), [preamp drawing](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG), [PA378B drawing](https://www.murchmusic.com/Polytone%20Info/schem2.JPG)).

That evidence is not as complete as the Fender evidence. No located primary source supplies measured frequency/phase responses, potentiometer tapers, loudspeaker response or Thiele-Small data, distortion-versus-level plots, or reference audio. The later “Sonic Circuit” manual describes Warm, Edge, and Drive programs but the located manufacturer schematic is the older overdrive circuit, not the Sonic Circuit. Therefore the first implementation should not claim to be a measured clone, and “Mini-Brute II” must not be treated as one invariant circuit across decades.

Recommended first delivery:

```text
calibrated mono input
  -> Hi/Lo input network
  -> op-amp input stage
  -> Dark / Normal / Brite network
  -> active Bass / Mid / Treble network
  -> clean Volume OR diode-clipped Overdrive (Drive + Gain)
  -> main summing / Master
  -> solid-state power-stage approximation
  -> version-specific sealed 1x12 cabinet response
  -> optional three-spring reverb path
```

Ship two related voices first: a late-1970s/1980s clean Mini-Brute voice and its older Clean/Overdrive channel. Treat the later Warm/Edge/Drive Sonic Circuit as a second research/measurement milestone.

## What Polytone's own documents establish

### A solid-state, op-amp preamp with a distinct power stage

Both owner manuals explicitly call the amplifiers solid state. The Polytone-labeled preamp drawing dated 7-6-98 uses 4558 op-amp stages on ±15 V rails and sends the summed signal “TO PWR AMP.” The separate PA378B drawing is a direct-coupled, discrete class-AB solid-state output stage with a differential input, bias adjustment, complementary driver/output devices, feedback, protection components, and a bipolar supply ([older manual, pp. 1–3](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF), [preamp drawing](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG), [PA378B drawing](https://www.murchmusic.com/Polytone%20Info/schem2.JPG)).

This is a fundamentally different profile from the tube-derived Fender architecture. **Implementation inference:** use an op-amp/diode preamp transfer and a high-headroom, tightly fed-back solid-state power model with little supply sag. Do not reuse Fender-style triode asymmetry, rectifier sag, or a tube-output-transformer model as the voice's defining behavior.

### The tone controls are active and the voicing switch is separate

The later manual specifies Bass and Treble with flat at noon and up to ±20 dB, Mid with flat at noon and boost/cut behavior, plus a three-position tonal-color switch that independently adds or removes 10 dB of highs. It also distinguishes Hi Gain for most instruments from Lo Gain for exceptionally hot sources ([later manual, p. 2](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20Sonic%20Circ..PDF)). The older manual gives the same ±20 dB Bass/Treble and independent ±10 dB Brite/Normal/Dark semantics ([older manual, p. 2](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF)).

The schematic supports those distinctions. It shows separate switched Dark/Normal/Brite paths before the tone amplifier, then Bass, Mid, and Treble networks around a 4558 stage. The input drawing shows Hi/Lo jacks, but the documents do not state a dB difference between them ([preamp drawing](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG)).

**Implementation inference:** implement these controls as an interacting active network derived from the schematic, not as Fender passive-stack presets. Keep Brite/Normal/Dark as a separate switch. Do not invent a numeric Hi/Lo attenuation until the jack switching and input impedance are solved from a version-specific drawing or measured.

### Clean/overdrive and Sonic Circuit are different generations

The older manual describes a switchable second channel with Gain and Drive. It says Drive moves Channel II from quasi-clean to total distortion, recommends Drive no higher than 2 for a clean Channel II sound, and says Channel II has a different clean timbre from Channel I. It also explains that Channel I Volume high/Master low produces natural preamp distortion, while reversing those settings produces an ultra-clean sound ([older manual, pp. 2–3](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF)).

The located Polytone preamp drawing is concrete: an optocoupler selects an overdrive path built from a 4558 stage with two 1N4002 diodes in its feedback path, followed by another 4558 stage; Drive and Gain are separate controls. Clean and overdrive rejoin before main summing and Master ([preamp drawing](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG)). This is enough to construct and tune a circuit-informed digital overdrive without borrowing a generic tube waveshaper.

The later manual instead documents a separate “Sonic Circuit” with Gain, a continuously variable Contour that boosts and cuts different frequencies, and a three-way Warm/Edge/Drive program switch; Channel I tone controls remain active ([later manual, p. 2](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20Sonic%20Circ..PDF)). A surviving first-party sales page describes the programs as greater warmth, warmth plus bite, and crunch ([archived Polytone sales material](https://www.murchmusic.com/polytone.htm)). The descriptions prove product topology and control semantics, but not transfer functions. Do not synthesize those three modes solely from the adjectives and call them authentic.

### Reverb and signal-access points are documented

The manuals identify a Hammond three-spring reverb on applicable models. The schematic supplies a transistor reverb driver and 4558 recovery/summing stage. The preamp output is explicitly preamp-only for another amplifier, mixer, or recording console, and the effects loop sits in the preamp path ([later manual, pp. 2–3](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20Sonic%20Circ..PDF), [older manual, pp. 2–3](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF), [preamp drawing](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG)).

**Implementation inference:** retain reverb as an optional parallel spring response around the main summing area. A generic plate is not a Polytone reverb model. A measured/licensed three-spring IR is the lowest-risk first version; exact tank behavior and decay require a known reference unit.

## Model/version candidates

| Candidate | Primary evidence | Suitability now | Main limitation |
|---|---|---|---|
| Mini-Brute I/III clean, older/1998-style circuit | Manuals plus complete preamp and PA378B drawings | **Best first profile.** Active tone controls, color switch, clean Volume/Master behavior, and power topology are documented. | Cabinet response and exact control tapers are unknown. |
| Mini-Brute II/IV older Clean/Overdrive | Older manual plus diode-overdrive schematic | **Best second profile.** Drive and Gain semantics and the clipping topology are directly recoverable. | Model-year naming is ambiguous; tune against a version-pinned unit. |
| Mini-Brute II/IV later Sonic Circuit | Later manual and first-party sales page | **Good later profile**, after obtaining its matching schematic or measurements. | Warm/Edge/Drive and Contour curves are undocumented in located primary evidence. |
| Mini-Brute V | First-party manual exists and documents two independent channels, Edge, spring reverb, master, 12/15-inch options and switchable horn ([manual](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brute%20V.PDF)). | Defer unless acoustic/horn voicing is a product goal. | More complex cabinet topology; no matching circuit drawing or driver response located. |
| Mega-Brute / Mini-Brain | Later manual and sales material document shared clean/Sonic controls and different power/cabinet configurations. | Reuse an established preamp family later. | A new amp label without the correct power/cabinet response would add little. |

The third-party service-manual catalog is useful corroboration for the version problem: it lists materially different 1977, 1978, 1985, 1987, and 1998 Mini-Brute II control sets and similar revisions across the family ([Musicparts Polytone archive](https://www.musicparts.com/products04fa.html?Company=Polytone)). It is not used here as primary proof of circuit behavior.

## Concrete DSP implications

The following are implementation recommendations, not factory specifications.

1. **Solve the clean preamp as a circuit.** Convert the documented RC/op-amp stages into linear transfer functions or a nodal/state-space model. Tabulate or interpolate the active Bass/Mid/Treble response over control positions. Preserve the independent color switch.
2. **Model the old overdrive from its topology.** An oversampled AudioWorklet or wave-digital/state-space block can model the 4558 gain stage and antiparallel 1N4002 feedback diodes. A simpler first pass may use an oversampled soft symmetric shaper inside the stage's feedback-derived filtering, calibrated to SPICE and later to hardware.
3. **Keep the power amp mostly clean.** Represent PA378B headroom, feedback, output filtering, and eventual clipping separately. Do not add Fender rectifier sag. Exact rail voltage and load vary by version, so calibrate to a named unit rather than infer wattage from model folklore.
4. **Use cabinet convolution.** A Mini-Brute clean sound heard from the combo includes its compact closed/sealed cabinet and speaker. First-party advertising from 1976 identifies the Mini-Brute I as a 12-inch, 60 W RMS combo, and later first-party sales material calls the Brute I/II speaker a heavy-duty 12-inch unit ([1976 Polytone advertisement in *International Musician*](https://www.worldradiohistory.com/Archive-All-Music/International-Musician/70s/International-Musician-1976-09.pdf), [later sales material](https://www.murchmusic.com/polytone.htm)). These sources do not identify a stable driver model or response. Capture or license a version-pinned cabinet/mic IR; until then call the result “Polytone-inspired closed 1x12,” not a Mini-Brute II clone.
5. **Separate virtual amp level from listening level.** Channel Volume, Drive/Gain, and Master affect circuit drive; Browser Amp's final listening Master should remain an additional safe output attenuation after the modeled amp/cabinet.

Suggested profile seam:

```ts
interface SolidStateAmpVoice {
  id: string;
  sourceRevision: string;
  input: { mode: 'hi' | 'lo'; trimDb: number };
  color: 'dark' | 'normal' | 'brite';
  tone: { bass: number; mid: number; treble: number };
  channel:
    | { kind: 'clean'; volume: number }
    | { kind: 'old-overdrive'; gain: number; drive: number }
    | { kind: 'sonic'; gain: number; contour: number; program: 'warm' | 'edge' | 'drive' };
  ampMaster: number;
  reverb: { enabled: boolean; amount: number; impulseId: string };
  cabinetIr: string;
  outputTrimDb: number;
}
```

## Evidence gaps and claim boundary

Before using a named “Polytone Mini-Brute II” factory label, obtain one dated, internally photographed reference unit and record:

- front/rear panel, PCB numbers, schematic correspondence, component substitutions, and pot tapers;
- small-signal frequency/phase sweeps for all tone controls, Brite/Normal/Dark, Hi/Lo, clean path, and effects/preamp output;
- level sweeps and harmonic spectra for clean Volume/Master combinations and several Drive/Gain positions;
- power-stage onset/recovery into a safe reactive load;
- cabinet near-field and fixed-mic impulse responses, speaker impedance curve, and cabinet dimensions/porting;
- spring-tank identity, wet-path impulse response, and return level.

No located primary source supports exact breakup positions, EQ center frequencies as player-facing claims, speaker manufacturer, cone material, cabinet IR, or “the” Mini-Brute II wattage across all revisions. Those values must be measurements or explicitly labeled calibration seeds. This is the largest difference from the Fender note: Polytone documentation exposes usable circuits, but not a controlled historical narrative or modern manufacturer measurements.

## Recommended delivery order

1. Add a versioned `SolidStateAmpVoice` module without changing current clean settings semantics.
2. Implement the documented clean op-amp/color/tone network and validate its calculated response against SPICE.
3. Add the old diode-feedback overdrive path and verify progressive harmonics, DC, alias energy, and gain/drive independence offline.
4. Capture a legally distributable closed-1x12 reference IR from a documented Mini-Brute I or II revision; tune and label the profile to that unit.
5. Add the spring path from a measured/licensed three-spring IR.
6. Only then add a named Polytone profile. Add Warm/Edge/Drive after finding the matching Sonic Circuit schematic or measuring the later hardware.

## Bottom line

Polytone belongs in the simulator roadmap. The evidence is sufficient for a technically distinct solid-state jazz-amp family—not merely a warmer Fender EQ preset. A clean Mini-Brute-family profile and its older diode overdrive can be circuit-informed now. The cabinet and later Sonic Circuit remain the authenticity bottlenecks, so ship the first work as version-pinned and Polytone-inspired until reference measurements close those gaps.

## Sources

Primary/manufacturer-originated sources used for substantive claims:

- Polytone Musical Instruments, [owner's manual for Mini-Brute series with Sonic Circuit](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20Sonic%20Circ..PDF).
- Polytone Musical Instruments, [older owner's manual for Mega-Brute and Mini-Brute I–IV](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brutes%20%28old%29.PDF).
- Polytone Musical Instruments, [Mini-Brute V owner's manual](https://www.murchmusic.com/Polytone%20Info/Polytone%20Mini%20Brute%20V.PDF).
- Archived Polytone/Murch Music, [service-information index](https://www.murchmusic.com/polytoneserviceinfo.htm).
- Polytone Musical Instruments, [Mini-Brutes I–IV / Mega-Brute preamp schematic](https://www.murchmusic.com/Polytone%20Info/Schem1.JPG), dated 1998.
- Polytone Musical Instruments, [PA378B power-amplifier schematic](https://www.murchmusic.com/Polytone%20Info/schem2.JPG).
- Archived Polytone/Murch Music, [product and specification page](https://www.murchmusic.com/polytone.htm).
- Polytone, [1976 Mini-Brute advertisement](https://www.worldradiohistory.com/Archive-All-Music/International-Musician/70s/International-Musician-1976-09.pdf), *International Musician*, September 1976.

Secondary source used only to inventory known service-manual revisions:

- Musicparts, [Polytone schematics and service-manual catalog](https://www.musicparts.com/products04fa.html?Company=Polytone).
