/* Dictionary for the RVC voices / training panel (rvc.js) and its markup in
 * index.html.
 *
 * Populated alongside the rvc.js conversion. Key namespace: rvc.*
 *
 * Coverage notes:
 *   - rvc.js (all user-visible strings, including job progress, preflight,
 *     storage migration, voice-library actions and validation errors)
 *   - index.html: the <section id="voices"> markup only (the "My voices /
 *     training" panel). The rvc-cover-* fragments inside the cover panel are
 *     left to whoever owns that markup.
 *   - NOT translated on purpose: the default project name '我的音色' in rvc.js,
 *     which is submitted to the backend as project data.
 *
 * Templates that this module fills in use {placeholders}: t('rvc.voice.meta',
 * {version, rate, count}).
 */
window.YUE2_I18N.registerLocale('zh', {
  // Panel shell (index.html #voices)
  'rvc.panel.title': '训练属于你的演唱音色',
  'rvc.panel.lead': '导入素材、试听筛选、训练模型，再发送到翻唱区。训练与歌曲生成共用任务队列。',
  // Separator for lists of server-provided items (warnings, errors, issues).
  'rvc.listSeparator': '；',

  // Storage locations / migration
  'rvc.storage.summary': '素材、训练缓存与音色库位置',
  'rvc.storage.projects': '训练项目与缓存',
  'rvc.storage.datasets': '训练素材',
  'rvc.storage.voices': '用户音色库',
  'rvc.storage.placeholder': '留空使用整合包默认目录',
  'rvc.storage.hint': '选择空文件夹。迁移会复制并校验文件，成功后切换目录；原目录保留为备份，确认新位置可用后可自行清理。中途取消可继续迁移。',
  'rvc.storage.preview': '预览迁移',
  'rvc.storage.apply': '开始迁移并切换',
  'rvc.storage.pathsChanged': '路径已更改，请重新预览迁移。',
  'rvc.storage.planItem': '{files} 个文件，约 {size} GB',
  'rvc.storage.noChanges': '目录未发生变化。',

  // Projects
  'rvc.field.project': '训练项目',
  'rvc.field.newProjectName': '新项目名称',
  'rvc.placeholder.projectName': '例如：我的流行演唱音色',
  'rvc.action.createProject': '新建训练项目',
  'rvc.action.refresh': '刷新',
  'rvc.action.openDirectory': '打开训练目录',

  // Step 1 - import and audition material
  'rvc.step.importTitle': '1. 导入与试听素材',
  'rvc.step.importHint': '推荐 10–50 分钟干净、音色一致的素材。每段都可试听；含伴奏的歌曲请先分离人声，再确认是否用于训练。',
  'rvc.field.files': '选择多个音频',
  'rvc.field.folder': '或导入整个文件夹',
  'rvc.placeholder.folderPath': '填写本机音频文件夹路径',
  'rvc.field.materialSpeaker': '这些素材属于',
  'rvc.field.sourceType': '素材类型',
  'rvc.sourceType.unknown': '待试听确认',
  'rvc.sourceType.dry': '已准备好纯人声',
  'rvc.sourceType.mix': '含伴奏的歌曲',
  'rvc.action.import': '导入素材',
  'rvc.action.separate': '分离选中素材 / 检查伴奏',
  'rvc.field.speaker': '说话人',
  'rvc.action.removeSpeaker': '移除说话人',
  'rvc.label.speakerOption': '{name}（{id}）',
  'rvc.label.speakerEntry': '{id}：{name}',
  'rvc.material.summaryShort': '选中 {count} 段，合计 {minutes} 分钟。不足 5 分钟，音色可能不稳定；建议补充干净素材。',
  'rvc.material.summaryReview': '选中 {count} 段，合计 {minutes} 分钟。请逐段试听并排除不合适的素材。',
  'rvc.material.meta': '{duration} 秒 · {rate} Hz · {channels} 声道',
  'rvc.material.separatedVocal': '分离后人声',
  'rvc.material.accompanimentEnergy': '伴奏能量估计 {percent}%，请以试听结果为准。',
  'rvc.material.useForTraining': '用于训练 / 分离',
  'rvc.material.reviewed': '已试听，确认素材合适',
  'rvc.material.hasAccompaniment': '此素材含伴奏，请先分离人声。',
  'rvc.material.empty': '还没有素材。导入后可逐段试听、确认和分配说话人。',
  'rvc.action.remove': '移除',

  // Step 2 - training settings
  'rvc.step.settingsTitle': '2. 训练设置',
  'rvc.field.epochs': '训练轮数',
  'rvc.field.batch': '批次大小（0 为自动）',
  'rvc.step.advancedSummary': '高级训练设置与说话人',
  'rvc.field.version': '模型版本',
  'rvc.field.sampleRate': '采样率',
  'rvc.field.f0': '音高提取',
  'rvc.field.saveEvery': '每隔多少轮保存',
  'rvc.field.gpu': 'GPU 编号',
  'rvc.field.workers': '数据加载进程数',
  'rvc.field.speakerId': '新说话人 ID',
  'rvc.field.speakerName': '新说话人名称',
  'rvc.placeholder.speakerName': '例如：第二位演唱者',
  'rvc.action.addSpeaker': '添加说话人',
  'rvc.step.pipelineHint': '步骤：素材预处理 → 音高 → HuBERT 特征 → 训练 → 检索索引 → 音色库。更换素材或模型结构时请新建项目；取消后会保留已保存的阶段和检查点。',
  'rvc.action.preflight': '检查训练条件',
  'rvc.action.train': '开始 / 继续训练',
  'rvc.action.cancel': '取消音色任务',
  'rvc.preflight.hint': '训练前会检查素材确认、底模和剩余空间；显存与内存以检查时为准。',
  'rvc.preflight.summary': '额外空间预算约 {required} GB，可用磁盘 {disk} GB，可用内存 {ram} GB{gpu}。{issues}',
  'rvc.preflight.gpu': '，GPU {id} 可用显存 {vram} GB',

  // Job progress / results
  'rvc.job.running': '{kind}：{stage}{parts}。{message}',
  'rvc.job.epochPart': ' · 第 {epoch} 轮',
  'rvc.job.epochPartTotal': ' · 第 {epoch} / {total} 轮',
  'rvc.job.progressCount': '（{completed}/{total}）',
  'rvc.job.progressSize': '（{done} / {total} GB）',
  'rvc.job.lossPart': '。最近训练损失：{loss}',
  'rvc.job.defaultMessage': '可查看日志或取消，已保存的检查点会保留。',
  'rvc.job.done': '{kind}已完成{extra}{review}',
  'rvc.job.reviewRequired': '。请试听分离后人声，再确认用于训练。',
  'rvc.job.importErrors': '；{count} 个文件未能导入：{items}',
  'rvc.job.importErrorItem': '{name}：{error}',
  'rvc.job.backups': '原目录备份（尚未删除）：',
  'rvc.job.downloadZip': '下载音色 ZIP',
  'rvc.job.emptyLog': '日志暂为空',
  'rvc.action.showLog': '查看训练日志',
  'rvc.action.resume': '从已保存阶段继续',

  // Voice library
  'rvc.library.title': '我的音色',
  'rvc.library.lead': '训练完成后会自动加入这里，用户音色与训练资料会在软件更新时保留。',
  'rvc.library.emptyTitle': '还没有专属音色',
  'rvc.library.emptyHint': '在上方导入素材并训练，或导入已有模型。训练成功后，音色会自动出现在这里。',
  'rvc.voice.meta': '{version} · {rate} kHz · {count} 位说话人',
  'rvc.voice.noPreview': '暂无试听样例',
  'rvc.voice.useForCover': '用于翻唱',
  'rvc.voice.export': '导出音色包',
  'rvc.voice.rename': '改名',
  'rvc.voice.open': '打开文件夹',
  'rvc.voice.renamePrompt': '音色名称',
  'rvc.voice.removeConfirm': '移除「{name}」？模型会保留在音色库的 .trash 文件夹，训练素材不受影响。',
  'rvc.voice.removed': '音色已移除，可从此目录恢复：{directory}',

  // Model import
  'rvc.modelImport.summary': '导入已有 RVC 音色',
  'rvc.modelImport.hint': '选择本软件导出的 ZIP，或一个推理 PTH 和对应 INDEX。训练中的 G / D 检查点不能直接导入。',
  'rvc.field.voiceName': '音色名称（选填）',
  'rvc.placeholder.voiceName': '例如：我的演唱音色',
  'rvc.field.modelFiles': '模型文件',
  'rvc.field.indexMapping': '多说话人 index 映射（选填）',
  'rvc.placeholder.indexMapping': '单说话人留空；多说话人填写 {"0":"小明.index","1":"小红.index"}',
  'rvc.action.checkAndImport': '检查并导入音色',

  // Cover tab: trained-voice pickers and pitch guidance
  'rvc.cover.selectVoice': '请选择已训练音色',
  'rvc.pitch.selectVoice': '选择音色后查看训练音域。',
  'rvc.pitch.noF0': '此模型未启用音高条件，不支持指定移调。',
  'rvc.pitch.range': '训练素材主要音域约 {low}–{high} Hz。由训练音高曲线估计，不是音色能演唱的硬性上下限。',
  'rvc.pitch.unknown': '此音色暂未记录训练音域。旧训练项目可点击继续训练，复用已完成结果并补充统计；导入模型可先试听原调与不同八度。',

  // Uploads
  'rvc.upload.uploading': '正在上传：{name}',
  'rvc.upload.uploadingModel': '正在上传模型文件：{name}',

  // Errors
  'rvc.error.noProjectSelected': '请先新建或选择训练项目',
  'rvc.error.noProject': '请先新建训练项目',
  'rvc.error.selectProject': '请先选择训练项目',
  'rvc.error.previewFirst': '请先预览迁移',
  'rvc.error.modelFileChoice': '请选择一个 ZIP，或一个 PTH 与对应的 INDEX',
  'rvc.error.duplicateFileNames': '文件名重复，请为不同说话人的 index 使用不同文件名',
  'rvc.error.mappingRequired': '多个 INDEX 需要填写说话人 ID 与文件名的映射',
  'rvc.error.mappingInvalid': 'index 映射中的 ID 或文件名无效',
});

window.YUE2_I18N.registerLocale('en', {
  // Panel shell (index.html #voices)
  'rvc.panel.title': 'Train a singing voice of your own',
  'rvc.panel.lead': 'Import material, audition and filter it, train a model, then send it to the cover tab. Training and song generation share the same job queue.',
  // Separator for lists of server-provided items (warnings, errors, issues).
  'rvc.listSeparator': '; ',

  // Storage locations / migration
  'rvc.storage.summary': 'Material, training cache and voice library locations',
  'rvc.storage.projects': 'Training projects and cache',
  'rvc.storage.datasets': 'Training material',
  'rvc.storage.voices': 'User voice library',
  'rvc.storage.placeholder': 'Leave empty to use the bundle default directory',
  'rvc.storage.hint': 'Choose empty folders. The migration copies and verifies the files, then switches the directories; the original folders are kept as a backup, and you can clean them up yourself once the new location works. Cancelling midway is resumable.',
  'rvc.storage.preview': 'Preview migration',
  'rvc.storage.apply': 'Start migration and switch',
  'rvc.storage.pathsChanged': 'Paths changed — preview the migration again.',
  'rvc.storage.planItem': '{files} file(s), about {size} GB',
  'rvc.storage.noChanges': 'The directories are unchanged.',

  // Projects
  'rvc.field.project': 'Training project',
  'rvc.field.newProjectName': 'New project name',
  'rvc.placeholder.projectName': 'For example: my pop singing voice',
  'rvc.action.createProject': 'New training project',
  'rvc.action.refresh': 'Refresh',
  'rvc.action.openDirectory': 'Open training directory',

  // Step 1 - import and audition material
  'rvc.step.importTitle': '1. Import and audition material',
  'rvc.step.importHint': '10–50 minutes of clean, tonally consistent material is recommended. Every clip can be auditioned; for songs with accompaniment, separate the vocals first and then confirm whether to use them for training.',
  'rvc.field.files': 'Choose one or more audio files',
  'rvc.field.folder': 'Or import a whole folder',
  'rvc.placeholder.folderPath': 'Enter an audio folder path on this machine',
  'rvc.field.materialSpeaker': 'These clips belong to',
  'rvc.field.sourceType': 'Material type',
  'rvc.sourceType.unknown': 'To confirm by auditioning',
  'rvc.sourceType.dry': 'Clean vocals, ready to use',
  'rvc.sourceType.mix': 'Song with accompaniment',
  'rvc.action.import': 'Import material',
  'rvc.action.separate': 'Separate selected material / check accompaniment',
  'rvc.field.speaker': 'Speaker',
  'rvc.action.removeSpeaker': 'Remove speaker',
  'rvc.label.speakerOption': '{name} ({id})',
  'rvc.label.speakerEntry': '{id}: {name}',
  'rvc.material.summaryShort': '{count} clip(s) selected, {minutes} minutes in total. Under 5 minutes — the voice may be unstable; add more clean material.',
  'rvc.material.summaryReview': '{count} clip(s) selected, {minutes} minutes in total. Audition every clip and drop the unsuitable ones.',
  'rvc.material.meta': '{duration} s · {rate} Hz · {channels} channel(s)',
  'rvc.material.separatedVocal': 'Separated vocals',
  'rvc.material.accompanimentEnergy': 'Estimated accompaniment energy {percent}%; judge by your own audition.',
  'rvc.material.useForTraining': 'Use for training / separation',
  'rvc.material.reviewed': 'Auditioned, material is suitable',
  'rvc.material.hasAccompaniment': 'This clip contains accompaniment — separate the vocals first.',
  'rvc.material.empty': 'No material yet. After importing you can audition each clip, confirm it and assign a speaker.',
  'rvc.action.remove': 'Remove',

  // Step 2 - training settings
  'rvc.step.settingsTitle': '2. Training settings',
  'rvc.field.epochs': 'Epochs',
  'rvc.field.batch': 'Batch size (0 = automatic)',
  'rvc.step.advancedSummary': 'Advanced training settings and speakers',
  'rvc.field.version': 'Model version',
  'rvc.field.sampleRate': 'Sample rate',
  'rvc.field.f0': 'Pitch extraction',
  'rvc.field.saveEvery': 'Save every N epochs',
  'rvc.field.gpu': 'GPU index',
  'rvc.field.workers': 'Data loader workers',
  'rvc.field.speakerId': 'New speaker ID',
  'rvc.field.speakerName': 'New speaker name',
  'rvc.placeholder.speakerName': 'For example: second singer',
  'rvc.action.addSpeaker': 'Add speaker',
  'rvc.step.pipelineHint': 'Steps: material pre-processing → pitch → HuBERT features → training → retrieval index → voice library. Create a new project when you change the material or the model structure; cancelling keeps the stages and checkpoints already saved.',
  'rvc.action.preflight': 'Check training prerequisites',
  'rvc.action.train': 'Start / resume training',
  'rvc.action.cancel': 'Cancel voice job',
  'rvc.preflight.hint': 'Before training, the material confirmations, the base model and the free space are checked; VRAM and memory are as of the moment you run the check.',
  'rvc.preflight.summary': 'Extra space needed about {required} GB, free disk {disk} GB, available memory {ram} GB{gpu}. {issues}',
  'rvc.preflight.gpu': ', GPU {id} with {vram} GB free VRAM',

  // Job progress / results
  'rvc.job.running': '{kind}: {stage}{parts}. {message}',
  'rvc.job.epochPart': ' · epoch {epoch}',
  'rvc.job.epochPartTotal': ' · epoch {epoch} / {total}',
  'rvc.job.progressCount': ' ({completed}/{total})',
  'rvc.job.progressSize': ' ({done} / {total} GB)',
  'rvc.job.lossPart': '. Recent training loss: {loss}',
  'rvc.job.defaultMessage': 'You can view the log or cancel; checkpoints already saved are kept.',
  'rvc.job.done': '{kind} finished{extra}{review}',
  'rvc.job.reviewRequired': '. Audition the separated vocals, then confirm them for training.',
  'rvc.job.importErrors': '; {count} file(s) could not be imported: {items}',
  'rvc.job.importErrorItem': '{name}: {error}',
  'rvc.job.backups': 'Backups of the original folders (not deleted yet):',
  'rvc.job.downloadZip': 'Download voice ZIP',
  'rvc.job.emptyLog': 'The log is empty for now',
  'rvc.action.showLog': 'View training log',
  'rvc.action.resume': 'Resume from the saved stage',

  // Voice library
  'rvc.library.title': 'My voices',
  'rvc.library.lead': 'Finished training is added here automatically; user voices and training material are preserved across software updates.',
  'rvc.library.emptyTitle': 'No custom voices yet',
  'rvc.library.emptyHint': 'Import material above and train, or import an existing model. Once training succeeds, the voice appears here automatically.',
  'rvc.voice.meta': '{version} · {rate} kHz · {count} speaker(s)',
  'rvc.voice.noPreview': 'No preview sample yet',
  'rvc.voice.useForCover': 'Use for cover',
  'rvc.voice.export': 'Export voice pack',
  'rvc.voice.rename': 'Rename',
  'rvc.voice.open': 'Open folder',
  'rvc.voice.renamePrompt': 'Voice name',
  'rvc.voice.removeConfirm': 'Remove "{name}"? The model stays in the voice library\'s .trash folder; training material is unaffected.',
  'rvc.voice.removed': 'Voice removed — you can restore it from: {directory}',

  // Model import
  'rvc.modelImport.summary': 'Import an existing RVC voice',
  'rvc.modelImport.hint': 'Choose a ZIP exported by this app, or one inference PTH together with its INDEX. The G / D checkpoints produced during training cannot be imported directly.',
  'rvc.field.voiceName': 'Voice name (optional)',
  'rvc.placeholder.voiceName': 'For example: my singing voice',
  'rvc.field.modelFiles': 'Model files',
  'rvc.field.indexMapping': 'Multi-speaker index mapping (optional)',
  'rvc.placeholder.indexMapping': 'Leave empty for a single speaker; for several speakers enter {"0":"ming.index","1":"hong.index"}',
  'rvc.action.checkAndImport': 'Check and import voice',

  // Cover tab: trained-voice pickers and pitch guidance
  'rvc.cover.selectVoice': 'Select a trained voice',
  'rvc.pitch.selectVoice': 'Select a voice to see its training range.',
  'rvc.pitch.noF0': 'This model was not trained with pitch conditioning, so no transposition can be set.',
  'rvc.pitch.range': 'The training material\'s main range is about {low}–{high} Hz. Estimated from the training pitch curve, it is not a hard limit on what the voice can sing.',
  'rvc.pitch.unknown': 'No training range is recorded for this voice yet. An older training project can be resumed to reuse the finished results and add the statistics; for an imported model, audition the original pitch and the other octaves first.',

  // Uploads
  'rvc.upload.uploading': 'Uploading: {name}',
  'rvc.upload.uploadingModel': 'Uploading model file: {name}',

  // Errors
  'rvc.error.noProjectSelected': 'Create or select a training project first',
  'rvc.error.noProject': 'Create a training project first',
  'rvc.error.selectProject': 'Select a training project first',
  'rvc.error.previewFirst': 'Preview the migration first',
  'rvc.error.modelFileChoice': 'Choose one ZIP, or one PTH together with its INDEX',
  'rvc.error.duplicateFileNames': 'Duplicate file names — use a different file name for each speaker\'s index',
  'rvc.error.mappingRequired': 'Several INDEX files need a speaker id to file name mapping',
  'rvc.error.mappingInvalid': 'The id or file name in the index mapping is invalid',
});
