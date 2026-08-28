# Research on filters and waveshapers for amp modeling

Date: 2026-08-28

## Answer

Yes. Filters combined with nonlinear processing are an established approach, with published research on recognizable amplifier circuits going back at least to the 2006 Fender Bassman tone-stack paper. There is also a particularly relevant 2017 example of a Marshall JCM800-inspired amplifier running in Web Audio. The evidence supports building useful amp characters from these ingredients; it does not establish that one generic clipping curve plus an EQ preset accurately reproduces any chosen amplifier. See the primary studies below.

## Six useful findings

### 1. Specific amplifiers have published filter equations

Yeh and Smith's **“Discretization of the '59 Fender Bassman Tone Stack” (DAFx 2006)** derives digital filter coefficients from the circuit's resistor, capacitor, and control values. Bass, middle, and treble interact: a knob changes the network's response rather than independently boosting a fixed band. This models the tone stack, not the complete amplifier or its distortion. [Original paper](https://dafx.de/paper-archive/2006/papers/p_001.pdf)

### 2. A browser implementation already uses this general recipe

Buffa and Lebrun's **“Real time tube guitar amplifier simulation using WebAudio” (WAC 2017)** describes a Marshall JCM800-based design with preamp, tone stack, power stage, and speaker simulation. The evaluations include native amp emulations and a Yamaha THR10's Marshall model, so they should not be represented as a measured match to an original JCM800. [Conference publication](https://webaudioconf.com/posts/2017_26/)

The authors' code repository explicitly calls the preamp an approximation, says the tone stack is not fully accurate, and describes the power stage as gain plus waveshaping. It also loads cabinet impulse responses. This is strong evidence of browser feasibility, with clearly acknowledged simplifications. [Author repository](https://github.com/micbuffa/WebAudio-Guitar-Amplifier-Simulator-3)

### 3. Researchers can fit filters and curves to real amps

Eichas, Möller, and Zölzer's **“Block-oriented Gray Box Modeling of Guitar Amplifiers” (DAFx 2017)** fits three filters and two nonlinear blocks to input/output measurements. It tested Fender Bassman 100 (Blackface-Mod), Bassman 300, Ampeg VT-22, Madamp A15Mk2, and Marshall JCM900 examples. Results were stronger for clean or nearly clean settings than heavy distortion.

Crucially, these were not only fixed curves: an envelope-dependent bias shift added memory. Measurements excluded cabinets and used a resistive load, which the authors identify as a limitation. The work also explains that reproducing control changes requires additional modeling; a profile fitted at one setting is not automatically an accurate model of every knob position. [Original paper, especially §§2–6](https://dafx.de/paper-archive/2017/papers/DAFx17_paper_35.pdf)

### 4. More detailed circuit models exist for named amps

Dunkel and colleagues' **“The Fender Bassman 5F6-A Family of Preamplifier Circuits—A Wave Digital Filter Case Study” (DAFx 2016)** models four nonlinear triodes together and compares the result with SPICE circuit simulation. This captures circuit interactions using a numerical solver. A wave digital filter is a circuit-modeling method; it is not another name for a Web Audio `WaveShaperNode`. Its results should not be used as proof that a simple static waveshaper offers the same accuracy. [Original paper](https://dafx.de/paper-archive/2016/dafxpapers/37-DAFx-16_paper_53-PN.pdf)

### 5. Current research still builds on filters plus nonlinear stages

Yen-Tung Yeh and colleagues' **“DDSP Guitar Amp: Interpretable Guitar Amplifier Modeling” (2024 preprint)** uses four cascaded filter–nonlinearity–filter blocks for its preamp, followed by modeled tone, power, and transformer stages. It replaces each static nonlinear curve with a small recurrent neural unit to represent history-dependent behavior. It also learns how knobs affect model parameters. This is a hybrid DSP/neural approach, not merely an automatically selected clipping curve. [Author preprint, §2](https://arxiv.org/html/2408.11405v1)

### 6. Reusable implementations are available

The Faust library's Guitarix-derived tone stacks include Fender Bassman/Twin, Marshall JCM800/JTM45, and Vox AC30 variants. They discretize passive filter networks based on schematic component values and cite the Bassman research. These are named tone-stack implementations, not complete named amp replicas. [Faust tone-stack documentation](https://faustlibraries.grame.fr/libs/tonestacks/)

Faust's separate tube library implements transfer-curve lookup with interpolation and triode stages combining table-driven waveshaping with cathode filtering. It exposes supply, bias, and filter parameters, illustrating that useful models involve more than choosing “soft” versus “hard” clipping. This is implementation evidence, not an independent measurement of replica fidelity. [Faust tube documentation](https://faustlibraries.grame.fr/libs/tubes/)

## What this means for Browser Amp

**Implementation inference:** the model dropdown should choose a signal-processing recipe: stage count and order, gains, nonlinear curves, filtering between stages, tone-control behavior, and optionally a matching cabinet response. A plausible initial structure is:

```text
Input conditioning → gain + nonlinear stage → interstage filter
→ gain + nonlinear stage → amp tone stack → output/cabinet response
```

Start with circuit-informed clean and edge-of-breakup voices, then test them against a pinned reference circuit or recordings at several input levels and knob settings. Keep “amp-inspired” labeling until that comparison exists. The clean-setting results above make this a reasonable first scope, not a guarantee for a different implementation.

A fixed waveshaper maps the same instantaneous input to the same output. Filters surrounding it do have memory, but that restricted structure does not automatically reproduce changing bias, power-supply behavior, nonlinear feedback, or speaker-load interactions. The measured gray-box and modern hybrid studies illustrate why dynamic state is added as fidelity requirements grow. Cabinet simulation is a separate part of the target sound, not something established by the waveshaping curve alone.

Nonlinear processing also generates harmonics that can alias in a sampled system. Oversampling with the appropriate filters is an established mitigation; a pleasant-looking transfer curve is not sufficient verification. Research on nonlinear audio modeling already discussed this explicitly in 1999. [Schattschneider and Zölzer, “Discrete-Time Models for Nonlinear Audio Systems,” §1.1](https://www.dafx.de/paper-archive/1999/schattschneider.pdf)

This note establishes feasibility and model boundaries. It does not specify measured Fender, Marshall, or Vox coefficients for Browser Amp, validate its current DSP against hardware, or change application code.
