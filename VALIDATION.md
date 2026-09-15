# YuE2 Local Integration Validation Report

## v1.3.0 release validation (2026-09-13)

- VRAM budget regression: a real browser captured eight submission paths (create, plan, exact restore, edit and re-render, import ABC, melody remake, and reference cover) and verified cross-page synchronization, refresh persistence, rejection of invalid values, and the 390 px layout. Backend tests cover the propagation of 8 / 16.25 / 32 GiB from the enqueue record through to the pipeline construction parameters; this does not claim that generation passes on a physical low-VRAM GPU.
- High-register investigation: the user reported that breathy passages, high notes, and natural long songs all produced broken RVC output on a male voice. Keeping the original key and switching to FP32 did not fix the high notes; with retrieval disabled and the octave explicitly lowered, the user reported on all three items that "lowering the octave made the voice sound normal". That feedback covers only this parameter-adjusted version — the original-key failure samples are retained, and other items are not treated as human-verified on this basis.
- Pitch control regression: in one real-GPU comparison job, Seed-VC stayed at 0 semitones while RVC used -12, and both subprocesses' result records matched those settings; backfilling register statistics for the two already-completed 100-epoch voices reused the original weights, indexes, and voice IDs. UI validation covered independent parameter submission, current/history result labelling, and the 390 px layout. Register statistics come from the continuous F0 of the training data, not from a model capability boundary.

Target machine: RTX 5090 Laptop 24GB, Windows, unified CPython 3.12.10, Torch 2.10.0+cu128, NumPy 1.26.4, Transformers 4.57.6. The validation below is complete for the release candidate. A real complete package containing the runtime and all seven base model groups was built and cold-start validated; that package stays local, and GitHub distributes only the code and the auto-update assets.

- Clean unified environment: 120 locked dependencies plus browser/FFmpeg probes; real-GPU song generation, Seed-VC, transcription, and rendering passed. All 111 automated tests passed on the release source, the JavaScript and PowerShell syntax checks passed, and the unified environment re-verified against the release dependency manifest.
- Local GGUF: lyrics, style, and a valid 8-bar ABC plus cross-page sending in a real browser passed; a second sample ABC was invalid, its text was preserved, and the score-validation requirements were not relaxed.
- RVC: real-GPU training cancellation/resume and inference remixing; CPU v1/48k and v2/40k training/resume; repeated completion registration reusing the same voice; and continued training after a directory migration all passed. These few-epoch samples validate the pipeline, not production voice quality.
- Formal training on public data: CSD dry vocals totalling 20 min 41 s across 14 files completed 100 epochs with RVC v2 / 48k / RMVPE at an effective batch size of 6, taking 2777.30 seconds (46 min 17 s), and produced an inference model, a matching index, and preview samples that passed registration validation. Test songs were held out by song ID, with both keys excluded at the same time; the test weights and recordings are not distributed with the release package. Audio-quality comparisons are recorded separately.
- Seed/RVC same-song comparison: both a real 12-second input and a 180-second input built by repeated concatenation produced both 48 kHz audio paths; the separation cache was shared; and the SHA256 of the recovered result matched the original. Repeatedly concatenated long audio is not a natural-long-song quality test.
- The 180-second conversion passed with a 4 GiB Torch allocator cap in every inference subprocess, with a Seed peak allocated of 3.152 GiB. That cap does not cover every CUDA allocation or WDDM, and it does not show that the workflow fits on a physical 4/6 GB GPU or that whole-song YuE2 generation does.
- Real training OOM: under a 3 GiB Torch allocator limit, two CUDA OOMs were actually triggered, the batch size stepped 6→3→1, training resumed from the epoch 3 checkpoint and completed epoch 4, and the voice registered successfully. Total time was 111.97 seconds; this is an allocator-limit test on an RTX 5090, not a test on a physical 3 GB GPU.
- Complete package: dependency, browser/FFmpeg, and seven-model-group checks all ran through the single `runtime/python.exe` inside the package; the native EXE cold-started on the separate port 8198, and both the page and the ComfyUI client connected. The Python search path points only at that package.
- Portable runtime libraries: added Microsoft-signed, hash-verified VC++ x64 DLLs whose versions match the DLLs Python already carries. The `MSVCP140.dll` actually loaded by a new process comes from inside the package, and the unified component, browser, and FFmpeg checks passed; both installation and complete-package builds verify these files, and the updater also detects version changes in them. This was not tested on a fresh Windows virtual machine.
- Browser: upload preview, current-page/history dual results, audio retained on failure, download/export, direct voice conversion, training preflight/progress, and migration all passed; display-only dual-path audio fixtures are recorded separately from the real dual-path GPU validation.
- Updates: migration from an older version to the new unified environment, rollback after an injected new-service startup failure, and a models-only update reusing the environment all passed.
- FlashAttention 2.8.3: the community wheel and the locally compiled SM120 wheel each passed 12 GPU operator checks; current YuE2 does not use standalone flash_attn, and no whole-song speedup is claimed.

This page records functional and environment acceptance. Comparisons of public material across singers, registers, breathy passages, and natural long songs, as well as speaker similarity, lyric recognition, DNSMOS, and the status of human blind listening, are in the release asset [RVC_EVALUATION.md](https://github.com/T8mars/Comfyui-YuE2-T8/releases/download/v1.3.0/RVC_EVALUATION.md). Test recordings and test voices are not distributed with the release package, and signal metrics are not written up as subjective quality rankings or as promises about low-VRAM hardware.

## Historical validation records

The following preserves the results and delivery status of older versions in the environment of that time; it does not describe the current state.

# YuE2 Music T8 validation

Validation date: 2026-09-11. Host: Windows, NVIDIA GeForce RTX 5090 Laptop GPU (24 GB). Historical results below are version-specific.

## 1.1.5 long-song memory and result visibility validation

- Replayed the original failing generation input without shortening the 280.999-second source transcription, lyrics, style or seed. The complete generation, separation, 30-step reference conversion and remix produced a 300.399-second 48 kHz stereo FLAC in 759.93 seconds. Generated duration may differ from the source. BF16, CFG and solver steps were retained; FP8 was not used.
- Generation peak active PyTorch allocation was 8.513 GiB; reference conversion peaked at 4.030 GiB in its separate worker. NAR offload moved 4.034 GiB of model weights to CPU and reduced active GPU allocation from 7.799 to 3.764 GiB at that boundary. Actual query tiles were at most 256 rows, with bounded math and cuDNN execution and zero OOM retries.
- Three consecutive workflows used 30/120/30-second source excerpts and produced 29.879/103.039/30.639-second covers in 120.92/282.99/149.75 seconds, excluding queue and transcription time. Their generation peaks were 7.795/7.899/7.796 GiB. All child processes began with the same 22.495 GiB available; no task-to-task accumulation was observed. Final idle GPU usage was 404 MiB. These are observations on this host, not guarantees under arbitrary external GPU load.
- A separate real workflow was cancelled at NAR step 2/32, then resumed from semantic checkpoints and completed. Every semantic checkpoint file retained its SHA256. Atomic checkpoint tests also cover interrupted writes and decoding failures that resume latents without repeating sampling.
- A real browser submitted the reference-cover flow, refreshed and closed while it ran; the backend still completed. The final player appeared above the current cover form, playback advanced, its downloaded FLAC matched the backend file hash, and a reload restored the same page and result. Mock API browser checks separately cover failure/log/recovery controls, tab switching, polling without replacing the player, and 390 px layout.
- CUDA BF16 regressions compare 128/256/512 query rows, and attention tests cover GQA, full visible keys, absolute causal masks, partial final blocks, bounded OOM retry and unavailable fused kernels. Saved ComfyUI examples now explicitly enable AR offload and use automatic attention with 256-row tiles.
- Runtime, model weights, original recordings, generated audio and private job logs are excluded from the published source and code ZIP. Public test summaries report measurements without bundling user media.
- The clean release checkout ran 41 automated tests: 39 passed and two skipped because model files and the voice runtime's SciPy dependency are not included in the code checkout. JavaScript syntax and Git whitespace checks passed. The development installation separately passed the model-presence check and installer preservation regression.

Validation limits: the separate existing 1.1.4 desktop service has not been replaced or restarted, and the updated nodes have not yet been reloaded in that running ComfyUI installation. These local installation checks remain separate from the source release. Audio finiteness, level and whole-second silence checks passed, but subjective listening and voice-similarity review have not been performed. The release does not claim those checks.

## 1.1.4 configurable model directory validation

- Added one page-integrated model setting shared by the WebUI, service workers, ComfyUI nodes, model verifiers, score renderer, and runtime installer. The setting stores only the chosen directory in `settings.json`; the default remains the bundle-local `models` folder.
- A live 1.1.4 service switched from `E:\\yue2\\models` to the separate installed model folder `E:\\YuE2-T8-Local-v1.1.3-Windows-NVIDIA-20260911\\models`. Health reported generation, transcription, score rendering, and reference-voice conversion ready from the external path, then reported all four ready again after resetting to the default.
- Release tests passed 25 checks with two expected environment skips. JavaScript syntax, Python compilation, PowerShell parsing, Git whitespace validation, and live settings API reads/writes passed.
- Browser validation at 1280 px confirmed the collapsed setting shows the active path, the expanded panel exposes the exact six-subdirectory layout and Hugging Face link, and the page has no horizontal overflow or console errors.

## 1.1.3 standalone source and diagnostics validation

- Restored all 14 tracked YuE2 0.1.6 inference files under `vendor/yue2`; live health reports generation, transcription, score rendering, and reference-voice conversion ready.
- Replayed the exact request that failed in 1.1.2. Job `20260911-135440-d0f97332` completed a 46.1987-second song with seed 831001 and no ABC or semantic truncation.
- Live 30-step Seed-VC job `20260911-135831-3d37d331` converted that song with the reference-voice path, completing Demucs separation, voice conversion, and 48 kHz stereo remix for the full 46.199 seconds.
- The WebUI history view exposed “View task log”, “Open log directory”, and “Open output directory”; expanding the original failed job displayed its full traceback inside the page.
- Integration checks passed all 25 tests, including worker error extraction and all eight localized workflow JSON files across the four workflow types.

## 1.1.2 multi-installation launcher validation

- When a different idle YuE2 installation owns port 8189, the launcher verifies its state file, service command line, and exact Python executable before switching to the requested installation.
- Running and queued jobs prevent automatic switching and remain untouched; the launcher reports the protected job and queue size.

## 1.1.1 launcher validation

- The native Windows launcher and compatibility batch launcher both start or reuse the local service and leave a visible success or failure result.
- Automated no-browser/no-pause checks verify exit codes without changing the normal double-click behavior.
- A missing-runtime fixture returns a nonzero exit code with an actionable Chinese error instead of flashing and disappearing.

## 1.1.0 reference-voice validation

- Release source checks ran 24 tests: 23 passed and the model-installation check was skipped as expected; the installed local source under the voice runtime passed all 24 checks.
- All 24 Seed-VC/Demucs bundle files passed the pinned size and SHA-256 check in `VOICE_MODEL_MANIFEST.json` (2,574,547,539 bytes total).
- Live service job `20260911-045414-30d09856` completed with 30 diffusion steps. Demucs separated the source, Seed-VC converted the vocal, and the worker produced a finite 12.0-second, 48 kHz stereo FLAC together with separated vocal, converted vocal, accompaniment, result JSON, and artifact manifest.
- ComfyUI prompt `4a593e72-f797-4b94-adf7-630d7a87d925` loaded two real AUDIO inputs and executed `YuE2ReferenceVoiceCover` at four diffusion steps. ComfyUI reported `success` with no node validation errors and PreviewAudio produced a 12.0-second, 48 kHz stereo FLAC (peak 0.98001, RMS 0.24306, all samples finite).
- ComfyUI 0.33.0 registered the new node after reinstall/restart. The local service recorded the linked job `20260911-050433-ef9b2cd5` with source `comfyui` and terminal status `complete`.
- The WebUI was rendered at 1508×1000. The page has no horizontal overflow; reference-voice controls remain inside the document flow and use the same pink, blue, white, and slate palette as the rest of the integration.

## Release checks

- Full song job `20260910-235141-24a06204`: default planning, semantic generation, synthesis, and tiled VAE decode completed. Output is a finite 48 kHz stereo FLAC, 39.9187 seconds; ABC and semantic outputs were not truncated.
- Transcription job `20260910-235403-260b286c`: the generated song was processed by SheetSage2 + MERT. ABC, MIDI, and a PNG score were produced with no warnings or renderer error.
- Staged jobs `20260910-235554-83264570`, `20260910-235754-71f82623`, and `20260910-235911-f3d46499`: semantic generation produced 2,214 tokens, synthesis produced 2,214 latent frames, and independent VAE decode produced a finite 48 kHz stereo FLAC of 88.5587 seconds.
- The semantic, latent, and decode manifests were re-read after completion. Every recorded file size and SHA-256 matched. The manifests identify the pinned YuE2-3B and YuE2-Vae source revisions and link each downstream stage to the preceding manifest digest.
- A live retention cleanup deleted one expired terminal job, one expired upload, and one expired log while preserving a sentinel in `exports`; the cleanup report contained no errors.

All six validation jobs were exported before cleanup. Local paths and generated media are machine artifacts and are intentionally excluded from the Registry ZIP.

## 1.0.7 page-integrated progress audit

- The live progress UI is part of the document flow directly below navigation and before the active workspace. No fixed task overlay or duplicate creation status card remains.
- The section appears only while a task is running or queued, shows the current stage and ordered queue, and keeps task-specific cancellation and history access in the same compact region.
- The creator credit and GitHub, Hugging Face model, Bilibili, and YouTube links are available in the page header and remain readable in the mobile layout.

## 1.0.6 task-center regression audit

- Release tests: 21 passed and one expected model-installation skip. Local integration tests: all 22 passed with the installed models present.
- Live duplicate submissions with different client request IDs returned the same active job `20260911-031109-38b46885` and `deduplicated: true`; only one worker entered the scheduler.
- A live task-center state showed environment self-check `20260911-031144-f1dae5c3` as the running WebUI task, followed by ComfyUI decode `20260911-031144-de7ca40f` in queue position 1 and API transcription `20260911-031144-63ed7d80` in position 2.
- The in-app browser accessibility tree exposed the task-center name, current stage, discrete task steps, source, elapsed time, both queue positions, summaries, short task IDs, and separate cancellation buttons.
- The local service and installed ComfyUI client both report 1.0.6. JavaScript syntax, Python compilation, Git whitespace validation, responsive task-center CSS, focus styles, and reduced-motion behavior passed inspection.

## 1.0.5 regression audit

- Release tests: 19 passed and one expected model-installation skip. Local integration tests: 20 passed with all four installed model layouts present.
- Live HTTP probes rejected non-loopback Host and cross-origin requests with HTTP 403 without creating a job. Health reported generation, transcription, FFmpeg, and score-renderer capabilities ready.
- Transcription job `20260911-010022-7642e2ce` processed a real 12-second FLAC with SheetSage2 + MERT, emitted ABC, MIDI, and PNG, and wrote a verified 27-file transcription manifest containing the source-audio SHA-256 and both pinned model revisions.
- Two simultaneous exports of that job completed to distinct directories, and no temporary or partial export remained.
- Doctor job `20260911-010118-2383f99b` passed CUDA 12.8/BF16 checks and re-verified all four installed model sizes and SHA-256 hashes.
- A 1.0.4 latent chain was re-verified with the 1.0.5 canonical provenance comparison. A duplicate service process was rejected by the per-installation lock before job recovery; the original PID and `server.json` remained unchanged.
- The local WebUI was rendered at 1508×1000 after applying the light pink, blue, and slate palette from the T8star IndexTTS 2.5 integration. Health state, typography, cards, inputs, navigation, and responsive layout rendered without missing assets.
