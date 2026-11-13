import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement } from "./components/Timeline";
import {
  augmentationKey,
  defaultSettings,
  EQ_BANDS,
  PitchCache,
  renderAugmented,
  renderCleaned,
  speedBuffer,
  type RackAudio,
  type Settings,
} from "./lib/audio/process";
import { mixTracks, type Track } from "./lib/audio/edit";
import { encodeMp3 } from "./lib/audio/mp3";
import { Player, type TrackAudio, type TrackId } from "./lib/audio/player";
import { isAbort } from "./lib/audio/worker-client";

/* ── Presets (augmentation-only, no cleanup keys) ── */
export const PRESETS: Record<string, Partial<Settings>> = {
  Podcast: { compressor: 0.5, eq125: 2, eq250: 1, eq1k: 2, eq4k: 3, eq8k: 2 },
  Educational: {
    compressor: 0.4,
    eq125: -2,
    eq250: 1,
    eq500: 1,
    eq1k: 3,
    eq2k: 4,
    eq4k: 3,
    eq8k: 1,
  },
  Gaming: {
    compressor: 0.6,
    eq31: 4,
    eq63: 3,
    eq250: -1,
    eq1k: 2,
    eq4k: 4,
    eq8k: 3,
    eq16k: 2,
    saturation: 0.15,
  },
  Best: {
    compressor: 0.4,
    saturation: 0.1,
    eq125: 2,
    eq250: 1,
    eq1k: 2,
    eq4k: 3,
    eq8k: 2,
    volume: 1.1,
  },
};

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The settings the augmentation stage owns (everything except cleanup). */
const AUGMENTATION_KEYS = [
  ...EQ_BANDS.map((b) => b.key),
  "pitch",
  "harmonizer",
  "harmonizerInterval",
  "chorus",
  "compressor",
  "saturation",
  "volume",
  "reverb",
  "reverbSize",
  "delay",
  "delayTime",
  "delayFeedback",
] as const;

/**
 * All of the studio's state and behaviour, with no markup. The page in
 * Studio.tsx renders from this one hook.
 */
export function useStudio() {
  /* ── State ── */
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fileName, setFileName] = useState<string | null>(null);
  /** Trim / join editor: the tracks (rows), with history for undo and redo. */
  const [timeline, setTimeline] = useState<{
    past: Track[][];
    tracks: Track[];
    future: Track[][];
  }>({ past: [], tracks: [], future: [] });
  const [activeTrack, setActiveTrack] = useState<number | null>(null);
  /** The audio the noise-removal and augmentation stages work on. */
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [cleaned, setCleaned] = useState<AudioBuffer | null>(null);
  const [selectedSource, setSelectedSource] = useState<"original" | "cleaned">("original");
  /** Last offline render, and what it was rendered from. */
  const [augmented, setAugmented] = useState<{
    buffer: AudioBuffer;
    source: AudioBuffer;
    key: string;
  } | null>(null);
  /** What the live preview plays: the source after pitch shifting, plus the harmony voice. */
  const [rackAudio, setRackAudio] = useState<{ source: AudioBuffer; audio: RackAudio } | null>(
    null,
  );

  const [noiseStatus, setNoiseStatus] = useState<string>("");
  const [augStatus, setAugStatus] = useState<string>("");
  const [noiseBusy, setNoiseBusy] = useState(false);
  const [augBusy, setAugBusy] = useState(false);
  const [exporting, setExporting] = useState<"edited" | "cleaned" | "augmented" | null>(null);
  const [transport, setTransport] = useState<{ track: TrackId | null; playing: boolean }>({
    track: null,
    playing: false,
  });

  const [player] = useState(() => new Player());
  const [pitchCache] = useState(() => new PitchCache());
  const loadRef = useRef(0);
  const nextTrackId = useRef(1);
  const keepHead = useRef<number | null>(null);
  // Edits can be committed after an await (decoding a file to append), so they
  // read the timeline through a ref rather than a possibly stale closure.
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const noiseJob = useRef<AbortController | null>(null);
  const speedJob = useRef<AbortController | null>(null);
  const augJob = useRef<AbortController | null>(null);

  /* ── Settings helper ── */
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  /* ── Derived ── */
  const tracks = timeline.tracks;
  // The timeline's own result. It only reaches the later stages when the
  // user sends it there, so editing never disturbs their previews.
  const mix = useMemo(() => mixTracks(tracks), [tracks]);
  const augSource = selectedSource === "original" ? original : cleaned;
  const liveAudio = rackAudio && rackAudio.source === augSource ? rackAudio.audio : null;
  const augFresh =
    !!augmented && augmented.source === augSource && augmented.key === augmentationKey(settings);

  const audioFor = (track: TrackId): TrackAudio | null => {
    if (track === "augmented") return liveAudio;
    const main = track === "edit" ? mix : track === "cleaned" ? cleaned : original;
    return main && { main };
  };

  /* ── Transport ── */
  useEffect(() => {
    player.onChange = () => setTransport({ track: player.track, playing: player.playing });
    return () => player.dispose();
  }, [player]);

  // The live rack follows every control as it moves.
  useEffect(() => player.setSettings(settings), [player, settings]);

  const getPosition = useCallback(() => player.position(), [player]);

  const toggle = (track: TrackId) => {
    if (transport.playing && transport.track === track) return player.pause();
    const audio = audioFor(track);
    if (audio) player.play(track, audio);
  };

  const seek = (track: TrackId, seconds: number) => {
    const audio = audioFor(track);
    if (audio) player.seek(seconds, track, audio);
  };

  /* ── Live preview audio: pitch / harmony are pre-shifted in a worker ── */
  const { pitch, harmonizerInterval } = settings;
  const harmonise = settings.harmonizer > 0;
  useEffect(() => {
    if (!augSource) return setRackAudio(null);
    const voice = { pitch, harmonizer: harmonise ? 1 : 0, harmonizerInterval };
    const ready = pitchCache.peek(augSource, voice);
    if (ready) return setRackAudio({ source: augSource, audio: ready });

    // Wait for the knob to settle; the previous audio keeps playing meanwhile.
    const job = new AbortController();
    const timer = setTimeout(() => {
      setAugStatus("Updating pitch… 0%");
      pitchCache
        .prepare(augSource, voice, {
          signal: job.signal,
          onProgress: (f) => setAugStatus(`Updating pitch… ${percent(f)}`),
        })
        .then((audio) => {
          setRackAudio({ source: augSource, audio });
          setAugStatus("");
        })
        .catch((err) => {
          if (!isAbort(err)) setAugStatus("Pitch shift failed: " + message(err));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      job.abort();
    };
  }, [augSource, pitch, harmonise, harmonizerInterval, pitchCache]);

  // When the audio behind the current track is replaced (re-cleaned, new pitch,
  // different source), swap it in at the playhead.
  useEffect(() => {
    const track = player.track;
    if (!track) return;
    const audio =
      track === "augmented"
        ? liveAudio
        : track === "cleaned"
          ? cleaned && { main: cleaned }
          : track === "edit"
            ? mix && { main: mix }
            : original && { main: original };
    if (!audio || player.isCurrent(audio)) return;
    if (player.playing) player.play(track, audio);
    else player.seek(player.position(), track, audio);
  }, [player, original, cleaned, liveAudio, mix]);

  // After an edit the mix is new; put the timeline playhead back where it was.
  useEffect(() => {
    const at = keepHead.current;
    keepHead.current = null;
    if (at !== null && mix) player.seek(at, "edit", { main: mix });
  }, [player, mix]);

  /* ── Trim / join editor ── */
  // Give the later stages new audio; anything made from the old audio
  // (cleaned, augmented, pitch cache) is void.
  const startPipeline = (audio: AudioBuffer | null, label: string) => {
    noiseJob.current?.abort();
    noiseJob.current = null;
    augJob.current?.abort();
    augJob.current = null;
    if (player.track !== "edit") player.stop();
    pitchCache.clear();
    setOriginal(audio);
    setNoiseStatus(
      audio
        ? `${label} · ${audio.duration.toFixed(1)}s · ${audio.sampleRate} Hz · ${audio.numberOfChannels}ch`
        : "",
    );
    setCleaned(null);
    setAugmented(null);
    setSelectedSource("original");
    setNoiseBusy(false);
    setAugBusy(false);
    setAugStatus("");
  };

  // An edit only touches the timeline. Its playhead is remembered so the new
  // mix doesn't rewind it.
  const beforeEdit = () => {
    if (player.track === "edit") {
      keepHead.current = player.position();
      player.stop();
    }
    setEditStatus("");
  };

  /** Hand the timeline's result to noise removal and augmentation. */
  const sendToPipeline = () => {
    if (!mix) return;
    startPipeline(mix, tracks.length > 1 ? `${tracks.length} tracks` : tracks[0]!.name);
    setEditStatus("Sent to noise removal.");
  };

  /** Apply an edit as one undoable step. */
  const commit = (edit: (tracks: Track[]) => Track[]) => {
    const { past, tracks: current } = timelineRef.current;
    const next = edit(current);
    if (next === current) return;
    beforeEdit();
    setTimeline({ past: [...past, current].slice(-100), tracks: next, future: [] });
    if (!next.some((t) => t.id === activeTrack)) setActiveTrack(next[0]?.id ?? null);
  };

  const undo = () => {
    const previous = timeline.past.at(-1);
    if (!previous) return;
    beforeEdit();
    setTimeline({
      past: timeline.past.slice(0, -1),
      tracks: previous,
      future: [tracks, ...timeline.future],
    });
  };

  const redo = () => {
    const next = timeline.future[0];
    if (!next) return;
    beforeEdit();
    setTimeline({
      past: [...timeline.past, tracks],
      tracks: next,
      future: timeline.future.slice(1),
    });
  };

  /** Change the highlighted track's speed (pitch is kept). The stretch runs in a worker. */
  const changeSpeed = async (speed: number) => {
    const target = tracks.find((t) => t.id === activeTrack);
    if (!target || speed === target.speed) return;
    speedJob.current?.abort();
    const job = (speedJob.current = new AbortController());
    setEditStatus("Changing speed… 0%");
    try {
      const buffer =
        Math.abs(speed - 1) < 0.001
          ? target.source
          : await speedBuffer(target.source, speed, {
              signal: job.signal,
              onProgress: (f) => setEditStatus(`Changing speed… ${percent(f)}`),
            });
      commit((list) =>
        list.map((t) => {
          if (t.id !== target.id) return t;
          // Carry the trim over: the same moments of the file stay kept.
          const scale = t.speed / speed;
          const start = Math.min(buffer.length - 1, Math.round(t.start * scale));
          const end =
            t.end === t.buffer.length
              ? buffer.length
              : Math.max(start + 1, Math.min(buffer.length, Math.round(t.end * scale)));
          return { ...t, buffer, speed, start, end };
        }),
      );
    } catch (err) {
      if (!isAbort(err)) setEditStatus("Speed change failed: " + message(err));
    }
  };

  /** Trim (yellow bars) or slide one track along the timeline. */
  const placeTrack = (id: number, placement: Placement) =>
    commit((list) => list.map((t) => (t.id === id ? { ...t, ...placement } : t)));

  const duplicateTrack = () =>
    commit((list) => {
      const index = list.findIndex((t) => t.id === activeTrack);
      const source = list[index];
      if (!source) return list;
      // The copy starts at the beginning of the timeline, ready to be trimmed or moved.
      const copy = {
        ...source,
        id: nextTrackId.current++,
        name: `${source.name} (copy)`,
        at: 0,
      };
      setActiveTrack(copy.id);
      return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
    });

  // Keyboard: undo / redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      const typing =
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement && el.type !== "range");
      if (typing) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── Load file — decode only, NO auto-cleaning ── */
  // "replace" starts a new project; "append" adds the file as another track to join.
  const loadFile = async (file: File, mode: "replace" | "append" = "replace") => {
    const load = ++loadRef.current;
    const setStatus = mode === "replace" ? setNoiseStatus : setEditStatus;
    setStatus("Decoding audio…");
    try {
      const buf = await player.context().decodeAudioData(await file.arrayBuffer());
      if (load !== loadRef.current) return;
      const track: Track = {
        id: nextTrackId.current++,
        name: file.name,
        source: buf,
        speed: 1,
        buffer: buf,
        start: 0,
        end: buf.length,
        at: 0,
      };
      setActiveTrack(track.id);
      if (mode === "append" && timelineRef.current.tracks.length > 0) {
        // An added file starts at the beginning of the timeline, on its own lane.
        commit((list) => [...list, track]);
      } else {
        // A fresh upload goes straight to the later stages as well.
        if (player.track === "edit") player.stop();
        setEditStatus("");
        startPipeline(buf, file.name);
        setTimeline({ past: [], tracks: [track], future: [] });
        setFileName(file.name);
      }
    } catch {
      if (load === loadRef.current) {
        setStatus("Could not decode that file. Try a standard .mp3 or .wav.");
      }
    }
  };

  /* ── Remove noise (Section 1) ── */
  const removeNoise = async () => {
    if (!original) return;
    noiseJob.current?.abort();
    const job = (noiseJob.current = new AbortController());
    setNoiseBusy(true);
    setNoiseStatus("Removing noise… 0%");
    try {
      const result = await renderCleaned(original, settings, {
        signal: job.signal,
        onProgress: (f) => setNoiseStatus(`Removing noise… ${percent(f)}`),
      });
      setCleaned(result);
      setNoiseStatus("Noise removed successfully.");
    } catch (err) {
      if (!isAbort(err)) setNoiseStatus("Noise removal failed: " + message(err));
    } finally {
      if (noiseJob.current === job) {
        noiseJob.current = null;
        setNoiseBusy(false);
      }
    }
  };

  /* ── Render augmentation (Section 2) — needed for the waveform and export only ── */
  const renderAugmentation = async (): Promise<AudioBuffer | null> => {
    if (!augSource) return null;
    if (augFresh && augmented) return augmented.buffer;
    augJob.current?.abort();
    const job = (augJob.current = new AbortController());
    const source = augSource;
    const used = settings;
    setAugBusy(true);
    setAugStatus("Preparing augmentation…");
    try {
      const audio = await pitchCache.prepare(source, used, {
        signal: job.signal,
        onProgress: (f) => setAugStatus(`Shifting pitch… ${percent(f)}`),
      });
      setAugStatus("Applying effects…");
      const buffer = await renderAugmented(audio, used);
      if (job.signal.aborted) return null;
      setAugmented({ buffer, source, key: augmentationKey(used) });
      return buffer;
    } finally {
      if (augJob.current === job) {
        augJob.current = null;
        setAugBusy(false);
      }
    }
  };

  const applyAugmentation = async () => {
    try {
      if (await renderAugmentation()) setAugStatus("Augmentation applied. Download it below.");
    } catch (err) {
      if (!isAbort(err)) setAugStatus("Augmentation failed: " + message(err));
    }
  };

  /* ── Download helper ── */
  const download = async (kind: "edited" | "cleaned" | "augmented") => {
    const setStatus =
      kind === "edited" ? setEditStatus : kind === "cleaned" ? setNoiseStatus : setAugStatus;
    const label = { edited: "Combined", cleaned: "Cleaned", augmented: "Augmented" }[kind];
    setExporting(kind);
    try {
      const buffer =
        kind === "edited" ? mix : kind === "cleaned" ? cleaned : await renderAugmentation();
      if (!buffer) return;
      setStatus("Encoding MP3… 0%");
      const blob = await encodeMp3(buffer, {
        onProgress: (f) => setStatus(`Encoding MP3… ${percent(f)}`),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName?.replace(/\.[^.]+$/, "") ?? "audio"}-${kind}.mp3`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`${label} MP3 download started.`);
    } catch (err) {
      if (!isAbort(err)) setStatus(`Download failed: ${message(err)}`);
    } finally {
      setExporting(null);
    }
  };

  const applyPreset = (name: string) => setSettings((s) => ({ ...s, ...PRESETS[name] }));

  const resetAugmentation = () =>
    setSettings((s) => {
      const next = { ...s };
      for (const k of AUGMENTATION_KEYS) next[k] = defaultSettings[k];
      return next;
    });

  const removeTrack = () => commit((list) => list.filter((t) => t.id !== activeTrack));

  return {
    // settings
    settings,
    set,
    applyPreset,
    resetAugmentation,
    // audio at each stage
    fileName,
    tracks,
    mix,
    original,
    cleaned,
    augmented,
    augSource,
    augFresh,
    liveAudio,
    selectedSource,
    setSelectedSource,
    /** True when the later stages already hold the timeline's current result. */
    sent: !mix || mix === original,
    // status
    editStatus,
    noiseStatus,
    augStatus,
    noiseBusy,
    augBusy,
    exporting,
    // transport
    transport,
    getPosition,
    toggle,
    seek,
    // timeline editing
    activeTrack,
    setActiveTrack,
    activeSpeed: tracks.find((t) => t.id === activeTrack)?.speed ?? 1,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    placeTrack,
    duplicateTrack,
    removeTrack,
    changeSpeed,
    undo,
    redo,
    sendToPipeline,
    // actions
    loadFile,
    removeNoise,
    applyAugmentation,
    download,
  };
}

export type StudioState = ReturnType<typeof useStudio>;
