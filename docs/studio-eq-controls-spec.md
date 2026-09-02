# Studio EQ controls

## Purpose

Studio EQ provides broad final polish after Amp Model, Cabinet, Noise Suppression, and Studio Compression. It is jazz-guitar focused: it separates low-mid warmth from upper-mid articulation without becoming a surgical mixing EQ or redefining an amp model.

## Signal order

```text
Low shelf → Low Mid bell → Upper Mid bell → High shelf
```

All four filters are serial `BiquadFilterNode`s. The two bell filters use a fixed broad Q of 0.8. Gain and frequency changes use short parameter ramps. Bypass ramps every band gain to 0 dB while retaining all six settings.

## Controls

| Band | Type | Frequency | Gain | Default |
|---|---|---:|---:|---:|
| Low | Low shelf | Fixed at 120 Hz | −12 to +12 dB | 0 dB |
| Low Mid | Bell, Q 0.8 | 180–500 Hz | −12 to +12 dB | 300 Hz, 0 dB |
| Upper Mid | Bell, Q 0.8 | 600 Hz–2 kHz | −12 to +12 dB | 1 kHz, 0 dB |
| High | High shelf | Fixed at 3.2 kHz | −12 to +12 dB | 0 dB |

Gain controls step by 0.1 dB. Frequency controls step by 1 Hz. Shelf frequency and bell Q are not player-facing controls.

## Saved-settings migration

The retired Bass gain maps to Low, and Treble maps to High. A non-zero saved Middle gain maps to Upper Mid at the retired filter's exact 800 Hz center. Flat or absent legacy Middle settings use the new 1 kHz default. Low Mid starts flat at 300 Hz, so migration does not add a new tonal change.
