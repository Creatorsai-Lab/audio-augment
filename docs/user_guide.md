# Audio Augment — User Guide

> **No account. No internet. No waiting.**
> Drop a file, clean it, shape it, download it.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Uploading Audio](#2-uploading-audio)
3. [Stage 1 — Noise Removal](#3-stage-1--noise-removal)
4. [Stage 2 — Audio Augmentation](#4-stage-2--audio-augmentation)
   - [Presets](#presets)
   - [Equalizer Panel](#equalizer-panel)
   - [Voice Panel](#voice-panel)
   - [Dynamics & Colour Panel](#dynamics--colour-panel)
   - [Reverb Panel](#reverb-panel)
   - [Echo / Delay Panel](#echo--delay-panel)
5. [Playback & Waveforms](#5-playback--waveforms)
6. [Downloading Your Audio](#6-downloading-your-audio)
7. [Typical Workflows](#7-typical-workflows)
8. [Tips & Best Practices](#8-tips--best-practices)

---

## 1. Getting Started

Audio Augment runs entirely in your browser or as a desktop app — everything happens locally on your machine. Nothing is uploaded to any server.

**Supported formats:** `.mp3` · `.wav`

**Web:** open the app URL in any modern browser.
**Desktop:** launch *Audio Augment* from the Start Menu or desktop shortcut.

---

## 2. Uploading Audio

You have two ways to load a file:

| Method | How |
|---|---|
| **Upload button** | Click **+ Upload Audio** and pick a `.mp3` or `.wav` file from your device |
| **Drag & drop** | Drag a file anywhere onto the noise removal section and release |

Once loaded, the status bar shows the **filename**, **duration**, **sample rate** and **channel count** — confirming the file decoded successfully.

> ℹ️ You can load a new file at any time. It replaces the current session and clears all previous results.

---

## 3. Stage 1 — Noise Removal

The first stage analyses and removes unwanted background noise from the raw audio. It runs entirely offline using spectral processing — no AI cloud service.

### Controls

| Knob | What it does | Default |
|---|---|---|
| **Noise reduction** | Reduces broadband background noise — fans, room hum, recording floor | 0.6 |
| **Hissing reduction** | Attenuates high-frequency tape hiss and mic self-noise | 0.5 |
| **Breath reduction** | Suppresses breath sounds and mouth noise between words | 0.35 |
| **Sibilance reduction** | De-esses harsh `s` and `sh` sounds in speech | 0.3 |

All knobs run from **0** (off) to **1** (maximum). Turn up only what you need — over-processing can make voices sound thin or unnatural.

### Running noise removal

1. Set the four knobs to your desired levels.
2. Click **Remove Noise**.
3. The status bar shows progress (`Analysing noise profile → Done`).
4. The **Cleaned Audio** waveform appears on the right.

You can click **▶ Play original** and **▶ Play cleaned** to compare before and after. If you're happy, click **⬇ Download cleaned audio** to export immediately — Stage 2 is optional.

---

## 4. Stage 2 — Audio Augmentation

The second stage applies creative effects to your audio. You can augment the **original** (unprocessed) audio or the **cleaned** audio from Stage 1 — choose using the **Source** toggle at the top of the section.

After adjusting any knobs, click **Apply Augmentation** to render the result. The process runs offline using the Web Audio API.

---

### Presets

Presets apply a curated combination of settings across all panels as a starting point. You can fine-tune any knob after applying a preset.

| Preset | Character |
|---|---|
| 🎙 **Podcast** | Light compression, a gentle low and high boost, and modest de-essing. Warm and clear voice for talk shows and interviews. |
| 📻 **Radio** | Heavier compression and saturation with a scooped mid. Punchy, broadcast-ready sound. |
| 🎬 **Cinematic** | Subtle reverb, a low shelf boost, slight pitch-down, and a touch of saturation. Atmospheric and dramatic. |
| 🤖 **Robot** | Pitch shifted down, high harmonizer interval, strong resonance, and chorus. A classic robotic voice effect. |

Click **Reset** to return all augmentation knobs to their default values without touching the noise removal settings.

---

### Equalizer Panel

Shapes the tonal balance of the audio using three frequency bands and a resonance control.

| Knob | Frequency | Range | Effect |
|---|---|---|---|
| **Low shelf** | ≤ 200 Hz | −18 dB to +18 dB | Boost for warmth and body; cut to reduce muddiness |
| **Mid** | 1200 Hz | −18 dB to +18 dB | Boost for presence; cut to reduce nasality or harshness |
| **High shelf** | ≥ 5000 Hz | −18 dB to +18 dB | Boost for air and clarity; cut to soften sibilance |
| **Resonance** | 900 Hz | −1 to +1 | Narrow peak or dip adding formant colour to a voice |

> **Tip:** Start EQ changes small — ±3 dB is often enough. Large boosts amplify noise too.

---

### Voice Panel

Transforms the pitch and character of the voice.

| Knob | Range | Effect |
|---|---|---|
| **Pitch** | −12 to +12 semitones | Shifts the entire pitch up (positive) or down (negative) in semitone steps. +12 is an octave up, −12 is an octave down. |
| **Harmonizer mix** | 0 – 1 | Blends in a pitch-shifted copy of the signal alongside the original, creating a harmony effect |
| **Harmony interval** | −12 to +12 semitones | Sets the interval of the harmony voice (e.g. +7 for a perfect fifth above, +5 for a fourth) |
| **Chorus** | 0 – 1 | Adds a slightly delayed and modulated copy of the signal for a wide, shimmering texture |

---

### Dynamics & Colour Panel

Controls the energy and harmonic richness of the signal.

| Knob | Range | Effect |
|---|---|---|
| **Compressor** | 0 – 1 | Reduces the dynamic range — loud parts get quieter, quiet parts become more audible. Useful for consistent voice levels. |
| **Saturation** | 0 – 1 | Adds gentle harmonic distortion inspired by analogue tape and tube equipment. Adds warmth and edge without clipping. |
| **Output gain** | −12 to +12 dB | Sets the final output level of the augmented signal before rendering. Use this to match loudness between versions. |

---

### Reverb Panel

Adds a sense of acoustic space to the signal.

| Knob | Range | Effect |
|---|---|---|
| **Mix** | 0 – 1 | Wet/dry blend. 0 = no reverb, 1 = fully wet |
| **Room size** | 0.2 – 6 seconds | Controls the decay length of the reverb tail. Shorter values feel like a small room; longer values feel like a large hall or cathedral. |

> **Tip:** For voice, keep the mix low (0.1 – 0.25) and room size under 2 s to retain clarity.

---

### Echo / Delay Panel

Adds a rhythmic echo effect with feedback.

| Knob | Range | Effect |
|---|---|---|
| **Mix** | 0 – 1 | How much echo is blended into the signal |
| **Time** | 0.02 – 1.5 seconds | The gap between the original signal and each echo repeat |
| **Feedback** | 0 – 0.85 | How much of each echo feeds back into itself. Higher values create longer, more prominent echo trails. Kept below 0.85 to prevent runaway feedback. |

---

## 5. Playback & Waveforms

Three waveform canvases update as you work:

| Canvas | Shows |
|---|---|
| **Original Audio Preview** | The raw uploaded file |
| **Cleaned Audio Preview** | After noise removal is applied |
| **Augmented Audio Preview** | After augmentation is applied |

Each stage has a **▶ Play** button to listen. Click again or press **⏹ Stop** to stop playback. Playback uses your device's default audio output — make sure your volume is up.

---

## 6. Downloading Your Audio

You can download at either stage — you don't have to use both.

| Button | What you get |
|---|---|
| **⬇ Download cleaned audio** | The noise-removed audio, exported as `filename-cleaned.mp3` |
| **⬇ Download augmented audio** | The fully augmented audio, exported as `filename-augmented.mp3` |

All encoding happens client-side using **lamejs**. Files are saved directly to your downloads folder. No data leaves your device.

---

## 7. Typical Workflows

### Podcast / voice-over cleanup

1. Upload your recording.
2. Set **Noise reduction** 0.5–0.7, **Hissing** 0.4–0.6, **Breath** 0.3–0.5.
3. Click **Remove Noise** → listen to the cleaned preview.
4. Switch to Stage 2, set Source to **Cleaned audio**.
5. Click the **Podcast** preset.
6. Adjust **Low shelf** (+1–3 dB) for warmth if needed.
7. Click **Apply Augmentation** → **⬇ Download augmented audio**.

---

### Cinematic voice-over

1. Upload a clean voice recording (or use a lightly noise-removed one).
2. In Stage 2, click the **Cinematic** preset.
3. Increase **Reverb mix** to 0.2–0.3, **Room size** to 2.5–4 s.
4. Lower **Pitch** by −1 to −3 semitones for depth.
5. Click **Apply Augmentation** → download.

---

### Creative robot / effect voice

1. Upload any voice recording.
2. Click the **Robot** preset.
3. Increase **Resonance** for a more metallic quality.
4. Adjust **Harmonizer interval** — try +12 (octave) for a deeper robot effect.
5. Click **Apply Augmentation** → download.

---

### Quick noise removal only

1. Upload your file.
2. Set noise removal knobs — the defaults are good for most microphone recordings.
3. Click **Remove Noise**.
4. Click **⬇ Download cleaned audio**. Done.

---

## 8. Tips & Best Practices

**Start with noise removal, then augment.**
Augmentation effects — especially reverb and saturation — make noise more audible, so always clean first.

**Less is more with the knobs.**
Every effect adds processing. Using many knobs at high values simultaneously tends to produce unnatural results. Build up gradually.

**Use presets as a starting point.**
Presets are calibrated for typical scenarios but are not final. Apply a preset and then adjust one or two knobs to taste.

**Compare with the original.**
Play the original and the processed version back-to-back before downloading. The playback buttons are there for exactly this.

**Download both versions.**
It costs nothing to download both the cleaned and augmented versions. You can decide later which one to use.

**Feedback controls and reverb tails affect file length.**
Delay feedback and long reverb room sizes add silence to the end of the file to capture the full tail. This is intentional — the exported file includes the complete decay.

---

*Audio Augment is made by [Creators AI Lab](https://github.com/your-username/audio-augment). MIT licensed.*
