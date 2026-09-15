"""English catalogue for server-generated, browser-facing strings.

Keyed by the Chinese source string (gettext style). See app/yue2_app/i18n.py for
why, and for how exact entries and regex patterns are applied.

SCOPE RULES -- read before adding entries
-----------------------------------------
INCLUDE: text a user can see because the server produced it -- validation and
API errors raised in service.py, worker failure text, update status messages.

DO NOT INCLUDE, under any circumstances:
  * LLM prompt / instruction text (assistant_rules/engine.py, assistant_data.py).
    Translating a prompt changes what the model is told and therefore changes
    generated output; that is a behaviour change, not a localisation.
  * Enum / protocol values that are compared with == or sent to the backend,
    e.g. the lyrics-language options '中文' / 'English' / '日本語' / '한국어',
    quality_mode / lyrics_mode / abc_action values. Translating these breaks
    validation in assistant_rules/engine.py.
  * Anything already handled by a browser dictionary in app/web/i18n.*.js.

`tests/test_i18n_catalog.py` asserts every exact key here still appears in the
source tree, so a reworded message fails loudly instead of silently reverting to
Chinese.
"""

EXACT = {
    "en": {
        # --- service lifecycle and validation -------------------------------
        "无效的任务 ID": "Invalid job ID",
        "这个任务还没有生成日志": "This job has not produced a log yet",
        "此 YuE2 整合包已有一个服务实例在运行": "A service instance is already running for this YuE2 bundle",
        "服务重启中断了任务，可使用恢复按钮继续已保存的阶段":
            "A service restart interrupted this job; use the resume button to continue from the saved stage",
        "整合包正在更新，请等待升级完成后再提交操作":
            "The bundle is updating; wait for the upgrade to finish before submitting",
        "有任务正在运行或排队，请等待任务结束后再更新":
            "A job is running or queued; wait for it to finish before updating",
        "正在下载并校验更新包": "Downloading and verifying the update package",
        "目录迁移需要独占任务队列，请等待当前任务结束":
            "Moving the directory needs exclusive use of the job queue; wait for the current job to finish",
        "request 必须是对象": "request must be an object",
        "RVC 训练组件或底模尚未安装完整":
            "The RVC training components or base models are not fully installed",
        "人声分离组件或模型尚未安装完整":
            "The vocal-separation components or models are not fully installed",
        "歌曲生成组件不完整：缺少 YuE2 推理源码或核心模型，请重新解压完整整合包":
            "Song generation is incomplete: the YuE2 inference source or core models are missing. Re-extract the full bundle",
        "音频转谱组件不完整，请重新解压完整整合包":
            "Audio-to-score is incomplete. Re-extract the full bundle",
        "音色转换参数必须是对象": "Voice-conversion parameters must be an object",
        "不支持的音色转换方式": "Unsupported voice-conversion method",
        "RVC 或人声分离组件尚未安装完整":
            "The RVC or vocal-separation components are not fully installed",
        "所选 RVC 模型未启用音高条件，不支持指定移调":
            "The selected RVC model was not trained with pitch conditioning, so a semitone shift is not supported",
        "音色中不存在对应的说话人索引": "That speaker index does not exist in this voice",
        "参考音色组件或所选转换方式不可用":
            "The reference-voice components or the selected conversion method are unavailable",
        "翻唱需要 generate 和 voice 两组参数": "A cover needs both the generate and voice parameter groups",
        "参考声音不是可读取的音频文件": "The reference voice is not a readable audio file",
        "参考音色需要 1–30 秒清晰干声": "A reference voice needs 1-30 seconds of clean dry vocals",
        "offload_ar 必须是布尔值": "offload_ar must be a boolean",
        "不支持的声学注意力后端": "Unsupported acoustic attention backend",
        "声学计算分块必须是 1–1024 的整数": "The acoustic chunk size must be an integer in 1-1024",
        "显存预算必须是大于 2 GiB 的有限数值": "The VRAM budget must be a finite number greater than 2 GiB",
        "任务状态 ID 与目录不一致": "The job status ID does not match the directory",
        "只能恢复失败或取消的任务": "Only failed or cancelled jobs can be resumed",
        "这个任务类型暂不支持阶段恢复": "This job type does not support stage recovery yet",
        "只能重试已结束的助手任务": "Only finished assistant jobs can be retried",
        "任务在排队阶段被取消": "The job was cancelled while queued",
        "任务已终止": "The job was terminated",
        "只能导出已完成任务的工件": "Only artifacts of completed jobs can be exported",
        "任务没有可导出的工件": "The job has no artifacts to export",

        # --- HTTP layer ------------------------------------------------------
        "请求必须使用 application/json": "Requests must use application/json",
        "请求正文大小无效": "Invalid request body size",
        "文件不存在": "File not found",
        "Host 必须是本机回环地址": "Host must be the local loopback address",
        "不是助手任务": "Not an assistant job",
        "接口不存在": "Endpoint not found",
        "缺少文件路径": "Missing file path",
        "该音频尚未完成，暂不可读取": "This audio is not finished yet and cannot be read",
        "任务不存在": "Job not found",
        "拒绝跨站请求": "Cross-site request refused",
        "没有可校验的 ABC": "There is no ABC to validate",
        "有任务正在运行或排队，请等待任务结束后再更改模型路径":
            "A job is running or queued; wait for it to finish before changing the model path",
        "不支持打开这个目录": "Opening this directory is not supported",
        "上传中断": "Upload interrupted",
        "worker 按任务隔离，空闲时不占用模型显存":
            "Workers are isolated per job and hold no model VRAM while idle",

        # --- assistant_worker: LLM provider and local-GGUF failures -----------
        "任务期间 GGUF 文件已变化，请等待下载完成后重新运行":
            "The GGUF file changed while this job was running; wait for the download to finish and run it again",
        "已达到本次最多 8 次模型调用，请保留结果后单独重试失败步骤":
            "This run has used its 8 model calls; keep these results and retry the failed step on its own",
        "响应包含凭据样式内容，未保存该响应":
            "The response contained credential-like content, so it was not saved",
        "连接中断或超时，远端结果与计费状态未知；未自动重发":
            "The connection dropped or timed out; the remote result and billing state are unknown, and nothing was resent",
        "渠道响应不是有效 JSON": "The provider response was not valid JSON",
        "渠道未返回完整正文": "The provider did not return the full body text",
        "渠道仅返回思考或空内容": "The provider returned only reasoning, or nothing at all",
        "输出被截断或拦截，未将半段内容当作完成；请调整 Token 上限":
            "The output was truncated or blocked; a partial result is not treated as complete. Raise the token limit",
        "当前轮子没有 GPU offload 支持；可显式改为 CPU，或安装匹配的 CUDA 轮子":
            "This build has no GPU offload support; switch to CPU explicitly, or install a matching CUDA build",
        "模型缺少 chat template，不能猜测聊天格式；请选择带模板的 GGUF":
            "The model has no chat template, so the chat format cannot be guessed; choose a GGUF that ships one",
        "本地模型输出未完整结束；请调整输出上限，未保存坏谱":
            "The local model did not finish its output cleanly; adjust the output limit. No broken score was saved",
        "本地模型没有最终正文；关闭思考或调整输出上限":
            "The local model produced no final answer text; turn thinking off or adjust the output limit",
        "模型连通，但没有正确返回测试 JSON":
            "The model is reachable but did not return the expected test JSON",
        "模型请求成功": "Model request succeeded",
        # Redaction markers substituted into the message before it is shown.
        "[已隐藏]": "[hidden]",
        "[渠道地址]": "[channel URL]",

        # --- core_worker: generation, resume and doctor -----------------------
        "恢复工件与当前歌词、乐谱、种子或模型配置不一致":
            "The saved artifacts do not match the current lyrics, score, seed or model configuration",
        "恢复计划与请求不一致": "The saved plan does not match this request",
        "恢复结构与请求不一致": "The saved structure does not match this request",
        "恢复声学工件与结构不一致": "The saved acoustic artifacts do not match this structure",
        "恢复声学工件的生成参数不一致": "The saved acoustic artifacts were generated with different parameters",
        "恢复声学工件的形状或数值无效": "The saved acoustic artifacts have an invalid shape or values",
        "seeds 数量必须与 candidates 一致": "The number of seeds must match the number of candidates",
        "无效的 semantic.npy": "Invalid semantic.npy",
        "解码只接受 latent_manifest.json 记录的 latent.npy":
            "Decoding only accepts the latent.npy recorded in latent_manifest.json",
        "自检失败：未检测到可用的 GPU（CUDA/HIP）":
            "Self-check failed: no usable GPU (CUDA/HIP) was detected",
        "自检失败：GPU 不支持 BF16": "Self-check failed: the GPU does not support BF16",

        # --- voice_worker: reference-voice conversion -------------------------
        "混音结果为空或包含无效采样": "The mixdown is empty or contains invalid samples",
        "所选说话人缺少匹配的音色 index": "The selected speaker has no matching voice index",
        "所选音色没有该说话人的模型索引": "This voice has no model index for that speaker",
        "参考音色需要 1–30 秒的清晰干声，推荐 5–25 秒":
            "A reference voice needs 1-30 seconds of clean dry vocals; 5-25 seconds is recommended",
        "参考音色运行时未检测到可用的 GPU（CUDA/HIP）":
            "The reference-voice runtime found no usable GPU (CUDA/HIP)",

        # --- transcribe_worker ------------------------------------------------
        "转谱运行时未检测到可用的 GPU（CUDA/HIP）":
            "The transcription runtime found no usable GPU (CUDA/HIP)",
        "转谱没有产生可用的旋律 ABC": "Transcription did not produce a usable melody ABC",

        # --- worker_common ----------------------------------------------------
        "用户已取消任务": "The job was cancelled by the user",

        # --- artifacts --------------------------------------------------------
        "高级工件缺少模型来源": "The advanced artifact has no model provenance",
        "高级工件的模型来源与当前 YuE2 权重不一致":
            "The advanced artifact's model provenance does not match the current YuE2 weights",

        # --- retention --------------------------------------------------------
        "retention.json 必须是 JSON 对象": "retention.json must be a JSON object",
        "retention.enabled 必须是布尔值": "retention.enabled must be a boolean",
        "retention.json 的限制值必须是非负数字":
            "The limits in retention.json must be non-negative numbers",
        "retention.cleanup_interval_hours 必须大于 0":
            "retention.cleanup_interval_hours must be greater than 0",

        # --- settings ---------------------------------------------------------
        "settings.json 必须是 JSON 对象": "settings.json must be a JSON object",
        "settings.json 版本不受支持": "Unsupported settings.json version",
        "模型路径必须是文件夹": "The model path must be a folder",

        # --- updater ----------------------------------------------------------
        "更新清单中的版本号无效": "Invalid version number in the update manifest",
        "更新下载被重定向到了不受信任的地址":
            "The update download was redirected to an untrusted address",
        "更新文件超过允许大小": "The update file exceeds the allowed size",
        "更新清单格式不受支持": "Unsupported update manifest format",
        "更新清单的版本与文件名不一致":
            "The update manifest version and file name do not match",
        "更新清单的下载地址无效": "Invalid download URL in the update manifest",
        "更新清单缺少有效的 SHA256": "The update manifest has no valid SHA256",
        "无法读取 GitHub 更新清单，请检查网络后重试":
            "Could not read the GitHub update manifest; check your network and try again",
        "更新压缩包的内容超过允许大小": "The update archive contents exceed the allowed size",
        "更新压缩包包含不安全的路径": "The update archive contains an unsafe path",
        "更新包缺少有效的项目版本": "The update package has no valid project version",
        "更新包内部版本不一致": "The version inside the update package is inconsistent",
        "当前已经是最新版本": "Already on the latest version",
        "更新包 SHA256 校验失败，已拒绝安装":
            "The update package failed its SHA256 check and was refused",
        "更新包版本与清单不一致": "The update package version does not match the manifest",
        "更新包已校验，正在重启并安装": "The update package is verified; restarting to install",
        "更新状态文件无法读取": "The update status file could not be read",
        "更新状态无效": "Invalid update status",

        # --- assistant_data: provider, request and draft validation -----------
        "不支持的 LLM 渠道": "Unsupported LLM provider",
        "API 地址必须是无凭据、无查询参数的 HTTP(S) 地址":
            "The API URL must be an HTTP(S) address with no credentials and no query parameters",
        "远程 API 请使用 HTTPS；本机服务可以使用 HTTP":
            "Remote APIs must use HTTPS; a service on this machine may use HTTP",
        "本地 GGUF 使用本机目录列表，不请求云端模型 LIST":
            "Local GGUF uses the on-disk directory listing and does not fetch a cloud model list",
        "无法从聊天地址推导模型 LIST 地址":
            "Could not derive the model-list URL from the chat URL",
        "本地模式请刷新 GGUF 目录": "In local mode, refresh the GGUF directory",
        "模型 LIST 响应超过 2 MiB，已停止读取":
            "The model-list response exceeded 2 MiB; reading stopped",
        "模型 LIST 网络请求失败；已保留默认模型和手动填写":
            "The model-list request failed; the default model and manual entry are still available",
        "模型 LIST 接口没有返回有效 JSON": "The model-list endpoint did not return valid JSON",
        "模型 LIST 响应缺少 data/models 数组":
            "The model-list response has no data/models array",
        "模型 LIST 为空；仍可手动填写模型 ID":
            "The model list is empty; you can still type a model ID yourself",
        "LLM 配置包含未知字段；密钥请使用独立凭据入口":
            "The LLM configuration contains unknown fields; enter secrets through the separate credential field",
        "温度策略无效": "Invalid temperature policy",
        "输出 Token 上限必须小于上下文，并留出提示词空间":
            "The output token limit must be below the context size, leaving room for the prompt",
        "请选择 GGUF 第一分片，分片数必须在 1–999":
            "Choose the first GGUF shard; the shard count must be within 1-999",
        "GGUF 元数据尚不可读，请确认下载完整":
            "The GGUF metadata is not readable yet; make sure the download is complete",
        "模型缺少聊天模板": "The model has no chat template",
        "助手请求包含未知字段；不要把 API Key 放入任务":
            "The assistant request contains unknown fields; do not put an API key in a job",
        "创作参数包含未知字段": "The creation parameters contain unknown fields",
        "随机种子超出可精确表示范围": "The random seed exceeds the exactly representable range",
        "段落序号必须在 1–100": "The section number must be within 1-100",
        "BPM 或目标时长超出范围": "The BPM or target duration is out of range",
        "无效的乐谱模式": "Invalid score mode",
        "请填写 API 模型名或选择本地 GGUF":
            "Enter an API model name or choose a local GGUF",
        "请填写歌曲想法": "Describe the song idea",
        "请选择存在的 GGUF 语言模型": "Choose a GGUF language model that exists",
        "本地 LLM 环境未安装，请先运行安装脚本；API 创作仍可用":
            "The local LLM environment is not installed; run the installer first. API-based creation still works",
        "无效的重试阶段": "Invalid retry stage",
        "重试固定字段无效": "Invalid pinned field for the retry",
        "纯器乐标记无效": "Invalid instrumental flag",
        "固定文本包含无效内容": "The pinned text contains invalid content",
        "固定曲风不能为空": "The pinned style cannot be empty",
        "空歌词只适用于明确选择的纯器乐":
            "Empty lyrics are only allowed when instrumental is explicitly selected",
        "无效草稿页面": "Invalid draft panel",
        "草稿格式或大小不正确": "The draft has the wrong format or size",
        "草稿不能包含凭据": "A draft must not contain credentials",
        "草稿不能包含密钥": "A draft must not contain a secret",
        "草稿版本不支持，原文件已保留":
            "Unsupported draft version; the original file was kept",
        "草稿已在其他页面更新，请重新载入后合并":
            "The draft was updated in another panel; reload it and merge",
        "草稿版本或格式不支持，原文件已保留；请使用匹配版本或从 previous 备份恢复":
            "Unsupported draft version or format; the original file was kept. Use a matching version or restore the .previous backup",
        "记住密钥仅支持 Windows；可以使用本次会话凭据":
            "Remembering secrets is Windows-only; you can still use session credentials",
        "无法读取本机加密凭据，请重新填写":
            "The encrypted credentials on this machine could not be read; enter them again",
        "API Key 必须是非空单行文本": "The API key must be non-empty single-line text",
        "API 凭据待补，请配置后重试": "The API credential is missing; configure it and retry",
        "API 凭据不存在或与当前地址不匹配，请重新填写":
            "The API credential does not exist or does not match the current address; enter it again",

        # --- rvc_api: workbench routes ----------------------------------------
        "试听文件不存在": "Preview file not found",
        "不支持的音频读取范围": "Unsupported audio byte range",
        "素材不存在": "Material not found",
        "音频尚未生成": "The audio has not been generated yet",
        "该音色还没有试听音频": "This voice has no preview audio yet",
        "音色任务正在运行或排队，请结束后再修改项目":
            "A voice job is running or queued; wait for it to finish before changing the project",
        "参数必须是对象": "Parameters must be an object",
        "说话人 ID 或名称无效": "Invalid speaker ID or name",
        "至少需要一个说话人": "At least one speaker is required",
        "更新包含不存在的素材": "The update refers to a material that does not exist",
        "素材选择与试听确认必须是布尔值":
            "Material selection and audition confirmation must be booleans",
        "素材对应的说话人不存在": "The speaker for this material does not exist",
        "要移除的素材不存在": "The material to remove does not exist",
        "请先移除或重新分配该说话人的素材，再移除说话人":
            "Reassign or remove this speaker's material before removing the speaker",
        "不支持的目录": "Unsupported directory",

        # --- rvc_library: voice registry, import and export -------------------
        "音色目录设置损坏": "The voice directory settings are corrupt",
        "无效音色 ID": "Invalid voice ID",
        "音色记录损坏": "The voice record is corrupt",
        "音色模型文件不存在或大小无效":
            "The voice model file is missing or has an invalid size",
        "请选择可推理的 RVC 音色模型；训练中的 G/D 检查点不能直接导入":
            "Choose an RVC voice model that can be used for inference; training G/D checkpoints cannot be imported directly",
        "RVC 模型结构或版本无效": "Invalid RVC model structure or version",
        "RVC 模型缺少有效的说话人权重": "The RVC model has no valid speaker weights",
        "RVC 模型权重含无效数据": "The RVC model weights contain invalid data",
        "RVC 模型采样率无效": "Invalid RVC model sample rate",
        "模型说话人信息与权重不一致":
            "The model's speaker information does not match its weights",
        "音色名称需要 1–100 个字符": "A voice name must be 1-100 characters",
        "每个说话人必须提供对应的检索 index": "Every speaker needs its own retrieval index",
        "检索 index 文件无效": "Invalid retrieval index file",
        "index 维度、训练状态或内容与模型不匹配":
            "The index dimensions, training state or contents do not match the model",
        "登记期间音色文件发生变化，请重试":
            "The voice files changed while they were being registered; try again",
        "index 映射必须是说话人 ID 到文件的对象":
            "The index mapping must be an object from speaker ID to file",
        "音色压缩包为空或超出大小限制":
            "The voice archive is empty or exceeds the size limit",
        "请选择本软件导出的音色 ZIP；其他模型请用 PTH + INDEX 导入":
            "Choose a voice ZIP exported by this app; import other models with PTH + INDEX",
        "音色压缩包不能包含符号链接": "The voice archive must not contain symlinks",
        "音色说明过大": "The voice description is too large",
        "音色压缩包缺少模型或说明": "The voice archive is missing its model or description",
        "压缩包文件清单不完整": "The archive file list is incomplete",

        # --- rvc_projects: training projects and materials --------------------
        "无效训练项目 ID": "Invalid training project ID",
        "训练项目记录无效": "The training project record is invalid",
        "训练项目名称需要 1–100 个字符": "A training project name must be 1-100 characters",
        "文件中途改变了采样率或声道，请先导出为 WAV":
            "The file changed sample rate or channel count part-way through; export it as WAV first",
        "音频含无效采样": "The audio contains invalid samples",
        "没有可读取的音频": "No readable audio",
        "静音素材": "Silent material",
        "音量偏低": "Low volume",
        "疑似削波失真": "Possible clipping distortion",
        "近静音采样较多，请试听并裁去空白":
            "Many near-silent samples; audition it and trim the silence",
        "素材不足 1 秒": "Material is shorter than 1 second",
        "请选择支持的音频文件": "Choose a supported audio file",
        "单个素材不能超过 1 GB": "A single material file cannot exceed 1 GB",
        "说话人 ID 不存在": "That speaker ID does not exist",
        "素材类型无效": "Invalid material type",
        "素材复制校验失败，请重新导入":
            "The material copy failed verification; import it again",
        "请至少选中一段训练素材": "Select at least one training clip",
        "请先试听并确认选中的训练素材":
            "Audition and confirm the selected training clips first",
        "含伴奏的素材请先分离人声，试听后再用于训练":
            "Material with accompaniment must be separated and auditioned before training",

        # --- rvc_training: stage preparation ----------------------------------
        "训练设置必须是对象": "Training settings must be an object",
        "RVC 版本或采样率无效": "Invalid RVC version or sample rate",
        "音高提取方式无效": "Invalid pitch-extraction method",
        "说话人 ID 必须唯一，并位于 0–109": "Speaker IDs must be unique and within 0-109",
        "HuBERT 特征与模型版本不匹配": "The HuBERT features do not match the model version",
        "素材缺少对应的说话人 ID": "The material has no matching speaker ID",
        "没有可训练素材，请先完成素材预处理和特征提取":
            "No trainable material; finish material preprocessing and feature extraction first",
        "素材或训练结构已经改变；请创建新训练项目，原检查点已保留":
            "The material or training structure changed; create a new training project. The existing checkpoints were kept",

        # --- rvc_preflight: resource estimates --------------------------------
        "请先导入并选择训练素材": "Import and select training material first",
        "请先逐段试听并确认选中的素材": "Audition each selected clip and confirm it first",
        "素材不足 5 分钟，可用于流程试跑；音色质量需要更多干净素材和试听评估":
            "Under 5 minutes of material: fine for a pipeline test run, but voice quality needs more clean material and auditioning",
        "可用系统内存不足 2 GB，建议关闭暂时不用的应用后再训练":
            "Less than 2 GB of system memory is free; close applications you are not using before training",
        "当前可用显存不足 4 GB，建议等待其他 GPU 任务结束；自动批次会尽量降低占用":
            "Less than 4 GB of VRAM is free; wait for other GPU jobs to finish. Automatic batching keeps usage low",
        "暂时无法读取显存；训练启动时仍会检查可用设备":
            "VRAM could not be read right now; available devices are still checked when training starts",

        # --- rvc_pitch --------------------------------------------------------
        "训练片段标识无效": "Invalid training-clip identifier",
        "训练音高统计遇到损坏特征":
            "Corrupt features while collecting training pitch statistics",
        "RVC 移调需要 -12 至 12 的整数半音":
            "RVC transposition needs a whole number of semitones from -12 to 12",

        # --- rvc_checkpoints --------------------------------------------------
        "没有完整的 G/D 检查点组": "No complete G/D checkpoint pair",
        "没有可恢复的完整检查点": "No complete checkpoint to resume from",

        # --- rvc_runner -------------------------------------------------------
        "RVC 计算组件未安装": "The RVC compute components are not installed",

        # --- rvc_storage: verified directory migration ------------------------
        "目录设置必须包含训练项目、素材、音色库路径":
            "The directory settings must include the training-project, material and voice-library paths",
        "请选择独立的数据文件夹，不能使用磁盘根目录或整合包根目录":
            "Choose a separate data folder; a drive root or the bundle root cannot be used",
        "音色数据目录不能与程序、基础模型或任务目录重叠":
            "Voice data directories must not overlap the program, base-model or job directories",
        "新目录不能与现有素材、训练或音色目录重叠":
            "The new directory must not overlap the existing material, training or voice directories",
        "三个数据目录不能相同或互相嵌套":
            "The three data directories cannot be the same or nested inside one another",
        "迁移源目录不能是链接": "The migration source directory cannot be a link",
        "目录中存在名称冲突的迁移标记，请先改名后重试":
            "The directory has a conflicting migration marker; rename it and try again",
        "迁移记录不属于当前整合包": "The migration record does not belong to this bundle",
        "目录未发生变化": "The directories did not change",
        "迁移记录 ID 无效": "Invalid migration record ID",
        "目录设置已改变，不能继续旧迁移；原文件和迁移副本均已保留":
            "The directory settings changed, so the old migration cannot continue; originals and migration copies were both kept",
        "迁移记录与目录变化不一致": "The migration record does not match the directory changes",
        "迁移记录中的目录不完整": "The migration record does not list all directories",
        "当前目录设置与已提交迁移不一致":
            "The current directory settings do not match the committed migration",
        "迁移记录包含无效路径": "The migration record contains an invalid path",
        "迁移暂存目录不能是链接": "The migration staging directory cannot be a link",
        "目标目录不属于当前迁移": "The target directory does not belong to this migration",
        "迁移暂存目录已被占用": "The migration staging directory is already in use",
        "迁移期间原目录发生改变；原文件已保留，请选择另一个空目标目录重新迁移":
            "The source directory changed during the migration; the originals were kept. Restart it with another empty target",
        "已迁移文件缺失或损坏，请从原目录备份恢复":
            "A migrated file is missing or damaged; restore it from the original directory backup",
        "文件复制校验失败，原目录保持不变":
            "The file copy failed verification; the original directory is unchanged",
        "原目录在校验期间发生改变，尚未切换设置":
            "The source directory changed during verification; the settings were not switched",
        "所有文件已通过校验，正在切换目录；原文件保留为备份":
            "All files passed verification; switching directories. The originals are kept as a backup",
        "目录已切换，原目录保留为备份；确认新位置可用后可自行清理原目录":
            "Directories switched; the originals are kept as a backup. Clean them up yourself once the new location works",

        # --- rvc_worker: import, separation and training jobs -----------------
        "素材文件夹不存在": "The material folder does not exist",
        "单次最多导入 1000 个音频，请拆分文件夹后重试；本次尚未导入":
            "At most 1000 audio files can be imported at once; split the folder and try again. Nothing was imported",
        "单次最多导入 1000 个音频": "At most 1000 audio files can be imported at once",
        "没有找到支持的音频素材": "No supported audio material was found",
        "请先选中需要分离或检测伴奏的素材":
            "Select the material you want to separate or check for accompaniment first",
        "所选 RVC 版本的训练底模尚未下载，请安装对应底模后重试":
            "The base training model for the selected RVC version has not been downloaded; install it and try again",
        "每个说话人都需要至少一段已确认的素材；请补充素材或移除空说话人":
            "Every speaker needs at least one confirmed clip; add material or remove the empty speakers",
        "素材、说话人或训练结构发生变化，请新建训练项目；原有检查点已保留":
            "The material, speakers or training structure changed; create a new project. The existing checkpoints were kept",
        "已训练项目的预处理文件损坏，请修复备份或新建项目":
            "The preprocessed files of a trained project are damaged; repair them from a backup or create a new project",
        "F0 特征缺失或无效": "F0 features are missing or invalid",
        "训练进程未输出达到目标轮次的模型，检查点已保留":
            "Training produced no model that reached the target epoch; the checkpoints were kept",
        "训练后的试听音频无声，请检查素材和训练日志":
            "The post-training preview audio is silent; check the material and the training log",
    },
}

# Ordered: first full match wins. Group references (\1) carry the values through.
# A pattern's literal prefix is asserted against the source tree, and its own
# sample must full-match, so only (.+) and (\d+) capture groups are usable --
# alternation or non-capturing groups would break `test_every_pattern_actually_fires`.
PATTERNS = {
    "en": (
        (r"任务运行失败（worker 返回码 (\d+)）", r"Job failed (worker exit code \1)"),
        (r"不支持的任务类型：(.+)", r"Unsupported job kind: \1"),
        (r"运行时未安装：(.+)。请先运行 install_runtime\.bat",
         r"Runtime not installed: \1. Run install_runtime.bat first"),
        (r"文件大小必须在 (\d+)GB 以内", r"File size must be within \1 GB"),
        (r"缺少字段：(.+)", r"Missing field: \1"),
        (r"请选择支持的文件格式：(.+)", r"Choose a supported file format: \1"),

        # --- assistant_worker -------------------------------------------------
        (r"(.+) 未完成（(.+)），已保留前序结果",
         r"\1 did not complete (\2); earlier results were kept"),
        (r"模型服务返回 HTTP (\d+)；未自动重发，请检查渠道设置",
         r"The model service returned HTTP \1; nothing was resent automatically. Check the provider settings"),
        (r"GGUF 分片缺失：(.+)", r"Missing GGUF shard: \1"),
        (r"GGUF 加载失败（(.+)）；请检查架构/分片/显存，降低 GPU 层数或上下文后重试",
         r"Failed to load the GGUF (\1); check the architecture, shards and VRAM, then lower the GPU layers or context and retry"),
        (r"所选模型训练上下文为 (.+)，请降低上下文设置",
         r"The selected model was trained with a context of \1; lower the context setting"),
        (r"上下文不足：提示 (.+) \+ 输出 (.+) \+ 余量 32 超过 (.+)；未截断原文",
         r"Not enough context: prompt \1 + output \2 + a 32-token margin exceeds \3; the input was not truncated"),
        (r"助手任务失败（(.+)）", r"Assistant job failed (\1)"),

        # --- core_worker ------------------------------------------------------
        (r"找不到随节点发布的 YuE2 推理源码：(.+)",
         r"YuE2 inference source shipped with this node was not found: \1"),

        # --- voice_worker -----------------------------------------------------
        (r"(.+)文件不在允许的本地目录中：(.+)",
         r"File is not in an allowed local directory: \2"),
        (r"(.+) 必须是数字", r"\1 must be a number"),
        (r"(.+) 必须在 (.+) 到 (.+) 之间", r"\1 must be between \2 and \3"),
        (r"音频无效：(.+)", r"Invalid audio: \1"),
        (r"Seed-VC 未产生唯一的转换音轨（找到 (\d+) 个）",
         r"Seed-VC did not produce exactly one converted track (found \1)"),

        # --- transcribe_worker ------------------------------------------------
        (r"找不到音频：(.+)", r"Audio not found: \1"),

        # --- artifacts --------------------------------------------------------
        (r"无效的工件清单路径：(.+)", r"Invalid artifact manifest path: \1"),
        (r"工件缺失或是符号链接：(.+)", r"Artifact is missing or is a symlink: \1"),
        (r"(.+) 运行时权重与模型来源清单不一致",
         r"\1 runtime weights do not match the model provenance manifest"),
        (r"缺少 (.+)；旧版或不完整的高级工件不能继续推理",
         r"Missing \1; an outdated or incomplete advanced artifact cannot be used for further inference"),
        (r"(.+) 的格式或工件类型不正确", r"\1 has the wrong format or artifact kind"),
        (r"(.+) 缺少必要文件记录", r"\1 has no record of the required files"),
        (r"(.+) 包含越界路径", r"\1 contains an out-of-bounds path"),
        (r"清单文件缺失：(.+)", r"Manifest file missing: \1"),
        (r"高级工件完整性校验失败：(.+)", r"Integrity check failed for the advanced artifact: \1"),
        (r"(.+) 缺少模型来源", r"\1 has no model provenance"),
        (r"谱系完整性校验失败：(.+)", r"Lineage integrity check failed: \1"),
        (r"(.+) 包含无效文件记录", r"\1 contains an invalid file record"),

        # --- retention --------------------------------------------------------
        (r"retention\.json 的 (.+) 必须是对象", r"retention.json section \1 must be an object"),

        # --- updater ----------------------------------------------------------
        (r"更新包缺少必要文件：(.+)", r"The update package is missing a required file: \1"),

        # --- assistant_data ---------------------------------------------------
        (r"模型 LIST 接口返回 HTTP (\d+)；请检查渠道、Key 或改为手动填写模型 ID",
         r"The model-list endpoint returned HTTP \1; check the provider and key, or type the model ID yourself"),
        (r"(.+) 必须在 (.+)–(.+) 范围内", r"\1 must be within \2-\3"),
        (r"(.+) 必须是布尔值", r"\1 must be a boolean"),
        (r"(.+) 格式不正确", r"\1 has the wrong format"),
        (r"请从 (.+) 移除密钥，使用独立 API Key 输入",
         r"Remove the secret from \1 and use the separate API key field"),
        (r"GGUF 文件或分片缺失：(.+)", r"GGUF file or shard missing: \1"),
        (r"(.+) 必须是有限长度文本", r"\1 must be text of a limited length"),
        (r"(.+) 必须是有限数值", r"\1 must be a finite number"),
        (r"请从 (.+) 移除密钥", r"Remove the secret from \1"),

        # --- rvc_library ------------------------------------------------------
        (r"音色文件缺失或损坏：(.+)", r"Voice file missing or damaged: \1"),
        (r"音色压缩包校验失败：(.+)", r"Voice archive verification failed: \1"),

        # --- rvc_projects -----------------------------------------------------
        (r"素材缺失或已改变：(.+)", r"Material is missing or has changed: \1"),

        # --- rvc_training -----------------------------------------------------
        (r"(.+) 必须为整数", r"\1 must be an integer"),
        (r"训练特征缺失：(.+)；请重新执行特征提取",
         r"Training features are missing: \1; run feature extraction again"),
        (r"训练特征损坏：(.+)", r"Training features are damaged: \1"),
        # The tail is the raw (possibly multi-line) stage log; the source already
        # puts a newline before it, so the capture group carries it through.
        (r"RVC (.+) 失败（(\d+)）：([\s\S]+)",
         r"RVC \1 failed (exit code \2):\3"),

        # --- rvc_preflight ----------------------------------------------------
        (r"训练目录空间不足：预计还需约 (.+) GB，可用 (.+) GB",
         r"Not enough space in the training directory: about \1 GB more is needed, \2 GB free"),
        (r"缺少所选版本的训练底模：(.+)",
         r"Missing the base training model for the selected version: \1"),

        # --- rvc_storage ------------------------------------------------------
        (r"迁移目录中含链接，请先整理为实际文件：(.+)",
         r"The directory being migrated contains a link; replace it with real files first: \1"),
        (r"目标目录需要为空，以免覆盖已有文件：(.+)",
         r"The target directory must be empty so existing files are not overwritten: \1"),
        (r"目标磁盘空间不足，需要约 (.+) GB 和校验余量：(.+)",
         r"Not enough space on the target disk: about \1 GB plus verification headroom is needed: \2"),
        (r"正在校验并复制 (.+)：(.+)", r"Verifying and copying \1: \2"),

        # --- rvc_worker -------------------------------------------------------
        (r"素材全部导入失败：(.+)", r"Every material import failed: \1"),
        (r"RVC (.+) 没有产生有效文件", r"RVC \1 produced no usable files"),
        (r"素材未产生有效训练片段：(.+)",
         r"The material produced no usable training segments: \1"),
        (r"显存不足，已释放训练进程并将批大小降至 (\d+)，从完整检查点继续",
         r"Out of VRAM: the training process was released and the batch size lowered to \1, resuming from the last checkpoint"),
        (r"说话人 (\d+) 缺少唯一匹配的 index",
         r"Speaker \1 has no single matching index"),

        # Keep last: the broadest prefix, so every specific 缺少* rule above wins.
        (r"缺少 (.+)", r"Missing \1"),
    ),
}
