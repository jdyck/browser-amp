/**
 * Compatibility facade for the amp catalog. The concrete definitions now live
 * beside their audio implementations under src/amps and src/audio/amps.
 */
export {
  AMP_MODELS,
  AMP_MODEL_CONTROLS,
  AMP_REGISTRY,
  DEFAULT_JAZZ_AMP_SETTINGS,
  isAmpModel,
  normalizeJazzAmpSettings,
} from '../amps/index';

export { studioGainDb } from '../amps/studioClean';

export type {
  AmpChoiceDefinition,
  AmpControlDefinition,
  AmpKnobDefinition,
  AmpSwitchDefinition,
  AmpModel,
  BlackfaceComboSettings,
  BritishChimeSettings,
  HighHeadroomAmericanSettings,
  JazzAmpId,
  JazzAmpSettings,
  JazzAmpState,
  SmallTweedComboSettings,
  StudioCleanSettings,
  WarmJazzComboSettings,
} from '../amps/index';
