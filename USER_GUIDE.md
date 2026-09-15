# YuE2 Local Bundle User Guide

## Installation and startup

1. The complete v1.3.0 bundle already includes the music models, the RVC base model, and a shared Python 3.12.10 runtime, and the local GGUF backend lives in that same environment (GGUF weights are an optional download). Just double-click `YuE2-T8.exe` and the browser opens `http://127.0.0.1:8189`. If the system blocks the EXE, you can also double-click the compatibility entry point `start_local_studio.bat`.
2. On first use, click "Run full self-check again" in the top-right corner. The service only listens on the local loopback address.
3. `install_environment.bat` repairs, reinstalls, or downloads missing components; a normal first launch does not need it.

The launcher window shows the environment check, the service status, the local address, or the reason for failure, and waits for a keypress before closing. The service keeps running in the background after the web page and the launcher window are closed. To stop it, right-click `stop_local_service.ps1` and run it with PowerShell, or execute it from a PowerShell prompt. Stopping the service also terminates the currently running inference worker.

Only one YuE2 installation on a machine can use port 8189. When the launcher finds another YuE2 instance that is idle, it checks the service process and switches to the current bundle automatically; if the other instance is generating or still has queued jobs, the launcher leaves those jobs alone and reports their job numbers, so you can restart it once they finish.

## Automatic page updates

v1.2.2 and later check GitHub for the stable release after the page is opened; the entry point is at the bottom of the "Runtime environment ready" card in the top right of the home page. When a new version is shown, click "Update to vX"; once the download and the SHA256 check finish, the local service exits, replaces the code, and restarts on the same port, after which the page refreshes automatically.

An update preserves models, local GGUF models, works, uploads, exports, logs, caches, assistant drafts, and settings. If jobs are running or queued, wait for them to finish first. When upgrading to the unified environment, the new environment and any missing base models are downloaded and verified first, then the old service exits and switches over; if startup fails, the old code and runtime are restored, and the old environment is only cleaned up after startup succeeds. Code backups live in `logs/backups`, so leave temporary space for the download and for the old and new environments to coexist.

v1.2.0 / v1.2.1 have no such page entry point. Unpack the new full version into a new directory, then point it at your existing model path; keep the old directory and its works for now. Do not just overwrite the v1.3.0 code into the old multi-environment directory.

## VRAM budget settings

Expand "Advanced settings" on the Create page to edit "VRAM budget GiB"; the Score page and the Melody remake page have the same setting. Values you enter are synced across all three pages and kept in the current browser. Plan generation, exact recovery, render-after-edit, and the song generation inside a reference-voice cover all use the current budget, instead of a fixed 23.5 or 24 GiB.

The budget must be greater than 2 GiB; there is no 12–24 GiB input range restriction. Set it according to the VRAM your GPU currently has available; it includes a 2 GiB reserve. Lowering the budget does not shrink the models, and it does not guarantee that a low-VRAM GPU can complete a generation. Direct voice conversion of an existing song and RVC training use their own resource management and are not governed by this YuE2 song-generation budget.

## Model location

Model repository: https://huggingface.co/t8star/YuE2-Comfy

The bundle uses `models` in its root directory by default. To keep the models on another drive, start the studio and expand "Model location and installation notes" on the page, enter the absolute path, and click "Save and check"; you can also double-click `set_model_path.bat` first. The WebUI, the ComfyUI nodes, model self-check, and repair installation all read the same `settings.json`.

The path you choose is itself the model root directory and must directly contain:

```text
<model_root>\
  MODEL_MANIFEST.json
  VOICE_MODEL_MANIFEST.json
  YuE2-3B\
  YuE2-Vae\
  SheetSage2\
  MERT-v2-FullSong\
  Seed-VC\
  Demucs\
  RVC\
```

Do not put weights in ComfyUI's `models/checkpoints`. If the models have not been downloaded yet, you can set the path first and then run `install_environment.bat`; the installer downloads from the Hugging Face repository above into the current path. The model path can only be changed when no jobs are running or queued.

## AI creation assistant

The "AI creation assistant" in the standalone bundle can write lyrics, style, and ABC first, then send the selected content to "Create", "Score plan", or "Melody remake / reference voice". This section adds no ComfyUI nodes.

First choose a channel: Zhenzhen Budget Shop, Zhenzhen's AI Workshop, an OpenAI-compatible endpoint, or local GGUF. The Budget Shop default model is `bytedance/doubao-seed-evolving` and the AI Workshop default model is `gemini-3.5-flash`; switching channels fills in the matching default automatically. The model field can be picked from the drop-down or typed in as a full ID; "Get model LIST" queries that channel's standard OpenAI `/models` endpoint and, on success, adds the models available to the account to the drop-down. Some compatible services do not offer that endpoint; when it fails, the default model and manual entry still work.

After entering your key, save the settings; by default it is valid only for this service session. The key is stored encrypted for the current Windows user only if you tick "Remember". Jobs and exported files keep only a credential reference. After the service stops, any key that was not remembered has to be entered again. The page provides the matching sign-up entries: [Get a Zhenzhen Budget Shop API Key](https://api.seedance.nz/sign-up?aff=5f4w); [Get a Zhenzhen AI Workshop API Key](https://ai.t8star.org/register?aff=dP7j). The OpenAI-compatible endpoint supports HTTPS as well as local HTTP services, and its model IDs and API key are provided by the respective provider.

Using the API requires no local LLM download or setup. [Local LLM model download (optional)](https://pan.quark.cn/s/55eab3bb2d9b): after unpacking, you can enter the directory that holds the GGUF files, for example `E:\LLM`; the field is optional, and when left empty the `LLM` folder under the model root is scanned by default. The full bundle already includes the local LLM backend, so simply choose a model and test the connection; `install_local_llm.bat` repairs that component in the shared environment. For a sharded model, select the first shard; all other shards must be present. No vision projection model is needed. The directory listing shows the readable architecture, context, and shard information. Model weights are yours to provide; the Create button never downloads them automatically. In the unified environment, Qwen3.8-27B-Q4_K_M was measured generating lyrics, style, and valid ABC and completing a cross-page send; a second ABC sample failed the duration check, so its lyrics and style were kept. The default therefore remains that YuE2 plans the score. Judge a local model's scoring ability by its actual output.

By default it generates lyrics and style first and leaves the score to YuE2 planning on the target page. If you want the current LLM to compose the score as well, select "Compose ABC automatically"; a full score usually takes longer than text, and a failed check allows at most one correction. On failure the finished lyrics and style are kept, and a score that fails validation is never sent as a usable score.

Lyric modes support generate, strict preservation, local rewording, and instrumental only. Strict preservation works from the exact text the server received, and pasting in a browser may normalise line breaks. Results can be edited, copied, and downloaded; after editing ABC by hand you must validate it again. Retrying only the ABC reuses the currently edited lyrics and style without regenerating them. A network interruption does not automatically resend the request, which avoids duplicate calls while the billing status is unclear.

Before sending, choose which fields to overwrite. If the target already has a draft you are warned that it will be overwritten; a send can be undone, and later manual edits stop an old undo from overwriting new content. Sending external ABC to "Score plan" uses import mode; sending a full score to Melody remake requires removing the chords explicitly, and the system checks that the two melody voices and the rhythm stay consistent. Instrumental only performs no reference-voice conversion.

Drafts and configuration live in `userdata/assistant`, and job outputs still go to `outputs/jobs`. Refreshing the page restores drafts and results; if the current content was edited by hand when a job finishes, the edits are kept and an entry point to the new result is offered. The assistant shares a serial queue with music jobs, the local LLM runs in a separate process, and the model is released when a job ends. After changing the GPU layer count or the context you must test again; a model that loads is not necessarily one that produces a usable score.

## Song generation

On the "Create" page, fill in the style and the lyrics separately. Tag sections in the lyrics with `[Verse]`, `[Chorus]`, and so on. `Melody + chords` suits a new song, `Melody only` lets the accompaniment vary freely, and `Direct generation` produces no ABC plan. With a candidate count of 2–4, candidates are generated serially from consecutive seeds, and finished candidates are kept.

## Score plan and editing

The "Score plan" page generates ABC only first. Ticking "Restore the exact original plan" uses the saved original tokens and prefix, and the text box does not overwrite it. To modify the work, untick it, edit the ABC, and then render; the system creates a new job and regenerates the entire song.

## Long songs and job recovery (1.1.5)

Acoustic synthesis runs in compute blocks of 256 rows by default and moves AR modules that the current stage does not need to the CPU. Compute blocks keep the full visible context and never truncate the song or reduce the number of generation steps automatically. Compatible mode uses chunked math attention; automatic mode uses fused kernels when they are available.

A reference-voice cover first uploads and saves the reference voice, then leaves the background to generate the song, separate the vocals, convert the voice, and mix, in that order. After submitting you can refresh or close the page; reopening it shows job progress and the most recent result. Closing the service process itself interrupts the job, and it then has to be recovered.

When a job finishes, the player, the finished duration, and "Download audio" appear directly below the page title. If you are still on that page when it finishes, the view moves to the result automatically; switching back or refreshing still keeps the most recent work. Downloading the audio gives you a single FLAC, and "Export all files" saves the job's complete artifacts. The history page also keeps every job.

After a failure or cancellation, click "Continue from saved stages" on the recent-job card or in the history. The plan, the structure, the acoustic results, and the vocal separation/conversion all have integrity checks. Older jobs that did not save intermediate results can only be run again. Recovery does not modify the original job record; the new job reuses the valid stages and records where they came from.

Progress is shown per current stage, and a finished stage does not mean the whole cover is finished. The VRAM budget is only a per-process allocation ceiling; other GPU applications can still reduce the space available. Each job's `resources.jsonl` records per-stage VRAM; the sub-stage logs of a background cover live in the job's `artifacts/stages`.

## Melody remake and reference voice

After uploading the original song, run SheetSage2 transcription first. By default it keeps the Vocal and Ins melodies and omits the chords. Transcription may get pitches, time signatures, or sections wrong, so you must check it by hand against the original audio; lyrics have to be pasted in and organised by section yourself.

Option A, "Melody remake", regenerates from the checked melody, the lyrics, and the target style, using YuE2's own vocal timbre. Option B, "Reference voice cover", additionally runs Demucs stem separation and Seed-VC voice conversion after generation. The reference audio must be 1–30 seconds of clear solo dry vocal, ideally 5–25 seconds with no accompaniment and little reverb; advanced settings let you adjust inference steps, voice strength, pitch shift, and mix volume. Use only your own voice, or a voice you have explicit permission to use.

## RVC: how to train when you have no model

1. Open "My voices / Training", create a project, and import the singing or speech material you prepared. Each segment can be previewed and filtered; for a song with accompaniment, separate the vocals first and then confirm them for training. The interface recommends 10–50 minutes of clean material with a consistent timbre, so check for noise, reverb, and the target vocal range first.
2. Choose the training settings and click "Check training conditions" to see the base model, the material, disk, memory, and the VRAM free at that moment. Passing the check does not guarantee that training will succeed under arbitrary external GPU load.
3. Click "Start / continue training" and the page shows preprocessing, pitch, features, training, and index progress in turn, with logs available. Cancelling keeps the saved checkpoints; changing the material or the model architecture should mean starting a new project.
4. When it finishes, preview it in the voice library, give it a name, and send it to the cover area; you can also import an existing model or export a trained voice. Do not judge final audio quality from a run with very few epochs.

Expanding "Asset, training cache, and voice library locations" lets you choose three empty directories separately: preview first, then migrate. The system copies and verifies the files before switching the settings; cancelling lets the migration continue, the original directory is kept as a backup, and you clean it up yourself once you have confirmed the new location works. After the original data changes you must preview again, and you cannot carry on from the old snapshot.

## Direct voice conversion and same-song comparison

On "Melody remake / reference voice", choose direct conversion of an existing song, upload the original, and preview it; no ABC and no song regeneration are needed. With RVC you choose a trained or imported voice; Seed-VC uses a short dry reference voice. You can also follow the original transcription flow to generate a new song first and then convert its voice.

After choosing "Seed-VC / RVC · Same-song comparison", select a short reference voice and an RVC model for the same target voice. Both paths process the same song one after the other and share the validated vocal/accompaniment cache, and the results can be previewed and downloaded separately on the current page and in the history page. If one path fails, the other path's audio is kept and you can continue from saved stages; a failed job marker does not mean all the audio is lost. The comparison is for your own listening judgement, and no model is preset as sounding better.

RVC keeps the original key by default. After selecting a voice you can see the estimated main range of its training material; it comes from the 5%–95% quantiles of the training pitch curve and is not a hard upper or lower limit on what the model can sing. An old finished training project can be reopened to continue training, reusing the existing results and adding statistics; externally imported models may not have this information.

When high notes distort, first try "One octave lower" under "RVC singing pitch", or adjust manually in semitones. One octave lower equals −12 semitones and only changes the singing pitch of the converted vocal, without transposing the accompaniment; it is not a fix for an original inability to reach high notes. To keep the original singing pitch, try training material that covers that range or a different voice model. Models that do not support pitch conditioning do not offer this option.

"Retrieval fit" is not a case of higher being better. When articulation or noise sounds wrong, click "Disable retrieval, keep current pitch" as a comparison and then decide which value suits that voice. In same-song comparison, RVC and Seed-VC have their own pitch settings; the current result and the history both mark RVC's actual transposition.

## ComfyUI

Run `install_to_comfyui.bat` in the full bundle and enter your own ComfyUI directory when prompted. You can also specify the directory explicitly in PowerShell:

```powershell
.\scripts\install_comfyui.ps1 -ComfyUIPath "D:\YourComfyUI\ComfyUI"
```

After restarting ComfyUI you will find 12 nodes under the "YuE2 Music" category. The `workflows` directory contains four front-end workflows: lyrics to song, plan-then-render, external ABC re-render, and reference-voice cover. The nodes connect to or start the shared service automatically and never replace ComfyUI's Torch.

## Output and troubleshooting

Each job lives in `outputs/jobs/<job_id>` and contains the request, the status, log references, and the complete generated artifacts. Job logs are in `logs/<job_id>.log`, and the service log is `logs/server.log`. The WebUI's "Jobs and versions" page can expand the log of a failed job directly, and also offers "Open log directory" and "Open output directory". A `complete` result still needs its `truncated` flag checked; the interface marks truncated results separately. Cancelling can be delayed during the VAE decode stage; force-ending the current worker makes the next job cold-start.

On first start the service creates `retention.json` and cleans up every 6 hours by default: finished jobs are kept for 30 days, at most 100 of them, and no more than 100 GiB; uploads are kept for 7 days and no more than 10 GiB; logs are kept for 30 days and no more than 2 GiB. The WebUI's "Jobs and versions" page shows the managed space and lets you clean up manually. Export important results first; `exports` is not affected by automatic cleanup.

Advanced semantic, latent, and decode artifacts each carry a manifest; before moving on to the next stage the system verifies the file SHA-256, the pinned model repository source, the runtime weight identity, and the previous stage's manifest digest. Old or modified advanced artifacts are rejected.

The models, the runtime, and the browser rendering components are all stored in this directory. Normal generation, transcription, and reference-voice conversion run offline and never download a model on the first click.

### Specifying a port when several installations coexist

The default address is `http://127.0.0.1:8189`. To keep another installation running, run `YuE2-T8.exe --port 8198 --no-switch` and then visit `http://127.0.0.1:8198`. `--no-switch` stops startup and suggests a different port when the chosen port is taken by another YuE2. When a ComfyUI client connects to this instance, set `YUE2_SERVICE=http://127.0.0.1:8198`.
