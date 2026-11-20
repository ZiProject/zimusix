/** Shared audio state (written by the visualizer loop, read by background effects and hooks). Values 0..1. */
export const reactive = {
  bass: 0,
  energy: 0,
  punch: 0,
  active: false,
  /** 32 log-spaced spectrum values (28 Hz – 16 kHz); reference to the analyser buffer, updated in place. */
  bands: new Float32Array(32),
};
