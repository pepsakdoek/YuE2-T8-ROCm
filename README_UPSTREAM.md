# ComfyUI YuE2 T8

[Chinese](#chinese) · [English](#english) · [Model weights](https://huggingface.co/t8star/YuE2-Comfy) · [ComfyUI Registry](https://registry.comfy.org/nodes/yue2-t8)

![YuE2 Music T8](icon.svg)

## Complete Portable Package

Complete portable package: [Quark Drive download](https://pan.quark.cn/s/67ebf18a2d51)

A complete Windows / NVIDIA package containing both the runtime and the models. Extract it fully, then double-click `YuE2-T8.exe` to start.

The [GitHub Release](https://github.com/T8mars/Comfyui-YuE2-T8/releases/tag/v1.3.0) provides only the code and the auto-update assets; it contains neither Python nor the models. Get the complete portable package from the Quark Drive link above; the models and the optional GGUF weights can also be downloaded separately from the cloud-drive link below. When an upgrade from an older version involves migrating to the unified runtime, the updater downloads the extra dependencies on demand.

## Model Downloads

Model downloads: [Quark Drive download](https://pan.quark.cn/s/6c40eac8af6c)

See "Model Locations" below for how to place the models.


## Local LLM Model (Optional)

Local LLM model: [Quark Drive download](https://pan.quark.cn/s/55eab3bb2d9b).

The standalone WebUI's "AI Creation Assistant" uses it to generate lyrics, style, and optional ABC. No download is needed when you use an API. In local mode, extract the model, enter the directory that holds the GGUF files in the assistant settings (for example `E:\LLM`), save, then select a model and test the connection; if you leave the directory empty, the `LLM` folder under the model root is used instead. This download is separate from the music model package and is not required in order to run YuE2.

## Chinese

YuE2 Music T8 brings YuE2-3B full-song generation into ComfyUI and ships a standalone local WebUI. The nodes call an isolated inference worker on `127.0.0.1:8189`, so they neither replace nor contaminate ComfyUI's own Torch environment. Version 1.1.0 added zero-shot reference-voice covers with Seed-VC + Demucs; 1.1.1 added the Windows EXE launcher; 1.1.2 switches safely and automatically when the port is already owned by another idle YuE2 installation; 1.1.3 fixed the missing YuE2 inference sources in the standalone package and added in-page logs; and 1.1.4 added the model directory setting and a code-only GitHub Release update manifest.

Highlights:

- Generate 48 kHz stereo songs from Chinese or English lyrics, with `full`, `melody`, and `off` planning modes.
- Generate and save ABC melody/chord plans that can be restored exactly, or edited or imported and then rendered again.
- Generate 1–8 consecutive-seed candidates in one run; a complete song artifact keeps the request, configuration, tokens, latents, and an integrity manifest, and finished results survive a later candidate failure.
- Transcribe WAV, FLAC, MP3, M4A, OGG, and AAC to ABC/MIDI with SheetSage2 + MERT, and generate covers from the result.
- Take a 1–30 second dry reference vocal, convert the vocal of a newly generated song to that timbre, and remix it with the Demucs-separated accompaniment into a 48 kHz stereo FLAC.
- A shared single-GPU queue, task center, per-item cancellation, task history, and export; the task center separates the current task from the complete waiting list and shows source, stage, style summary, and queue position.
- Automatic cleanup of expired or over-quota jobs, uploads, and logs; important results in `exports` are kept indefinitely, and interrupted jobs are explicitly marked as failed when the service restarts.

### v1.3.0: Unified Runtime and RVC Training Workbench

- Every local feature shares Python 3.12.10 / Torch 2.10.0 + CUDA 12.8 and runs stage by stage in subprocesses.
- "My Voices / Training": import material, preview and screen it, separate the accompaniment, train, cancel/resume, build indexes, and preview or import/export the voice library. Users who have no RVC model can train directly from the page.
- The cover page can convert an existing song directly, or remake it with YuE2 first and then convert it; choose Seed-VC, RVC, or a same-song comparison. The comparison shares the separation cache, and once it finishes both the current page and the history page keep a playable result.
- RVC shows the register statistics of the selected voice's training data and offers independent semitone and octave controls plus a retrieval-disabled comparison. The original key is kept by default; lowering the octave changes the sung pitch, and in comparison mode it does not affect the Seed-VC pitch setting.
- Training projects/caches, datasets, and the user voice library can be pointed at custom directories and migrated with verification; the original data is kept as a backup. The updater supports migration from legacy multi-environment installs and rolls back on failure.

RVC training and voice conversion have been validated on real hardware; a handful of samples cannot demonstrate behaviour across every voice, and no claim is made that RVC always beats Seed-VC. Comparative metrics on public material and the status of human blind listening are in the release asset [RVC_EVALUATION.md](https://github.com/T8mars/Comfyui-YuE2-T8/releases/download/v1.3.0/RVC_EVALUATION.md). The complete package ships optional FlashAttention wheels that are prebuilt and verified; current song inference does not use standalone `flash_attn`, so installing them is unnecessary and no whole-song speedup is claimed.

### AI Creation Assistant (Standalone WebUI)

The "AI Creation Assistant" generates lyrics, style, and optional ABC through ZhenZhen Affordable AI Shop, ZhenZhen AI Workshop, any OpenAI-compatible endpoint, or a local GGUF model. Results can be edited, saved, and downloaded, and individual fields can then be sent to "Create", "Score Plan", or "Melody Remake / Reference Voice". Sending only fills in a draft — audio generation still starts from the button on the target page — and the feature adds no ComfyUI nodes.

By default the assistant writes the lyrics and style first and leaves ABC planning to YuE2; select automatic ABC creation when you want the LLM to write the score. A score that fails validation cannot be sent directly, a failure keeps the text already produced, and only the failed step can be retried. Drafts are stored in `userdata/assistant`, which must be preserved across upgrades.

API keys are valid only for the current service session by default, and can optionally be saved encrypted for the current Windows user. Local models go under `LLM` in the model root, or in a directory you specify. In v1.3.0 music generation, transcription, Seed-VC, RVC training/inference, and the GGUF assistant all use the same `runtime/python.exe` (Python 3.12.10) and start a subprocess per task to release the model; there is no second Python. The complete package already includes the GGUF backend, and `install_local_llm.bat` only repairs components in this shared environment — it does not download GGUF weights. A model that loads successfully has not necessarily passed score-generation quality validation. See the [user guide](USER_GUIDE.md#ai-creation-assistant) for the steps.

The channel automatically fills in the default model used by the reference nodes: `bytedance/doubao-seed-evolving` for ZhenZhen Affordable AI Shop and `gemini-3.5-flash` for ZhenZhen AI Workshop. The model field supports preset dropdowns, manual model IDs, and a LIST of the models available to the account fetched from a standard OpenAI `/models` endpoint; if the endpoint does not support LIST you can still enter an ID by hand. Getting an API key: [ZhenZhen Affordable AI Shop](https://api.seedance.nz/sign-up?aff=5f4w) · [ZhenZhen AI Workshop](https://ai.t8star.org/register?aff=dP7j).

### Installation

Once the Registry version has passed review, you can install it through the ComfyUI Registry/Manager:

```bash
comfy node install yue2-t8
```

Or install it manually:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/T8mars/Comfyui-YuE2-T8.git
```

After installing the node, enter the node directory and run `install_runtime.bat` once. The script downloads the models, the unified Python 3.12.10 runtime and the RVC base model, CUDA 12.8 Torch, FFmpeg, and the offline score-rendering components. Restart ComfyUI when it finishes.

Requirements: Windows 10/11 and an NVIDIA GPU; 24 GB of VRAM and at least 60 GB of free disk space are recommended for installation, downloads, and migration (training material, checkpoints, and outputs are extra). Normal generation, transcription, and reference-voice conversion all run offline.

### Model Locations

All models are published in [t8star/YuE2-Comfy](https://huggingface.co/t8star/YuE2-Comfy). The installation script pins the verified model commit [`a083f1064`](https://huggingface.co/t8star/YuE2-Comfy/commit/a083f106499daead99259dd0c443a5494254cfc5). By default they are placed under `models` in the current node directory; alternatively, expand "Model location and install notes" at the top of the WebUI to enter an absolute path on another drive, or double-click `configure_models.bat` before installing. The current path is stored in `settings.json`.

```text
ComfyUI/custom_nodes/yue2-t8/models/YuE2-3B/model.safetensors
ComfyUI/custom_nodes/yue2-t8/models/YuE2-Vae/model.safetensors
ComfyUI/custom_nodes/yue2-t8/models/SheetSage2/model.safetensors
ComfyUI/custom_nodes/yue2-t8/models/MERT-v2-FullSong/model.safetensors
ComfyUI/custom_nodes/yue2-t8/models/SheetSage2/render_assets/
ComfyUI/custom_nodes/yue2-t8/models/Seed-VC/DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth
ComfyUI/custom_nodes/yue2-t8/models/Demucs/955717e8.safetensors
ComfyUI/custom_nodes/yue2-t8/models/RVC/
ComfyUI/custom_nodes/yue2-t8/models/VOICE_MODEL_MANIFEST.json
```

When you clone the repository manually, replace `yue2-t8` above with the actual repository directory name, `Comfyui-YuE2-T8`. Do not put the weights directly into ComfyUI's `checkpoints` directory; the code expects all seven model subdirectories, their configuration files, and two manifests.

If you use a custom directory, that directory is itself the `models` segment of the paths above: the seven subdirectories together with `MODEL_MANIFEST.json` and `VOICE_MODEL_MANIFEST.json` must sit directly inside it. Command-line installation is also supported:

```powershell
.\install_runtime.bat -ModelsDirectory "D:\AI\YuE2-models"
```

### Updating

Since v1.2.2 the run-status card in the top right of the local WebUI home page offers a "Check for updates" button, and the stable channel is also checked automatically when the page opens. When a new version is found, click "Update to vX" and the program downloads the code archive from the [latest version manifest](https://github.com/T8mars/Comfyui-YuE2-T8/releases/latest/download/update-manifest.json), verifies its origin and SHA256, backs up the old code, then installs and restarts on the current port. Updates preserve the models, local GGUF files, outputs, uploads, exports, logs, caches, assistant drafts, and settings. The first upgrade to v1.3.0 prepares and verifies the unified runtime and fetches the RVC base model; the old service exits before the code and Python are switched, and the old runtime is removed only after the new service passes its startup checks. On failure the old code and the original runtime are restored. An update never starts while a job is running or queued.

GitHub's `*-code.zip` is the code archive used by automatic updates and contains neither models nor Python; the complete version includes the unified runtime and the base models, with GGUF weights downloaded separately. The in-page updater is available from v1.2.2 onward. On earlier versions, extract the new complete package into a new directory, point it at your existing model path, and start it, leaving the original installation directory and your outputs in place.

Do not simply copy the v1.3.0 code over an older multi-Python portable package: the new version requires a unified-environment migration. Use the in-page updater, or install the complete package into a new directory. The first upgrade needs network access to download the missing components and enough temporary space for the old and new environments to coexist; models that have already been verified are reused.

1.1.5 reduces the VRAM peak of acoustic synthesis for long songs on Windows by tiling by query by default and offloading idle AR weights; reference-voice covers became persistent background jobs with staged save and resume. When they finish, the current page shows a player, the duration, and a download button, and the most recent result survives a refresh or a page switch. See [validation records](VALIDATION.md) for details.

### Usage

The nodes live under the `YuE2 Music` category. The `workflows` directory provides four front-end workflows: lyrics to song, plan then render, external ABC re-render, and reference voice cover. The Windows portable package starts by double-clicking `YuE2-T8.exe`; the node source package starts by double-clicking `start_webui.bat`. The launcher window stays open and shows either the service address or the reason it failed. If port 8189 is already owned by another idle YuE2 installation, the launcher verifies the process and switches automatically; it will not interrupt a running or queued job. Use `stop_service.bat` to stop the background service manually.

Reference-voice covers need a clean 1–30 second solo dry vocal, ideally 5–25 seconds, without accompaniment and with little reverb. The workflow generates or accepts a song, then separates vocals from accompaniment, converts the timbre, and remixes. Only use your own voice, or a voice for which you have explicit permission.

For a first run, start with the "YuE2 Model Service" node or the self-check in the top right of the WebUI. All outputs are saved under `outputs/jobs` in the node directory, and exported results go to `exports`. For a failed job you can expand the log directly on the WebUI's "Tasks & Versions" page, or open the `logs` directory in the node directory; the page now shows the worker's actual exception instead of only an exit code.

The storage policy is written to `retention.json` in the node directory on first start: completed jobs are kept for 30 days by default, up to 100 of them and no more than 100 GiB in total; uploads are kept for 7 days and no more than 10 GiB; ordinary logs are kept for 30 days and no more than 2 GiB. The service runs this automatically every 6 hours, and you can also run it manually on the WebUI's "Tasks & Versions" page. Export anything you need to keep long term to `exports`; the automatic policy never deletes that directory.

### Nodes

| Node | Function |
| --- | --- |
| YuE2 Model Service | Checks the runtime, the models, and the shared service |
| YuE2 Generate Song | Lyrics, style, and ABC to complete audio |
| YuE2 Generate Score Plan | Produces an editable ABC plan only |
| YuE2 Render Score Plan | Restores a plan exactly, or re-renders after editing |
| YuE2 Transcribe Audio | Audio to ABC, MIDI, events, and a score image |
| YuE2 Generate Cover | Generates from a checked ABC and a new style |
| YuE2 Reference Voice Cover | Converts the vocal timbre with Seed-VC + Demucs and remixes |
| YuE2 Generate Semantic Tokens | Advanced staged inference |
| YuE2 Acoustic Synthesis | Semantic tokens to acoustic latents |
| YuE2 VAE Decode | Latents to 48 kHz stereo audio |
| YuE2 Export Artifacts | Copies complete artifacts to `exports` |
| YuE2 Unload/Cancel | Queries or cancels the current isolated worker |

## English

YuE2 Music T8 integrates YuE2-3B full-song generation with ComfyUI and includes a standalone local WebUI. Its local scheduler runs models in isolated Python workers, so installing the node does not replace ComfyUI's Torch packages. Version 1.1.4 adds a configurable model directory and code-only GitHub Release update metadata.

Install it with `comfy node install yue2-t8`, then run `install_runtime.bat` once from the node directory and restart ComfyUI. Models are downloaded from [t8star/YuE2-Comfy](https://huggingface.co/t8star/YuE2-Comfy) into `<node-directory>/models`; use the WebUI model settings or `configure_models.bat` to place them on another drive. Keep all seven model subdirectories (including RVC) and their configuration files. Windows and an NVIDIA GPU are required, with 24GB VRAM and at least 60GB free disk space recommended for installation and migration, plus storage for training data and outputs.

The node pack supports Chinese and English lyrics, editable ABC plans, multi-candidate generation, SheetSage2 transcription, melody remake, Seed-VC reference-voice conversion, staged inference, per-task cancellation, history, and artifact export. The reference-voice workflow accepts a 1–30 second clean voice sample, separates the generated song with Demucs, converts the vocal, and remixes a 48 kHz stereo FLAC. Its page-integrated progress section identifies the current job and every queued job with stage, source, summary, and queue position. Example front-end workflows are in `workflows`.

The standalone v1.3.0 studio uses one CPython 3.12.10 runtime for music, transcription, Seed-VC, RVC training/inference and optional GGUF. The RVC workbench includes material review, training/resume and a voice library. Existing songs can be converted directly or compared through Seed-VC and RVC with shared separation. The updater migrates legacy runtimes and rolls back a failed startup. Short compatibility runs are not a voice-quality benchmark.

## Links

- Creator: By Bilibili creator T8star-Aix
- GitHub: https://github.com/T8mars/Comfyui-YuE2-T8
- Bilibili: https://space.bilibili.com/385085361
- YouTube: https://www.youtube.com/@T8star-Aix/
- API: https://api.seedance.nz/sign-up?aff=5f4w
- Online AI apps: https://www.runninghub.ai/zh-cn/user-center/1907375370302308353/userPost?inviteCode=rh-v1121
- ComfyUI portable package: https://pan.quark.cn/s/264edb7e36bd
- Hugging Face: https://huggingface.co/t8star
- Model repository: https://huggingface.co/t8star/YuE2-Comfy
- Release validation: [VALIDATION.md](VALIDATION.md)

## License

YuE2 first-party inference code and model weights are licensed under CC BY-NC 4.0 and are for non-commercial use. Seed-VC source is GPL-3.0. Demucs, BigVGAN and other third-party components retain their own licenses; see `THIRD_PARTY_NOTICES.md`, `MODEL_LICENSE`, `vendor/seed-vc/LICENSE`, and `vendor/licenses`.

This integration vendors YuE2 inference code version 0.1.6 from commit `8e06871aa2e704d87ffb9bc71b5f5420f6813724` of https://github.com/multimodal-art-projection/YuE.
