const STORAGE_KEY = "ironpulse.v1";
const LEGACY_STORAGE_KEYS = ["forgetrack.v2", "forgetrack.v1"];

const PROGRAM_TEMPLATES = buildProgramTemplates();
let currentPlanPatterns = [];

const state = loadState();

const dom = {
  views: document.querySelectorAll(".view"),
  tabs: document.querySelectorAll(".tab"),
  sessionArea: document.getElementById("session-area"),
  sessionContent: document.getElementById("session-content"),
  sessionEmpty: document.getElementById("session-empty"),
  summaryGrid: document.getElementById("summary-grid"),
  programList: document.getElementById("program-list"),
  programTitle: document.getElementById("program-title"),
  programDescription: document.getElementById("program-description"),
  programMode: document.getElementById("program-mode"),
  historyList: document.getElementById("history-list"),
  plannedList: document.getElementById("planned-list"),
  progressStats: document.getElementById("progress-stats"),
  progressExercise: document.getElementById("progress-exercise"),
  progressChart: document.getElementById("progress-chart"),
  filterGroup: document.getElementById("filter-group"),
  filterExercise: document.getElementById("filter-exercise"),
  filterFrom: document.getElementById("filter-from"),
  filterTo: document.getElementById("filter-to"),
  startModal: document.getElementById("start-modal"),
  startDay: document.getElementById("start-day"),
  startDate: document.getElementById("start-date"),
  customDates: document.getElementById("custom-dates"),
  planPattern: document.getElementById("plan-pattern"),
  planWeek: document.getElementById("plan-week"),
  copyFrom: document.getElementById("copy-from"),
  copyTo: document.getElementById("copy-to"),
  syncPill: document.getElementById("sync-pill"),
  lastSync: document.getElementById("last-sync"),
  statusText: document.getElementById("status-text"),
  statusDot: document.querySelector(".status-dot"),
  csvStatus: document.getElementById("csv-status"),
  csvFile: document.getElementById("csv-file")
};

init();

function init() {
  ensureValidProgramMode();
  bindNavigation();
  bindActions();
  updateConnectionStatus();
  syncSessions();
  renderAll();
  registerServiceWorker();
}

function bindNavigation() {
  dom.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const viewId = tab.dataset.view;
      selectView(viewId);
      if (viewId === "progress") {
        renderProgress();
      }
    });
  });
}

function bindActions() {
  document.getElementById("start-session").addEventListener("click", () => openStartModal());
  document.getElementById("close-modal").addEventListener("click", closeStartModal);
  document.getElementById("confirm-start").addEventListener("click", confirmStartSession);

  document.getElementById("save-session").addEventListener("click", saveActiveSession);
  document.getElementById("cancel-session").addEventListener("click", cancelActiveSession);
  document.getElementById("duplicate-last").addEventListener("click", duplicateLastSession);

  document.getElementById("export-pdf").addEventListener("click", exportPdfReport);
  document.getElementById("reset-filters").addEventListener("click", resetFilters);

  document.getElementById("import-program").addEventListener("click", () => dom.csvFile.click());
  document.getElementById("load-csv").addEventListener("click", loadCsvProgram);

  document.getElementById("plan-week-btn").addEventListener("click", planWeekSessions);
  document.getElementById("copy-week-btn").addEventListener("click", copyWeekSessions);

  dom.planPattern.addEventListener("change", handlePatternChange);
  dom.programMode.addEventListener("change", handleProgramModeChange);

  dom.filterGroup.addEventListener("change", renderHistory);
  dom.filterExercise.addEventListener("change", renderHistory);
  dom.filterFrom.addEventListener("change", renderHistory);
  dom.filterTo.addEventListener("change", renderHistory);

  dom.progressExercise.addEventListener("change", renderProgress);

  dom.sessionArea.addEventListener("input", handleSessionInput);
  dom.sessionArea.addEventListener("click", handleSessionAreaClick);
  dom.plannedList.addEventListener("click", handlePlannedListClick);

  dom.startModal.addEventListener("click", (event) => {
    if (event.target === dom.startModal) {
      closeStartModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeStartModal();
    }
  });

  window.addEventListener("online", () => {
    updateConnectionStatus();
    syncSessions();
    renderSummary();
    updateSyncInfo();
  });

  window.addEventListener("offline", () => {
    updateConnectionStatus();
    updateSyncInfo();
  });
}

function renderAll() {
  renderProgramModeOptions();
  renderSummary();
  renderProgram();
  renderSession();
  renderFilters();
  renderHistory();
  renderPlanPatternOptions();
  renderPlanned();
  renderStartOptions();
  renderProgressExerciseOptions();
  renderProgress();
  updateSyncInfo();
}

function renderSummary() {
  const now = parseISODate(todayISO());
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const recentSessions = state.sessions.filter((session) => {
    const date = parseISODate(session.date);
    return date >= sevenDaysAgo && date <= now;
  });

  const totalVolume = recentSessions.reduce((sum, session) => sum + (Number(session.totalVolume) || 0), 0);
  const totalReps = recentSessions.reduce((sum, session) => sum + (Number(session.totalReps) || 0), 0);
  const prCount = recentSessions.reduce((sum, session) => sum + (Number(session.prCount) || 0), 0);
  const pendingSync = state.sessions.filter((session) => !session.synced).length;

  const cards = [
    { label: "Sessions 7j", value: recentSessions.length },
    { label: "Volume 7j", value: `${Math.round(totalVolume)} kg` },
    { label: "Reps 7j", value: totalReps },
    { label: "Records battus", value: prCount },
    { label: "Sync en attente", value: pendingSync }
  ];

  dom.summaryGrid.innerHTML = cards
    .map(
      (item) =>
        `<div class="summary-card"><span class="muted">${escapeHtml(item.label)}</span><strong>${escapeHtml(
          item.value
        )}</strong></div>`
    )
    .join("");
}

function renderProgramModeOptions() {
  ensureValidProgramMode();
  const options = [
    { value: "3x", label: "Template 3x/semaine" },
    { value: "4x", label: "Template 4x/semaine" }
  ];

  if (state.customProgram) {
    options.push({ value: "custom", label: "Programme importe" });
  }

  const current = dom.programMode.value || state.programMode;
  dom.programMode.innerHTML = options
    .map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`)
    .join("");

  if (options.some((item) => item.value === current)) {
    dom.programMode.value = current;
  }

  if (!options.some((item) => item.value === state.programMode)) {
    state.programMode = "3x";
  }

  dom.programMode.value = state.programMode;
}

function renderProgram() {
  const program = getCurrentProgram();
  const trainingDays = program.days.filter((day) => !day.rest).length;

  dom.programTitle.textContent = program.name;
  dom.programDescription.textContent = `${trainingDays} seances de musculation par semaine, structuree pour un suivi rapide et rigoureux.`;

  dom.programList.innerHTML = "";

  program.days.forEach((day) => {
    const card = document.createElement("div");
    card.className = "program-day";

    const dayHeader = `
      <div class="day-head">
        <div>
          <strong>${escapeHtml(day.label)}</strong>
          <div class="muted">${day.rest ? "Recuperation" : `${day.exercises.length} exercices`}</div>
        </div>
        <div class="card-actions">
          ${
            day.rest
              ? ""
              : `<button class="ghost small" data-action="start-day" data-day="${escapeAttr(day.id)}">Demarrer</button>
                 <button class="ghost small" data-action="plan-day" data-day="${escapeAttr(day.id)}">Planifier</button>`
          }
        </div>
      </div>
    `;

    card.innerHTML = dayHeader;

    if (!day.rest) {
      day.exercises.forEach((exercise) => {
        const ex = document.createElement("div");
        ex.className = "exercise";
        ex.innerHTML = `
          <div class="title">${escapeHtml(exercise.name)}</div>
          <div class="meta">
            <div>Groupe: ${escapeHtml(exercise.group)}</div>
            <div>Echauff.: ${escapeHtml(exercise.warmup)}</div>
            <div>Series: ${escapeHtml(exercise.sets)}</div>
            <div>Reps: ${escapeHtml(exercise.reps)}</div>
            <div>RIR: ${escapeHtml(exercise.rir)}</div>
            <div>Repos: ${escapeHtml(exercise.rest)}</div>
          </div>
          <div class="muted">${escapeHtml(exercise.notes || "")}</div>
          ${exercise.variants ? `<div class="extra muted">Variantes: ${escapeHtml(exercise.variants)}</div>` : ""}
        `;
        card.appendChild(ex);
      });
    }

    dom.programList.appendChild(card);
  });

  dom.programList.querySelectorAll("button[data-action='start-day']").forEach((button) => {
    button.addEventListener("click", () => openStartModal(button.dataset.day));
  });

  dom.programList.querySelectorAll("button[data-action='plan-day']").forEach((button) => {
    button.addEventListener("click", () => planSingleDay(button.dataset.day));
  });
}

function renderSession() {
  if (!state.activeSession) {
    dom.sessionEmpty.style.display = "block";
    dom.sessionContent.innerHTML = "";
    return;
  }

  dom.sessionEmpty.style.display = "none";

  const session = state.activeSession;
  dom.sessionContent.innerHTML = `
    <div class="muted">${escapeHtml(formatDate(session.date))} - ${escapeHtml(session.programDayLabel || "")}</div>
  `;

  session.exercises.forEach((exercise) => {
    const card = document.createElement("div");
    card.className = "session-exercise";

    const rows = exercise.sets
      .map(
        (set, index) => `
          <div class="set-row">
            <div>${index + 1}</div>
            <input
              type="number"
              min="0"
              data-exercise="${escapeAttr(exercise.instanceId)}"
              data-set="${index}"
              data-field="reps"
              placeholder="${escapeAttr(exercise.targetReps)}"
              value="${escapeAttr(set.reps)}"
            />
            <input
              type="number"
              min="0"
              step="0.5"
              data-exercise="${escapeAttr(exercise.instanceId)}"
              data-set="${index}"
              data-field="weight"
              placeholder="0"
              value="${escapeAttr(set.weight)}"
            />
            <input
              type="text"
              data-exercise="${escapeAttr(exercise.instanceId)}"
              data-set="${index}"
              data-field="rest"
              placeholder="${escapeAttr(exercise.targetRest)}"
              value="${escapeAttr(set.rest)}"
            />
            <input
              type="text"
              data-exercise="${escapeAttr(exercise.instanceId)}"
              data-set="${index}"
              data-field="comment"
              placeholder="Optionnel"
              value="${escapeAttr(set.comment)}"
            />
          </div>
        `
      )
      .join("");

    card.innerHTML = `
      <div class="session-head">
        <h3>${escapeHtml(exercise.name)}</h3>
        <div class="session-quick">
          <button class="ghost small" data-action="fill-last" data-exercise="${escapeAttr(exercise.instanceId)}">Auto depuis derniere seance</button>
          <button class="ghost small" data-action="copy-first-set" data-exercise="${escapeAttr(exercise.instanceId)}">Dupliquer serie 1</button>
        </div>
      </div>
      <div class="muted">Objectif: ${escapeHtml(exercise.targetSets)} x ${escapeHtml(
      exercise.targetReps
    )} | RIR ${escapeHtml(exercise.targetRir)} | Repos ${escapeHtml(exercise.targetRest)}</div>
      <div class="sets-grid">
        <span>Set</span>
        <span>Reps</span>
        <span>Charge (kg)</span>
        <span>Repos</span>
        <span>Commentaire</span>
        ${rows}
      </div>
      <label>
        Commentaire exercice
        <textarea rows="2" data-exercise="${escapeAttr(exercise.instanceId)}" data-field="exerciseComment">${escapeHtml(
      exercise.comment
    )}</textarea>
      </label>
    `;

    dom.sessionContent.appendChild(card);
  });
}

function renderFilters() {
  const prevGroup = dom.filterGroup.value || "Tous";
  const prevExercise = dom.filterExercise.value || "Tous";

  const groups = new Set(["Tous"]);
  const exerciseCatalog = getExerciseCatalog();

  exerciseCatalog.forEach((item) => {
    groups.add(item.group);
  });

  dom.filterGroup.innerHTML = Array.from(groups)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`)
    .join("");

  dom.filterExercise.innerHTML = [`<option value="Tous">Tous</option>`]
    .concat(
      Array.from(exerciseCatalog.values())
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map(
          (exercise) =>
            `<option value="${escapeAttr(exercise.key)}">${escapeHtml(exercise.name)}</option>`
        )
    )
    .join("");

  dom.filterGroup.value = optionExists(dom.filterGroup, prevGroup) ? prevGroup : "Tous";
  dom.filterExercise.value = optionExists(dom.filterExercise, prevExercise) ? prevExercise : "Tous";
}

function renderHistory() {
  const filtered = applyHistoryFilters();
  dom.historyList.innerHTML = "";

  if (!filtered.length) {
    dom.historyList.innerHTML = `<div class="muted">Aucune seance pour ces filtres.</div>`;
    return;
  }

  filtered.forEach((session) => {
    const exercisesText = session.exercises.map((exercise) => exercise.name).join(" | ");
    const prTag = session.prCount ? `<span class="tag">${session.prCount} PR</span>` : "";
    const syncTag = session.synced ? "" : `<span class="tag" style="background:rgba(242,184,75,.16);border-color:rgba(242,184,75,.3);color:#f2b84b">A sync</span>`;

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <h4>${escapeHtml(formatDate(session.date))} - ${escapeHtml(session.programDayLabel || "")}</h4>
      <div class="card-actions">${prTag}${syncTag}</div>
      <div class="muted">Volume: ${Math.round(Number(session.totalVolume) || 0)} kg | Reps: ${
      Number(session.totalReps) || 0
    }</div>
      <div class="muted">${escapeHtml(exercisesText)}</div>
    `;

    dom.historyList.appendChild(item);
  });
}

function renderProgressExerciseOptions() {
  const catalog = getExerciseCatalog();
  const previous = dom.progressExercise.value;

  const options = Array.from(catalog.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  dom.progressExercise.innerHTML = options
    .map((exercise) => `<option value="${escapeAttr(exercise.key)}">${escapeHtml(exercise.name)}</option>`)
    .join("");

  if (!options.length) {
    dom.progressStats.innerHTML = `<div class="muted">Aucune donnee.</div>`;
    clearCanvas(dom.progressChart);
    return;
  }

  if (options.some((item) => item.key === previous)) {
    dom.progressExercise.value = previous;
  }
}

function renderProgress() {
  const exerciseKey = dom.progressExercise.value;
  if (!exerciseKey) {
    dom.progressStats.innerHTML = `<div class="muted">Selectionne un exercice.</div>`;
    clearCanvas(dom.progressChart);
    return;
  }

  const history = getExerciseHistory(exerciseKey);
  const stats = computeProgressStats(history);

  const cards = [
    {
      label: "Charge max",
      value: `${roundMetric(stats.lastWeight)} kg`,
      delta: formatDelta(stats.deltaWeight, "kg")
    },
    {
      label: "Reps totales",
      value: `${roundMetric(stats.lastReps)}`,
      delta: formatDelta(stats.deltaReps, "")
    },
    {
      label: "Volume",
      value: `${roundMetric(stats.lastVolume)} kg`,
      delta: formatDelta(stats.deltaVolume, "kg")
    },
    {
      label: "Record charge",
      value: `${roundMetric(stats.bestWeight)} kg`,
      delta: `${history.length} seances`
    }
  ];

  dom.progressStats.innerHTML = cards
    .map(
      (card) =>
        `<div class="stat"><span class="muted">${escapeHtml(card.label)}</span><strong>${escapeHtml(
          card.value
        )}</strong><span class="muted">${escapeHtml(card.delta)}</span></div>`
    )
    .join("");

  drawProgressChart(history);
}

function renderPlanPatternOptions() {
  const trainingDays = getTrainingDays(getCurrentProgram());
  currentPlanPatterns = buildPlanPatterns(trainingDays.length);

  const previous = dom.planPattern.value;
  dom.planPattern.innerHTML = currentPlanPatterns
    .map((pattern) => `<option value="${escapeAttr(pattern.id)}">${escapeHtml(pattern.label)}</option>`)
    .join("");

  if (optionExists(dom.planPattern, previous)) {
    dom.planPattern.value = previous;
  }

  handlePatternChange();
}

function renderPlanned() {
  dom.plannedList.innerHTML = "";

  if (!state.planned.length) {
    dom.plannedList.innerHTML = `<div class="muted">Aucune seance planifiee.</div>`;
    return;
  }

  const sorted = [...state.planned].sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach((plan) => {
    const item = document.createElement("div");
    item.className = "planned-item";
    item.innerHTML = `
      <strong>${escapeHtml(formatDate(plan.date))} - ${escapeHtml(plan.dayLabel || "")}</strong>
      <div class="muted">${escapeHtml(plan.notes || "Planifie")}</div>
      <div class="card-actions">
        <button class="ghost small" data-action="start-plan" data-plan="${escapeAttr(plan.id)}">Demarrer</button>
        <button class="ghost small" data-action="remove-plan" data-plan="${escapeAttr(plan.id)}">Retirer</button>
      </div>
    `;
    dom.plannedList.appendChild(item);
  });
}

function renderStartOptions() {
  const trainingDays = getTrainingDays(getCurrentProgram());
  dom.startDay.innerHTML = trainingDays
    .map((day) => `<option value="${escapeAttr(day.id)}">${escapeHtml(day.label)}</option>`)
    .join("");
  dom.startDate.value = todayISO();
}

function handleProgramModeChange() {
  const mode = dom.programMode.value;
  if (mode === "custom" && !state.customProgram) {
    state.programMode = "3x";
  } else {
    state.programMode = mode;
  }
  saveState();
  renderAll();
}

function handleSessionInput(event) {
  if (!state.activeSession) {
    return;
  }

  const target = event.target;
  const exerciseId = target.dataset.exercise;
  const field = target.dataset.field;

  if (!exerciseId || !field) {
    return;
  }

  const exercise = state.activeSession.exercises.find((item) => item.instanceId === exerciseId);
  if (!exercise) {
    return;
  }

  if (field === "exerciseComment") {
    exercise.comment = target.value;
  } else {
    const setIndex = Number(target.dataset.set);
    const set = exercise.sets[setIndex];
    if (!set) {
      return;
    }
    set[field] = target.value;
  }

  state.activeSession.updatedAt = new Date().toISOString();
  saveState();
}

function handleSessionAreaClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !state.activeSession) {
    return;
  }

  const action = button.dataset.action;
  const exerciseId = button.dataset.exercise;

  if (action === "fill-last") {
    autoFillFromPreviousSession(exerciseId);
  }

  if (action === "copy-first-set") {
    duplicateFirstSet(exerciseId);
  }
}

function handlePlannedListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const planId = button.dataset.plan;
  if (!planId) {
    return;
  }

  if (button.dataset.action === "start-plan") {
    startFromPlan(planId);
  }

  if (button.dataset.action === "remove-plan") {
    removePlanned(planId);
  }
}

function openStartModal(preselectedDayId) {
  renderStartOptions();
  dom.startModal.setAttribute("aria-hidden", "false");
  dom.startDate.value = todayISO();

  if (preselectedDayId && optionExists(dom.startDay, preselectedDayId)) {
    dom.startDay.value = preselectedDayId;
  }
}

function closeStartModal() {
  dom.startModal.setAttribute("aria-hidden", "true");
}

function confirmStartSession() {
  const program = getCurrentProgram();
  const dayId = dom.startDay.value;
  const day = program.days.find((item) => item.id === dayId);

  if (!day || day.rest) {
    return;
  }

  createActiveSessionFromDay(getCurrentProgramId(), day, dom.startDate.value || todayISO());
  closeStartModal();
  selectView("today");
}

function createActiveSessionFromDay(programId, day, date) {
  if (!day || day.rest) {
    return;
  }

  state.activeSession = {
    id: uid(),
    date,
    programId,
    programDayId: day.id,
    programDayLabel: day.label,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exercises: day.exercises.map((exercise, index) => {
      const targetSets = clampPositiveInt(exercise.sets, 1);
      return {
        instanceId: `${exercise.id}-${index}-${uid().slice(-4)}`,
        templateExerciseId: exercise.id,
        key: exercise.key || normalizeExerciseKey(exercise.name),
        name: exercise.name,
        group: exercise.group || "Autre",
        targetSets,
        targetReps: exercise.reps || "",
        targetRir: exercise.rir || "",
        targetRest: exercise.rest || "",
        sets: Array.from({ length: targetSets }, () => ({ reps: "", weight: "", rest: "", comment: "" })),
        comment: ""
      };
    })
  };

  saveState();
  renderSession();
}

function saveActiveSession() {
  if (!state.activeSession) {
    return;
  }

  const snapshot = deepClone(state.activeSession);
  const metrics = computeSessionMetrics(snapshot);
  const savedAt = new Date().toISOString();

  const session = {
    ...snapshot,
    totalVolume: metrics.totalVolume,
    totalReps: metrics.totalReps,
    prCount: metrics.prCount,
    synced: navigator.onLine,
    savedAt,
    updatedAt: savedAt
  };

  state.sessions.unshift(session);
  state.activeSession = null;

  if (navigator.onLine) {
    state.lastSyncAt = savedAt;
  }

  saveState();
  renderAll();
}

function cancelActiveSession() {
  state.activeSession = null;
  saveState();
  renderSession();
}

function duplicateLastSession() {
  if (!state.sessions.length) {
    alert("Aucune seance precedente a dupliquer.");
    return;
  }

  const last = state.sessions[0];
  state.activeSession = {
    id: uid(),
    date: todayISO(),
    programId: last.programId || getCurrentProgramId(),
    programDayId: last.programDayId,
    programDayLabel: last.programDayLabel || "Seance dupliquee",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exercises: (last.exercises || []).map((exercise, index) => ({
      instanceId: `${exercise.templateExerciseId || exercise.id || "ex"}-${index}-${uid().slice(-4)}`,
      templateExerciseId: exercise.templateExerciseId || exercise.id || `dup-${index}`,
      key: exercise.key || normalizeExerciseKey(exercise.name || `Exercice ${index + 1}`),
      name: exercise.name || `Exercice ${index + 1}`,
      group: exercise.group || "Autre",
      targetSets: clampPositiveInt(exercise.targetSets || exercise.sets?.length, 1),
      targetReps: exercise.targetReps || "",
      targetRir: exercise.targetRir || "",
      targetRest: exercise.targetRest || "",
      sets: (exercise.sets || []).map((set) => ({
        reps: set.reps || "",
        weight: set.weight || "",
        rest: set.rest || "",
        comment: set.comment || ""
      })),
      comment: exercise.comment || ""
    }))
  };

  saveState();
  renderSession();
  selectView("today");
}

function autoFillFromPreviousSession(instanceId) {
  if (!state.activeSession) {
    return;
  }

  const activeExercise = state.activeSession.exercises.find((exercise) => exercise.instanceId === instanceId);
  if (!activeExercise) {
    return;
  }

  const sourceSession = state.sessions.find((session) =>
    session.exercises.some((exercise) => exercise.key === activeExercise.key)
  );

  if (!sourceSession) {
    alert("Aucune donnee precedente pour cet exercice.");
    return;
  }

  const sourceExercise = sourceSession.exercises.find((exercise) => exercise.key === activeExercise.key);
  if (!sourceExercise) {
    return;
  }

  activeExercise.sets = activeExercise.sets.map((set, index) => {
    const sourceSet = sourceExercise.sets[index];
    if (!sourceSet) {
      return set;
    }
    return {
      reps: sourceSet.reps || "",
      weight: sourceSet.weight || "",
      rest: sourceSet.rest || "",
      comment: sourceSet.comment || ""
    };
  });

  activeExercise.comment = sourceExercise.comment || activeExercise.comment;
  state.activeSession.updatedAt = new Date().toISOString();

  saveState();
  renderSession();
}

function duplicateFirstSet(instanceId) {
  if (!state.activeSession) {
    return;
  }

  const exercise = state.activeSession.exercises.find((item) => item.instanceId === instanceId);
  if (!exercise || !exercise.sets.length) {
    return;
  }

  const first = exercise.sets[0];
  if (!first.reps && !first.weight && !first.rest) {
    alert("Renseigne d'abord la serie 1.");
    return;
  }

  exercise.sets = exercise.sets.map((set, index) => {
    if (index === 0) {
      return set;
    }
    return {
      ...set,
      reps: first.reps,
      weight: first.weight,
      rest: first.rest
    };
  });

  state.activeSession.updatedAt = new Date().toISOString();
  saveState();
  renderSession();
}

function planSingleDay(dayId) {
  const program = getCurrentProgram();
  const day = program.days.find((item) => item.id === dayId);

  if (!day || day.rest) {
    return;
  }

  const date = prompt("Quelle date pour cette seance ? (YYYY-MM-DD)", todayISO());
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return;
  }

  upsertPlanned(
    createPlannedEntry({
      date,
      day,
      notes: `Planifie (${program.name})`
    })
  );

  saveState();
  renderPlanned();
  selectView("plan");
}

function planWeekSessions() {
  if (!dom.planWeek.value) {
    alert("Choisis une semaine.");
    return;
  }

  const trainingDays = getTrainingDays(getCurrentProgram());
  const dates = getDatesForWeekPattern(dom.planWeek.value, trainingDays.length);

  if (dates.length !== trainingDays.length) {
    alert("Les dates planifiees ne correspondent pas au nombre de seances.");
    return;
  }

  trainingDays.forEach((day, index) => {
    upsertPlanned(
      createPlannedEntry({
        date: dates[index],
        day,
        notes: `Planifie (${dom.planWeek.value})`
      })
    );
  });

  saveState();
  renderPlanned();
}

function copyWeekSessions() {
  if (!dom.copyFrom.value || !dom.copyTo.value) {
    alert("Choisis une semaine source et une semaine cible.");
    return;
  }

  if (dom.copyFrom.value === dom.copyTo.value) {
    alert("La semaine source et la semaine cible doivent etre differentes.");
    return;
  }

  const sourceStart = weekStart(dom.copyFrom.value);
  const targetStart = weekStart(dom.copyTo.value);

  if (!sourceStart || !targetStart) {
    alert("Format de semaine invalide.");
    return;
  }

  const sourcePlans = state.planned.filter((plan) => isSameWeek(plan.date, sourceStart));
  if (!sourcePlans.length) {
    alert("Aucune seance planifiee sur la semaine source.");
    return;
  }

  sourcePlans.forEach((plan) => {
    const offset = diffDays(plan.date, sourceStart);
    const targetDate = addDays(targetStart, offset);

    const copied = {
      ...deepClone(plan),
      id: uid(),
      date: targetDate,
      notes: `Copie de ${dom.copyFrom.value}`
    };

    upsertPlanned(copied);
  });

  saveState();
  renderPlanned();
}

function startFromPlan(planId) {
  const plan = state.planned.find((item) => item.id === planId);
  if (!plan) {
    return;
  }

  const snapshot = normalizeDay(plan.daySnapshot || {});
  if (snapshot.rest || !snapshot.exercises.length) {
    alert("Cette seance planifiee ne contient pas d'exercices.");
    return;
  }

  createActiveSessionFromDay(plan.programId || getCurrentProgramId(), snapshot, plan.date);
  removePlanned(planId);
  selectView("today");
}

function removePlanned(planId) {
  state.planned = state.planned.filter((item) => item.id !== planId);
  saveState();
  renderPlanned();
}

function resetFilters() {
  dom.filterGroup.value = "Tous";
  dom.filterExercise.value = "Tous";
  dom.filterFrom.value = "";
  dom.filterTo.value = "";
  renderHistory();
}

function applyHistoryFilters() {
  const sorted = sortSessions(state.sessions);

  return sorted.filter((session) => {
    if (dom.filterFrom.value && session.date < dom.filterFrom.value) {
      return false;
    }

    if (dom.filterTo.value && session.date > dom.filterTo.value) {
      return false;
    }

    if (dom.filterExercise.value !== "Tous") {
      const hasExercise = session.exercises.some((exercise) => exercise.key === dom.filterExercise.value);
      if (!hasExercise) {
        return false;
      }
    }

    if (dom.filterGroup.value !== "Tous") {
      const hasGroup = session.exercises.some((exercise) => exercise.group === dom.filterGroup.value);
      if (!hasGroup) {
        return false;
      }
    }

    return true;
  });
}

function getExerciseHistory(exerciseKey) {
  return sortSessions(state.sessions)
    .map((session) => {
      const exercise = session.exercises.find((item) => item.key === exerciseKey);
      if (!exercise) {
        return null;
      }

      const volume = exercise.sets.reduce((sum, set) => {
        const reps = toNumber(set.reps);
        const weight = toNumber(set.weight);
        return sum + reps * weight;
      }, 0);

      const maxWeight = Math.max(0, ...exercise.sets.map((set) => toNumber(set.weight)));
      const totalReps = exercise.sets.reduce((sum, set) => sum + toNumber(set.reps), 0);

      return {
        date: session.date,
        savedAt: session.savedAt,
        volume,
        maxWeight,
        totalReps
      };
    })
    .filter(Boolean);
}

function computeProgressStats(history) {
  if (!history.length) {
    return {
      lastWeight: 0,
      lastReps: 0,
      lastVolume: 0,
      bestWeight: 0,
      deltaWeight: 0,
      deltaReps: 0,
      deltaVolume: 0
    };
  }

  const last = history[0];
  const previous = history[1] || null;

  return {
    lastWeight: last.maxWeight,
    lastReps: last.totalReps,
    lastVolume: last.volume,
    bestWeight: Math.max(...history.map((entry) => entry.maxWeight)),
    deltaWeight: previous ? last.maxWeight - previous.maxWeight : 0,
    deltaReps: previous ? last.totalReps - previous.totalReps : 0,
    deltaVolume: previous ? last.volume - previous.volume : 0
  };
}

function computeSessionMetrics(session) {
  let totalVolume = 0;
  let totalReps = 0;
  let prCount = 0;

  session.exercises.forEach((exercise) => {
    const volume = exercise.sets.reduce((sum, set) => sum + toNumber(set.reps) * toNumber(set.weight), 0);
    const reps = exercise.sets.reduce((sum, set) => sum + toNumber(set.reps), 0);
    const maxWeight = Math.max(0, ...exercise.sets.map((set) => toNumber(set.weight)));

    totalVolume += volume;
    totalReps += reps;

    const history = getExerciseHistory(exercise.key);
    const bestWeight = history.length ? Math.max(...history.map((entry) => entry.maxWeight)) : 0;
    const bestVolume = history.length ? Math.max(...history.map((entry) => entry.volume)) : 0;

    if (maxWeight > bestWeight || volume > bestVolume) {
      prCount += 1;
    }
  });

  return { totalVolume, totalReps, prCount };
}

function drawProgressChart(history) {
  const canvas = dom.progressChart;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  resizeCanvas(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!history.length) {
    ctx.fillStyle = "#9aa5b8";
    ctx.font = "16px Rajdhani";
    ctx.fillText("Aucune donnee pour cet exercice.", 20, 36);
    return;
  }

  const points = [...history].reverse();
  const width = canvas.width;
  const height = canvas.height;
  const padding = 42;

  const chartWidth = Math.max(10, width - padding * 2);
  const chartHeight = Math.max(10, height - padding * 2);

  ctx.strokeStyle = "rgba(165,173,190,0.2)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  const maxVolume = Math.max(1, ...points.map((point) => point.volume));
  const maxWeight = Math.max(1, ...points.map((point) => point.maxWeight));
  const maxReps = Math.max(1, ...points.map((point) => point.totalReps));

  drawSeries(points, (point) => point.volume / maxVolume, "#ff6f3d", 2.8);
  drawSeries(points, (point) => point.maxWeight / maxWeight, "#2cd189", 2.8);
  drawSeries(points, (point) => point.totalReps / maxReps, "#79b8ff", 2.8);

  drawLegend([
    { label: "Volume", color: "#ff6f3d" },
    { label: "Charge", color: "#2cd189" },
    { label: "Reps", color: "#79b8ff" }
  ]);

  function drawSeries(data, accessor, color, lineWidth) {
    ctx.beginPath();
    data.forEach((point, index) => {
      const progress = data.length === 1 ? 0.5 : index / (data.length - 1);
      const x = padding + progress * chartWidth;
      const y = padding + (1 - accessor(point)) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    data.forEach((point, index) => {
      const progress = data.length === 1 ? 0.5 : index / (data.length - 1);
      const x = padding + progress * chartWidth;
      const y = padding + (1 - accessor(point)) * chartHeight;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawLegend(items) {
    let x = padding;
    const y = 20;

    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y - 8, 12, 4);
      ctx.fillStyle = "#dce2ee";
      ctx.font = "12px Rajdhani";
      ctx.fillText(item.label, x + 16, y);
      x += 84;
    });
  }
}

function handlePatternChange() {
  dom.customDates.innerHTML = "";
  if (dom.planPattern.value !== "custom") {
    return;
  }

  const trainingDays = getTrainingDays(getCurrentProgram());

  trainingDays.forEach((day, index) => {
    const wrapper = document.createElement("label");
    wrapper.innerHTML = `${escapeHtml(day.label)}<input type="date" data-custom-index="${index}" />`;
    dom.customDates.appendChild(wrapper);
  });
}

function getDatesForWeekPattern(weekValue, dayCount) {
  if (dom.planPattern.value === "custom") {
    const dates = Array.from(dom.customDates.querySelectorAll("input"))
      .map((input) => input.value)
      .filter(Boolean);

    return dates.length === dayCount ? dates : [];
  }

  const selectedPattern = currentPlanPatterns.find((pattern) => pattern.id === dom.planPattern.value);
  if (!selectedPattern) {
    return [];
  }

  const start = weekStart(weekValue);
  if (!start) {
    return [];
  }

  return selectedPattern.offsets.slice(0, dayCount).map((offset) => addDays(start, offset));
}

function buildPlanPatterns(dayCount) {
  if (dayCount >= 4) {
    return [
      { id: "mon-tue-thu-fri", label: "Lun / Mar / Jeu / Ven", offsets: [0, 1, 3, 4] },
      { id: "mon-wed-fri-sat", label: "Lun / Mer / Ven / Sam", offsets: [0, 2, 4, 5] },
      { id: "custom", label: "Choisir les dates", offsets: [] }
    ];
  }

  return [
    { id: "mon-wed-fri", label: "Lun / Mer / Ven", offsets: [0, 2, 4] },
    { id: "tue-thu-sat", label: "Mar / Jeu / Sam", offsets: [1, 3, 5] },
    { id: "custom", label: "Choisir les dates", offsets: [] }
  ];
}

function createPlannedEntry({ date, day, notes }) {
  return {
    id: uid(),
    date,
    programId: getCurrentProgramId(),
    programDayId: day.id,
    dayLabel: day.label,
    notes: notes || "Planifie",
    daySnapshot: deepClone(day)
  };
}

function upsertPlanned(entry) {
  const index = state.planned.findIndex(
    (item) => item.date === entry.date && item.dayLabel === entry.dayLabel
  );

  if (index >= 0) {
    state.planned[index] = entry;
  } else {
    state.planned.push(entry);
  }
}

function loadCsvProgram() {
  if (!dom.csvFile.files.length) {
    dom.csvStatus.textContent = "Selectionne un fichier CSV.";
    return;
  }

  const file = dom.csvFile.files[0];
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const program = parseCsvProgram(text);
      state.customProgram = program;
      state.programMode = "custom";
      saveState();
      renderAll();
      dom.csvStatus.textContent = "Programme importe avec succes.";
    } catch (error) {
      console.error(error);
      dom.csvStatus.textContent = "Erreur d'import: verifie le format du CSV.";
    }
  };

  reader.readAsText(file);
}

function parseCsvProgram(text) {
  const rows = parseDelimitedRows(text).filter((row) => row.some((cell) => String(cell || "").trim().length > 0));
  if (rows.length < 2) {
    throw new Error("CSV vide");
  }

  const header = rows[0].map((cell) => normalizeHeader(cell));

  const indexes = {
    day: getHeaderIndex(header, ["jour", "day", "session", "seance"]),
    exercise: getHeaderIndex(header, ["exercice", "exercise", "nom", "name"]),
    group: getHeaderIndex(header, ["groupe", "group", "muscle"]),
    warmup: getHeaderIndex(header, ["echauffement", "serieechauffement", "warmup"]),
    sets: getHeaderIndex(header, ["series", "sets"]),
    reps: getHeaderIndex(header, ["reps", "repetitions", "rep"]),
    rir: getHeaderIndex(header, ["rir"]),
    rest: getHeaderIndex(header, ["repos", "rest"]),
    notes: getHeaderIndex(header, ["notes", "commentaire", "comment"]),
    video: getHeaderIndex(header, ["video", "lienvideo"]),
    variants: getHeaderIndex(header, ["variantes", "variantesexercice", "variations", "variants"])
  };

  if (indexes.day === -1 || indexes.exercise === -1 || indexes.group === -1) {
    throw new Error("Colonnes minimales manquantes: jour, exercice, groupe");
  }

  const dayMap = new Map();
  let order = 0;

  rows.slice(1).forEach((row) => {
    const dayLabelRaw = getCell(row, indexes.day);
    if (!dayLabelRaw) {
      return;
    }

    const dayLabel = dayLabelRaw.trim();
    const mapKey = dayLabel.toLowerCase();

    if (!dayMap.has(mapKey)) {
      dayMap.set(mapKey, {
        id: `custom-day-${order + 1}`,
        label: dayLabel,
        order: order + 1,
        rest: /repos|rest/i.test(dayLabel),
        exercises: []
      });
      order += 1;
    }

    const day = dayMap.get(mapKey);
    const exerciseName = getCell(row, indexes.exercise);

    if (!exerciseName) {
      return;
    }

    day.rest = false;
    day.exercises.push(
      normalizeExerciseTemplate(
        {
          id: `custom-${day.id}-${day.exercises.length + 1}`,
          name: exerciseName,
          group: getCell(row, indexes.group) || "Autre",
          warmup: getCell(row, indexes.warmup) || "",
          sets: getCell(row, indexes.sets) || 3,
          reps: getCell(row, indexes.reps) || "",
          rir: getCell(row, indexes.rir) || "",
          rest: getCell(row, indexes.rest) || "",
          notes: getCell(row, indexes.notes) || "",
          video: getCell(row, indexes.video) || "",
          variants: getCell(row, indexes.variants) || ""
        },
        day.exercises.length,
        day.id
      )
    );
  });

  const days = Array.from(dayMap.values())
    .sort((a, b) => a.order - b.order)
    .map((day) => {
      if (!day.exercises.length) {
        day.rest = true;
      }
      return normalizeDay(day);
    });

  if (!days.some((day) => !day.rest)) {
    throw new Error("Aucune seance valide trouvee dans le CSV");
  }

  return {
    id: "custom",
    name: "Programme importe",
    days
  };
}

function parseDelimitedRows(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstLine = lines.find((line) => line.trim().length > 0) || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolons >= commas ? ";" : ",";

  const rows = [];

  lines.forEach((line) => {
    if (!line.length) {
      return;
    }

    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    rows.push(cells);
  });

  return rows;
}

function exportPdfReport() {
  const sessions = applyHistoryFilters();

  if (!sessions.length) {
    alert("Aucune seance a exporter avec les filtres actuels.");
    return;
  }

  const totalVolume = sessions.reduce((sum, session) => sum + (Number(session.totalVolume) || 0), 0);
  const totalReps = sessions.reduce((sum, session) => sum + (Number(session.totalReps) || 0), 0);
  const totalPr = sessions.reduce((sum, session) => sum + (Number(session.prCount) || 0), 0);

  const rows = sessions
    .map((session) => {
      const exerciseRows = session.exercises
        .map((exercise) => {
          const sets = exercise.sets
            .map((set, index) => `${index + 1}: ${set.reps || "-"} reps @ ${set.weight || "-"} kg`)
            .join(" | ");
          return `
            <tr>
              <td>${escapeHtml(exercise.name)}</td>
              <td>${escapeHtml(exercise.group)}</td>
              <td>${escapeHtml(sets)}</td>
              <td>${escapeHtml(exercise.comment || "")}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <section class="session-block">
          <h2>${escapeHtml(formatDate(session.date))} - ${escapeHtml(session.programDayLabel || "")}</h2>
          <p>Volume: ${Math.round(Number(session.totalVolume) || 0)} kg | Reps: ${Number(
        session.totalReps
      ) || 0} | PR: ${Number(session.prCount) || 0}</p>
          <table>
            <thead>
              <tr>
                <th>Exercice</th>
                <th>Groupe</th>
                <th>Series</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              ${exerciseRows}
            </tbody>
          </table>
        </section>
      `;
    })
    .join("");

  const reportHtml = `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Export IronPulse</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #161616; }
          h1 { margin: 0 0 8px; }
          h2 { margin: 0 0 6px; font-size: 18px; }
          p { margin: 0 0 10px; }
          .summary { margin-bottom: 18px; padding: 10px; border: 1px solid #ddd; }
          .session-block { margin: 0 0 18px; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; text-align: left; padding: 6px; vertical-align: top; }
          th { background: #f5f5f5; }
        </style>
      </head>
      <body>
        <h1>IronPulse - Export des seances</h1>
        <div class="summary">
          <strong>Sessions exportees: ${sessions.length}</strong><br />
          Volume total: ${Math.round(totalVolume)} kg<br />
          Reps totales: ${totalReps}<br />
          Records personnels: ${totalPr}
        </div>
        ${rows}
      </body>
    </html>
  `;

  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Autorise les popups pour exporter en PDF.");
    return;
  }

  popup.document.write(reportHtml);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  dom.statusText.textContent = online ? "En ligne" : "Hors ligne";
  dom.statusDot.style.background = online ? "#2cd189" : "#f2b84b";
  dom.statusDot.style.boxShadow = online ? "0 0 10px #2cd189" : "0 0 10px #f2b84b";
}

function updateSyncInfo() {
  const pending = state.sessions.filter((session) => !session.synced).length;

  if (navigator.onLine) {
    dom.syncPill.textContent = pending ? `Synchro en attente (${pending})` : "Synchronise";
  } else {
    dom.syncPill.textContent = "Hors ligne";
  }

  dom.lastSync.textContent = state.lastSyncAt
    ? `Derniere synchro : ${formatDateTime(state.lastSyncAt)}`
    : "Derniere synchro : --";
}

function syncSessions() {
  if (!navigator.onLine) {
    return;
  }

  let updated = false;

  state.sessions = state.sessions.map((session) => {
    if (!session.synced) {
      updated = true;
      return { ...session, synced: true };
    }
    return session;
  });

  if (updated) {
    state.lastSyncAt = new Date().toISOString();
    saveState();
  }
}

function ensureValidProgramMode() {
  if (state.programMode === "custom" && !state.customProgram) {
    state.programMode = "3x";
  }

  if (!["3x", "4x", "custom"].includes(state.programMode)) {
    state.programMode = "3x";
  }
}

function getCurrentProgram() {
  if (state.programMode === "custom" && state.customProgram) {
    return state.customProgram;
  }

  return PROGRAM_TEMPLATES[state.programMode] || PROGRAM_TEMPLATES["3x"];
}

function getCurrentProgramId() {
  const program = getCurrentProgram();
  return program.id;
}

function getTrainingDays(program) {
  return (program?.days || []).filter((day) => !day.rest);
}

function getExerciseCatalog() {
  const catalog = new Map();

  getCurrentProgram().days.forEach((day) => {
    day.exercises.forEach((exercise) => {
      catalog.set(exercise.key, {
        key: exercise.key,
        name: exercise.name,
        group: exercise.group || "Autre"
      });
    });
  });

  state.sessions.forEach((session) => {
    session.exercises.forEach((exercise) => {
      if (!catalog.has(exercise.key)) {
        catalog.set(exercise.key, {
          key: exercise.key,
          name: exercise.name,
          group: exercise.group || "Autre"
        });
      }
    });
  });

  return catalog;
}

function selectView(viewId) {
  dom.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === viewId);
  });

  dom.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
}

function loadState() {
  const empty = defaultState();

  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (parsed) {
    return migrateState(parsed);
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = safeParse(localStorage.getItem(key));
    if (legacy) {
      const migrated = migrateState(legacy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }

  return empty;
}

function migrateState(input) {
  const next = defaultState();

  next.programMode = input.programMode || "3x";

  if (input.customProgram) {
    next.customProgram = normalizeProgram(input.customProgram, "custom");
  }

  if (!input.customProgram && input.program) {
    next.customProgram = normalizeProgram(input.program, "custom");
    next.programMode = "custom";
  }

  next.sessions = Array.isArray(input.sessions)
    ? input.sessions.map((session) => normalizeSession(session)).filter(Boolean)
    : [];

  next.planned = Array.isArray(input.planned)
    ? input.planned.map((plan) => normalizePlanned(plan)).filter(Boolean)
    : [];

  next.activeSession = input.activeSession ? normalizeActiveSession(input.activeSession) : null;
  next.lastSyncAt = input.lastSyncAt || null;

  if (!next.customProgram && next.programMode === "custom") {
    next.programMode = "3x";
  }

  if (!["3x", "4x", "custom"].includes(next.programMode)) {
    next.programMode = "3x";
  }

  return next;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultState() {
  return {
    programMode: "3x",
    customProgram: null,
    sessions: [],
    planned: [],
    activeSession: null,
    lastSyncAt: null
  };
}

function normalizeProgram(program, fallbackId) {
  return {
    id: String(program.id || fallbackId || "program"),
    name: String(program.name || "Programme"),
    days: Array.isArray(program.days) ? program.days.map((day) => normalizeDay(day)).filter(Boolean) : []
  };
}

function normalizeDay(day) {
  const exercises = Array.isArray(day.exercises)
    ? day.exercises.map((exercise, index) => normalizeExerciseTemplate(exercise, index, day.id)).filter(Boolean)
    : [];

  return {
    id: String(day.id || `day-${uid().slice(0, 4)}`),
    label: String(day.label || "Jour"),
    rest: Boolean(day.rest || !exercises.length),
    exercises
  };
}

function normalizeExerciseTemplate(exercise, index, dayId) {
  const name = String(exercise.name || exercise.exercice || `Exercice ${index + 1}`);
  const sets = clampPositiveInt(exercise.sets || exercise.series, 1);

  return {
    id: String(exercise.id || `${dayId || "day"}-ex-${index + 1}`),
    key: String(exercise.key || normalizeExerciseKey(name)),
    name,
    group: String(exercise.group || exercise.groupe || "Autre"),
    warmup: String(exercise.warmup ?? exercise.echauffement ?? ""),
    sets,
    reps: String(exercise.reps ?? ""),
    rir: String(exercise.rir ?? ""),
    rest: String(exercise.rest ?? exercise.repos ?? ""),
    notes: String(exercise.notes ?? ""),
    video: String(exercise.video ?? ""),
    variants: String(exercise.variants ?? exercise.variantes ?? "")
  };
}

function normalizeSession(session) {
  if (!session || !session.date) {
    return null;
  }

  const exercises = Array.isArray(session.exercises)
    ? session.exercises
        .map((exercise, index) => {
          const name = String(exercise.name || `Exercice ${index + 1}`);
          const targetSets = clampPositiveInt(exercise.targetSets || exercise.sets?.length || exercise.sets, 1);
          const rawSets = Array.isArray(exercise.sets) ? exercise.sets : [];

          return {
            instanceId: String(exercise.instanceId || `${exercise.id || "ex"}-${index}-${uid().slice(-4)}`),
            templateExerciseId: String(exercise.templateExerciseId || exercise.id || `ex-${index + 1}`),
            key: String(exercise.key || normalizeExerciseKey(name)),
            name,
            group: String(exercise.group || "Autre"),
            targetSets,
            targetReps: String(exercise.targetReps || exercise.reps || ""),
            targetRir: String(exercise.targetRir || exercise.rir || ""),
            targetRest: String(exercise.targetRest || exercise.rest || ""),
            sets: Array.from({ length: targetSets }, (_, setIndex) => {
              const source = rawSets[setIndex] || {};
              return {
                reps: String(source.reps ?? ""),
                weight: String(source.weight ?? ""),
                rest: String(source.rest ?? ""),
                comment: String(source.comment ?? "")
              };
            }),
            comment: String(exercise.comment || "")
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: String(session.id || uid()),
    date: String(session.date),
    programId: String(session.programId || "3x"),
    programDayId: String(session.programDayId || ""),
    programDayLabel: String(session.programDayLabel || ""),
    exercises,
    totalVolume: Number(session.totalVolume || 0),
    totalReps: Number(session.totalReps || 0),
    prCount: Number(session.prCount || 0),
    synced: Boolean(session.synced),
    savedAt: session.savedAt || new Date().toISOString(),
    updatedAt: session.updatedAt || session.savedAt || new Date().toISOString(),
    createdAt: session.createdAt || session.savedAt || new Date().toISOString()
  };
}

function normalizeActiveSession(session) {
  const normalized = normalizeSession({ ...session, synced: false });
  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id,
    date: normalized.date,
    programId: normalized.programId,
    programDayId: normalized.programDayId,
    programDayLabel: normalized.programDayLabel,
    exercises: normalized.exercises,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

function normalizePlanned(plan) {
  if (!plan || !plan.date) {
    return null;
  }

  return {
    id: String(plan.id || uid()),
    date: String(plan.date),
    programId: String(plan.programId || "3x"),
    programDayId: String(plan.programDayId || ""),
    dayLabel: String(plan.dayLabel || "Seance"),
    notes: String(plan.notes || "Planifie"),
    daySnapshot: normalizeDay(plan.daySnapshot || { id: plan.programDayId, label: plan.dayLabel, rest: false, exercises: [] })
  };
}

function sortSessions(list) {
  return [...list].sort((a, b) => {
    const aTime = new Date(a.savedAt || `${a.date}T00:00:00`).getTime();
    const bTime = new Date(b.savedAt || `${b.date}T00:00:00`).getTime();
    return bTime - aTime;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.error("Service worker erreur", error);
    });
  }
}

function weekStart(weekValue) {
  const match = String(weekValue || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const week = Number(match[2]);

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;

  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);

  return monday.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = parseISODate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(dateString, startString) {
  const date = parseISODate(dateString);
  const start = parseISODate(startString);
  return Math.round((date - start) / (1000 * 60 * 60 * 24));
}

function isSameWeek(dateString, weekStartDate) {
  const date = parseISODate(dateString);
  const start = parseISODate(weekStartDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return date >= start && date <= end;
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  const date = parseISODate(dateString);
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseISODate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date();
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return NaN;
  }
  if (typeof value === "number") {
    return value;
  }
  const normalized = String(value).replace(",", ".");
  return Number(normalized);
}

function toNumber(value) {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDelta(value, unit) {
  const rounded = Math.round(value * 10) / 10;
  const suffix = unit ? ` ${unit}` : "";

  if (!rounded) {
    return `Stable${suffix}`.trim();
  }

  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`.trim();
}

function roundMetric(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function resizeCanvas(canvas) {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(220, Math.floor(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  resizeCanvas(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function optionExists(selectElement, value) {
  return Array.from(selectElement.options).some((option) => option.value === value);
}

function getHeaderIndex(header, names) {
  return header.findIndex((column) => names.includes(column));
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeExerciseKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `exercise-${uid().slice(0, 6)}`;
}

function clampPositiveInt(value, fallback) {
  const parsed = Math.round(parseNumber(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getCell(row, index) {
  if (index < 0) {
    return "";
  }
  return String(row[index] || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function ex(id, name, group, warmup, sets, reps, rir, rest, notes, variants, video = "Video") {
  return {
    id,
    key: normalizeExerciseKey(name),
    name,
    group,
    warmup,
    sets,
    reps,
    rir,
    rest,
    notes,
    variants,
    video
  };
}

function buildProgramTemplates() {
  return {
    "3x": {
      id: "3x",
      name: "PROGRAMME - 3x/semaine",
      days: [
        {
          id: "3x-day-1",
          label: "Jour 1 - Fullbody 1",
          rest: false,
          exercises: [
            ex(
              "3x-d1-ex1",
              "Developpe incline a la smith",
              "Pectoraux",
              2,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Banc a 30 degres, coude a 45 degres, omoplates resserrees, epaules baissees.",
              "Developpe incline barre, halteres ou machine"
            ),
            ex(
              "3x-d1-ex2",
              "Tirage vertical prise large",
              "Dos",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Mains a 1.5x largeur epaules, amplitude complete.",
              "Tirage machine, traction"
            ),
            ex(
              "3x-d1-ex3",
              "A1 : Extension triceps a la poulie haute",
              "Triceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Poulie au niveau des hanches, coudes fixes.",
              "Barre au front, extension halteres"
            ),
            ex(
              "3x-d1-ex4",
              "A2 : Curl a la poulie",
              "Biceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Descends au plus bas, dos droit.",
              "Curl halteres"
            ),
            ex(
              "3x-d1-ex5",
              "B1 : Leg extension",
              "Quadriceps",
              1,
              3,
              "8-12",
              "1-0-0",
              "15sec",
              "Plie au maximum tes jambes.",
              "Sissy squat"
            ),
            ex(
              "3x-d1-ex6",
              "B2 : Leg curl assis",
              "Ischios",
              1,
              3,
              "8-12",
              "1-0-0",
              "1min",
              "Tends completement les jambes.",
              "Leg curl allonge, leg curl debout"
            )
          ]
        },
        {
          id: "3x-day-2",
          label: "Jour 2 - Repos",
          rest: true,
          exercises: []
        },
        {
          id: "3x-day-3",
          label: "Jour 3 - Fullbody 2",
          rest: false,
          exercises: [
            ex(
              "3x-d3-ex1",
              "Dips lestes",
              "Pectoraux",
              2,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Descends au maximum sans douleur, leste si besoin.",
              "Machine dips, developpe decline"
            ),
            ex(
              "3x-d3-ex2",
              "Zercher squat",
              "Quadriceps",
              2,
              3,
              "6-8",
              "3-2-1",
              "2min30",
              "Pieds legerement ouverts, regard fixe.",
              "Presse a cuisses, hack squat"
            ),
            ex(
              "3x-d3-ex3",
              "A1 : Face pull",
              "Epaules",
              1,
              3,
              "12-20",
              "2-1-0",
              "15sec",
              "Amplitude complete, coudes a 90 degres.",
              "Peck reverse, oiseau halteres"
            ),
            ex(
              "3x-d3-ex4",
              "A2 : Crunch a la poulie",
              "Abdos",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Arrondis uniquement le dos.",
              "Leve de genoux"
            ),
            ex(
              "3x-d3-ex5",
              "B1 : Upright row halteres",
              "Epaules",
              1,
              3,
              "12-20",
              "2-1-0",
              "15sec",
              "Monte les coudes a hauteur des epaules.",
              "Elevations laterales"
            ),
            ex(
              "3x-d3-ex6",
              "B2 : Extension mollet jambes tendues",
              "Mollets",
              1,
              3,
              "8-12",
              "0-0-0",
              "1min",
              "Pause 2 secondes en bas, amplitude complete.",
              "Toute variante mollet jambes tendues"
            )
          ]
        },
        {
          id: "3x-day-4",
          label: "Jour 4 - Repos",
          rest: true,
          exercises: []
        },
        {
          id: "3x-day-5",
          label: "Jour 5 - Fullbody 3",
          rest: false,
          exercises: [
            ex(
              "3x-d5-ex1",
              "Developpe militaire a la machine",
              "Epaules",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min",
              "Siege haut, amplitude complete, gainage fort.",
              "Developpe militaire halteres ou barre"
            ),
            ex(
              "3x-d5-ex2",
              "Tirage vertical prise neutre",
              "Dos",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min",
              "Amene les coudes vers les hanches.",
              "Tirage machine, traction neutre"
            ),
            ex(
              "3x-d5-ex3",
              "A1 : Extension triceps a la poulie haute",
              "Triceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Coudes fixes, gaine bien.",
              "Barre au front"
            ),
            ex(
              "3x-d5-ex4",
              "A2 : Curl a la poulie",
              "Biceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Descente controlee.",
              "Curl halteres"
            ),
            ex(
              "3x-d5-ex5",
              "B1 : Elevations laterales aux halteres",
              "Epaules",
              1,
              3,
              "8-12",
              "2-1-0",
              "30sec",
              "Penche toi legerement vers l'avant.",
              "Upright row, elevations laterales machine"
            ),
            ex(
              "3x-d5-ex6",
              "B2 : Hyperextension",
              "Bas du dos",
              1,
              3,
              "8-12",
              "1-0-0",
              "30sec",
              "Gaine bien et controle la descente.",
              "Hyperextension au banc, good morning"
            ),
            ex(
              "3x-d5-ex7",
              "B3 : Leves de genoux a la barre",
              "Abdos",
              0,
              3,
              "MAX",
              "0",
              "30sec",
              "Leve le bassin, retiens la descente, pas de balancier.",
              "Crunch poulie, leve de jambes au sol"
            )
          ]
        },
        {
          id: "3x-day-6",
          label: "Jour 6 - Repos",
          rest: true,
          exercises: []
        },
        {
          id: "3x-day-7",
          label: "Jour 7 - Repos",
          rest: true,
          exercises: []
        }
      ]
    },
    "4x": {
      id: "4x",
      name: "PROGRAMME - 4x/semaine",
      days: [
        {
          id: "4x-day-1",
          label: "Jour 1 - Upper",
          rest: false,
          exercises: [
            ex(
              "4x-d1-ex1",
              "Developpe incline a la smith",
              "Pectoraux",
              2,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Banc 30 degres, coude 45 degres, omoplates serrees.",
              "Developpe incline barre ou halteres"
            ),
            ex(
              "4x-d1-ex2",
              "Tirage vertical prise large",
              "Dos",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Amplitude complete, tire les coudes vers le bas.",
              "Traction, tirage machine"
            ),
            ex(
              "4x-d1-ex3",
              "A1 : Pushdown triceps corde",
              "Triceps",
              1,
              3,
              "10-15",
              "2-1-0",
              "30sec",
              "Coudes pres du corps, extension complete.",
              "Barre droite, barre V"
            ),
            ex(
              "4x-d1-ex4",
              "A2 : Pull-over a la poulie",
              "Dos",
              1,
              3,
              "10-15",
              "2-1-0",
              "1min30",
              "Bras presque tendus, dorsaux engages.",
              "Pull-over haltere"
            ),
            ex(
              "4x-d1-ex5",
              "B1 : Crunch a la poulie",
              "Abdos",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Arrondi du buste uniquement.",
              "Leve de genoux"
            ),
            ex(
              "4x-d1-ex6",
              "B2 : Elevations laterales",
              "Epaules",
              1,
              3,
              "15-20",
              "2-1-0",
              "15sec",
              "Controle la montee et la descente.",
              "Machine laterale, poulie"
            )
          ]
        },
        {
          id: "4x-day-2",
          label: "Jour 2 - Jambes/Bras",
          rest: false,
          exercises: [
            ex(
              "4x-d2-ex1",
              "Squat",
              "Quadriceps",
              2,
              3,
              "6-8",
              "3-2-1",
              "2min30",
              "Pieds stables, gainage fort, amplitude controlee.",
              "Presse a cuisses, hack squat"
            ),
            ex(
              "4x-d2-ex2",
              "A1 : Extension triceps a la poulie haute",
              "Triceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Coudes fixes, extension complete.",
              "Extension halteres"
            ),
            ex(
              "4x-d2-ex3",
              "A2 : Curl a la poulie",
              "Biceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Descente lente, sans elan.",
              "Curl halteres"
            ),
            ex(
              "4x-d2-ex4",
              "B1 : Leg curl assis",
              "Ischios",
              1,
              3,
              "8-12",
              "2-1-0",
              "2min",
              "Tends et flechis completement.",
              "Leg curl allonge"
            ),
            ex(
              "4x-d2-ex5",
              "B2 : Extension triceps a la poulie haute",
              "Triceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Version strict sans balancer.",
              "Barre, corde"
            ),
            ex(
              "4x-d2-ex6",
              "B3 : Curl marteau",
              "Biceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Coude proche du corps, paume neutre.",
              "Curl marteau poulie"
            )
          ]
        },
        {
          id: "4x-day-3",
          label: "Jour 3 - Repos",
          rest: true,
          exercises: []
        },
        {
          id: "4x-day-4",
          label: "Jour 4 - Fullbody",
          rest: false,
          exercises: [
            ex(
              "4x-d4-ex1",
              "Dips lestes",
              "Pectoraux",
              2,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Descente controlee, amplitude maximale.",
              "Machine dips, developpe decline"
            ),
            ex(
              "4x-d4-ex2",
              "Tirage vertical prise neutre",
              "Dos",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min",
              "Coudes vers les hanches.",
              "Traction prise neutre"
            ),
            ex(
              "4x-d4-ex3",
              "A1 : Leg extension",
              "Quadriceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Contraction forte en haut.",
              "Sissy squat"
            ),
            ex(
              "4x-d4-ex4",
              "A2 : Hyperextension",
              "Bas du dos",
              1,
              3,
              "10-15",
              "2-1-0",
              "1min",
              "Gaine fort, descente controlee.",
              "Good morning"
            ),
            ex(
              "4x-d4-ex5",
              "B1 : Upright row aux halteres",
              "Epaules",
              1,
              3,
              "12-20",
              "2-1-0",
              "15sec",
              "Coudes a hauteur des epaules.",
              "Elevations laterales"
            ),
            ex(
              "4x-d4-ex6",
              "B2 : Extension mollet jambes tendues",
              "Mollets",
              1,
              3,
              "8-12",
              "1-1-0",
              "1min",
              "Amplitude maximale, pause en bas.",
              "Mollets machine"
            )
          ]
        },
        {
          id: "4x-day-5",
          label: "Jour 5 - Upper",
          rest: false,
          exercises: [
            ex(
              "4x-d5-ex1",
              "Developpe militaire a la machine",
              "Epaules",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min30",
              "Gainage fort, amplitude complete.",
              "Developpe militaire barre ou halteres"
            ),
            ex(
              "4x-d5-ex2",
              "Curl incline",
              "Biceps",
              1,
              3,
              "6-8",
              "2-1-0",
              "2min",
              "Bras fixes et etirement complet.",
              "Curl banc Larry"
            ),
            ex(
              "4x-d5-ex3",
              "A1 : Elevations laterales aux halteres",
              "Epaules",
              1,
              3,
              "12-20",
              "2-1-0",
              "15sec",
              "Controle strict, pas d'elan.",
              "Poulie laterale"
            ),
            ex(
              "4x-d5-ex4",
              "A2 : Leves de genoux a la barre",
              "Abdos",
              0,
              3,
              "MAX",
              "0-0-0",
              "1min",
              "Bassin vers le haut, descente controlee.",
              "Crunch poulie"
            ),
            ex(
              "4x-d5-ex5",
              "B1 : Extension triceps a la poulie haute",
              "Triceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "15sec",
              "Coudes proches du corps.",
              "Barre, corde"
            ),
            ex(
              "4x-d5-ex6",
              "B2 : Curl marteau",
              "Biceps",
              1,
              3,
              "8-12",
              "2-1-0",
              "1min",
              "Mouvement controle sans balancier.",
              "Poulie corde"
            )
          ]
        },
        {
          id: "4x-day-6",
          label: "Jour 6 - Repos",
          rest: true,
          exercises: []
        },
        {
          id: "4x-day-7",
          label: "Jour 7 - Repos",
          rest: true,
          exercises: []
        }
      ]
    }
  };
}
