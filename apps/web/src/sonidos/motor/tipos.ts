/*
 * Motor de sonido de React Bits · Sound Lab (DavidHDev/react-bits, src/tools/sound-lab,
 * commit e12c22192ac7b4b452c5e2feb9b586d74765d696). Licencia MIT + Commons Clause:
 * `licencias/react-bits-sound-lab.md`. Partido en módulos sin cambiar lo que hace (DP-11.3).
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type Ramp =
  | number
  | { from: number; to: number; time?: number; delay?: number; curve?: number }
  | { points: [number, number][] };

export interface Envelope {
  attack?: number;
  rise?: number;
  hold?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  curve?: number;
}

export interface Filter {
  type: BiquadFilterType;
  freq: Ramp;
  q?: Ramp;
  gain?: number;
}

export interface LayerBase {
  at?: number;
  gain?: number;
  env?: Envelope;
  pan?: Ramp;
  filter?: Filter | Filter[];
  punch?: boolean;
  tremolo?: { rate: number; depth: number };
}

export interface ToneLayer extends LayerBase {
  type: 'tone';
  freq: Ramp;
  wave?: Wave;
  harmonics?: number[];
  partials?: [number, number, number?][];
  voices?: number;
  detune?: number;
  fm?: { ratio: number; index: Ramp };
  vibrato?: { rate: number; depth: number };
}

export interface NoiseLayer extends LayerBase {
  type: 'noise';
  color?: 'white' | 'pink' | 'brown' | 'crackle';
}

export interface SampleSet {
  rate: number;
  data: string[];
}

export interface SampleLayer extends LayerBase {
  type: 'sample';
  rate?: number;
  data?: string[];
  pitch?: number;
  offset?: number;
}

export type Layer = ToneLayer | NoiseLayer | SampleLayer;

export interface Recipe {
  duration: number;
  layers: Layer[];
  samples?: SampleSet;
  seed?: number;
  gain?: number;
  loudness?: number;
  highpass?: number;
  lowpass?: number;
  drive?: number;
  width?: number;
  reverb?: { mix: number; decay: number; predelay?: number; damp?: number; lowcut?: number };
  echo?: { time: number; feedback: number; mix: number; damp?: number };
  reverse?: boolean;
  stutter?: { slice: number; chance: number };
  crush?: number;
}

export interface ReverbEffect {
  mix?: number;
  decay?: number;
  tone?: number;
}

export interface EchoEffect {
  time?: number;
  feedback?: number;
  mix?: number;
  tone?: number;
  pingPong?: boolean;
}

export interface FilterEffect {
  type?: 'lowpass' | 'highpass' | 'bandpass';
  cutoff?: number;
  resonance?: number;
  sweep?: number;
}

export interface ChorusEffect {
  mix?: number;
  rate?: number;
  depth?: number;
}

export interface LofiEffect {
  bits?: number;
  rate?: number;
  mix?: number;
}

export interface Tune {
  pitch?: number;
  tone?: number;
  length?: number;
  space?: number;
  punch?: number;
  volume?: number;
  variation?: number;
  reverb?: ReverbEffect;
  echo?: EchoEffect;
  filter?: FilterEffect;
  chorus?: ChorusEffect;
  lofi?: LofiEffect;
}

export interface RenderOptions {
  sampleRate?: number;
  channels?: number;
  variant?: number;
}
