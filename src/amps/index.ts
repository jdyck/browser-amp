import type { AmpPath } from '../audio/amps/shared';

import {
  BlackfaceComboPath,
  topologyKey as blackfaceTopologyKey,
} from '../audio/amps/blackfaceCombo';
import {
  BritishChimePath,
  topologyKey as britishChimeTopologyKey,
} from '../audio/amps/britishChime';
import {
  HighHeadroomAmericanPath,
  topologyKey as highHeadroomAmericanTopologyKey,
} from '../audio/amps/highHeadroomAmerican';
import {
  SmallTweedComboPath,
  topologyKey as smallTweedComboTopologyKey,
} from '../audio/amps/smallTweedCombo';
import {
  StudioCleanPath,
  topologyKey as studioCleanTopologyKey,
} from '../audio/amps/studioClean';
import {
  WarmJazzComboPath,
  topologyKey as warmJazzComboTopologyKey,
} from '../audio/amps/warmJazzCombo';

import { blackfaceCombo } from './blackfaceCombo';
import { britishChime } from './britishChime';
import { highHeadroomAmerican } from './highHeadroomAmerican';
import { smallTweedCombo } from './smallTweedCombo';
import { studioClean } from './studioClean';
import { warmJazzCombo } from './warmJazzCombo';
import type { AmpControlDefinition } from './types';

interface AmpRegistration<Settings> {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly defaultSettings: Settings;
  readonly controls: Readonly<Record<keyof Settings, AmpControlDefinition>>;
  readonly normalizeSettings: (value: unknown, fallback?: Settings) => Settings;
}

interface AmpAudioRegistration<Settings> {
  readonly topologyKey: (settings: Settings) => string;
  readonly createPath: (context: BaseAudioContext, settings: Settings) => AmpPath;
}

function registerAmp<Settings>(
  definition: AmpRegistration<Settings>,
  audio: AmpAudioRegistration<Settings>,
) {
  return {
    ...definition,
    normalizeSettings: (value: unknown, fallback?: unknown): Settings =>
      definition.normalizeSettings(value, fallback as Settings | undefined),
    topologyKey: (settings: unknown): string =>
      audio.topologyKey(settings as Settings),
    createPath: (context: BaseAudioContext, settings: unknown): AmpPath =>
      audio.createPath(context, settings as Settings),
  };
}

/** The single registration point for the amp catalog and runtime adapters. */
export const AMP_REGISTRY = {
  [studioClean.id]: registerAmp(
    studioClean,
    {
      topologyKey: studioCleanTopologyKey,
      createPath: (context, settings) =>
        new StudioCleanPath(context, settings),
    },
  ),
  [warmJazzCombo.id]: registerAmp(
    warmJazzCombo,
    {
      topologyKey: warmJazzComboTopologyKey,
      createPath: (context, settings) =>
        new WarmJazzComboPath(context, settings),
    },
  ),
  [blackfaceCombo.id]: registerAmp(
    blackfaceCombo,
    {
      topologyKey: blackfaceTopologyKey,
      createPath: (context, settings) =>
        new BlackfaceComboPath(context, settings),
    },
  ),
  [highHeadroomAmerican.id]: registerAmp(
    highHeadroomAmerican,
    {
      topologyKey: highHeadroomAmericanTopologyKey,
      createPath: (context, settings) =>
        new HighHeadroomAmericanPath(context, settings),
    },
  ),
  [smallTweedCombo.id]: registerAmp(
    smallTweedCombo,
    {
      topologyKey: smallTweedComboTopologyKey,
      createPath: (context, settings) =>
        new SmallTweedComboPath(context, settings),
    },
  ),
  [britishChime.id]: registerAmp(
    britishChime,
    {
      topologyKey: britishChimeTopologyKey,
      createPath: (context, settings) =>
        new BritishChimePath(context, settings),
    },
  ),
} as const;

export type JazzAmpId = keyof typeof AMP_REGISTRY;
/** Backwards-compatible name used by the audio engine and existing integrations. */
export type AmpModel = JazzAmpId;

export type JazzAmpSettings = {
  readonly [Id in JazzAmpId]: ReturnType<
    (typeof AMP_REGISTRY)[Id]['normalizeSettings']
  >;
};

export type JazzAmpState = JazzAmpSettings[JazzAmpId];

const ampIds = Object.keys(AMP_REGISTRY) as JazzAmpId[];

type AmpCatalog = {
  readonly [Id in JazzAmpId]: {
    readonly label: string;
    readonly description: string;
  };
};

export const AMP_MODELS = Object.fromEntries(
  ampIds.map((id) => [
    id,
    {
      label: AMP_REGISTRY[id].label,
      description: AMP_REGISTRY[id].description,
    },
  ]),
) as AmpCatalog;

export function isAmpModel(value: unknown): value is JazzAmpId {
  return typeof value === 'string' && Object.hasOwn(AMP_REGISTRY, value);
}

export const DEFAULT_JAZZ_AMP_SETTINGS = Object.fromEntries(
  ampIds.map((id) => [id, AMP_REGISTRY[id].defaultSettings]),
) as JazzAmpSettings;

type AmpControlCatalog = {
  readonly [Id in JazzAmpId]: Readonly<
    Record<keyof JazzAmpSettings[Id], AmpControlDefinition>
  >;
};

export const AMP_MODEL_CONTROLS = Object.fromEntries(
  ampIds.map((id) => [id, AMP_REGISTRY[id].controls]),
) as AmpControlCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeJazzAmpSettings(
  value: unknown,
  fallback: JazzAmpSettings = DEFAULT_JAZZ_AMP_SETTINGS,
): JazzAmpSettings {
  const all = isRecord(value) ? value : {};

  return Object.fromEntries(
    ampIds.map((id) => {
      const raw = isRecord(all[id]) ? all[id] : {};

      return [id, AMP_REGISTRY[id].normalizeSettings(raw, fallback[id])];
    }),
  ) as JazzAmpSettings;
}

export type {
  AmpChoiceDefinition,
  AmpControlDefinition,
  AmpKnobDefinition,
  AmpSwitchDefinition,
} from './types';
export type { BlackfaceComboSettings } from './blackfaceCombo';
export type { BritishChimeSettings } from './britishChime';
export type { HighHeadroomAmericanSettings } from './highHeadroomAmerican';
export type { SmallTweedComboSettings } from './smallTweedCombo';
export type { StudioCleanSettings } from './studioClean';
export type { WarmJazzComboSettings } from './warmJazzCombo';
