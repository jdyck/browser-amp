# Swappable audio-module architecture for Browser Amp

Date: 2026-08-11

## Recommendation

Keep the existing single, deep `AudioEngine`, but refactor its fixed internal chain into **typed stage slots**. Each slot (`amp`, `eq`, `reverb`, `delay`, and eventually `dynamics`) owns exactly one selected module instance. A module is a factory plus a small lifecycle contract; it creates Web Audio nodes only when selected, exposes one input and one output to the slot, accepts complete typed state, and disconnects every resource it owns on disposal.

Do not create an `AudioContext` per module. Keep one context per live input session and put every selected module in that graph. The Web Audio specification calls contexts expensive, says one is usually sufficient per document, and notes that implementations may cap their number ([Web Audio system-resource guidance](https://webaudio.github.io/web-audio-api/#system-resources-associated-with-baseaudiocontext-subclasses)). `AudioContext.suspend()` and `close()` operate on the whole context, not an individual stage: suspend stops context time and rendering while permitting later resume, whereas close stops rendering permanently for that context ([`suspend()`](https://webaudio.github.io/web-audio-api/#dom-audiocontext-suspend), [`close()`](https://webaudio.github.io/web-audio-api/#dom-audiocontext-close)). They are therefore session/monitoring lifecycle tools, not module-switching tools.

The steady-state invariant should be:

> Each slot has one connected DSP implementation, or a direct bypass connection. Unselected implementations have no live input connection, no live output connection, no timers/listeners/ports, and no retained instance.

A short, bounded overlap during a click-free switch is reasonable; it is materially different from keeping every available amp/EQ/reverb/delay graph running indefinitely. If zero overlap is a hard requirement, fade the slot to silence, replace the module, then fade back in, accepting a brief dip.

## Why the present graph needs a stronger boundary

The repository already has the correct outer seam: its ADR says DOM code sends settings and commands through `AudioEngine`, while node topology remains internal ([ADR 0001](../adr/0001-keep-web-audio-behind-a-deep-audio-engine.md)). Keep that decision.

Inside the engine, however, the graph is a single concrete implementation:

- `connectInput()` always constructs one clean gain, three fixed biquads, one native compressor, and a reverb path ([current graph construction](../../src/audio/AudioEngine.ts)).
- Compression bypass changes dry/wet gains, but the upstream EQ remains connected to the compressor, so the compressor continues to receive an actively processing input even when its wet output is zero ([compression routing](../../src/audio/AudioEngine.ts)).
- Reverb bypass is closer to the desired lifecycle: it disconnects the convolver input and retires the old path after the smoothing interval ([reverb bypass](../../src/audio/AudioEngine.ts)).
- Settings are one flat `AmpControlSettings` object, and persistence already does useful runtime normalization plus a top-level version check ([control normalization](../../src/controls.ts), [settings store](../../src/settings.ts)).

The Web Audio processing model is the reason a muted output is not a sufficient lifecycle contract. Ordinary nodes are actively processing when an actively processing upstream node is connected and its input can still affect output; inactive nodes output silence ([AudioNode lifetime](https://webaudio.github.io/web-audio-api/#AudioNode-lifetime)). A gain of zero may silence a branch, but the specification does not make that a general command to stop all upstream DSP. `AudioNode.disconnect()` is the graph API that removes outgoing connections ([disconnect overloads](https://webaudio.github.io/web-audio-api/#dom-audionode-disconnect)). The stage manager should detach both boundary edges and the module should disconnect its internal edges, then release JavaScript references.

## Proposed module and slot contracts

Use compile-time-registered, first-party modules rather than a public runtime plugin system. The goal is interchangeable implementations with auditable ownership, not loading arbitrary third-party code into the audio rendering path.

An illustrative contract is:

```ts
type StageSlot = 'amp' | 'eq' | 'dynamics' | 'reverb' | 'delay';

interface ParseResult<State> {
  readonly ok: boolean;
  readonly value?: State;
  readonly errors?: readonly string[];
}

interface StageDefinition<State> {
  readonly id: string;              // stable, never reused for different semantics
  readonly slot: StageSlot;
  readonly stateVersion: number;
  readonly defaultState: State;
  parseState(value: unknown, version: number): ParseResult<State>;
  create(context: BaseAudioContext, state: State): Promise<AudioStage<State>>;
  readonly controls: readonly ControlDescriptor[];
}

interface AudioStage<State> {
  readonly input: AudioNode;
  readonly output: AudioNode;
  applyState(state: State, now: number): void;
  dispose(): void;
}
```

Important contract rules:

1. `create` returns a disconnected subgraph. The slot manager, not the module, connects it to the rest of the amp chain.
2. Every node, timer, event listener, animation callback, `MessagePort`, buffer cache, and other resource created by the module is owned by that instance and released by idempotent `dispose()`.
3. `applyState` receives a complete validated state, not piecemeal DOM events. It schedules click-free `AudioParam` changes relative to the supplied context time.
4. A module cannot reach the media source, destination, meters, monitoring mute, storage, or DOM. Those stay behind the current engine/application seams.
5. A definition has a stable ID such as `amp.clean-v1`, `eq.three-band-v1`, or `reverb.plate-v1`. Display names are not identifiers.
6. Register definitions by slot and reject duplicate IDs or a definition registered under the wrong slot at startup.

The `controls` descriptor can cover the present slider/number/toggle UI and keep DSP modules independent from DOM rendering. If a future EQ curve editor genuinely cannot be described declaratively, add a separate optional UI adapter contract that reads and emits module state; it still must not manipulate AudioNodes. This preserves the project rule that DOM code does not reach through `AudioEngine`.

Module-specific state is naturally modeled as a discriminated union keyed by `id`; TypeScript supports narrowing and exhaustive checking over discriminated unions ([TypeScript handbook](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html#discriminating-unions)). Avoid a universal bag of optional fields such as `bass?`, `decay?`, and `delayTime?`: it would make invalid cross-module combinations representable and turn every consumer into defensive branching.

## Slot graph and switching algorithm

Keep stable chain-level nodes around each replaceable position:

```text
previous stage
  -> slot input
     -> selected module input ... selected module output
  -> slot output/crossfade gain
  -> next stage
```

For each slot switch:

1. Validate the requested module ID and state before touching the live graph.
2. Create the new module while disconnected, so it has no actively processing input.
3. Connect it to a second slot branch at gain 0.
4. Over the existing 20 ms smoothing interval, ramp the old branch from 1 to 0 and the new branch from 0 to 1.
5. After the ramp, detach both external edges of the old module, call `dispose()`, drop the reference, and leave only the new branch.
6. Serialize switches per slot. If the player changes selection again mid-switch, cancel/supersede deterministically rather than accumulating retired graphs.

This permits at most two instances in one slot for one bounded transition. The old instance must not enter an unbounded “retired” set. For strict single-instance behavior, replace steps 3–5 with fade-out, teardown, connect, fade-in.

Tail-producing effects require an explicit product policy. Web Audio defines tail-time as output that may remain non-silent after input becomes silent; `ConvolverNode` and `DelayNode` have tail-time ([tail-time definition](https://webaudio.github.io/web-audio-api/#AudioNode-tail-time), [`ConvolverNode`](https://webaudio.github.io/web-audio-api/#ConvolverNode), [`DelayNode`](https://webaudio.github.io/web-audio-api/#DelayNode)). Browser Amp's current language says reverb bypass ends the existing tail, so the simplest consistent switch policy is **fade briefly, disconnect the old input, then dispose and chop the tail** ([project domain language](../../CONTEXT.md)). A future “preserve trails” mode would intentionally keep the outgoing effect active for a declared maximum tail duration and should be treated as a separate CPU policy, not an accidental leak.

Bypass should use the same slot ownership model. For expensive effects, bypass connects the slot input directly to its output and disposes the effect instance; re-enabling constructs one instance from its remembered state. A gain-only dry/wet bypass is appropriate only when retaining the processor is deliberate (for example, to preserve a tail or make instant A/B switching a stated feature).

## AudioWorklet policy

Native nodes remain the best first implementation for the existing gain, biquad EQ, compressor, convolver, and ordinary delay designs. Introduce `AudioWorklet` only for DSP unavailable with native nodes, such as a future nonlinear amp model or gate.

For a selected worklet module:

- Load/register its processor only when first selected; conditional `import()` can also lazily load its control-thread factory, and TypeScript documents that dynamic imports allow conditional lazy loading ([TypeScript dynamic-import documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-4.html#dynamic-import-expressions)). Loading processor code is not the same as constructing every processor instance.
- Construct one `AudioWorkletNode` for the selected instance. The processor runs on the audio rendering thread ([AudioWorklet processor model](https://webaudio.github.io/web-audio-api/#AudioWorkletProcessor)).
- For an input-transforming processor without a tail, follow the specification guidance and return `false` from `process()` so connected active inputs, rather than a permanent active-source flag, determine processing lifetime. For a real tail, return `true` only for the bounded tail period ([worklet lifetime policy](https://webaudio.github.io/web-audio-api/#dom-audioworkletprocessor-process)).
- On disposal, disconnect the node and close one end of its message channel; the specification explicitly notes that closing a port allows resources to be collected ([worklet `MessagePort` guidance](https://webaudio.github.io/web-audio-api/#dom-audioworkletprocessor-port)).
- Never allocate arrays, parse JSON, design coefficients, or touch the DOM inside `process()`. Send compact validated state/coefficient updates from the control thread and make the rendering callback bounded.

Do not try to suspend individual worklet modules by suspending their context; that suspends the whole rig. Module disconnection and processor lifetime are the correct level of control.

## Settings: separate a shareable rig from local preferences

Do not make the shareable JSON identical to all browser-local preferences. Define two objects:

- `RigPresetV1`: active module selection and active module state only. This is what Copy/Paste exports and imports.
- `StoredWorkbenchPreferencesV2`: the current rig, remembered state for inactive modules, and local-only UI preferences such as the direct-monitoring guidance dismissal. It must continue to exclude device IDs, capture state, and enabled monitoring, matching current product policy ([saved-settings scope](../../PLAN.md)).

Example shareable rig:

```json
{
  "schemaVersion": 1,
  "kind": "browser-amp-rig",
  "slots": {
    "amp": {
      "moduleId": "amp.clean-v1",
      "stateVersion": 1,
      "state": { "gainDb": 0 }
    },
    "eq": {
      "moduleId": "eq.three-band-v1",
      "stateVersion": 1,
      "state": { "bassDb": 0, "middleDb": 0, "trebleDb": 0 }
    },
    "reverb": {
      "moduleId": "reverb.plate-v1",
      "stateVersion": 1,
      "state": { "enabled": false, "amount": 20 }
    },
    "delay": {
      "moduleId": "delay.none-v1",
      "stateVersion": 1,
      "state": {}
    }
  },
  "fixed": {
    "compression": { "enabled": false, "amount": 25 },
    "masterVolumeDb": -18
  }
}
```

Use both `schemaVersion` and per-module `stateVersion`. The first evolves the envelope/slot layout; the second lets one module migrate its own state without forcing unrelated module formats to change. Keep explicit migration functions `v1 -> v2 -> ...`, test each step, and serialize only the newest canonical form.

Treat parsed JSON as `unknown`. Validate the complete envelope, resolve every module ID from the registry, and let each definition validate/migrate its own state. JSON Schema Draft 2020-12 defines a standard structural-validation vocabulary and is suitable for documenting or validating the exported contract ([JSON Schema validation specification](https://json-schema.org/draft/2020-12/json-schema-validation)); the existing hand-written normalizers are also a reasonable small-runtime implementation. TypeScript types alone do not validate pasted JSON at runtime.

Import should be transactional:

1. `JSON.parse` into `unknown`.
2. Enforce a modest maximum text length before parsing.
3. Validate `kind`, supported top-level version, exact required slots, known module IDs, finite numbers, booleans/enums, and per-control ranges.
4. Migrate to the current in-memory model.
5. If any error exists, show specific errors and change neither audio nor saved settings.
6. If valid, apply one complete rig command to `AudioEngine`; persist only after the engine accepts it.

Do not silently replace an unknown module with a default during paste. That can make a shared rig sound materially different while appearing successful. A future version may preserve unknown slots for round-tripping, but the first importer should reject them clearly.

The existing stored version 1 can migrate losslessly: clean gain becomes `amp.clean-v1`; bass/middle/treble become `eq.three-band-v1`; current reverb becomes `reverb.plate-v1`; compression and master remain fixed initially. Keeping dynamics fixed in the first refactor reduces scope; it can become a slot later without another preset-envelope redesign.

## Copy and paste UX

Offer a settings dialog with a formatted, selectable `<textarea>` and these actions:

- **Copy rig** serializes the canonical `RigPresetV1` with `JSON.stringify(rig, null, 2)`, places the same text in the textarea, and calls `navigator.clipboard.writeText()` from the button click.
- **Apply pasted rig** reads the textarea. The player can use the operating system's normal Paste command, which avoids requiring programmatic clipboard-read permission.
- An optional **Paste from clipboard** button may call `navigator.clipboard.readText()` as a convenience, but it must be feature-detected and failures must leave the textarea/manual-paste path available.

The Async Clipboard API is exposed only in secure contexts, its read/write methods are permission-gated, and the specification allows user agents to require a transient user activation; it also requires the document to have focus for async clipboard access ([Clipboard interface](https://w3c.github.io/clipboard-apis/#clipboard-interface), [clipboard permissions](https://w3c.github.io/clipboard-apis/#permissions-api-integration), [privacy/focus requirement](https://w3c.github.io/clipboard-apis/#privacy-async-clipboard)). The production app is already HTTPS, but localhost/manual-paste fallback still matters for denied permissions, policy, or browser differences. Catch `NotAllowedError` and report “Copy failed—select the JSON and copy it manually” rather than treating it as a settings failure.

Keep the textarea visible even after successful copy. Besides being a fallback, it makes the shared state inspectable and lets users save presets in notes or source control without a custom file format.

## Suggested repository shape

This is a direction, not a requirement to create all files at once:

```text
src/audio/
  AudioEngine.ts                 owns capture/session and the ordered chain
  graph/StageSlot.ts             switch/crossfade/disposal state machine
  modules/contracts.ts           StageDefinition and AudioStage
  modules/registry.ts            compile-time registry by slot and stable ID
  modules/amp/clean.ts
  modules/eq/threeBand.ts
  modules/reverb/plate.ts
  modules/delay/none.ts
src/rig/
  types.ts                       current in-memory RigPreset
  parse.ts                       unknown -> validated current rig
  migrations.ts                 persisted/exported version migrations
  serialize.ts                   canonical JSON
src/ui/
  moduleControls.ts              declarative control renderer
  rigTransfer.ts                 textarea + Clipboard API adapter
```

If bundle size becomes meaningful, registry entries can use lazy factory imports. Do not make lazy JavaScript loading the correctness mechanism: **not constructing and not connecting unselected audio graphs** is what prevents their DSP from running.

## Verification plan

1. **Contract tests:** every registered definition has a unique stable ID, matches its slot, accepts its default state, rejects malformed/non-finite state, and can be disposed twice without throwing.
2. **Migration tests:** fixture every saved/exported version, including the current flat version 1, and assert exact current canonical JSON. Unknown top-level and module versions must produce actionable errors.
3. **Transactional import tests:** invalid JSON, oversized text, unknown module ID, wrong slot, invalid state, and unsupported version leave both the engine snapshot and local storage unchanged.
4. **Slot lifecycle tests:** use the existing mocked Web Audio environment to assert one steady-state instance per slot, bounded two-instance overlap only during crossfade, both boundary edges detached after transition, and timers/ports/listeners released.
5. **Deterministic DSP tests:** extend the existing `OfflineAudioContext` harness so each module renders alone and in its intended slot. Test default response, parameter extremes, bypass, switch discontinuity, and absence of old-module output after the retirement deadline. The Web Audio specification defines `OfflineAudioContext` specifically for rendering a graph to a buffer ([offline rendering](https://webaudio.github.io/web-audio-api/#OfflineAudioContext)).
6. **Browser stress test:** repeatedly switch modules while monitoring and verify no clicks, retained tails beyond policy, console errors, or growing live-instance counters. Run an all-active-chain sustained pass on the slowest supported target; real-time work exceeding the callback budget causes underruns/glitches ([Web Audio rendering load](https://webaudio.github.io/web-audio-api/#rendering-an-audio-graph)).
7. **Clipboard browser tests:** verify formatted copy, manual paste/apply, rejected import preserving state, and permission-denied fallback on the production HTTPS path.

Add a development-only diagnostic snapshot such as `{slot, moduleId, instanceSerial, status}` for each slot and assert that no slot stays in `switching` after its deadline. Expose this to tests through the engine test seam, not to DOM production code as raw AudioNodes.

## Low-risk implementation sequence

1. Introduce `RigPresetV1`, its parser/serializer, and migration from current saved version 1 while leaving the current audio graph intact.
2. Add copy/manual-paste UI and transactional validation.
3. Extract the present EQ and reverb into definitions without changing their sound; add `StageSlot` and lifecycle tests.
4. Move clean gain into the amp slot, then add a second amp voice as the first proof that swapping works.
5. Add `delay.none-v1`, followed by one real delay module.
6. Add custom UI adapters only after a module proves the declarative control renderer insufficient.
7. Introduce AudioWorklet-backed modules only when native nodes cannot express the required DSP.

This order separates persistence risk from live-audio graph risk, preserves the existing deep `AudioEngine` boundary, and produces a usable copy/paste format before the number of module states grows.
