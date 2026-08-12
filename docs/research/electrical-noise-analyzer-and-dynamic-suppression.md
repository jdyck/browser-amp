# Electrical-noise analysis, dynamic frequency suppression, and safe household troubleshooting

Date: 2026-08-11

## Short answer

The proposed behavior is feasible. In audio terminology it is closest to a **level-dependent dynamic EQ** or a **multiband downward expander**: selected frequency bands are attenuated while the useful input is near its noise floor, then smoothly restored toward 0 dB attenuation when the player produces a strong signal. A full FFT implementation that makes an independent decision for every frequency bin is usually called a **spectral gate** or spectral denoiser. FabFilter's first-party documentation makes the same distinction: its ordinary dynamic EQ changes an entire band's gain from a band-limited trigger, whereas its spectral mode triggers individual frequencies inside a band ([FabFilter dynamic EQ](https://www.fabfilter.com/support/help-detail?alias=pro-q&url=using%2Fdynamic-eq), [FabFilter spectral dynamics](https://prod.fabfilter.com/help/pro-q/using/spectral-dynamics)).

For Browser Amp, the best first version is not an always-on spectral denoiser. It is:

1. a diagnostic input spectrogram with a learned quiet/noise trace and 50/60 Hz harmonic-comb markers;
2. a repeatable before/after capture workflow for locating the physical source; and
3. an optional low-latency bank of a few dynamic hum/buzz bands, with limited attenuation, hysteresis, hold, and smooth opening/closing.

No analyzer can always distinguish noise from music from one mixed signal. A sustained guitar note or harmonic at the same frequency and time as a hum component is mathematically entangled with it. Persistence, a 50/60 Hz harmonic pattern, quiet calibration, note onset/decay, and changes as the guitar moves can provide useful *evidence*, not certainty. This is why the UI should say “persistent 60 Hz candidate” and show confidence and measurements rather than claim “house noise found.”

> **Electrical-safety boundary:** troubleshooting here means listening, measuring the audio capture, moving or unplugging accessible consumer devices, and operating their normal controls. Never remove an outlet or service-panel cover, alter premises wiring, defeat a plug's ground pin, or lift the protective earth of an amplifier, interface, computer, or monitor. CPSC explicitly says never to defeat a grounding feature or break off a ground pin; OSHA describes grounding as the low-resistance fault path that prevents hazardous exposed voltage ([CPSC home electrical checklist](https://www.cpsc.gov/s3fs-public/513.pdf), [OSHA grounding guidance](https://www.osha.gov/etools/construction/electrical-incidents/grounding)). If strings, a microphone, a computer, an interface, or another chassis ever tingle or shock; if an outlet is hot, scorched, loose, arcing, or smells burnt; or if breakers/GFCIs trip, stop using the setup and call a licensed electrician. A GFCI is a shock-protection device, not an audio-noise cure; OSHA says it trips on a roughly 5 mA current imbalance and may interrupt power within 1/40 second ([OSHA GFCI guidance](https://www.osha.gov/etools/construction/electrical-incidents/ground-fault-circuit-interrupters)).

## What the analyzer can reveal

### A useful display, not an oracle

Show four related views from the raw selected input, before amp gain and effects:

- **Current spectrum:** dBFS versus logarithmic frequency, with peak frequency readouts.
- **Quiet profile:** a power-spectrum average from a deliberate 5–10 second “do not play” calibration, plus a slower minimum/low-percentile trace. This is the noise fingerprint against which later frames are compared.
- **Waterfall/spectrogram:** frequency versus time, colored by dBFS. Stationary vertical or horizontal traces (depending on axis orientation) become visually distinct from guitar attacks and decays.
- **Candidate overlays:** 50 and 60 Hz fundamentals and integer harmonics, each with measured level, persistence, deviation from its expected center, and margin above the local quiet floor.

Web Audio's `AnalyserNode` already supplies dB frequency samples using `getFloatFrequencyData()`. The specification requires a Blackman window, FFT, temporal magnitude smoothing, and conversion with `20 log10`; `fftSize` is a power of two from 32 through 32768 and `frequencyBinCount` is half of it ([Web Audio `AnalyserNode`](https://webaudio.github.io/web-audio-api/#AnalyserNode), [normative FFT/window/smoothing procedure](https://webaudio.github.io/web-audio-api/#fft-windowing-and-smoothing-over-time)). An analyzer passes its input through unchanged, so it can remain in the monitoring graph; it analyzes but does not suppress noise.

At 48 kHz the nominal bin spacing and window duration are:

| FFT size | Bin spacing, `sampleRate / N` | Window duration, `N / sampleRate` | Use |
|---:|---:|---:|---|
| 2,048 | 23.44 Hz | 42.7 ms | Meter/general shape; too coarse to localize 50 versus 60 Hz well |
| 8,192 | 5.86 Hz | 170.7 ms | Responsive diagnostic spectrum |
| 16,384 | 2.93 Hz | 341.3 ms | Recommended quiet-profile and hum-comb view |
| 32,768 | 1.46 Hz | 682.7 ms | Highest native resolution, but slow and more costly |

These are grid spacing and time-span arithmetic, not the ability to resolve arbitrary nearby tones; the specified Blackman window spreads a non-bin-centered sinusoid into neighboring bins. Interpolate local peak bins if a more precise label is useful, but do not display false precision. A larger FFT improves frequency localization while making the view respond to a longer history; Web Audio also warns that large FFT sizes can be costly ([Web Audio `fftSize`](https://webaudio.github.io/web-audio-api/#dom-analysernode-fftsize)).

### How to rank “probably noise”

Use several independent features and expose them in the UI:

1. **Quiet-profile excess.** During calibration, average *linear power*, then convert the result to dB. A component that remains well above adjacent bins while no note is played is a strong noise candidate.
2. **Temporal persistence and low variance.** Track how often the component is present and how little its center drifts. A noise-floor estimator based on tracking smoothed spectral minima is an established alternative when explicit silent calibration is unavailable; Rainer Martin's original minimum-statistics method does this per band without requiring a voice-activity detector ([Martin, 2001, DOI 10.1109/89.928915](https://doi.org/10.1109/89.928915)). Explicit calibration is simpler and more inspectable for this guitar tool.
3. **Mains harmonic-comb score.** Combine evidence near 50 or 60 Hz and their harmonics rather than insisting the fundamental be the largest line. Guitar single coils are documented by their manufacturer as susceptible to 50/60 Hz electromagnetic interference from building wiring, lights, transformers, and motors; two opposite coils in a humbucker cancel much of the common interference ([Seymour Duncan humbucker explanation](https://www.seymourduncan.com/blog/latest-updates/what-is-a-humbucker)).
4. **Response to controlled changes.** If the line drops when the guitar is rotated, moved, or switched from a single coil to a humbucking pickup, that points toward radiated magnetic pickup. Seymour Duncan specifically documents orientation-dependent hum from transformer fields ([manufacturer troubleshooting note](https://www.seymourduncan.com/blog/swd/why-does-a-guitar-hum-if-standing-by-an-amp-but-hums-less-when-you-turn-to-a-different-direct)). If it appears only when a laptop supply or second audio device is connected, a conducted/ground-loop path is more likely.
5. **Musical activity.** Mark rapid onset, decay, spectral movement, and a harmonic series whose fundamental changes with played notes as “probably music.” Do not automatically suppress a bin merely because it is near 60, 120, or 180 Hz: guitar fundamentals and overtones can overlap those frequencies.

The quiet profile should be saved with the input device ID, channel, sample rate, guitar/pickup selection, interface gain noted by the user, and timestamp. dBFS measures the browser's digital full scale, not volts or electromagnetic-field strength; comparisons are meaningful only when the analog gain and physical setup stay fixed.

### Repo-specific analyzer seam

The current graph already places `#inputAnalyser` after the selected input channel and before `#cleanGain`, requests `echoCancellation`, `noiseSuppression`, and `autoGainControl` off, and reports when the browser cannot confirm those settings ([current capture and graph](../../src/audio/AudioEngine.ts), [media-capture constraint definitions](https://w3c.github.io/mediacapture-main/#dom-mediatrackconstraintset-noisesuppression)). That is exactly the raw point to analyze.

Do not simply change the existing analyzer from 2048 to 16384: it also supplies the time-domain peak meter, so doing that would silently change the meter's history from about 43 ms to about 341 ms at 48 kHz and enlarge its per-frame arrays. Add a dedicated spectrum analyzer at the same raw-input seam, preallocate its `Float32Array`, and keep the existing meter behavior stable. Analysis/presentation can update on animation frames; audio suppression must not depend on animation-frame timing.

## The requested level-dependent EQ

### Define the intended transfer law

For each selected band, maintain a detector envelope `L` in dB and a gain `G` in dB:

```text
quiet / close threshold:  Tclose
signal / open threshold:  Topen = Tclose + hysteresisDb
maximum quiet cut:        -rangeDb

L >= Topen   -> target G = 0 dB       (restore the band)
L <= Tclose  -> target G = -rangeDb   (suppress the band)
between      -> interpolate with a soft knee
```

This is downward expansion limited to `rangeDb`, not a hard mute. JUCE's first-party DSP API likewise describes its noise gate as threshold/ratio/attack/release processing that becomes an expander at a lower ratio ([JUCE `dsp::NoiseGate`](https://docs.juce.com/master/classjuce_1_1dsp_1_1NoiseGate.html)). A gentle 1:1.5–1:3 slope or a limited 6–15 dB range will usually sound less artificial than an infinite gate.

The trigger choice is crucial:

- A **wideband guitar-presence detector** opens every selected band when the player plays. It best preserves tone but lets the hum return underneath notes.
- A **per-band detector** opens only where energy exceeds that band's learned noise floor. It can remain quieter during playing but is more likely to eat low notes and harmonics.
- A practical compromise is to open on either clear wideband activity or a per-band signal-to-noise margin. Thresholds should be expressed relative to the learned floor (for example a configurable 6–12 dB margin), not as one universal dBFS number.

Do not use the raw problem-band level alone without a learned floor: a loud, steady hum can hold its own gate open.

### Envelopes, hysteresis, and timing

Rectify or square the detector signal and use separate one-pole attack/release smoothing. RMS/power reacts to energy and is stable; peak detection opens faster on transients. In gate terminology, **attack/open** is how quickly attenuation disappears when playing begins, while **release/close** is how slowly attenuation returns after playing ends. FabFilter and Steinberg both expose threshold, attack, and release for dynamic EQ; Steinberg documents that a longer attack lets more of the start through and release controls return to the original gain ([FabFilter dynamic EQ](https://www.fabfilter.com/support/help-detail?alias=pro-q&url=using%2Fdynamic-eq), [Steinberg Dynamic EQ](https://www.steinberg.help/r/wavelab-pro/wavelabplugref/13.0/en/_shared/topics/plug_ref/master_rig/master_rig_dynamic_eq_r.html)).

Reasonable *starting points to test*, not universal truths, are:

| Control | Starting range | Purpose |
|---|---:|---|
| Open/attack | 2–10 ms | Avoid dulling the pick attack |
| Close threshold hysteresis | 4–8 dB below open | Prevent chatter near threshold |
| Hold | 40–100 ms | Keep the band open across short waveform/picking gaps |
| Close/release | 120–350 ms | Avoid abrupt pumping as a note decays |
| Maximum quiet cut | 6–15 dB | Reduce noise without a conspicuous tonal hole |

Lower-frequency bands may need slower release because their periods are longer. Smooth gain at audio rate; abrupt coefficient or gain changes click, while a threshold with no hysteresis chatters. A very slow close makes the hum audibly “breathe” back in during note decay, so show gain-reduction meters and make timing tunable.

### Three implementation families

| Method | Strengths | Costs/artifacts | Browser Amp fit |
|---|---|---|---|
| **A few IIR/biquad dynamic bands** | Sample-by-sample, no FFT block, low CPU, exact control over known hum harmonics | Phase shift; narrow high-Q filters ring; coefficient modulation or insufficient smoothing can click/warp; a notch removes wanted signal at the same frequency | Best MVP for 4–8 user-selected hum/buzz bands |
| **Crossover/filter-bank multiband expander** | Independent detector and gain per broad band; natural for hiss or broad buzz regions | Crossovers must recombine with matched phase/magnitude; more filters; wider bands change tone | Useful second mode after narrow hum bands |
| **STFT/FFT spectral gate** | Learned floor and gain for hundreds of bins; follows irregular, broadband noise | Frame/overlap latency, CPU, time smearing, “musical noise,” phasiness, damage to note partials; needs overlap-add and time/frequency gain smoothing | Experimental/high-quality mode, not live default |

Classic spectral subtraction estimates a noise spectrum during noise-only intervals, subtracts it from each short-time magnitude spectrum, keeps the original phase, and resynthesizes; the original work also notes that rapidly changing noise estimates and overly aggressive subtraction can harm the wanted signal ([Boll, 1979, DOI 10.1109/TASSP.1979.1163209](https://doi.org/10.1109/TASSP.1979.1163209)). Berouti, Schwartz, and Makhoul documented the characteristic “musical noise” and used over-subtraction plus a nonzero spectral floor to mitigate it ([Berouti et al., 1979, DOI 10.1109/ICASSP.1979.1170788](https://doi.org/10.1109/ICASSP.1979.1170788)). A spectral gate therefore needs a gain floor, soft masks, neighboring-bin smoothing, attack/release smoothing, and overlap-add—not independent hard zeroing of FFT bins.

`AnalyserNode` cannot perform the inverse transform or change audio. A custom spectral processor belongs in `AudioWorklet`, whose processor runs synchronously on the audio rendering thread ([Web Audio `AudioWorklet`](https://webaudio.github.io/web-audio-api/#AudioWorklet)). An STFT with a 1024- or 2048-sample frame at 48 kHz spans about 21 or 43 ms before overlap/lookahead and implementation buffering. This is materially different from a small causal IIR bank.

For either dynamic IIR or FFT processing, keep envelope/filter state and parameter smoothing inside an `AudioWorklet`; the page/main thread should only send infrequent settings and receive downsampled meters. Do not drive the audible gate from `requestAnimationFrame`, which is presentation scheduling and may be delayed or throttled. Keep the new processor behind the existing deep `AudioEngine` interface ([project ADR](../adr/0001-keep-web-audio-behind-a-deep-audio-engine.md)).

### Proposed MVP for this repository

1. **Diagnostic-only release:** add a dedicated raw-input `AnalyserNode` at FFT 16384; preallocate arrays; show current spectrum, quiet profile, and a scrolling 20 Hz–10 kHz waterfall. Add buttons for “Capture quiet profile” and “Compare current to profile.”
2. **Candidate scoring:** report persistent peaks and a 50/60 Hz harmonic-comb score. Let the user click a peak to create a proposed band; never auto-enable processing.
3. **One conservative processor:** implement an `AudioWorklet` with a wideband/per-band noise-relative detector and at most 6–8 dynamic peaking/notch bands. Start with 9 dB maximum quiet cut, 6 dB hysteresis, 5 ms opening, 60 ms hold, and 200 ms closing, all user-adjustable.
4. **Honest UI:** for every band show frequency, width/Q, learned floor, open threshold/margin, current envelope, current attenuation, and “audition removed signal.” Include global bypass and level-matched A/B.
5. **Verification:** use `OfflineAudioContext` tests with silence+hum, guitar-like decaying harmonic tones, notes deliberately overlapping 60/120 Hz, threshold sweeps, and bypass transitions. Assert bounded gain, no NaN, no sample discontinuity, correct attack/hold/release, and no change at 0 dB dynamic gain. Measure impulse/swept-sine response and test Chrome/macOS hardware for dropouts.
6. **Defer spectral mode:** only add STFT gating after the analyzer and IIR version establish real recordings, target noise types, acceptable latency, and an artifact test corpus.

Also consider a simple full-band downward expander before the amp chain. It is the least selective option, but it often solves the practical goal—quiet gaps—while leaving the guitar's frequency balance untouched when open. It will not remove hum under a played note.

## Safe, repeatable troubleshooting in the house

### First make the measurement trustworthy

Use headphones connected directly to the audio interface and turn speakers/amps down or off. Fix the guitar, pickup selection, interface instrument/Hi-Z mode, hardware input gain, Browser Amp settings, position, and orientation. Confirm Browser Amp does not warn that browser noise suppression, AGC, or echo cancellation remained enabled. Capture at least 10 seconds for every condition and label it; compare both the quiet-profile spectrum and time-domain level, not memory.

Do not turn up the preamp merely to make a spectrum easier to see. High gain raises wanted signal and every upstream noise source, while later amp/compression/distortion can exaggerate the apparent noise.

### Isolation matrix: change one thing at a time

1. **Output versus recorded input.** If noise is present in powered monitors but absent from interface headphones and absent from the recorded/raw input spectrum, investigate monitor power, output cables, and the output interconnect. If it is in the raw input and interface headphones, work upstream from the interface input.
2. **Simplify to guitar → short known-good cable → interface → headphones.** Remove pedals, USB peripherals, hubs, monitors, docks, and external displays. Re-add one item at a time. Universal Audio's first-party guitar troubleshooting likewise recommends disconnecting USB, simplifying connections, changing cable/instrument, and trying another location ([UA guitar-noise troubleshooting](https://help.uaudio.com/hc/en-us/articles/43206470858132-UAFX-Pedal-General-Troubleshooting)).
3. **Disconnect the guitar, then compare cable/guitar states.** An open Hi-Z input is not a calibrated interface self-noise test and may itself pick up noise, but the change still localizes the path. Compare: input with no cable; cable plus guitar volume at zero; normal volume/hands off; touching strings; alternate cable; alternate guitar; single-coil versus humbucking pickup. Stop immediately if touching strings or another chassis ever tingles or shocks.
4. **Rotate and relocate.** Keep settings fixed and rotate the guitar through 360 degrees; then move away from walls, power supplies, displays, amplifiers, and transformers. A deep orientation null or strong distance dependence is evidence of radiated pickup, not proof of defective house wiring. Single-coil shielding can reduce wiring acting as an RF antenna but the pickup manufacturer says it does not eliminate the pickup's intrinsic 60-cycle magnetic hum ([Seymour Duncan shielding guide](https://www.seymourduncan.com/blog/installation-setup/how-to-shield-a-guitar)).
5. **Laptop battery test.** With a laptop, disconnect its charger and unnecessary USB devices and listen on interface headphones. If the noise disappears, reconnect only the approved laptop supply, then peripherals one by one. Focusrite recommends this exact battery/location isolation and notes that bus-powered interfaces depend on computer USB power ([Focusrite hum/noise troubleshooting](https://support.focusrite.com/hc/en-gb/articles/211615185-Why-is-there-unwanted-hum-noise-in-my-monitors)).
6. **Different room, circuit, computer, and building.** A genuinely different building is a strong divider between the instrument/interface chain and the local electrical environment. Preserve all gains and capture profiles in both places.

### Find noisy loads without opening electrical equipment

With the minimal battery/headphone setup if possible, switch off or unplug *accessible consumer devices using their normal controls*, one at a time, and capture a labeled profile after each change. Start near the guitar and work outward:

- dimmers and their LED/CFL lamps (test off and full output, not just another dim level);
- plug-in LED lamps, fluorescent lamps, neon signs, and touch lamps;
- laptop/phone chargers, wall-warts, pedal supplies, docks, powered USB hubs, and displays;
- routers, power-line networking adapters, smart-home supplies, UPS units, and battery chargers;
- refrigerators, HVAC/air cleaners, fans, treadmills, aquarium pumps, and other motors or variable-speed controls;
- solar inverter/optimizer equipment, EV chargers, and a neighbor's equipment if evidence points outside the house.

This list is physically plausible, not a declaration that every such device is defective. The FCC interference handbook distinguishes radiated and power-line-conducted paths and recommends eliminating interference at its source where possible; it also says defective power-line hardware must be reported to the utility rather than repaired by a receiver technician ([FCC Interference Handbook](https://docs.fcc.gov/public/attachments/DOC-298197A1.pdf)). LED drivers rectify and switch power and use EMI filters specifically to keep conversion harmonics off the AC line ([U.S. Department of Energy LED-driver report](https://www.energy.gov/documents/rti-sslmultichanneldriverinitial-resultspdf)). Lutron documents that dimmer/LED combinations can create current spikes, humming, electrical noise, and flicker, and separately recommends low-noise driver/dimming approaches for studios and other noise-sensitive rooms ([Lutron LED/CFL load note](https://assets.lutron.com/a/documents/048487.pdf), [Lutron noise-sensitive lighting note](https://assets.lutron.com/a/documents/048603_for_web.pdf)).

Operating a familiar breaker handle with the panel closed may help isolate a branch circuit, but it is not required for this workflow. Do not do it if the panel is damaged, hot, buzzing/arcing, wet, unlabeled, or unfamiliar; never remove its cover. Ask a licensed electrician to perform branch-circuit and receptacle tests instead.

### Interpret the pattern, then fix the source

| Observation | More likely path | Safe next step |
|---|---|---|
| Narrow 50/60 Hz line plus exact harmonics; varies strongly with guitar angle | Magnetic field into pickup | Increase distance, rotate playing position, switch humbucking pickup, remove/replace nearby field source |
| Harmonic-rich buzz changes with a dimmer or LED load | Dimmer/driver conducted or radiated interference | Use a tested compatible lamp/dimmer/driver; have an electrician change fixed controls |
| Noise begins when laptop charger, dock, second interface, or monitor cable is attached | Computer supply/USB noise or an added ground-loop path | Approved supply, simpler USB path, balanced monitor connections, suitable audio/USB isolation |
| Noise only from monitors, not interface headphones or raw input | Output interconnect/monitor power | Short balanced TRS/XLR connections where both ends support them; add outputs one at a time |
| Broadband hiss rises smoothly with interface gain | Source/preamp/cable noise rather than mains hum | Correct Hi-Z input, healthy short cable, sensible gain staging, quieter source |
| Chirps/whine correlate with mouse, display, CPU, or USB activity | Computer/USB switching interference | Remove peripherals, change physical/USB routing, test battery/another computer |
| Same noise in a second building with the same guitar/cable/interface | Instrument or signal-chain source | Service/substitute guitar, cable, pedal supply, or interface before house work |

Ground loops arise when equipment grounds are joined by more than one path and loop current enters audio signal ground; properly implemented balanced interconnects reject this common-mode noise. Rane's engineering note also emphasizes that factory safety grounding must remain intact and that wiring modifications belong with trained personnel ([Rane Note 110](https://www.ranecommercial.com/legacy/note110.html)). Prefer manufacturer-approved, purpose-built transformer DI/line isolation or a signal-ground lift on a DI specifically designed for it; **never** imitate that by removing AC protective earth. Power the computer, interface, and monitors from the same properly grounded source when their manufacturers allow it, and use balanced outputs to balanced monitor inputs; Focusrite recommends both practices for interface systems ([Focusrite hum/noise troubleshooting](https://support.focusrite.com/hc/en-gb/articles/211615185-Why-is-there-unwanted-hum-noise-in-my-monitors)).

Keep unbalanced guitar leads short, uncoiled, and physically separated from mains cords, transformers, wall-warts, dimmers, and motors; when paths must meet, crossing rather than long parallel runs reduces coupling. Use genuinely isolated pedal-supply outputs rather than assuming multiple jacks imply isolation; Universal Audio documents that non-isolated pedal supplies can create hum and ground loops ([UA cable and power guide](https://help.uaudio.com/hc/en-us/articles/43206586819092-UAFX-Cable-Power-Guide)).

A “power conditioner” is not the first diagnostic purchase. A line filter may help conducted high-frequency noise, but it cannot remove a magnetic field already coupling into a guitar pickup, repair unsafe wiring, or guarantee removal of a ground loop. Locate the path first. Fixed dimmers, receptacles, grounding, neutral/ground reversals, damaged wiring, and service/power-line faults are electrician or utility work.

## Bottom line

Build the analyzer first and make it a troubleshooting instrument: raw-input spectrum, quiet-profile delta, waterfall, persistent peak list, mains-comb evidence, and labeled comparisons. Then implement a small, conservative, noise-relative dynamic IIR bank inside an `AudioWorklet`. It should restore bands quickly when playing, wait briefly, and attenuate them slowly and only by a bounded amount when quiet. This delivers the requested behavior without imposing FFT-frame latency on the live path.

Treat DSP as the last layer. The most transparent “noise reduction” is a quieter pickup/power/interconnect/environment, because no one-channel processor can remove a component that exactly overlaps wanted guitar energy without also changing that energy. The analyzer's highest-value outcome may therefore be showing exactly which lamp, supply, cable, pickup orientation, or extra ground path to fix—and giving an objective before/after result.
