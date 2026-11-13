# Audio Augment — User Guide

> **No account. No upload. No waiting.**
> Open a recording, trim it, clean it, shape it, export it.

---

## Contents

1. [How the studio is laid out](#1-how-the-studio-is-laid-out)
2. [Opening a recording](#2-opening-a-recording)
3. [Section 01 — Trim](#3-section-01--trim)
4. [Section 02 — Remove Noise](#4-section-02--remove-noise)
5. [Section 03 — Augment & Effects](#5-section-03--augment--effects)
6. [Playback](#6-playback)
7. [Downloading](#7-downloading)
8. [Typical workflows](#8-typical-workflows)
9. [Tips](#9-tips)

---

## 1. How the studio is laid out

Audio Augment runs entirely in your browser or as a desktop app. Everything is processed on your own device; your audio is never uploaded.

**Supported formats:** `.mp3` · `.wav`

The studio is one page with three sections, one below the other. Use any of them on their own, or all three in order:

| Section                  | What it is for                                              |
| ------------------------ | ----------------------------------------------------------- |
| **01 Trim**              | Trim, repeat, re-time and join clips on a timeline          |
| **02 Remove Noise**      | Take out background noise, hiss, breaths and harsh S sounds |
| **03 Augment & Effects** | Equaliser, voice, dynamics and space effects, heard live    |

Every section has its own play button and its own download button.

---

## 2. Opening a recording

The upload box is at the top of the page, above the three sections.

| Method          | How                                                 |
| --------------- | --------------------------------------------------- |
| **Choose**      | Click **Upload audio** and pick an `.mp3` or `.wav` |
| **Drag & drop** | Drop a file anywhere on the page                    |

Once a recording is loaded, the box shrinks to one row showing the file name and length. **Upload another** there starts over with a different file; to add a second file alongside the first, use **+ Add audio** in the Trim section instead.

---

## 3. Section 01 — Trim

A timeline: each audio file is a clip on its own lane under a shared time scale (a label every 10 seconds). What you hear and export is every clip at its position on that scale. A timeline longer than the screen scrolls sideways.

| Action                 | How                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trim**               | Drag the yellow bar at either end of a clip inward. Drag it back out to restore the audio. The exact time is shown while dragging.                                                     |
| **Move a clip**        | Drag the clip left or right in its lane. Its edges snap to the start of the timeline and to the edges of other clips, so clips can sit end to end without a gap.                       |
| **Add audio**          | **+ Add audio** in the toolbar, or drop a file. The new clip appears on its own lane starting at 0:00.                                                                                 |
| **Duplicate**          | Select a clip, then **Duplicate**. The copy appears on a new lane starting at 0:00; trim and move it as needed.                                                                        |
| **Change speed**       | Select a clip, then **Speed** and drag the slider (0.5× to 2×). The clip gets shorter or longer; its pitch stays the same.                                                             |
| **Right-click a clip** | Opens a menu for the exact moment under the pointer: **Split here** (cuts the clip in two; the right-hand part moves to its own lane), **Remove left part** and **Remove right part**. |
| **Remove a clip**      | Select it, then **Remove**.                                                                                                                                                            |
| **Undo / Redo**        | The arrows at the right of the toolbar, or `Ctrl+Z` / `Ctrl+Shift+Z`.                                                                                                                  |
| **Move the playhead**  | Click or drag on the time scale, or click empty lane space.                                                                                                                            |

**To cut a section out of the middle:** right-click where the section starts and choose **Split here**, then right-click the new clip where the section ends and choose **Remove left part**. Slide the second clip up against the first.

Gaps between clips are silence in the result, and clips that overlap in time are mixed together.

Editing the timeline does not change what the two sections below are working on. When the timeline is ready, click **Use in noise removal** to send its result to them; the button then reads **In noise removal**. Sending a new result clears an earlier noise removal, because it no longer matches the audio.

---

## 4. Section 02 — Remove Noise

| Slider        | What it does                                           | Default |
| ------------- | ------------------------------------------------------ | ------- |
| **Noise**     | Removes steady background noise (fans, room tone, hum) | 0.60    |
| **Hiss**      | Removes high-frequency hiss                            | 0.50    |
| **Breaths**   | Turns down breaths and quiet gaps between words        | 0.35    |
| **Sibilance** | Softens harsh `s` and `sh` sounds                      | 0.30    |

Set the sliders, then press **Remove noise**. A percentage shows progress. Two waveforms appear: **Before** and **After**.

Use the **Before / After** switch next to the play button to compare. Switching while playing carries on from the same moment.

Higher values remove more, but can thin the voice. Change a slider and press **Remove noise again** to retry.

---

## 5. Section 03 — Augment & Effects

**Source.** At the top right, choose what to work on. This is not switched for you:

| Source       | What it is                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Original** | The file exactly as you uploaded it                                                                        |
| **Cleaned**  | The result of Remove Noise (available after you run it)                                                    |
| **Trimmed**  | The Trim timeline as it is now (available once you have trimmed, moved, split, re-timed or added anything) |

**Live preview.** Press play under the waveform and move any control: the sound changes as you move it. Pitch and harmony take a moment to update after you let go.

### Presets

**Podcast**, **Educational**, **Gaming** and **Best** set a starting combination of controls. **Reset** returns every effect to its default. You can adjust anything after choosing a preset.

### Tone — 10-band equaliser

Ten faders from 31 Hz to 16 kHz, each ±12 dB. Drag a fader up to boost that band or down to cut it. Double-click a fader to return it to 0.

| Bands        | Affects                                 |
| ------------ | --------------------------------------- |
| 31 – 125 Hz  | Rumble, bass, body                      |
| 250 – 500 Hz | Warmth; too much sounds muddy or boxy   |
| 1 – 2 kHz    | Presence and intelligibility            |
| 4 – 8 kHz    | Clarity and bite; too much sounds harsh |
| 16 kHz       | Air                                     |

### Voice

| Control              | Range                | Effect                                                 |
| -------------------- | -------------------- | ------------------------------------------------------ |
| **Pitch**            | −12 to +12 semitones | Raises or lowers the voice without changing its length |
| **Harmony**          | 0 – 1                | Blends in a second, pitch-shifted copy of the voice    |
| **Harmony interval** | −10 to +10 semitones | How far the harmony sits from the main voice           |
| **Chorus**           | 0 – 1                | Adds a subtle doubled, shimmering quality              |

### Dynamics

| Control        | Range      | Effect                                                                           |
| -------------- | ---------- | -------------------------------------------------------------------------------- |
| **Compressor** | 0 – 1      | Evens out loud and quiet parts                                                   |
| **Warmth**     | 0 – 1      | Gentle saturation for a fuller tone                                              |
| **Volume**     | 10% – 200% | Final loudness. 100% leaves it unchanged; above 100% is louder, below is quieter |

### Space

| Control          | Range        | Effect                                        |
| ---------------- | ------------ | --------------------------------------------- |
| **Reverb**       | 0 – 1        | How much room sound is added                  |
| **Room size**    | 0.1 – 6 s    | How long the reverb rings                     |
| **Echo**         | 0 – 1        | How loud the echo is                          |
| **Echo time**    | 0.02 – 1.5 s | The gap between repeats                       |
| **Echo repeats** | 0 – 1        | How many times the echo repeats before fading |

---

## 6. Playback

Each section has a round play button with the current time beside it:

| Section           | Plays                                                   | Switch              |
| ----------------- | ------------------------------------------------------- | ------------------- |
| Trim              | The whole timeline; one playhead moves across all lanes | —                   |
| Remove Noise      | The audio before or after noise removal                 | **Before / After**  |
| Augment & Effects | The audio with your effects, live                       | **Dry / Augmented** |

Flipping a switch while that section is playing carries on from the same moment. Click any waveform to jump to that point.

---

## 7. Downloading

Each section has its own download button, which saves a 192 kbps MP3:

| Button                                           | File saved                                                   |
| ------------------------------------------------ | ------------------------------------------------------------ |
| **Download combined audio** (Trim)               | `<name>-edited.mp3` — the timeline as arranged               |
| **Download cleaned audio** (Remove Noise)        | `<name>-cleaned.mp3`                                         |
| **Download augmented audio** (Augment & Effects) | `<name>-augmented.mp3` — always matches the current controls |

Reverb and echo add a short tail to the end of the file so they can ring out fully.

---

## 8. Typical workflows

### Podcast or voice-over cleanup

1. Open the recording.
2. **Trim:** drag the yellow bars to cut dead air from the start and end, then **Use in noise removal**.
3. **Remove Noise:** press **Remove noise**, compare Before / After.
4. **Augment & Effects:** set the source to **Cleaned**, choose **Podcast**, press play and adjust.
5. **Download augmented audio**.

### Quick trim only

1. Open the recording.
2. Trim it on the timeline.
3. **Download combined audio**.

### Join two recordings

1. Open the first recording, then **+ Add audio** for the second.
2. Drag the second clip right until its start snaps onto the end of the first.
3. **Download combined audio**, or **Use in noise removal** to clean and shape the result.

### Speed up a slow section

1. **Duplicate** the clip twice so there are three copies.
2. Trim them to the part before, the slow section, and the part after.
3. Select the middle clip and raise **Speed**.
4. Slide the clips together end to end.

---

## 9. Tips

- **Compare often.** The Before / After and Dry / Augmented switches are the fastest way to tell whether a change helped.
- **Less is usually more.** Strong noise removal, heavy compression and big EQ boosts all make a voice sound processed.
- **Clean before you augment.** Effects such as compression make background noise louder, so remove noise first and set the source to **Cleaned**.
- **Long files need memory.** Very long recordings may be too much for some phones; a computer works best for those.
- **Watch the level.** Several boosts stacked together can make the export distort. If it sounds crunchy, lower **Volume**.
