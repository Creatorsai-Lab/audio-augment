# Audio Augment Studio
_by Creators AI Lab_

A very simple and fast audio editing studio that works with great precision. It has been designed and developed for content creators to edit their audio at their fingertips without any hassle.

`no accounts`, `no internet required`, `just kickstart`

### Audio Augment Interface Screenshot:

![Audio Augment Interface](public/audio_augment_interface_screenshot.png)

## What it does

Drop an MP3 or WAV and professional cleaned and edite audio. It provide **_two_** independent processing stages:

**Stage 1: Noise Removal**
- Background noise reduction
- Hiss reduction
- Breath reduction
- Sibilance (de-ess) reduction

**Stage 2: Audio Augmentation**
- 3-band EQ (Low / Mid / High)
- Pitch shift
- Harmonizer
- Compressor
- Saturation
- Reverb + room size
- Delay + feedback
- Chorus
- Resonance

Built-in presets: **Podcast**, **Radio**, **Cinematic**, **Robot**

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
**Styling** — Tailwind CSS v4


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