# Fetch the official YuE2 weights needed to run the upstream example song
# (YuE/examples/generate.py driven by YuE/examples/song.json).
#
# These are the m-a-p release repos, not the t8star repack this kit's installer
# uses. They are byte-identical where it matters:
#   YuE2-3B/model.safetensors  sha256 1d55c42c...  bytes 7261441640
#   YuE2-Vae/model.safetensors sha256 807ce9d5...  bytes  530512720
# which is exactly what models/README.md and the t8 MODEL_MANIFEST pin, so
# scripts/verify_models.py still passes against them.
#
# Only the files the pipeline actually reads are fetched: weights_manifest.json
# (integrity), config.json, qwen.tiktoken (tokenizer), the safetensors and the
# reference modeling source. Licences and media assets are not needed to infer.
#
# curl rather than huggingface_hub because it resumes: huggingface.co resets
# large transfers on some networks, and re-downloading 6.9 GB each time is not
# acceptable. -C - picks up where the previous attempt stopped.
#
# ASCII only.
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [int]$Attempts = 10,
    [switch]$SkipVerify
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Models = Join-Path $Root 'models'

# repo -> @(relative paths). Only files that actually exist upstream: YuE2-3B
# ships modeling_yue2.py, the VAE repo ships modeling_vae.py, and neither has
# the other's.
$Plan = [ordered]@{
    'm-a-p/YuE2-3B'  = @('config.json', 'weights_manifest.json', 'model.safetensors',
                         'qwen.tiktoken', 'yue2_generation_config.json',
                         'generation_config.json', 'modeling_yue2.py')
    'm-a-p/YuE2-Vae' = @('config.json', 'weights_manifest.json', 'model.safetensors',
                         'modeling_vae.py')
}

# What the pipeline independently re-checks via weights_manifest.json.
$Expected = @{
    'YuE2-3B/model.safetensors'  = @{ sha256 = '1d55c42c1a9875c34f5d736e15078449992b044e807ce2a138e6cf289a1e59e9'; bytes = 7261441640 }
    'YuE2-Vae/model.safetensors' = @{ sha256 = '807ce9d5149fa27c5ad3e6582058469852e908f6c5acc8c8aa338e7ab7751346'; bytes = 530512720 }
}

function Get-RemoteFile {
    param([string]$Url, [string]$Destination, [long]$Bytes = 0, [int]$MaxAttempts = 10)

    if ($Bytes -gt 0 -and (Test-Path -LiteralPath $Destination) -and
        (Get-Item -LiteralPath $Destination).Length -eq $Bytes) {
        return
    }
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        # A native command writing to stderr turns into a terminating
        # ErrorRecord while $ErrorActionPreference is Stop, which would abort
        # the whole script on a transient reset instead of resuming it. Relax
        # the preference for the duration of the call and judge by exit code.
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & curl.exe -sS -L --fail --retry 5 --retry-delay 5 --retry-all-errors `
                -C - -o $Destination $Url 2>$null
            $code = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previous
        }
        if ($code -eq 0) { return }
        # 33 = server does not honour the resume range; start that file over.
        if ($code -eq 33) { Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue }
        # 22 = HTTP error. A 404 will never succeed on retry, so fail fast with
        # the URL rather than burning ten attempts on it.
        if ($code -eq 22) { throw "HTTP error (curl 22, likely 404) for $Url" }
        Write-Host ("         attempt {0}/{1} failed (curl {2}); resuming" -f $attempt, $MaxAttempts, $code)
        Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 30))
    }
    throw "download failed after $MaxAttempts attempts: $Url"
}

foreach ($repo in $Plan.Keys) {
    $name = $repo.Split('/')[1]
    $dir = Join-Path $Models $name
    New-Item -ItemType Directory -Force $dir | Out-Null
    Write-Host "`n=== $repo -> models/$name ===" -ForegroundColor Cyan
    foreach ($rel in $Plan[$repo]) {
        $dest = Join-Path $dir $rel
        $url = "https://huggingface.co/$repo/resolve/main/$rel"
        $want = 0
        $key = "$name/$rel"
        if ($Expected.ContainsKey($key)) { $want = [long]$Expected[$key].bytes }
        if (Test-Path -LiteralPath $dest) {
            $have = (Get-Item -LiteralPath $dest).Length
            if ($want -eq 0 -or $have -eq $want) {
                Write-Host ("  have   {0,-32} {1,13:N0} bytes" -f $rel, $have)
                continue
            }
            Write-Host ("  resume {0,-32} {1,13:N0}/{2:N0}" -f $rel, $have, $want)
        } else {
            Write-Host ("  fetch  {0,-32} <- {1}" -f $rel, $repo)
        }
        Get-RemoteFile -Url $url -Destination $dest -Bytes $want -MaxAttempts $Attempts
        Write-Host ("         {0,-32} {1,13:N0} bytes" -f $rel, (Get-Item -LiteralPath $dest).Length)
    }
}

if (-not $SkipVerify) {
    Write-Host "`n=== verifying pinned weight hashes ===" -ForegroundColor Cyan
    $bad = 0
    foreach ($key in $Expected.Keys) {
        $file = Join-Path $Models $key
        if (-not (Test-Path -LiteralPath $file)) { Write-Host "  MISSING  $key"; $bad++; continue }
        $size = (Get-Item -LiteralPath $file).Length
        if ($size -ne [long]$Expected[$key].bytes) {
            Write-Host ("  BAD SIZE {0}: {1} != {2}" -f $key, $size, $Expected[$key].bytes) -ForegroundColor Red
            $bad++
            continue
        }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
        if ($actual -eq $Expected[$key].sha256) {
            Write-Host ("  OK       {0}" -f $key) -ForegroundColor Green
        } else {
            Write-Host ("  MISMATCH {0}`n    expected {1}`n    actual   {2}" -f $key, $Expected[$key].sha256, $actual) -ForegroundColor Red
            $bad++
        }
    }
    if ($bad -gt 0) { throw "$bad weight(s) failed verification" }
}

Write-Host "`nmodels ready under $Models" -ForegroundColor Green
