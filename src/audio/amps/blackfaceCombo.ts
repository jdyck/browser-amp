import type { BlackfaceComboSettings } from '../../amps';
import { dbToLinearGain } from '../gain';
import { AmpPathBase } from './shared';

export function topologyKey(settings: BlackfaceComboSettings): string {
  return String(settings.bright);
}

export class BlackfaceComboPath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: BlackfaceComboSettings) {
    super(context);
    this.connectPath([
      this.input,
      this.filter('highpass', 42),
      this.controlledGain(
        'drive',
        dbToLinearGain((state.volume - 4) * 3.3)
      ),
      this.controlledFilter(
        'bright', 'highshelf', 2_700,
        state.bright ? 7 * (1 - state.volume / 10) : 0
      ),
      this.gain(0.38),
      this.shaper(1.15, 0.07),
      this.filter('highpass', 18),
      this.gain(0.58),
      this.controlledFilter(
        'bass', 'lowshelf', 105,
        (state.bass - 4) * 1.7
      ),
      this.filter('peaking', 680, -4.2, 0.65),
      this.controlledFilter(
        'treble', 'highshelf', 2_800,
        (state.treble - 5.5) * 1.7
      ),
      this.gain(0.48),
      this.shaper(0.9, -0.04),
      this.filter('highpass', 18),
      this.filter('lowpass', 6_800),
      this.gain(10.4),
      this.output,
    ]);
  }

  setControls(settings: unknown): void {
    const state = settings as BlackfaceComboSettings;
    this.setControlDb('drive', (state.volume - 4) * 3.3);
    this.setControl('bass', (state.bass - 4) * 1.7);
    this.setControl('treble', (state.treble - 5.5) * 1.7);
    this.setControl(
      'bright',
      state.bright ? Math.max(0, 7 * (1 - state.volume / 10)) : 0
    );
  }
}
