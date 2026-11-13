# Audio Augment Studio
_by Creators AI Lab_

A very simple and fast audio editing studio that works with great precision. It has been designed and developed for content creators to edit their audio at their fingertips without any hassle.

`no accounts`, `no internet required`, `just kickstart`

### Audio Augment Interface Screenshot:

![Audio Augment Interface](public/audio_augment_studio.png)

## What it does

Drop an MP3 or WAV and professional cleaned and edite audio. It has **_three_** stages:

**01 Trim**
- Trim, move and join clips on a timeline
- Duplicate a clip to repeat a part
- Change speed (0.5× to 2×) without changing pitch

**02 Remove Noise**
- Background noise reduction
- Hiss reduction
- Breath reduction
- Sibilance (de-ess) reduction

**03 Augment & Effects** (heard live as you move the controls)
- 10-band equaliser
- Pitch shift and harmonizer
- Compressor and saturation
- Reverb + room size
- Echo + repeats
- Chorus

Built-in presets: **Podcast**, **Educational**, **Gaming**, **Best**

> Export as MP3 at any stage, **cleaned** audio or **augmented** audio

## Download

Grab the latest Windows installer from [Releases](../../releases).

1. Download `audio-augment-x.x.x-x64.nsis.7z`
2. Extract and run the installer
3. Launch **Audio Augment** from the desktop shortcut

> Mac and Linux builds are not yet available.

## Architecture

**Web** — static React app built with Vite (landing page + `/editor`), deployed on Vercel
**Desktop** — Electron shell loading a pre-built static bundle via `file://`
**Audio engine** — Web Audio API plus a Web Worker for the heavy DSP, no server calls
**MP3 encoding** — lamejs, runs client-side in the worker
**Styling** — Tailwind CSS v4, fonts bundled locally (no external requests)


---

## User Guide

Full usage documentation — every control explained, workflows, and tips:
**[→ Read the User Guide](docs/user_guide.md)**

---

## Run locally (desktop app)

**Requirements:** Node.js 20+, npm
first fork the repository
```bash
# your forked repo
git clone https://github.com/your-username/audio-augment.git
cd audio-augment
npm install

# start the web studio (opens /editor/)
npm run dev

# start desktop app
npm run desktop
```

```bash
# build locally
npm run desktop:package
```