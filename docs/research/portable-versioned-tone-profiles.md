# Portable, versioned tone profiles for Browser Amp

Date: 2026-08-11

## Question

How should Browser Amp package its app-wide sound settings so another browser application can import a profile, offer a small Tone A/B/C choice, and play a recording with little or no adjustment?

## Short answer

Publish a small **browser-only, headless ESM package** containing both:

1. a validated, versioned JSON profile format; and
2. the Web Audio implementation that gives those profile values their sonic meaning.

JSON alone can move values between applications, but it cannot guarantee the same sound unless both applications implement the same graph, parameter mappings, generated impulses, bypass behavior, and gain staging. Web Audio itself deliberately has no graph introspection or serialization primitive, so the portable artifact must be an application-owned declarative model, not serialized `AudioNode` objects ([Web Audio: lack of serialization primitives](https://webaudio.github.io/web-audio-api/#lifetime-AudioContext)).

The reusable package should accept a host application's `BaseAudioContext`, expose `input` and `output` nodes, and apply one complete validated profile at a time. Browser Amp can connect its microphone path to that processor; a recording application can connect an `AudioBufferSourceNode` or `MediaElementAudioSourceNode` to the same processor. The package should not request microphone permission, select hardware, create a second `AudioContext`, or control monitoring.

For the current codebase, the lowest-risk first profile processor is the existing fixed Clean Amp Chain. Do not first redesign it into a public plugin platform. Package the present control semantics behind a stable processor ID, add three calibrated built-in profiles, and let the existing app consume that same package so the implementation cannot drift.

## What the repository already provides

The current code is close to a portable data model, but not yet a portable sound implementation:

- [`AmpControlSettings`](../../src/controls.ts) is a complete, finite set of nine sound-control fields. Its normalizer clamps numeric ranges, rounds to control precision, and rejects non-finite values by falling back.
- [`StoredWorkbenchPreferences`](../../src/settings.ts) already has a top-level version and correctly separates saved controls from unsafe live session state. It also contains the local-only direct-monitoring guidance preference, which must not enter a tone profile.
- [`AudioEngine.applyControls()`](../../src/audio/AudioEngine.ts) takes a complete control object and schedules 20 ms parameter ramps rather than exposing nodes to the UI. This is the right shape for an atomic `applyToneProfile()` operation.
- The actual sound depends on implementation details outside `AmpControlSettings`: EQ filter types/frequencies/Q, compression mapping, dry/wet topology, reverb maximum wet gain, the seeded impulse generator, and stage order all live in [`AudioEngine.ts`](../../src/audio/AudioEngine.ts), [`reverb.ts`](../../src/audio/reverb.ts), and [`gain.ts`](../../src/audio/gain.ts).
- The architecture decision explicitly keeps Web Audio topology behind a deep engine interface ([ADR 0001](../adr/0001-keep-web-audio-behind-a-deep-audio-engine.md)). A public package should preserve that boundary rather than export raw internal nodes or invite consumers to reconstruct the graph.
- The repository's current product language calls the persisted last-used state **Saved Control Settings** and says to avoid calling that state a preset ([domain language](../../CONTEXT.md)). A packaged factory **Tone Profile** is a different concept: it is an intentional, named sound definition, not an automatically restored browser session. The new term should be added to the domain language if this direction becomes product scope.

The root `package.json` is currently a private Vite application with no runtime dependencies. Vite has an official library mode for browser-oriented libraries through `build.lib` ([Vite library mode](https://vite.dev/guide/build.html#library-mode)), so no framework adoption is required.

## Define three different state objects

Avoid one “whole app settings” object. It would make profiles carry irrelevant or unsafe state and would make imports harder to evolve.

### 1. `ToneProfile`

An immutable or revisioned, named factory sound. Package Tone A/B/C as these. It contains:

- stable identity, display label, and revision;
- profile-schema version;
- processor ID and processor-state version;
- complete sound-producing state;
- calibrated profile output trim;
- optional versioned asset references; and
- descriptive metadata that does not affect DSP.

It excludes input/output device IDs, selected channel, permission state, connection state, monitoring state, meter state, clip latch, and UI preferences.

### 2. `TonePatch`

A selected profile plus player changes. This is the future copy/paste or save/share object. It can reference the factory profile for provenance but must also carry the effective complete state so that editing a catalog label or reorganizing defaults does not change an old saved patch.

### 3. `WorkbenchPreferences`

Browser-local state. It stores the last patch and local UI preferences, while continuing to exclude devices and monitoring. The existing [`StoredWorkbenchPreferences`](../../src/settings.ts) is this category.

Keep the user's final **Master Volume** outside `ToneProfile`. A profile may carry a calibrated `outputTrimDb` inside the processor to loudness-match A/B/C and preserve headroom, but selecting a tone should not unexpectedly raise the listener's safety/comfort setting. The current `masterVolumeDb` can remain a host control after the processor output. This is an implementation recommendation, not a Web Audio requirement.

## Recommended V1 profile envelope

Use UTF-8 JSON for interchange. JSON is explicitly a lightweight, language-independent format for portable structured data; RFC 8259 also disallows `NaN` and infinities, recommends unique member names, and warns consumers not to depend on object-member order ([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html)).

The first public format should match the fixed graph that actually exists:

```json
{
  "$schema": "https://example.invalid/browser-amp/tone-profile-v1.schema.json",
  "kind": "browser-amp-tone-profile",
  "schemaVersion": 1,
  "id": "studio-clean-a",
  "revision": 1,
  "label": "Tone A — Studio Clean",
  "processor": {
    "id": "browser-amp.clean-chain",
    "stateVersion": 1,
    "state": {
      "cleanGainDb": 0,
      "bassDb": 0,
      "middleDb": 0,
      "trebleDb": 0,
      "compressionAmount": 25,
      "compressionBypassed": true,
      "reverbAmount": 20,
      "reverbBypassed": true
    }
  },
  "outputTrimDb": 0,
  "tags": ["clean", "neutral"]
}
```

The URL above is only a placeholder for the project's eventual stable schema URL. Export the same schema from the package for offline use.

Design rules:

1. `schemaVersion` evolves the envelope. `processor.stateVersion` evolves the sound-producing state. Package version is separate and versions the JavaScript public API.
2. `kind` prevents an unrelated JSON object with coincidentally similar fields from being accepted.
3. `id` is a machine identifier; the UI displays `label`. Do not use “Tone A” as the only identity, because catalog ordering and labels will change.
4. A published `(id, revision)` pair is immutable. A changed sound gets a new revision. Semantic Versioning similarly requires released package contents not to be modified and ties version changes to a declared public API ([SemVer 2.0.0](https://semver.org/)).
5. Profile state is complete, not a sparse override over changing defaults.
6. Unknown processor IDs or unsupported state versions are errors. Silently substituting a default would make the imported profile sound different while appearing successful.
7. Factory profile import is strict. The current local-settings normalizer's fallback behavior is appropriate for recovering a usable UI from old/corrupt browser storage, but a foreign profile should report malformed, missing, out-of-range, or non-finite fields rather than repair them invisibly.

JSON Schema Draft 2020-12 defines a standard schema and validation vocabulary and supports bundling related schemas ([JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)). Publish a schema for documentation and cross-language consumers, but still expose one package-owned runtime parser returning either a current `ToneProfile` or structured errors. TypeScript types do not validate network, file, or pasted JSON at runtime.

When the swappable stage architecture described in [the existing module research](./swappable-audio-module-architecture.md) is implemented, add a new processor/state version whose state contains stable module IDs plus per-module state versions. Migrate the fixed-chain V1 explicitly. Do not pre-announce module IDs that do not yet have implementations.

## Package API

An illustrative public API is deliberately smaller than the current `AudioEngine`:

```ts
export interface ToneProcessor {
  readonly input: AudioNode;
  readonly output: AudioNode;
  readonly profile: ToneProfile;
  setProfile(profile: ToneProfileInput): Promise<void>;
  dispose(): void;
}

export function parseToneProfile(value: unknown): ParseResult<ToneProfile>;
export function getBuiltInToneProfile(id: BuiltInToneId): ToneProfile;
export function listBuiltInToneProfiles(): readonly ToneProfileSummary[];

export async function createToneProcessor(
  context: BaseAudioContext,
  initialProfile: ToneProfileInput,
): Promise<ToneProcessor>;
```

The package should accept the host's context rather than create one. Web Audio describes contexts as expensive, says one is usually sufficient per document, and notes that implementations can cap their number ([Web Audio context resource guidance](https://webaudio.github.io/web-audio-api/#system-resources-associated-with-baseaudiocontext-subclasses)). Accepting `BaseAudioContext` also allows the same constructor to work with `OfflineAudioContext` in tests and non-real-time rendering.

`setProfile()` is asynchronous because future profiles may need to load an impulse response, register an `AudioWorklet`, or construct a replacement graph. It should validate and prepare the complete new profile before changing the audible graph, then crossfade/automate once and commit the new snapshot. Web Audio schedules parameter changes on a context timeline and recommends gradual transitions to avoid clicks ([Web Audio `AudioParam` transitions](https://webaudio.github.io/web-audio-api/#AudioParam-transitions)); the current project already uses a 20 ms ramp.

Do not expose capture, `getUserMedia`, input/output selection, monitoring, meters, local storage, DOM rendering, or the context destination from this package. That split lets both intended hosts use it:

```ts
// Existing live-input app
const processor = await createToneProcessor(context, getBuiltInToneProfile('studio-clean-a'));
mediaStreamSource.connect(processor.input);
processor.output.connect(existingOutputMeterAndMonitorMute);

// Recording-playback app
const processor = await createToneProcessor(context, getBuiltInToneProfile('warm-b'));
recordingBufferSource.connect(processor.input);
processor.output.connect(hostMasterGain).connect(context.destination);
```

The API should not auto-connect to `context.destination`. The host must remain responsible for whether sound is audible.

## Package shape and build

A sensible target shape is:

```text
packages/tone-engine/
  src/
    index.ts                 public constructor and types
    profiles.ts              built-in catalog
    profile/parse.ts         unknown -> validated current profile
    profile/migrations.ts    explicit version migrations
    processor/cleanChain.ts  current fixed graph
    dsp/                     gain, compression, EQ, reverb helpers
  schemas/tone-profile-v1.schema.json
  assets/                    future licensed/versioned IRs or worklets
  package.json
```

The existing app should import this package through its public entry point. Do not publish `src/audio/AudioEngine.ts` as the library: it couples tone DSP to capture, device recovery, routing, meters, and monitoring.

Build as browser ESM first; only add CommonJS or UMD after a real consumer requires it. Vite's library mode is intended for browser-oriented libraries ([Vite library mode](https://vite.dev/guide/build.html#library-mode)). Define a small `package.json` `exports` map such as `.`, `./profiles`, and `./schema`; Node's package documentation recommends `exports` for new packages because it declares and encapsulates the public entry points ([Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)). Use npm's `files` field to restrict the published contents to distributions, declarations, schemas, assets, README, and license ([npm `package.json` files](https://docs.npmjs.com/files/package.json/#files)).

A concrete starting manifest, using a placeholder scope until the publisher chooses an available npm owner, is:

```json
{
  "name": "@browser-amp/tone-engine",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist", "schemas", "assets", "README.md", "LICENSE"],
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./profiles": {
      "types": "./dist/profiles.d.ts",
      "import": "./dist/profiles.js"
    },
    "./schema": {
      "types": "./dist/schema.d.ts",
      "import": "./dist/schema.js"
    },
    "./schema/tone-profile-v1.json": "./schemas/tone-profile-v1.schema.json"
  }
}
```

`@browser-amp/tone-engine` is illustrative, not a claim that this npm scope exists or is controlled by the project. Keep `sideEffects: false` only while all public modules truly avoid import-time graph creation, global registration, and other observable work. `./schema` should export the schema as a JavaScript value for ordinary bundlers; the explicit JSON subpath serves tools that need the original document.

Generate and ship `.d.ts` files. TypeScript's publishing guidance says generated declarations should be published with the package and referenced through `types` ([TypeScript declaration publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)); `declaration`/`emitDeclarationOnly` can produce those files ([TypeScript `declaration`](https://www.typescriptlang.org/tsconfig/declaration.html)).

Before publishing, inspect the tarball with `npm pack --dry-run`, then install the tarball or package directory into a tiny separate Vite consumer. npm explicitly recommends testing a package by installing its local path before publication ([npm scoped-package testing](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/#testing-your-package)). The root app may remain `private`; only the child package needs publishing metadata.

## Tone A/B/C behavior

Expose a catalog, not three hard-coded UI branches:

```ts
const tones = listBuiltInToneProfiles();

toneSelect.addEventListener('change', async () => {
  const profile = getBuiltInToneProfile(toneSelect.value as BuiltInToneId);
  await processor.setProfile(profile);
});
```

The select can initially show three choices, but the identity and behavior remain data-driven. A useful initial product set is:

- Tone A: the current neutral/default Clean Amp Chain.
- Tone B: one deliberately warmer, level-matched recording profile.
- Tone C: one brighter or more produced, level-matched profile.

Those B/C values need listening calibration and offline measurement; they should not be invented by the interchange format. Every factory profile should be tuned against the same reference input, matched to a declared output-loudness/headroom target, and checked not to clip at the default host master. The existing amp-voice research explains why future historically named amp voices require different topology and dynamics, not merely three EQ numbers ([Fender voice research](./fender-amp-gain-and-era-voicings.md)).

On selection:

1. resolve the stable profile ID;
2. validate it even if it came from the built-in catalog;
3. prepare any required graph/assets;
4. atomically apply/crossfade the complete sound state;
5. update the controls to the applied effective values; and
6. leave host master, source selection, play position, output device, and monitoring policy unchanged.

This gives the desired “pick a tone, hit play” flow without making profile selection responsible for the rest of the recording application's session.

## Assets and sample-rate behavior

The current reverb is especially portable because it generates a deterministic impulse in code for the context's sample rate ([current impulse generator](../../src/audio/reverb.ts)). If later profiles use cabinet or room impulse files:

- version the asset identity separately from the friendly profile label;
- package legally distributable assets with the engine rather than relying on mutable third-party URLs;
- record channel count, intended use, license/provenance, and calibration gain;
- resolve assets through static ESM imports or static `new URL(..., import.meta.url)` references so Vite includes and hashes them in the build graph ([Vite static assets](https://vite.dev/guide/assets.html)); and
- test every supported context sample rate.

Web Audio runs all nodes in a context at the context's sample rate, and `decodeAudioData()` resamples decoded audio to that rate when necessary ([Web Audio `sampleRate`](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-samplerate), [`decodeAudioData`](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata)). That is convenient, but it means a profile should not assume that an IR always has its source-file sample count after decoding. Define effect timing in seconds and verify 44.1/48 kHz behavior.

## Compatibility and migration policy

Use three independent version axes:

| Axis | Example | Changes when |
|---|---|---|
| npm package | `1.3.0` | exported JavaScript API/behavior changes under SemVer |
| profile envelope | `schemaVersion: 1` | identity/metadata/processor envelope changes |
| processor state | `stateVersion: 1` | graph-specific sound state changes |

Never infer one from another. A package update may add a profile without changing the schema; a schema migration may remain supported by several package majors.

Keep explicit pure migrations (`v1 -> v2`, not “anything -> current”) and fixture every supported version. Parse into `unknown`, validate, migrate, validate the current result, then apply. If an unsupported profile is selected, preserve the currently playing profile and return an actionable compatibility error.

For built-in catalog evolution, either retain old revisions or embed the effective complete state in exported `TonePatch` objects. A shared patch must not change merely because Tone B was retuned in a later package.

## Verification plan

1. **Schema tests:** valid built-ins pass; missing fields, duplicate/unknown IDs, non-finite/out-of-range values, extra unsupported processor fields, and unsupported versions fail with structured errors.
2. **Migration fixtures:** every old envelope and processor-state version migrates to exact canonical current JSON; the current stored controls migrate into the legacy Studio Clean profile without changing their sound.
3. **Atomic application:** a failed parse, asset load, or graph construction leaves the old profile and snapshot unchanged. A successful change emits one committed profile state.
4. **Offline audio parity:** render a fixed reference buffer through both Browser Amp's adapter and a standalone consumer using the same profile and compare their outputs. `OfflineAudioContext` exists specifically to render an audio graph into an `AudioBuffer` without real-time hardware ([Web Audio `OfflineAudioContext`](https://webaudio.github.io/web-audio-api/#OfflineAudioContext)).
5. **Profile fingerprints:** for each factory profile, store measured frequency response, gain, impulse/tail behavior, and a tolerant rendered-audio fingerprint at supported sample rates. Treat deliberate sonic changes as profile revisions.
6. **Switching tests:** repeatedly switch A/B/C during playback and bound sample discontinuities, retained old graphs, and effect-tail behavior.
7. **Host-boundary tests:** selecting a profile does not alter the recording position, input/output devices, monitoring, browser permissions, or host Master Volume.
8. **Consumer smoke test:** `npm pack --dry-run`, install the tarball into a minimal separate Vite app, import only documented exports, build, load one profile, and render/play a short source.

Exact sample equality across all browsers should not be the public portability promise. The package can guarantee the same declared graph, parameters, assets, and transition policy; supported-browser measurements should define the acceptable numeric/audio tolerance.

## Low-risk implementation sequence

1. Introduce `ToneProfileV1`, strict parsing, built-in catalog metadata, and migrations while leaving the current graph in place.
2. Separate final host Master Volume from processor output trim; preserve the current default audible level.
3. Extract only the fixed sound-producing graph and helpers into a headless processor that accepts `BaseAudioContext` and exposes disconnected input/output nodes.
4. Make the existing `AudioEngine` compose that processor behind its current public interface. Keep capture, devices, meters, recovery, and monitoring in the app.
5. Add Tone A as an exact current-default compatibility profile, then calibrate and add B/C with offline and listening checks.
6. Add the library/declaration/schema build and test its packed tarball in a separate minimal consumer.
7. Publish only after Browser Amp itself and the external recording prototype both use the same public package entry point.
8. Introduce a module/slot processor-state version only when the swappable architecture is implemented; migrate V1 rather than making the first format hypothetical.

## Bottom line

The transferable unit should be a **Tone Profile plus its version-matched tone engine**, not a dump of local storage and not serialized Web Audio nodes. Keep profiles declarative and strict, keep the processor headless and source-agnostic, keep device/monitoring/master safety in the host app, and make both Browser Amp and the recording web app import the same package. Then Tone A/B/C becomes a small catalog choice backed by one tested sonic implementation instead of three labels that happen to set similar sliders.
