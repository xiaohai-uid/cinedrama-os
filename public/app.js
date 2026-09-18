// CineDrama Studio — Client Application Engine
(function () {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // 桌面客户端与浏览器双模自适应适配
  // ==========================================================================
  let API_BASE = '';

  async function initApiBase() {
    if (window.location.protocol === 'file:') {
      document.body.classList.add('is-electron');
      try {
        const res = await fetch('toonflow://getappurl');
        const data = await res.json();
        if (data && data.url) {
          API_BASE = data.url.replace(/\/api\/?$/, '');
          console.log('[CineDrama Desktop] Electron API_BASE resolved:', API_BASE);
          return;
        }
      } catch (e) {
        console.warn('[CineDrama Desktop] Electron bridge not responding, fallback to default port 3080', e);
      }
      API_BASE = 'http://127.0.0.1:3080';
    } else {
      API_BASE = '';
    }
  }

  function apiUrl(path) {
    if (!API_BASE) return path;
    return `${API_BASE}${path}`;
  }

  function initDesktopControls() {
    const btnMin = document.getElementById('winMinimize');
    const btnMax = document.getElementById('winMaximize');
    const btnClose = document.getElementById('winClose');

    if (btnMin) {
      btnMin.addEventListener('click', async () => {
        try {
          await fetch('toonflow://windowminimize');
        } catch (e) {
          console.warn('Window minimize error:', e);
        }
      });
    }
    if (btnMax) {
      btnMax.addEventListener('click', async () => {
        try {
          await fetch('toonflow://windowmaximize');
        } catch (e) {
          console.warn('Window maximize error:', e);
        }
      });
    }
    if (btnClose) {
      btnClose.addEventListener('click', async () => {
        try {
          await fetch('toonflow://windowclose');
        } catch (e) {
          console.warn('Window close error:', e);
        }
      });
    }
  }

  // 状态管理
  const state = {
    currentProjectId: null,
    currentJobId: null,
    projects: [],
    shots: [],
    jobData: null,
    cinema: {
      currentIndex: 0,
      isPlaying: false,
      timer: null,
    },
    aiEngine: {
      providers: [],
      activeTextModel: 'deepseek-v4-flash',
      hasKey: false,
      maskedKey: '',
      baseUrl: 'https://token.sensenova.cn/v1',
    },
  };

  // 预置范例模版
  const TEMPLATES = {
    xianxia: {
      title: "仙尊归来之龙王赘婿",
      text: "九天仙域大劫降临，无极仙尊林破天为护道侣，以肉身硬抗九道灭世神雷。神魂重创后坠入凡尘青云城，却发现自己成了林家受尽嘲讽的上门赘婿。今日林家演武大会，林破天眼神冰冷，残破的神识悄然复苏，冷冷注视着高台上不可一世的挑衅者...",
    },
    cyber: {
      title: "赛博大唐：夜宴刺杀",
      text: "公元2088年，霓虹闪烁的九龙地下城，刺客十七接到一桩神秘悬赏：潜入神威重工核心数据库，窃取被抹除的「天女计划」。当机械义眼捕捉到目标面容时，他握着高周波震荡刃的手突然颤抖，眼前的女人竟与三年前死去的师妹一模一样...",
    },
    apocalypse: {
      title: "末世空间：百亿囤货",
      text: "距离全球极寒冰封灾难还有三天，重生归来的陆炎变卖家族百亿资产，在昆仑山脉深处建造终极末日避难所，疯狂囤积十万吨物资与极品抗寒能源。这一世，他要冷眼旁观前世背叛他的所有人，在冰雪绝境中建立属于自己的帝国神话...",
    },
  };

  // DOM 元素引用
  const dom = {
    projectSelect: document.getElementById('projectSelect'),
    btnNewProject: document.getElementById('btnNewProject'),
    stylePresetSelect: document.getElementById('stylePresetSelect'),
    aspectRatioSelect: document.getElementById('aspectRatioSelect'),
    novelTitleInput: document.getElementById('novelTitleInput'),
    novelTextInput: document.getElementById('novelTextInput'),
    charCount: document.getElementById('charCount'),
    workflowSelect: document.getElementById('workflowSelect'),
    btnGenerate: document.getElementById('btnGenerate'),
    progressBox: document.getElementById('progressBox'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    progressBarFill: document.getElementById('progressBarFill'),
    progressSubtext: document.getElementById('progressSubtext'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    storyboardGrid: document.getElementById('storyboardGrid'),
    shotsCountBadge: document.getElementById('shotsCountBadge'),
    btnPlayAllShots: document.getElementById('btnPlayAllShots'),
    // 放映厅
    cinemaScreen: document.getElementById('cinemaScreen'),
    cinemaImage: document.getElementById('cinemaImage'),
    cinemaVideo: document.getElementById('cinemaVideo'),
    cinemaPlaceholder: document.getElementById('cinemaPlaceholder'),
    cinemaSubtitleBar: document.getElementById('cinemaSubtitleBar'),
    subtitleSpeaker: document.getElementById('subtitleSpeaker'),
    subtitleText: document.getElementById('subtitleText'),
    cinemaTrack: document.getElementById('cinemaTrack'),
    cinemaTrackFill: document.getElementById('cinemaTrackFill'),
    cinemaShotIndicator: document.getElementById('cinemaShotIndicator'),
    cinemaDurationInfo: document.getElementById('cinemaDurationInfo'),
    cinemaHealthIndicator: document.getElementById('cinemaHealthIndicator'),
    btnPrevShot: document.getElementById('btnPrevShot'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNextShot: document.getElementById('btnNextShot'),
    btnMuteToggle: document.getElementById('btnMuteToggle'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    // 剧本与资产
    actsContainer: document.getElementById('actsContainer'),
    dialogueList: document.getElementById('dialogueList'),
    charactersGrid: document.getElementById('charactersGrid'),
    scenesGrid: document.getElementById('scenesGrid'),
    // 弹窗与音频
    imageModal: document.getElementById('imageModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalClose: document.getElementById('modalClose'),
    modalImage: document.getElementById('modalImage'),
    modalCaption: document.getElementById('modalCaption'),
    globalAudioPlayer: document.getElementById('globalAudioPlayer'),
    // AI 创作引擎
    btnOpenAiSettings: document.getElementById('btnOpenAiSettings'),
    engineStatusDot: document.getElementById('engineStatusDot'),
    engineNameText: document.getElementById('engineNameText'),
    engineTag: document.getElementById('engineTag'),
    aiSettingsModal: document.getElementById('aiSettingsModal'),
    aiSettingsBackdrop: document.getElementById('aiSettingsBackdrop'),
    aiSettingsClose: document.getElementById('aiSettingsClose'),
    settingModelSelect: document.getElementById('settingModelSelect'),
    settingBaseUrlInput: document.getElementById('settingBaseUrlInput'),
    settingApiKeyInput: document.getElementById('settingApiKeyInput'),
    btnToggleKeyVisibility: document.getElementById('btnToggleKeyVisibility'),
    apiKeyStatusHint: document.getElementById('apiKeyStatusHint'),
    testResultText: document.getElementById('testResultText'),
    btnTestConnection: document.getElementById('btnTestConnection'),
    btnCancelAiSettings: document.getElementById('btnCancelAiSettings'),
    btnSaveAiSettings: document.getElementById('btnSaveAiSettings'),
    // AI 质量评估与诊断
    evalTierBadge: document.getElementById('evalTierBadge'),
    btnRunEval: document.getElementById('btnRunEval'),
    evalContainer: document.getElementById('evalContainer'),
    evalEmptyState: document.getElementById('evalEmptyState'),
    evalContent: document.getElementById('evalContent'),
    evalTierGiant: document.getElementById('evalTierGiant'),
    evalTitle: document.getElementById('evalTitle'),
    evalOverallScore: document.getElementById('evalOverallScore'),
    evalVerdict: document.getElementById('evalVerdict'),
    evalJudgeModel: document.getElementById('evalJudgeModel'),
    evalTime: document.getElementById('evalTime'),
    scoreDramaticTension: document.getElementById('scoreDramaticTension'),
    barDramaticTension: document.getElementById('barDramaticTension'),
    reasonDramaticTension: document.getElementById('reasonDramaticTension'),
    scoreDialogueQuality: document.getElementById('scoreDialogueQuality'),
    barDialogueQuality: document.getElementById('barDialogueQuality'),
    reasonDialogueQuality: document.getElementById('reasonDialogueQuality'),
    scoreCinematicPacing: document.getElementById('scoreCinematicPacing'),
    barCinematicPacing: document.getElementById('barCinematicPacing'),
    reasonCinematicPacing: document.getElementById('reasonCinematicPacing'),
    scorePacingConsistency: document.getElementById('scorePacingConsistency'),
    barPacingConsistency: document.getElementById('barPacingConsistency'),
    reasonPacingConsistency: document.getElementById('reasonPacingConsistency'),
    evalHighlightsList: document.getElementById('evalHighlightsList'),
    evalImprovementsList: document.getElementById('evalImprovementsList'),
    // 分镜时序轨
    storyboardTimelineStrip: document.getElementById('storyboardTimelineStrip'),
    stripTotalTime: document.getElementById('stripTotalTime'),
    timelineSlots: document.getElementById('timelineSlots'),
    btnToolbarExport: document.getElementById('btnToolbarExport'),
    // 放映厅时间轴
    cinemaTimelineTrack: document.getElementById('cinemaTimelineTrack'),
    // 导出整集
    btnOpenExportModal: document.getElementById('btnOpenExportModal'),
    exportModal: document.getElementById('exportModal'),
    btnCloseExportModal: document.getElementById('btnCloseExportModal'),
    exportShotCount: document.getElementById('exportShotCount'),
    exportTotalDuration: document.getElementById('exportTotalDuration'),
    exportIncludeSubtitles: document.getElementById('exportIncludeSubtitles'),
    exportTransitionSelect: document.getElementById('exportTransitionSelect'),
    exportFilterSelect: document.getElementById('exportFilterSelect'),
    btnStartExport: document.getElementById('btnStartExport'),
    exportProgressBox: document.getElementById('exportProgressBox'),
    exportProgressFill: document.getElementById('exportProgressFill'),
    exportStatusText: document.getElementById('exportStatusText'),
    exportResultBox: document.getElementById('exportResultBox'),
    linkDownloadMp4: document.getElementById('linkDownloadMp4'),
    linkDownloadVtt: document.getElementById('linkDownloadVtt'),
    linkDownloadManifest: document.getElementById('linkDownloadManifest'),
  };

  // ==========================================================================
  // 初始化与事件绑定
  // ==========================================================================
  async function init() {
    await initApiBase();
    initDesktopControls();
    bindEvents();
    loadTemplate('xianxia');
    await loadAiEngineStatus();
    await loadProjects();
  }

  function bindEvents() {
    // 字数统计
    dom.novelTextInput.addEventListener('input', () => {
      dom.charCount.innerText = `${dom.novelTextInput.value.length} 字`;
    });

    // 模版点击
    document.querySelectorAll('.template-chips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tplKey = btn.getAttribute('data-tpl');
        loadTemplate(tplKey);
      });
    });

    // 项目切换
    dom.projectSelect.addEventListener('change', async (e) => {
      state.currentProjectId = e.target.value;
      await loadProjectData(state.currentProjectId);
    });

    // 新建项目
    dom.btnNewProject.addEventListener('click', async () => {
      const title = prompt('请输入新漫剧名称：', '新建漫剧工程');
      if (!title) return;
      await createProject(title);
    });

    // 一键生成
    dom.btnGenerate.addEventListener('click', startGeneration);

    // 标签页切换
    dom.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        switchTab(tabId);
      });
    });

    // 放映厅控制
    dom.btnPlayPause.addEventListener('click', toggleCinemaPlay);
    dom.btnPrevShot.addEventListener('click', () => stepCinemaShot(-1));
    dom.btnNextShot.addEventListener('click', () => stepCinemaShot(1));
    dom.btnPlayAllShots.addEventListener('click', () => {
      switchTab('cinema');
      startCinemaPlay();
    });

    // 弹窗关闭
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalBackdrop.addEventListener('click', closeModal);

    // 全屏放映
    dom.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        dom.cinemaScreen.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // AI 创作引擎设置弹窗事件
    dom.btnOpenAiSettings.addEventListener('click', openAiSettingsModal);
    dom.aiSettingsClose.addEventListener('click', closeAiSettingsModal);
    dom.aiSettingsBackdrop.addEventListener('click', closeAiSettingsModal);
    dom.btnCancelAiSettings.addEventListener('click', closeAiSettingsModal);
    dom.btnSaveAiSettings.addEventListener('click', saveAiSettings);
    dom.btnTestConnection.addEventListener('click', testAiConnection);
    dom.btnToggleKeyVisibility.addEventListener('click', () => {
      const isPwd = dom.settingApiKeyInput.type === 'password';
      dom.settingApiKeyInput.type = isPwd ? 'text' : 'password';
      dom.btnToggleKeyVisibility.innerText = isPwd ? '🔒' : '👁️';
    });

    // 质量评估按钮
    dom.btnRunEval?.addEventListener('click', () => {
      runEvaluation(state.currentProjectId, true);
    });

    // 导出整集模态框事件
    dom.btnOpenExportModal?.addEventListener('click', openExportModal);
    dom.btnToolbarExport?.addEventListener('click', openExportModal);
    dom.btnCloseExportModal?.addEventListener('click', closeExportModal);
    dom.exportModal?.addEventListener('click', (e) => {
      if (e.target === dom.exportModal) closeExportModal();
    });
    dom.btnStartExport?.addEventListener('click', startExport);

    // 放映厅音量与时间轴跳转
    dom.btnMuteToggle?.addEventListener('click', toggleMute);
    dom.cinemaTrack?.addEventListener('click', handleSeekCinema);

    // 视频与音频事件监听（实现精确事件驱动连续放映与时间轴精确同步）
    if (dom.cinemaVideo) {
      dom.cinemaVideo.addEventListener('timeupdate', updateCinemaProgressFromMedia);
      dom.cinemaVideo.addEventListener('ended', onCinemaMediaEnded);
    }
    if (dom.globalAudioPlayer) {
      dom.globalAudioPlayer.addEventListener('ended', onCinemaMediaEnded);
    }

    // 全局快捷键监听
    initKeyboardShortcuts();
  }

  function loadTemplate(key) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    dom.novelTitleInput.value = tpl.title;
    dom.novelTextInput.value = tpl.text;
    dom.charCount.innerText = `${tpl.text.length} 字`;
  }

  function switchTab(tabId) {
    dom.tabBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
    dom.tabPanes.forEach((p) => p.classList.toggle('active', p.id === `pane-${tabId}`));
  }

  // ==========================================================================
  // API 请求与数据载入
  // ==========================================================================
  async function loadProjects() {
    try {
      const res = await fetch(apiUrl('/api/projects'));
      const data = await res.json();
      state.projects = data.projects || [];

      dom.projectSelect.innerHTML = '';
      if (state.projects.length === 0) {
        await createProject('默认漫剧工程');
        return;
      }

      state.projects.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.title;
        dom.projectSelect.appendChild(opt);
      });

      state.currentProjectId = state.projects[0].id;
      dom.projectSelect.value = state.currentProjectId;
      await loadProjectData(state.currentProjectId);
    } catch (e) {
      console.error('加载项目失败:', e);
    }
  }

  async function createProject(title) {
    try {
      const res = await fetch(apiUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          aspectRatio: dom.aspectRatioSelect.value,
        }),
      });
      const data = await res.json();
      await loadProjects();
      if (data.project) {
        dom.projectSelect.value = data.project.id;
        state.currentProjectId = data.project.id;
        await loadProjectData(state.currentProjectId);
      }
    } catch (e) {
      alert(`创建工程失败: ${e.message}`);
    }
  }

  async function loadProjectData(projectId) {
    if (!projectId) return;
    try {
      let dbShots = [];
      try {
        const shotsRes = await fetch(apiUrl(`/api/projects/${projectId}/shots`));
        const shotsData = await shotsRes.json();
        if (shotsData.success && Array.isArray(shotsData.shots)) {
          dbShots = shotsData.shots;
        }
      } catch (err) {
        console.warn('获取项目分镜列表失败:', err);
      }

      const res = await fetch(apiUrl(`/api/pipeline/jobs?projectId=${projectId}`));
      const data = await res.json();
      const jobs = data.jobs || [];
      if (jobs.length > 0) {
        const latestJob = jobs[0];
        state.currentJobId = latestJob.id;
        const detailRes = await fetch(apiUrl(`/api/pipeline/jobs/${latestJob.id}`));
        const detailData = await detailRes.json();
        renderJobOutputs(detailData.job, dbShots);
        loadEvaluation(projectId);
      } else if (dbShots.length > 0) {
        state.shots = dbShots;
        dom.shotsCountBadge.innerText = state.shots.length;
        renderStoryboardGrid(state.shots);
        loadCinemaShot(0);
        loadEvaluation(projectId);
      } else {
        renderEmptyState();
        renderEmptyEvaluation();
      }
    } catch (e) {
      console.error('加载漫剧数据失败:', e);
    }
  }

  // ==========================================================================
  // 核心业务：一键生成漫剧流水线
  // ==========================================================================
  async function startGeneration() {
    const novelText = dom.novelTextInput.value.trim();
    const title = dom.novelTitleInput.value.trim() || '未命名短剧';
    if (!novelText) {
      alert('请先输入或粘贴小说章节原文！');
      return;
    }

    if (!state.currentProjectId) {
      await createProject(title);
    }

    dom.btnGenerate.disabled = true;
    dom.btnGenerate.classList.add('loading');
    dom.progressBox.classList.remove('hidden');
    setProgress(5, '正在提交剧本改编任务...');

    try {
      const workflowId = dom.workflowSelect.value;
      const res = await fetch(apiUrl('/api/pipeline/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.currentProjectId,
          workflowId,
          input: {
            title,
            novelText,
            stylePreset: dom.stylePresetSelect.value,
            textModel: state.aiEngine.activeTextModel,
          },
        }),
      });

      const data = await res.json();
      if (data.job?.id) {
        state.currentJobId = data.job.id;
        pollJobProgress(data.job.id);
      } else {
        throw new Error(data.error || '任务提交失败');
      }
    } catch (e) {
      alert(`生成失败: ${e.message}`);
      resetGenerateBtn();
    }
  }

  function setProgress(percent, statusText, subText) {
    dom.progressPercent.innerText = `${percent}%`;
    dom.progressBarFill.style.width = `${percent}%`;
    if (statusText) dom.progressStatus.innerText = statusText;
    if (subText) dom.progressSubtext.innerText = subText;
  }

  function resetGenerateBtn() {
    dom.btnGenerate.disabled = false;
    dom.btnGenerate.classList.remove('loading');
  }

  async function pollJobProgress(jobId) {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/pipeline/jobs/${jobId}`));
        const data = await res.json();
        const job = data.job;
        const steps = data.steps || [];

        const totalSteps = steps.length || 7;
        const completedSteps = steps.filter((s) => s.status === 'completed').length;
        const percent = Math.min(95, Math.round((completedSteps / totalSteps) * 100));

        let friendlyMessage = '正在进行视听漫剧创作...';
        const lastRunningStep = steps.find((s) => s.status === 'running')?.stepId;
        if (lastRunningStep === 'step-skeleton') friendlyMessage = '📖 正在分析故事核心矛盾与三幕架构...';
        else if (lastRunningStep === 'step-script') friendlyMessage = '✍️ 正在扩写短剧对白台词与动作细节...';
        else if (lastRunningStep === 'step-assets') friendlyMessage = '🎨 正在提取角色外观立绘与场景氛围...';
        else if (lastRunningStep === 'step-storyboard') friendlyMessage = '🎞️ 正在进行电影级镜头分镜规划...';
        else if (lastRunningStep === 'step-render-images') friendlyMessage = '🖼️ 正在批量渲染高精分镜画面...';
        else if (lastRunningStep === 'step-dubbing-tts') friendlyMessage = '🎙️ 正在调用专业声线录制角色配音...';
        else if (lastRunningStep === 'step-render-videos') friendlyMessage = '🎬 正在生成镜头动态视频片段...';

        setProgress(percent, friendlyMessage, `已完成 ${completedSteps} / ${totalSteps} 个制作环节`);

        if (job.status === 'completed') {
          clearInterval(pollInterval);
          setProgress(100, '✨ 漫剧整集制作完成！', '全部画幅、配音与视频已就绪');
          setTimeout(() => {
            dom.progressBox.classList.add('hidden');
            resetGenerateBtn();
          }, 1500);

          renderJobOutputs(job);
          switchTab('storyboard');
          if (state.currentProjectId) {
            runEvaluation(state.currentProjectId, false);
          }
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(pollInterval);
          alert(`漫剧制作遇到问题: ${job.error || '已中断'}`);
          resetGenerateBtn();
        }
      } catch (err) {
        console.error('轮询任务失败:', err);
      }
    }, 800);
  }

  // ==========================================================================
  // 成果渲染与视图装配
  // ==========================================================================
  let draggedCardIndex = null;

  function renderJobOutputs(job, dbShots = []) {
    if (!job || !job.output) return;
    state.jobData = job.output;

    const storyboard = job.output['step-storyboard'];
    const renderedImages = job.output['step-render-images'];
    const dubbedAudio = job.output['step-dubbing-tts'];
    const renderedVideos = job.output['step-render-videos'];

    const rawShots = storyboard?.shots || [];
    let shots = rawShots.map((shot, index) => {
      const imgInfo = renderedImages?.shots?.find((s) => s.shotIndex === shot.shotIndex);
      const audioInfo = dubbedAudio?.shots?.find((s) => s.shotIndex === shot.shotIndex);
      const videoInfo = renderedVideos?.shots?.find((s) => s.shotIndex === shot.shotIndex);

      const dbMatch = dbShots.find((d) => d.shotIndex === shot.shotIndex);

      return {
        ...shot,
        id: dbMatch?.id || shot.id || `shot_${state.currentJobId || 'job'}_${shot.shotIndex || index + 1}`,
        imageUrl: imgInfo?.imageUrl || dbMatch?.imageUrl || null,
        audioUrl: audioInfo?.audioUrl || dbMatch?.audioUrl || null,
        videoUrl: videoInfo?.videoUrl || dbMatch?.videoUrl || null,
      };
    });

    if (dbShots.length > 0) {
      const dbOrderMap = new Map(dbShots.map((s, idx) => [s.id, idx]));
      shots.sort((a, b) => {
        const orderA = dbOrderMap.has(a.id) ? dbOrderMap.get(a.id) : a.shotIndex;
        const orderB = dbOrderMap.has(b.id) ? dbOrderMap.get(b.id) : b.shotIndex;
        return orderA - orderB;
      });
      shots.forEach((s, idx) => {
        s.shotIndex = idx + 1;
      });
    }

    state.shots = shots;
    dom.shotsCountBadge.innerText = state.shots.length;

    renderStoryboardGrid(state.shots);
    renderScript(job.output['step-skeleton'], job.output['step-script']);
    renderAssets(job.output['step-assets']);

    if (state.shots.length > 0) {
      loadCinemaShot(0);
    }
  }

  function renderTimeline() {
    const totalDuration = state.shots.reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0);

    // 1. Storyboard 时序总览条
    if (dom.stripTotalTime) {
      dom.stripTotalTime.innerText = `总片长: ${totalDuration.toFixed(1)} 秒 (${state.shots.length} 镜)`;
    }

    // 2. Storyboard 时间轴卡槽轨
    if (dom.timelineSlots) {
      dom.timelineSlots.innerHTML = '';
      if (state.shots.length === 0) {
        dom.timelineSlots.innerHTML = '<span class="timeline-empty-hint" style="color:#64748b;font-size:12px;">暂无分镜时序</span>';
      } else {
        state.shots.forEach((shot, idx) => {
          const chip = document.createElement('div');
          chip.className = `timeline-slot-chip ${idx === state.cinema.currentIndex ? 'active' : ''}`;
          chip.setAttribute('title', `点击跳转到第 ${idx + 1} 镜 · ${escapeHtml(shot.voiceRole || '角色')}`);
          chip.innerHTML = `
            <div class="slot-chip-top">
              <span>#${idx + 1}</span>
              <span class="slot-chip-dur">${(shot.duration || 3.5).toFixed(1)}s</span>
            </div>
            <div class="slot-chip-role" style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(shot.voiceRole || '镜头 ' + (idx + 1))}
            </div>
          `;
          chip.addEventListener('click', () => {
            switchTab('cinema');
            loadCinemaShot(idx);
          });
          dom.timelineSlots.appendChild(chip);
        });
      }
    }

    // 3. 放映厅时间轴卡槽轨
    if (dom.cinemaTimelineTrack) {
      dom.cinemaTimelineTrack.innerHTML = '';
      if (state.shots.length === 0) {
        dom.cinemaTimelineTrack.innerHTML = '<div class="timeline-empty-hint">暂无镜头，生成短剧后此处将呈现整集交互式时间轴</div>';
      } else {
        state.shots.forEach((shot, idx) => {
          const slot = document.createElement('div');
          slot.className = `cinema-timeline-slot ${idx === state.cinema.currentIndex ? 'active' : ''}`;
          slot.setAttribute('title', `点击跳转到第 ${idx + 1} 镜`);
          const imgUrl = shot.imageUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzE0MTcyMiIvPjwvc3ZnPg==';
          slot.innerHTML = `
            <img src="${imgUrl}" alt="镜 ${idx + 1}">
            <span class="slot-badge-idx">#${idx + 1}</span>
            <span class="slot-badge-time">${(shot.duration || 3.5).toFixed(1)}s</span>
          `;
          slot.addEventListener('click', () => {
            loadCinemaShot(idx);
            if (state.cinema.isPlaying) {
              playCurrentShotSequence();
            }
          });
          dom.cinemaTimelineTrack.appendChild(slot);
        });
      }
    }
  }

  async function handleReorderShots(fromIndex, toIndex) {
    if (fromIndex === toIndex || !state.shots || state.shots.length === 0) return;
    const moved = state.shots.splice(fromIndex, 1)[0];
    state.shots.splice(toIndex, 0, moved);

    state.shots.forEach((s, i) => {
      s.shotIndex = i + 1;
    });

    renderStoryboardGrid(state.shots);
    loadCinemaShot(Math.min(state.cinema.currentIndex, state.shots.length - 1));

    if (state.currentProjectId) {
      const shotIds = state.shots.map((s) => s.id).filter(Boolean);
      if (shotIds.length === state.shots.length) {
        try {
          const res = await fetch(apiUrl(`/api/projects/${state.currentProjectId}/shots/reorder`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shotIds }),
          });
          const data = await res.json();
          if (data.shots) {
            data.shots.forEach((dbShot, i) => {
              state.shots[i].shotIndex = dbShot.shotIndex;
              state.shots[i].id = dbShot.id;
            });
            renderTimeline();
          }
        } catch (e) {
          console.warn('保存分镜排序至数据库失败:', e);
        }
      }
    }
  }

  function renderStoryboardGrid(shots) {
    dom.storyboardGrid.innerHTML = '';
    if (shots.length === 0) {
      renderEmptyState();
      renderTimeline();
      return;
    }

    shots.forEach((shot, index) => {
      const card = document.createElement('div');
      card.className = 'shot-card';
      card.setAttribute('draggable', 'true');
      card.dataset.index = String(index);
      if (shot.id) card.dataset.shotId = shot.id;

      // HTML5 原生拖拽事件监听
      card.addEventListener('dragstart', (e) => {
        draggedCardIndex = index;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const targetIndex = index;
        if (draggedCardIndex !== null && draggedCardIndex !== targetIndex) {
          await handleReorderShots(draggedCardIndex, targetIndex);
        }
        draggedCardIndex = null;
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.shot-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });

      const motionLabels = {
        zoom_in: '🎥 缓推特写',
        zoom_out: '🎬 远景缓拉',
        pan_right: '⏩ 镜头右移',
        pan_left: '⏪ 镜头左移',
        breathing: '✨ 动态呼吸',
        still: '📷 经典定格'
      };
      const motionBadge = motionLabels[shot.cameraMotion] || (shot.cameraAngle?.includes('特写') ? '🎥 缓推特写' : (shot.cameraAngle?.includes('远景') ? '🎬 远景缓拉' : '🎥 电影运镜'));

      const imageSrc = shot.imageUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzE0MTcyMiIvPjwvc3ZnPg==';

      card.innerHTML = `
        <div class="shot-image-wrapper">
          <img src="${imageSrc}" alt="镜头 ${shot.shotIndex || index + 1}">
          <span class="shot-drag-handle" title="按住拖拽排序">⋮⋮</span>
          <div class="shot-badges">
            <span class="shot-num">镜 #${shot.shotIndex || index + 1}</span>
            <span class="shot-camera">${shot.cameraAngle || '中景'}</span>
            <span class="shot-motion">${motionBadge}</span>
            <div class="shot-shift-actions">
              <button class="btn-shift-shot btn-shift-up" data-idx="${index}" title="前移此镜头" ${index === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>⬆️</button>
              <button class="btn-shift-shot btn-shift-down" data-idx="${index}" title="后移此镜头" ${index === shots.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>⬇️</button>
            </div>
          </div>
          <span class="shot-duration">${shot.duration || 3.5}s</span>
        </div>
        <div class="shot-content">
          <div class="shot-prompt" title="${escapeHtml(shot.prompt)}">${escapeHtml(shot.prompt)}</div>
          ${
            shot.dialogue
              ? `<div class="shot-dialogue-bubble">
                  <span class="shot-speaker">${escapeHtml(shot.voiceRole || '角色')}:</span>
                  "${escapeHtml(shot.dialogue)}"
                 </div>`
              : ''
          }
          <div class="shot-actions">
            ${
              shot.audioUrl
                ? `<button class="btn-play-voice" data-idx="${index}">
                    ▶ 试听台词
                   </button>`
                : ''
            }
            ${
              shot.videoUrl
                ? `<button class="btn-play-video" data-idx="${index}">
                    🎬 动态视频
                   </button>`
                : ''
            }
          </div>
          <div class="shot-health-pills">
            ${
              shot.audioUrl
                ? `<span class="shot-health-badge neural" title="Edge Neural 情感拟真人声配音">🎙️ 神经拟真</span>`
                : ''
            }
            ${
              shot.dialogue
                ? `<span class="shot-health-badge subtitle" title="含字幕混流轨道与对白字幕">💬 字幕对齐</span>`
                : ''
            }
            ${
              shot.filter && shot.filter !== 'normal'
                ? `<span class="shot-health-badge filter" title="电影级色彩滤镜">🎨 ${escapeHtml(shot.filter === 'cinematic_teal_orange' ? '青橙好莱坞' : shot.filter === 'vintage_film' ? '复古胶片' : shot.filter === 'noir_bw' ? '黑白高反差' : shot.filter === 'cyberpunk_neon' ? '赛博霓虹' : shot.filter === 'warm_glow' ? '暖阳柔光' : shot.filter)}</span>`
                : ''
            }
            ${
              shot.transition && shot.transition !== 'none'
                ? `<span class="shot-health-badge transition" title="电影交叉转场过渡">⚡ ${escapeHtml(shot.transition === 'fade' ? '淡入淡出' : shot.transition === 'dissolve' ? '叠化' : shot.transition === 'fadewhite' ? '高潮闪白' : shot.transition === 'fadeblack' ? '沉稳落黑' : shot.transition === 'wipeleft' ? '向左划入' : shot.transition === 'wiperight' ? '向右划出' : shot.transition === 'zoom_cross' ? '变焦穿梭' : shot.transition)}</span>`
                : ''
            }
            <span class="shot-health-badge sync" title="音画时长已自动对齐">${shot.duration || 3.5}s 对齐</span>
            <span class="shot-health-badge consistency" title="角色特征锚点锁定，防止脸部与画风漂移">🎯 角色锁: ${escapeHtml(shot.voiceRole || "主角")}</span>
          </div>
        </div>
      `;

      card.querySelector('.shot-image-wrapper').addEventListener('click', (e) => {
        if (e.target.closest('.shot-drag-handle') || e.target.closest('.btn-shift-shot')) return;
        openModal(imageSrc, `镜头 #${shot.shotIndex || index + 1} · ${shot.prompt}`);
      });

      const btnUp = card.querySelector('.btn-shift-up');
      if (btnUp && index > 0) {
        btnUp.addEventListener('click', (e) => {
          e.stopPropagation();
          handleReorderShots(index, index - 1);
        });
      }

      const btnDown = card.querySelector('.btn-shift-down');
      if (btnDown && index < shots.length - 1) {
        btnDown.addEventListener('click', (e) => {
          e.stopPropagation();
          handleReorderShots(index, index + 1);
        });
      }

      const voiceBtn = card.querySelector('.btn-play-voice');
      if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          playShotVoice(index);
        });
      }

      const videoBtn = card.querySelector('.btn-play-video');
      if (videoBtn) {
        videoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          switchTab('cinema');
          loadCinemaShot(index);
          startCinemaPlay();
        });
      }

      dom.storyboardGrid.appendChild(card);
    });

    renderTimeline();
  }

  function renderScript(skeleton, script) {
    if (skeleton && skeleton.threeActs) {
      dom.actsContainer.innerHTML = skeleton.threeActs
        .map(
          (act) => `
          <div class="act-box">
            <div class="act-title">第 ${act.act} 幕 · ${act.name}</div>
            <p style="font-size: 12px; color: #9ca3af;">目标爽点: ${act.target}</p>
          </div>
        `
        )
        .join('');
    }

    if (script && script.dialogueLines) {
      dom.dialogueList.innerHTML = script.dialogueLines
        .map(
          (item) => `
          <div class="dialogue-item">
            <span class="dialogue-role-badge">${item.role}</span>
            <div class="dialogue-body">
              <span class="dialogue-text">"${item.line}"</span>
              ${item.action ? `<span class="dialogue-action">[动作提示]: ${item.action}</span>` : ''}
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  function renderAssets(assets) {
    if (!assets) return;

    if (assets.characters) {
      dom.charactersGrid.innerHTML = assets.characters
        .map(
          (c) => `
          <div class="character-card">
            <h5>${escapeHtml(c.name)} <span class="badge badge-accent">${escapeHtml(c.role)}</span></h5>
            <p class="character-desc">${escapeHtml(c.visualPrompt)}</p>
            <div class="character-voice-tag" style="margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; background: rgba(137,180,250,0.12); color: #89b4fa; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(137,180,250,0.2);">
              <span>🎙️ 爆款短剧专有人设音色库</span>
              <span style="color: #a6adc8;">· 情感微调与多谐波声学</span>
            </div>
          </div>
        `
        )
        .join('');
    }

    if (assets.scenes) {
      dom.scenesGrid.innerHTML = assets.scenes
        .map(
          (s) => `
          <div class="scene-card">
            <h5>${s.name}</h5>
            <p class="scene-desc">${s.visualPrompt}</p>
          </div>
        `
        )
        .join('');
    }
  }

  function renderEmptyState() {
    dom.storyboardGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎞️</div>
        <p>暂无漫剧数据，请在左侧输入小说后点击「一键生成整集视听漫剧」</p>
      </div>
    `;
    dom.shotsCountBadge.innerText = '0';
    renderTimeline();
  }

  // ==========================================================================
  // 全片放映厅 (Cinema Theater) 播放器与时序控制逻辑
  // ==========================================================================
  function formatSeconds(sec) {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function loadCinemaShot(index) {
    if (!state.shots || state.shots.length === 0) return;
    if (index < 0) index = 0;
    if (index >= state.shots.length) index = state.shots.length - 1;

    state.cinema.currentIndex = index;
    const shot = state.shots[index];

    dom.cinemaPlaceholder.classList.add('hidden');
    dom.cinemaShotIndicator.innerText = `镜 ${index + 1} / ${state.shots.length}`;

    const totalDuration = state.shots.reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0) || 1;
    const baseTime = state.shots.slice(0, index).reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0);
    dom.cinemaDurationInfo.innerText = `${formatSeconds(baseTime)} / ${formatSeconds(totalDuration)}`;

    const pct = ((index + 1) / state.shots.length) * 100;
    dom.cinemaTrackFill.style.width = `${pct}%`;

    // 联动高亮时序轨卡槽
    document.querySelectorAll('.timeline-slot-chip').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.cinema-timeline-slot').forEach((el, i) => {
      el.classList.toggle('active', i === index);
      if (i === index) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });

    if (shot.videoUrl) {
      dom.cinemaVideo.src = shot.videoUrl;
      dom.cinemaVideo.classList.remove('hidden');
      if (dom.cinemaImage) dom.cinemaImage.classList.add('hidden');
    } else if (shot.imageUrl) {
      if (dom.cinemaVideo) {
        dom.cinemaVideo.pause();
        dom.cinemaVideo.classList.add('hidden');
      }
      dom.cinemaImage.src = shot.imageUrl;
      dom.cinemaImage.classList.remove('hidden');
    }

    if (shot.dialogue) {
      dom.cinemaSubtitleBar.classList.remove('hidden');
      dom.subtitleSpeaker.innerText = shot.voiceRole || '角色';
      dom.subtitleText.innerText = shot.dialogue;
    } else {
      dom.cinemaSubtitleBar.classList.add('hidden');
    }
  }

  function toggleCinemaPlay() {
    if (state.cinema.isPlaying) {
      pauseCinemaPlay();
    } else {
      startCinemaPlay();
    }
  }

  function startCinemaPlay() {
    if (state.shots.length === 0) return;
    state.cinema.isPlaying = true;
    dom.btnPlayPause.innerText = '⏸';

    playCurrentShotSequence();
  }

  function pauseCinemaPlay() {
    state.cinema.isPlaying = false;
    dom.btnPlayPause.innerText = '▶';
    if (state.cinema.timer) {
      clearTimeout(state.cinema.timer);
      state.cinema.timer = null;
    }
    dom.globalAudioPlayer.pause();
    if (dom.cinemaVideo) {
      dom.cinemaVideo.pause();
    }
  }

  function advanceCinemaShot() {
    if (state.cinema.timer) {
      clearTimeout(state.cinema.timer);
      state.cinema.timer = null;
    }
    if (state.cinema.currentIndex < state.shots.length - 1) {
      state.cinema.currentIndex++;
      loadCinemaShot(state.cinema.currentIndex);
      if (state.cinema.isPlaying) {
        playCurrentShotSequence();
      }
    } else {
      pauseCinemaPlay();
      state.cinema.currentIndex = 0;
      loadCinemaShot(0);
    }
  }

  function onCinemaMediaEnded() {
    if (!state.cinema.isPlaying) return;
    advanceCinemaShot();
  }

  function updateCinemaProgressFromMedia() {
    if (!state.shots || state.shots.length === 0) return;
    const currentIdx = state.cinema.currentIndex;
    const baseTime = state.shots.slice(0, currentIdx).reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0);
    const totalDuration = state.shots.reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0) || 1;
    let currentInMedia = 0;
    if (dom.cinemaVideo && !dom.cinemaVideo.classList.contains('hidden')) {
      currentInMedia = dom.cinemaVideo.currentTime || 0;
    }
    const currentTotalSec = baseTime + currentInMedia;
    const pct = Math.min(100, (currentTotalSec / totalDuration) * 100);
    dom.cinemaTrackFill.style.width = `${pct}%`;
    dom.cinemaDurationInfo.innerText = `${formatSeconds(currentTotalSec)} / ${formatSeconds(totalDuration)}`;
  }

  function playCurrentShotSequence() {
    if (!state.cinema.isPlaying) return;
    const current = state.shots[state.cinema.currentIndex];
    if (!current) {
      pauseCinemaPlay();
      return;
    }

    if (state.cinema.timer) {
      clearTimeout(state.cinema.timer);
      state.cinema.timer = null;
    }

    loadCinemaShot(state.cinema.currentIndex);

    const shotDuration = Number(current.duration) || 3.5;

    if (current.videoUrl) {
      dom.cinemaVideo.src = current.videoUrl;
      dom.cinemaVideo.classList.remove('hidden');
      if (dom.cinemaImage) dom.cinemaImage.classList.add('hidden');
      dom.globalAudioPlayer.pause();
      dom.cinemaVideo.currentTime = 0;
      dom.cinemaVideo.play().catch((err) => {
        console.warn('Video playback autoplay notice:', err);
      });
      // 视频结束由 ended 事件精确触发，定时器仅作为网络卡死时的超时兜底保护
      state.cinema.timer = setTimeout(() => {
        if (state.cinema.isPlaying && (dom.cinemaVideo.ended || dom.cinemaVideo.paused)) {
          advanceCinemaShot();
        }
      }, (shotDuration + 1.5) * 1000);
    } else {
      if (dom.cinemaVideo) {
        dom.cinemaVideo.pause();
        dom.cinemaVideo.classList.add('hidden');
      }
      if (current.imageUrl) {
        dom.cinemaImage.src = current.imageUrl;
        dom.cinemaImage.classList.remove('hidden');
      }
      if (current.audioUrl) {
        dom.globalAudioPlayer.src = current.audioUrl;
        dom.globalAudioPlayer.currentTime = 0;
        dom.globalAudioPlayer.play().catch((err) => {
          console.warn('Audio playback notice:', err);
        });
      }
      // 静止画面按设有时长推进
      state.cinema.timer = setTimeout(() => {
        advanceCinemaShot();
      }, shotDuration * 1000);
    }
  }

  function stepCinemaShot(delta) {
    pauseCinemaPlay();
    const target = state.cinema.currentIndex + delta;
    if (target >= 0 && target < state.shots.length) {
      loadCinemaShot(target);
    }
  }

  function handleSeekCinema(e) {
    if (!state.shots || state.shots.length === 0) return;
    const rect = dom.cinemaTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const totalDuration = state.shots.reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0);
    const targetSeconds = ratio * totalDuration;

    let accumulated = 0;
    let targetIndex = 0;
    for (let i = 0; i < state.shots.length; i++) {
      const d = Number(state.shots[i].duration) || 3.5;
      if (targetSeconds <= accumulated + d || i === state.shots.length - 1) {
        targetIndex = i;
        break;
      }
      accumulated += d;
    }

    loadCinemaShot(targetIndex);
    if (dom.cinemaVideo && !dom.cinemaVideo.classList.contains('hidden')) {
      const withinShotSec = Math.max(0, targetSeconds - accumulated);
      dom.cinemaVideo.currentTime = withinShotSec;
    }
    if (state.cinema.isPlaying) {
      playCurrentShotSequence();
    }
  }

  function toggleMute() {
    const isMuted = dom.cinemaVideo ? !dom.cinemaVideo.muted : false;
    if (dom.cinemaVideo) dom.cinemaVideo.muted = isMuted;
    if (dom.globalAudioPlayer) dom.globalAudioPlayer.muted = isMuted;
    if (dom.btnMuteToggle) {
      dom.btnMuteToggle.innerText = isMuted ? '🔇' : '🔊';
      dom.btnMuteToggle.title = isMuted ? '取消静音 (M)' : '静音 (M)';
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      dom.cinemaScreen.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }
      if (dom.imageModal && !dom.imageModal.classList.contains('hidden')) return;
      if (dom.aiSettingsModal && !dom.aiSettingsModal.classList.contains('hidden')) return;
      if (dom.exportModal && !dom.exportModal.classList.contains('hidden')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleCinemaPlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepCinemaShot(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepCinemaShot(1);
      } else if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    });
  }

  function playShotVoice(index) {
    const shot = state.shots[index];
    if (shot && shot.audioUrl) {
      dom.globalAudioPlayer.src = shot.audioUrl;
      dom.globalAudioPlayer.play().catch((e) => console.log('Audio playback error:', e));
    }
  }

  // ==========================================================================
  // 全片成片导出模态框逻辑 (Export Hub)
  // ==========================================================================
  function openExportModal() {
    if (!state.shots || state.shots.length === 0) {
      alert('当前工程暂无分镜可供导出，请先生成漫剧！');
      return;
    }
    const totalDuration = state.shots.reduce((acc, s) => acc + (Number(s.duration) || 3.5), 0);
    if (dom.exportShotCount) dom.exportShotCount.innerText = `${state.shots.length} 镜`;
    if (dom.exportTotalDuration) dom.exportTotalDuration.innerText = `${totalDuration.toFixed(1)} 秒`;
    if (dom.exportProgressBox) dom.exportProgressBox.classList.add('hidden');
    if (dom.exportResultBox) dom.exportResultBox.classList.add('hidden');
    if (dom.btnStartExport) {
      dom.btnStartExport.disabled = false;
      dom.btnStartExport.innerText = '⚡ 开始合成并导出整集';
    }
    if (dom.exportModal) dom.exportModal.classList.remove('hidden');
  }

  function closeExportModal() {
    if (dom.exportModal) dom.exportModal.classList.add('hidden');
  }

  async function startExport() {
    if (!state.currentProjectId) {
      alert('请先选择或创建工程！');
      return;
    }
    if (dom.btnStartExport) {
      dom.btnStartExport.disabled = true;
      dom.btnStartExport.innerText = '⏳ 正在合成处理中...';
    }
    if (dom.exportProgressBox) dom.exportProgressBox.classList.remove('hidden');
    if (dom.exportResultBox) dom.exportResultBox.classList.add('hidden');
    if (dom.exportStatusText) dom.exportStatusText.innerText = '正在执行 FFmpeg 多镜头无损拼接与字幕合并...';

    try {
      const includeSubtitles = dom.exportIncludeSubtitles ? dom.exportIncludeSubtitles.checked : true;
      const transition = dom.exportTransitionSelect ? dom.exportTransitionSelect.value : 'fade';
      const filter = dom.exportFilterSelect ? dom.exportFilterSelect.value : 'normal';
      const res = await fetch(apiUrl(`/api/projects/${state.currentProjectId}/export`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeSubtitles, format: 'mp4', transition, filter }),
      });
      const data = await res.json();
      if (!data.export) {
        throw new Error(data.error || '导出整集失败');
      }

      if (dom.exportProgressBox) dom.exportProgressBox.classList.add('hidden');
      if (dom.exportResultBox) dom.exportResultBox.classList.remove('hidden');

      if (dom.linkDownloadMp4) {
        dom.linkDownloadMp4.href = apiUrl(data.export.videoUrl);
        dom.linkDownloadMp4.setAttribute('download', `master_episode_${state.currentProjectId}.mp4`);
      }
      if (dom.linkDownloadVtt) {
        dom.linkDownloadVtt.href = apiUrl(data.export.vttUrl);
        dom.linkDownloadVtt.setAttribute('download', `master_episode_${state.currentProjectId}.vtt`);
      }
      if (dom.linkDownloadManifest) {
        const manifestBlob = new Blob(
          [
            JSON.stringify(
              {
                projectId: state.currentProjectId,
                exportedAt: new Date().toISOString(),
                totalDuration: data.export.totalDuration,
                shotCount: data.export.shotCount,
                shots: state.shots,
              },
              null,
              2
            ),
          ],
          { type: 'application/json' }
        );
        dom.linkDownloadManifest.href = URL.createObjectURL(manifestBlob);
        dom.linkDownloadManifest.setAttribute('download', `manifest_shots_${state.currentProjectId}.json`);
      }
    } catch (e) {
      alert(`导出整集失败: ${e.message}`);
      if (dom.exportProgressBox) dom.exportProgressBox.classList.add('hidden');
    } finally {
      if (dom.btnStartExport) {
        dom.btnStartExport.disabled = false;
        dom.btnStartExport.innerText = '⚡ 开始合成并导出整集';
      }
    }
  }

  // ==========================================================================
  // 弹窗逻辑
  // ==========================================================================
  function openModal(imageSrc, caption) {
    dom.modalImage.src = imageSrc;
    dom.modalCaption.innerText = caption || '';
    dom.imageModal.classList.remove('hidden');
  }

  function closeModal() {
    dom.imageModal.classList.add('hidden');
  }

  // ==========================================================================
  // AI 创作引擎设置管理 (小白友好)
  // ==========================================================================
  async function loadAiEngineStatus() {
    try {
      const res = await fetch(apiUrl('/api/providers'));
      const data = await res.json();
      state.aiEngine.providers = data.providers || [];
      state.aiEngine.activeTextModel = data.activeTextModel || 'deepseek-v4-flash';

      const sensenova = state.aiEngine.providers.find((p) => p.id === 'sensenova');
      if (sensenova && sensenova.config) {
        state.aiEngine.hasKey = sensenova.config.hasKey;
        state.aiEngine.maskedKey = sensenova.config.maskedKey;
        state.aiEngine.baseUrl = sensenova.config.baseUrl;
      }

      updateAiEngineUI();
    } catch (e) {
      console.warn('获取 AI 引擎状态失败:', e);
    }
  }

  function updateAiEngineUI() {
    const isMock = state.aiEngine.activeTextModel === 'bridge-text-mock';
    if (isMock) {
      dom.engineStatusDot.className = 'status-dot yellow';
      dom.engineNameText.innerText = '离线演示模拟模式';
      dom.engineTag.innerText = '离线本地';
    } else {
      dom.engineStatusDot.className = 'status-dot green';
      dom.engineNameText.innerText = '商汤 SenseNova (免费)';
      dom.engineTag.innerText = state.aiEngine.hasKey ? '零门槛就绪' : '免费通道';
    }

    dom.settingModelSelect.value = state.aiEngine.activeTextModel;
    dom.settingBaseUrlInput.value = state.aiEngine.baseUrl || 'https://token.sensenova.cn/v1';
    if (state.aiEngine.hasKey) {
      dom.settingApiKeyInput.placeholder = `已自动载入 (${state.aiEngine.maskedKey})`;
      dom.apiKeyStatusHint.innerText = '🟢 已自动从系统知识库环境载入免费密钥，无需手动输入';
      dom.apiKeyStatusHint.style.color = '#10b981';
    } else {
      dom.settingApiKeyInput.placeholder = '输入你的 SenseNova API Key (sk-...)';
      dom.apiKeyStatusHint.innerText = '⚠️ 未检测到系统密钥，可直接在此处输入或使用离线演示模式';
      dom.apiKeyStatusHint.style.color = '#f59e0b';
    }
  }

  function openAiSettingsModal() {
    dom.testResultText.innerText = '点击右侧按钮进行连通性与网络测速';
    dom.testResultText.className = 'test-value';
    dom.aiSettingsModal.classList.remove('hidden');
  }

  function closeAiSettingsModal() {
    dom.aiSettingsModal.classList.add('hidden');
  }

  async function testAiConnection() {
    dom.testResultText.innerText = '正在测速诊断中...';
    dom.testResultText.className = 'test-value';
    dom.btnTestConnection.disabled = true;

    try {
      const res = await fetch(apiUrl('/api/providers/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'sensenova' }),
      });
      const data = await res.json();
      if (data.ok) {
        dom.testResultText.innerText = `✅ 连接成功 · 延迟 ${data.latencyMs}ms · 免费通道运行畅通`;
        dom.testResultText.className = 'test-value success';
      } else {
        dom.testResultText.innerText = `❌ 测试未通过 · ${data.message}`;
        dom.testResultText.className = 'test-value error';
      }
    } catch (e) {
      dom.testResultText.innerText = `❌ 网络异常: ${e.message}`;
      dom.testResultText.className = 'test-value error';
    } finally {
      dom.btnTestConnection.disabled = false;
    }
  }

  async function saveAiSettings() {
    const selectedModel = dom.settingModelSelect.value;
    const newApiKey = dom.settingApiKeyInput.value.trim();
    const newBaseUrl = dom.settingBaseUrlInput.value.trim();

    try {
      // 1. 如果输入了新 Key 或 BaseURL，更新配置
      if (newApiKey || newBaseUrl) {
        await fetch(apiUrl('/api/providers/config'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'sensenova',
            apiKey: newApiKey || undefined,
            baseUrl: newBaseUrl || undefined,
          }),
        });
      }

      // 2. 切换当前默认模型
      await fetch(apiUrl('/api/providers/active'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      });

      state.aiEngine.activeTextModel = selectedModel;
      await loadAiEngineStatus();
      closeAiSettingsModal();
    } catch (e) {
      alert(`保存失败: ${e.message}`);
    }
  }

  // ==========================================================================
  // AI 质量评估与诊断 (Prompt Evals & LLM-as-a-Judge)
  // ==========================================================================
  async function runEvaluation(projectId, showToast = true) {
    if (!projectId) return;
    if (dom.btnRunEval) {
      dom.btnRunEval.disabled = true;
      dom.btnRunEval.innerText = '⚡ 正在组织专家评审团打分...';
    }

    try {
      const res = await fetch(apiUrl('/api/evals/drama'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          model: state.aiEngine.activeTextModel,
        }),
      });
      const data = await res.json();
      if (data.evaluation) {
        renderEvaluation(data.evaluation);
        if (showToast) {
          alert(`🎉 AI 质量评审完成！综合评定为 【${data.evaluation.tier} 级 · ${data.evaluation.overallScore} 分】`);
        }
      }
    } catch (e) {
      console.error('运行 AI 质量评审失败:', e);
      if (showToast) {
        alert(`评审失败: ${e.message}`);
      }
    } finally {
      if (dom.btnRunEval) {
        dom.btnRunEval.disabled = false;
        dom.btnRunEval.innerText = '⚡ 重新运行 AI 质量评审';
      }
    }
  }

  async function loadEvaluation(projectId) {
    if (!projectId) return;
    try {
      const res = await fetch(apiUrl(`/api/projects/${projectId}/eval`));
      if (res.status === 200) {
        const data = await res.json();
        if (data.evaluation) {
          renderEvaluation(data.evaluation);
          return;
        }
      }
      renderEmptyEvaluation();
    } catch (e) {
      renderEmptyEvaluation();
    }
  }

  function renderEmptyEvaluation() {
    if (dom.evalTierBadge) {
      dom.evalTierBadge.innerText = '未评';
      dom.evalTierBadge.className = 'tab-badge-grade';
    }
    if (dom.evalEmptyState) dom.evalEmptyState.classList.remove('hidden');
    if (dom.evalContent) dom.evalContent.classList.add('hidden');
  }

  function renderEvaluation(evaluation) {
    if (!evaluation) {
      renderEmptyEvaluation();
      return;
    }

    const tier = evaluation.tier || 'B';
    const score = evaluation.overallScore || 0;

    // 1. 顶部 Tab 标签徽章
    if (dom.evalTierBadge) {
      dom.evalTierBadge.innerText = `${tier} 级 · ${score}分`;
      dom.evalTierBadge.className = `tab-badge-grade tier-${tier.toLowerCase()}`;
    }

    // 2. 评测主面板显示
    if (dom.evalEmptyState) dom.evalEmptyState.classList.add('hidden');
    if (dom.evalContent) dom.evalContent.classList.remove('hidden');

    // 3. 巨幅徽章与综合总评
    if (dom.evalTierGiant) {
      dom.evalTierGiant.innerText = tier;
      dom.evalTierGiant.className = `tier-badge-giant tier-${tier.toLowerCase()}`;
    }
    if (dom.evalTitle) {
      dom.evalTitle.innerText = `${dom.novelTitleInput?.value || '短剧'} · 影视工业级综合评定`;
    }
    if (dom.evalOverallScore) dom.evalOverallScore.innerText = score.toFixed(1);
    if (dom.evalVerdict) dom.evalVerdict.innerText = evaluation.verdict || '';
    if (dom.evalJudgeModel) {
      if (evaluation.isFallback) {
        dom.evalJudgeModel.innerHTML = `<span style="color: #f59e0b; font-weight: 600;">⚠️ 裁判来源: 离线规则启发式估算 (模型裁判未连通)</span>`;
      } else {
        dom.evalJudgeModel.innerText = `裁判模型: ${evaluation.judgeModel || '商汤 SenseNova'}`;
      }
    }
    if (dom.evalTime) {
      const dateStr = new Date(evaluation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      dom.evalTime.innerText = `评估时间: ${dateStr}`;
    }

    // 4. 四大维度雷达条与打分
    const dims = evaluation.dimensions || {};
    const updateDim = (dimKey, scoreEl, barEl, reasonEl) => {
      const dim = dims[dimKey];
      if (!dim) return;
      if (scoreEl) scoreEl.innerText = `${dim.score.toFixed(1)} 分`;
      if (barEl) barEl.style.width = `${Math.min(100, Math.max(10, dim.score * 10))}%`;
      if (reasonEl) reasonEl.innerText = dim.reason || '';
    };

    updateDim('dramaticTension', dom.scoreDramaticTension, dom.barDramaticTension, dom.reasonDramaticTension);
    updateDim('dialogueQuality', dom.scoreDialogueQuality, dom.barDialogueQuality, dom.reasonDialogueQuality);
    updateDim('cinematicPacing', dom.scoreCinematicPacing, dom.barCinematicPacing, dom.reasonCinematicPacing);
    updateDim('pacingConsistency', dom.scorePacingConsistency, dom.barPacingConsistency, dom.reasonPacingConsistency);

    // 5. 核心亮点列表
    if (dom.evalHighlightsList) {
      dom.evalHighlightsList.innerHTML = '';
      (evaluation.highlights || []).forEach((hl) => {
        const li = document.createElement('li');
        li.innerText = hl;
        dom.evalHighlightsList.appendChild(li);
      });
    }

    // 6. 改稿建议列表
    if (dom.evalImprovementsList) {
      dom.evalImprovementsList.innerHTML = '';
      (evaluation.improvements || []).forEach((imp) => {
        const li = document.createElement('li');
        li.innerText = imp;
        dom.evalImprovementsList.appendChild(li);
      });
    }
  }

  // 启动
  window.addEventListener('DOMContentLoaded', init);
})();
