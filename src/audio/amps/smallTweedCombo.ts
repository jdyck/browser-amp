import type { SmallTweedComboSettings } from '../../amps';
import { dbToLinearGain } from '../gain';
import { AmpPathBase, toneDb } from './shared';

export function topologyKey(settings: SmallTweedComboSettings): string {
  return String(settings.lowInput);
}

export class SmallTweedComboPath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: SmallTweedComboSettings) {
    super(context);
    this.connectPath([
      this.input,
      this.filter('highpass', 45),
      this.gain(state.lowInput ? 0.52 : 1),
      this.controlledGain('drive', dbToLinearGain((state.volume - 3.5) * 4)),
      this.gain(0.72),
      this.shaper(1.55, 0.12),
      this.filter('highpass', 22),
      this.filter('highpass', 105),
      this.controlledFilter('tone', 'highshelf', 1_700, toneDb(state.tone, 10)),
      this.gain(0.9),
      this.shaper(1.25, -0.08),
      this.filter('highpass', 22),
      this.filter('peaking', 720, 2.4, 0.7),
      this.filter('lowpass', 5_400),
      this.gain(1.54),
      this.output,
    ]);
  }

  setControls(settings: unknown): void {
    const state = settings as SmallTweedComboSettings;
    this.setControlDb('drive', (state.volume - 3.5) * 4);
    this.setControl('tone', toneDb(state.tone, 10));
  }
}
