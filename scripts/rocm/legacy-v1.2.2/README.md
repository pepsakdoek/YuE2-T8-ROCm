# legacy: original scripts from the t8 v1.2.2 three-runtime era

These are the scripts the port **actually used and validated at the time**, kept as-is for the record.

They assume the t8 v1.2.2 runtime layout — three separate embedded interpreters under
`runtime/core`, `runtime/transcribe` and `runtime/voice`. Upstream has since merged all three into a single
`runtime/python.exe` (and changed how models are distributed), so **do not use these scripts directly
against the current upstream main**; for the current layout use the scripts one directory up:

| Current script | Purpose |
|---|---|
| `../setup_rocm_runtime.ps1` | Build the single-runtime ROCm environment (upstream equivalent: `setup_unified.ps1`) |
| `../apply_rocm_port.py` | Apply every port patch idempotently |
| `../patch_audiotools.py` | Site-packages patch (the one change that cannot live in the repository) |
| `../fetch_mirror_models.py` | Download models from the mirror with chunked resume |
| `../verify_capabilities.py` | End-to-end validation: doctor + transcription rendering + voice conversion |

For the measured results from the three-runtime era, see `../../docs/PORT_REPORT.md`.
