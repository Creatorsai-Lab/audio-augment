import { buildRack, defaultSettings, tailSeconds, type Rack, type Settings } from "./process";

export type TrackId = "original" | "cleaned" | "augmented";

/** `harmony` is only used by the augmented track. */
export type TrackAudio = { main: AudioBuffer; harmony?: AudioBuffer | null };

/**
 * Transport for the three previews. All tracks share one playhead, so
 * switching track while playing carries on from the same moment (A/B).
 *
 * "original" and "cleaned" play straight to the speakers. "augmented" plays
 * through a live effects rack that follows `setSettings` in real time.
 */
export class Player {
  track: TrackId | null = null;
  playing = false;
  /** Called whenever `track` or `playing` changes. */
  onChange: (() => void) | null = null;

  private ctx: AudioContext | null = null;
  private rack: Rack | null = null;
  private settings: Settings = defaultSettings;
  private nodes: AudioBufferSourceNode[] = [];
  private audio: TrackAudio | null = null;
  private startedAt = 0;
  private offset = 0;
  private endTimer: ReturnType<typeof setTimeout> | undefined;

  /** The shared context (also used for decoding). Created on first use. */
  context(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") this.ctx = new AudioContext();
    return this.ctx;
  }

  setSettings(s: Settings) {
    this.settings = s;
    this.rack?.update(s);
  }

  /** Playhead in seconds. */
  position(): number {
    if (!this.playing || !this.ctx || !this.audio) return this.offset;
    return Math.min(this.audio.main.duration, Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  /** True if `audio` is exactly what is loaded right now. */
  isCurrent(audio: TrackAudio): boolean {
    return (
      this.audio?.main === audio.main && (this.audio.harmony ?? null) === (audio.harmony ?? null)
    );
  }

  /** Start (or switch to) a track at `at` seconds, by default at the playhead. */
  play(track: TrackId, audio: TrackAudio, at: number = this.position()) {
    const ctx = this.context();
    void ctx.resume();
    const live = track === "augmented";
    const keepRack = live && this.playing && this.track === "augmented";
    this.silence();
    // A fresh rack per session, so stale echo / reverb tails never leak in.
    if (!keepRack) this.dropRack();
    if (live && !this.rack) {
      this.rack = buildRack(ctx, this.settings, true);
      this.rack.output.connect(ctx.destination);
    }

    const duration = audio.main.duration;
    const offset = at >= duration - 0.02 ? 0 : Math.max(0, at);
    const when = ctx.currentTime + 0.005;

    const main = ctx.createBufferSource();
    main.buffer = audio.main;
    main.connect(live && this.rack ? this.rack.input : ctx.destination);
    main.start(when, offset);
    this.nodes = [main];

    if (live && this.rack && audio.harmony) {
      const harmony = ctx.createBufferSource();
      harmony.buffer = audio.harmony;
      harmony.connect(this.rack.harmonyInput);
      harmony.start(when, offset);
      this.nodes.push(harmony);
    }

    main.onended = () => {
      if (this.nodes[0] !== main) return;
      // Reached the end: let the effect tail ring out, then rewind.
      this.nodes = [];
      const tail = live ? tailSeconds(this.settings) : 0;
      this.endTimer = setTimeout(() => {
        this.dropRack();
        this.playing = false;
        this.offset = 0;
        this.onChange?.();
      }, tail * 1000);
    };

    this.audio = audio;
    this.track = track;
    this.startedAt = when - offset;
    this.offset = offset;
    this.playing = true;
    this.onChange?.();
  }

  pause() {
    this.offset = this.position();
    this.silence();
    this.dropRack();
    this.playing = false;
    this.onChange?.();
  }

  /** Move the playhead; keeps playing if it was. */
  seek(seconds: number, track: TrackId, audio: TrackAudio) {
    const at = Math.min(Math.max(0, seconds), Math.max(0, audio.main.duration - 0.03));
    if (this.playing) {
      this.play(track, audio, at);
    } else {
      this.offset = at;
      this.track = track;
      this.audio = audio;
      this.onChange?.();
    }
  }

  /** Stop and rewind. */
  stop() {
    this.silence();
    this.dropRack();
    this.playing = false;
    this.offset = 0;
    this.track = null;
    this.audio = null;
    this.onChange?.();
  }

  dispose() {
    this.onChange = null;
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private silence() {
    clearTimeout(this.endTimer);
    for (const node of this.nodes) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        /* already ended */
      }
      node.disconnect();
    }
    this.nodes = [];
  }

  private dropRack() {
    this.rack?.output.disconnect();
    this.rack = null;
  }
}
