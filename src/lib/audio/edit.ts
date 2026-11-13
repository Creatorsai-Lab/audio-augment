// Non-destructive trimming and arranging. A track is a decoded file, the span
// of it that is kept, and where that span sits on the shared timeline — so
// trimming, sliding and duplicating only change three numbers. Audio is copied
// once, when the timeline is mixed down.

/** One lane of the editor. All values are in samples; `end` is exclusive. */
export type Track = {
  id: number;
  name: string;
  /** The file as decoded. */
  source: AudioBuffer;
  /** Playback speed applied to it (1 = unchanged). Pitch is kept. */
  speed: number;
  /** `source` at `speed`: the audio that `start`, `end` and `at` refer to. */
  buffer: AudioBuffer;
  /** Kept span of the file. */
  start: number;
  end: number;
  /** Timeline position of the kept span's first sample. */
  at: number;
};

/** Fade applied at every trimmed edge so cuts don't click. */
const FADE_SECONDS = 0.003;

/** Timeline position just after the last clip, in samples. */
export const timelineEnd = (tracks: readonly Track[]) =>
  tracks.reduce((max, t) => Math.max(max, t.at + t.end - t.start), 0);

/**
 * Mix every clip down at its timeline position: gaps are silence, overlaps
 * are summed. Mono files fill every output channel.
 */
export function mixTracks(tracks: readonly Track[]): AudioBuffer | null {
  const first = tracks[0];
  const length = timelineEnd(tracks);
  if (!first || length === 0) return null;
  // A single untrimmed file at the start of the timeline needs no copy at all.
  if (
    tracks.length === 1 &&
    first.at === 0 &&
    first.start === 0 &&
    first.end === first.buffer.length
  ) {
    return first.buffer;
  }

  const sampleRate = first.buffer.sampleRate;
  const channels = Math.max(...tracks.map((t) => t.buffer.numberOfChannels));
  const out = new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
  const fade = Math.round(FADE_SECONDS * sampleRate);

  for (let c = 0; c < channels; c++) {
    const data = out.getChannelData(c);
    for (const t of tracks) {
      const source = t.buffer.getChannelData(Math.min(c, t.buffer.numberOfChannels - 1));
      const n = t.end - t.start;
      // Fade only where audio was actually cut, not at a file's natural edges.
      const ramp = Math.min(fade, Math.floor(n / 2));
      const fadeIn = t.start > 0 ? ramp : 0;
      const fadeOut = t.end < t.buffer.length ? ramp : 0;
      for (let i = 0; i < n; i++) {
        let v = source[t.start + i]!;
        if (i < fadeIn) v *= i / fadeIn;
        else if (i >= n - fadeOut) v *= (n - 1 - i) / fadeOut;
        data[t.at + i]! += v;
      }
    }
  }
  return out;
}
