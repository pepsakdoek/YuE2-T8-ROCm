# Model directory skeleton (weights not included)

This repository **contains no model weights**. All it holds is the directory structure, which shows where the weights belong.
The installer downloads the weights from `t8star/YuE2-Comfy` (or use the mirror script below),
and the manifests shipped with this repository verify them (path + size + sha256).

```
models/
├── Demucs/                                  vocal/instrumental separation (HTDemucs)
├── MERT-v2-FullSong/                        MERT encoder used for transcription
├── Seed-VC/                                 reference timbre (voice cloning)
│   ├── bigvgan_v2_44khz_128band_512x/      vocoder
│   └── whisper-small/                      semantic encoder
├── SheetSage2/                              audio to ABC score
│   └── render_assets/
│       └── soundfonts/
│           └── acoustic_grand_piano-mp3/   score playback soundfont
├── YuE2-3B/                                 main model (single bilingual CN/EN weight set)
│   ├── assets/audio/
│   └── examples/
├── YuE2-Vae/                                VAE audio decoding
├── MODEL_MANIFEST.json                      written by the downloader, checked by verify_models.py
└── VOICE_MODEL_MANIFEST.json                written by the downloader, checked by verify_voice_models.py
```

About 12.2 GB in total. For weight licensing see `MODEL_LICENSE` at the repository root:
**YuE2 is CC BY-NC 4.0 (non-commercial)**; SheetSage2 and MERT have their own LICENSE files;
Seed-VC is GPL-3.0 and Demucs is MIT.

## Download

```powershell
# upstream default method
runtime\python.exe -m huggingface_hub.cli.hf download t8star/YuE2-Comfy `
    --revision a083f106499daead99259dd0c443a5494254cfc5 --local-dir models

# when huggingface.co is unreachable (mirror + chunked resume)
python scripts\rocm\fetch_mirror_models.py
```

## Verification (must go through t8's own manifests)

```powershell
runtime\python.exe scripts\verify_models.py --root .
runtime\python.exe scripts\verify_voice_models.py --root .
```

## Files that should be present

### Song generation / transcription (`MODEL_MANIFEST.json`)

| Component | File | Size (bytes) | sha256 | Source |
|---|---|---:|---|---|
| `MERT-v2-FullSong` | `MERT-v2-FullSong/model.safetensors` | 2529812848 | `e6dd2ab187d6dd62b6521cd7d8f932e237acf0c5757745a7232082e28391350d` | `m-a-p/MERT-v2-FullSong` |
| `SheetSage2` | `SheetSage2/model.safetensors` | 228738564 | `b235f68091a5f5b644000f2b5acb57d1e70432aca2b34ab1b9cf27236e1f4274` | `m-a-p/SheetSage2` |
| `YuE2-3B` | `YuE2-3B/model.safetensors` | 7261441640 | `1d55c42c1a9875c34f5d736e15078449992b044e807ce2a138e6cf289a1e59e9` | `mrfakename/YuE2-3B` |
| `YuE2-Vae` | `YuE2-Vae/model.safetensors` | 530512720 | `807ce9d5149fa27c5ad3e6582058469852e908f6c5acc8c8aa338e7ab7751346` | `m-a-p/YuE2-Vae` |

### Reference voice (`VOICE_MODEL_MANIFEST.json`)

**Demucs** — source `adefossez/HTDemucs`

| File | Size (bytes) | sha256 |
|---|---:|---|
| `Demucs/955717e8.json` | 12087 | `12540373de858920b60002ebfbe17738860dbf2e89df625dc3b7875af2d28491` |
| `Demucs/955717e8.safetensors` | 84025440 | `d9fa14133cfcc034a6758923bb3a8ca9f8dfd0b582134643bbf83f72c17576dd` |
| `Demucs/LICENSE` | 1087 | `cf9b17822d1fcd4ff32ccbe14183386fb3adf6f2ff92dc184130823f7fc28173` |
| `Demucs/README.md` | 647 | `b34c13f1b6c3473bf44978f70b5c62666ee309514d6d50b34cf44827f9a38104` |
| `Demucs/htdemucs.yaml` | 21 | `239c445d0b14454d541ad8bd9bb271c9e536d267e8a4625208744cbb2e7bb66c` |

**Seed-VC** — source `https://github.com/Plachtaa/seed-vc`

| File | Size (bytes) | sha256 |
|---|---:|---|
| `Seed-VC/bigvgan_v2_44khz_128band_512x/bigvgan_generator.pt` | 489041291 | `d9fe7ec6bd0b44ed9d66973d5012d8181c1570b01e5c72df51973e241dccd357` |
| `Seed-VC/bigvgan_v2_44khz_128band_512x/config.json` | 1403 | `65b7f487bfaf15256056a75f6667ef5f640214c981922a111927873705ea4ddb` |
| `Seed-VC/bigvgan_v2_44khz_128band_512x/LICENSE` | 1076 | `90459cd52fc41bd723df7c0c76fac1e4dd60e6bfd644a7e2a93f325bed4f6d95` |
| `Seed-VC/bigvgan_v2_44khz_128band_512x/README.md` | 8041 | `209c68252dd23468b4f95991a1fb535b35f8fb603ac3937ed5d5eb2b1d993439` |
| `Seed-VC/campplus_cn_common.bin` | 28036335 | `3388cf5fd3493c9ac9c69851d8e7a8badcfb4f3dc631020c4961371646d5ada8` |
| `Seed-VC/config_dit_mel_seed_uvit_whisper_base_f0_44k.yml` | 2408 | `ff86f343b08c2def405f075022eeb10dafba23c4eda36d151010f4ca6d7a1a0a` |
| `Seed-VC/DiT_seed_v2_uvit_whisper_base_f0_44k_bigvgan_pruned_ft_ema_v2.pth` | 820865494 | `42aef93ffe65857c840d270252fa040f7ba04514945ec460f3ac1ac2a96de684` |
| `Seed-VC/rmvpe.pt` | 181184272 | `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193` |
| `Seed-VC/whisper-small/added_tokens.json` | 34604 | `9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1` |
| `Seed-VC/whisper-small/config.json` | 1967 | `e6a2b489da1b5aed65a8eb8d1e7466fa867ad5643a8bc138ba708bd56b2875c4` |
| `Seed-VC/whisper-small/generation_config.json` | 3868 | `71565b8ef50d0bf7a1193ed4bbed195b94e70c18894d81bba2f1233dcec3ab53` |
| `Seed-VC/whisper-small/merges.txt` | 493869 | `2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6` |
| `Seed-VC/whisper-small/model.safetensors` | 966995080 | `1d7734884874f1a1513ed9aa760a4f8e97aaa02fd6d93a3a85d27b2ae9ca596b` |
| `Seed-VC/whisper-small/normalizer.json` | 52666 | `bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd` |
| `Seed-VC/whisper-small/preprocessor_config.json` | 184990 | `9b5cd03a36fbb8a627c64d98a5b5b126ead95a77720723944487311f0110b666` |
| `Seed-VC/whisper-small/special_tokens_map.json` | 2194 | `e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691` |
| `Seed-VC/whisper-small/tokenizer.json` | 2480466 | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` |
| `Seed-VC/whisper-small/tokenizer_config.json` | 282683 | `2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce` |
| `Seed-VC/whisper-small/vocab.json` | 835550 | `8f680bba319e01a653d2e8a5dbc17a9157179e0576e6ce74ce0c06356c6e24f9` |

> The manifests themselves also live in this directory (written by the downloader), and
> `scripts/verify_models.py` and `scripts/verify_voice_models.py` accept nothing but the manifests — so
> the weights must match the pin **bit for bit**, independently of this repository's AMD port.
