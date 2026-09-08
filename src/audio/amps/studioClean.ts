import {
  studioGainDb,
  type StudioCleanSettings,
} from '../../amps/studioClean';
import { dbToLinearGain } from '../gain';
import { AmpPathBase, toneDb } from './shared';

export function topologyKey(settings: StudioCleanSettings): string {
  return String(settings.maximumHeadroom);
}

export class StudioCleanPath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: StudioCleanSettings) {
    super(context, 0);
    const path: AudioNode[] = [
      this.input,
      this.controlledGain('drive', dbToLinearGain(studioGainDb(state.gain))),
      this.controlledFilter('bass', 'lowshelf', 120, toneDb(state.bass, 12)),
      this.controlledFilter('middle', 'peaking', 800, toneDb(state.middle, 12), 0.8),
      this.controlledFilter('treble', 'highshelf', 3_200, toneDb(state.treble, 12)),
    ];

    if (!state.maximumHeadroom) {
      path.push(this.gain(0.28), this.shaper(0.55), this.gain(3.6));
    }
    path.push(this.output);
    this.connectPath(path);
  }

  setControls(settings: unknown): void {
    const state = settings as StudioCleanSettings;
    this.setControlDb('drive', studioGainDb(state.gain));
    this.setControl('bass', toneDb(state.bass, 12));
    this.setControl('middle', toneDb(state.middle, 12));
    this.setControl('treble', toneDb(state.treble, 12));
  }
}
