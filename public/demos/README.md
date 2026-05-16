# Cached demos — required binaries

Each subfolder needs (before the hackathon):

- `input.png` — the real photo Role D shot of the object
- `transcription.txt` — already populated, simulated user voice
- `output.mp4` — the final pre-rendered repair video

The pre-generated MP4s are produced **once the pipeline is end-to-end**
(typically Saturday afternoon of the hackathon, per PRD §6 and §11).
Until then, the demo cards work but the player falls back to a public
sample MP4 (see `lib/mocks.ts → PLACEHOLDER_FINAL_MP4`).

Naming must match exactly because `lib/demos/<id>.ts` references them.
