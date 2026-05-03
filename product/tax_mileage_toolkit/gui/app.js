let activeRunId = null;
let statusDismissTimer = null;
let _logPollTimer = null;

const statusBanner  = document.getElementById("statusBanner");
const statusText    = document.getElementById("statusText");
const statusSpinner = document.getElementById("statusSpinner");
const feedbackArea  = document.getElementById("feedbackArea");
const summaryArea   = document.getElementById("summaryArea");
const rawSummaryEl  = document.getElementById("rawSummary");
const rawSummaryWrap = document.getElementById("rawSummaryWrap");
const runsList      = document.getElementById("runsList");
const suggestionsTable = document.getElementById("suggestionsTable");
const genericTable  = document.getElementById("genericTable");
const selectionCount = document.getElementById("selectionCount");
const runLogWrap    = document.getElementById("runLogWrap");
const runLogBody    = document.getElementById("runLogBody");
const runLogLines   = document.getElementById("runLogLines");
const runLogToggleBtn = document.getElementById("runLogToggleBtn");

function setStatus(state, text) {
  clearTimeout(statusDismissTimer);
  statusBanner.className = `state-${state}`;
  statusText.textContent = text;
  statusSpinner.classList.toggle("hidden", state !== "running");
  if (state === "success") {
    statusDismissTimer = setTimeout(() => setStatus("idle", ""), 4000);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

function formatRunId(id) {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!m) return id;
  return `${m[1]}-${m[2]}-${m[3]}  ${m[4]}:${m[5]}:${m[6]}`;
}

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
  });
});

function navigateTo(viewId) {
  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === `view-${viewId}`);
  });
}

function renderTable(target, rows, withSelect = false) {
  if (!rows || rows.length === 0) {
    target.innerHTML = '<div class="empty-state">No rows found.</div>';
    return;
  }
  const headers = Object.keys(rows[0]);
  const head = `<tr>
    ${withSelect ? "<th><input type='checkbox' id='selectAll' title='Select all'></th>" : ""}
    ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
  </tr>`;
  const body = rows.map(r => {
    const rowIdx = escapeHtml(r.row_idx || "");
    const pickCell = withSelect
      ? `<td><input type="checkbox" class="row-cb" data-row="${rowIdx}"></td>`
      : "";
    return `<tr>${pickCell}${headers.map(h => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>`;
  }).join("");
  const tableClass = withSelect ? "table-selectable" : "";
  target.innerHTML = `<table class="${tableClass}"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  if (withSelect) {
    updateSelectionCount();
    const allCb = target.querySelector("#selectAll");
    if (allCb) {
      allCb.addEventListener("change", () => {
        target.querySelectorAll(".row-cb").forEach(cb => {
          cb.checked = allCb.checked;
          cb.closest("tr").classList.toggle("row-selected", allCb.checked);
        });
        updateSelectionCount();
      });
    }
    target.querySelectorAll(".row-cb").forEach(cb => {
      cb.addEventListener("change", () => {
        cb.closest("tr").classList.toggle("row-selected", cb.checked);
        updateSelectionCount();
      });
    });
  }
}

function updateSelectionCount() {
  const total = suggestionsTable.querySelectorAll(".row-cb").length;
  const checked = suggestionsTable.querySelectorAll(".row-cb:checked").length;
  selectionCount.textContent = total > 0 ? `${checked} of ${total} selected` : "";
}

async function refreshRuns(preserveStatus = false) {
  if (!preserveStatus) setStatus("running", "Loading runs…");
  const data = await getJson("/api/runs");
  if (!data.runs || data.runs.length === 0) {
    runsList.innerHTML = '<div class="empty-state">No runs yet. Use Run Controls to create one.</div>';
    activeRunId = null;
    if (!preserveStatus) setStatus("idle", "");
    return;
  }
  runsList.innerHTML = data.runs.map(r => {
    const chips = [
      r.has_audit       ? '<span class="chip chip-green">audit</span>' : '<span class="chip chip-gray">no audit</span>',
      r.has_suggestions ? '<span class="chip chip-green">suggestions</span>' : '<span class="chip chip-gray">no suggestions</span>',
      r.has_index_html  ? '<span class="chip chip-green">html</span>'  : "",
    ].filter(Boolean).join("");
    return `
      <div class="run-entry" data-run-id="${escapeHtml(r.id)}">
        <div>
          <div class="run-id-label">${escapeHtml(r.id)}</div>
          <div class="run-datetime">${formatRunId(r.id)}</div>
        </div>
        <div class="run-chips">${chips}</div>
      </div>`;
  }).join("");

  runsList.querySelectorAll(".run-entry").forEach(el => {
    el.addEventListener("click", () => {
      runsList.querySelectorAll(".run-entry").forEach(e => e.classList.remove("active"));
      el.classList.add("active");
      loadSummary(el.dataset.runId);
    });
  });

  const firstRun = data.runs[0];
  if (firstRun) {
    const firstEl = runsList.querySelector(".run-entry");
    if (firstEl) firstEl.classList.add("active");
    await loadSummary(firstRun.id);
  }
  if (!preserveStatus) {
    setStatus("success", `${data.runs.length} run${data.runs.length !== 1 ? "s" : ""} loaded`);
  }
}

async function loadSummary(runId) {
  const runChanged = activeRunId !== runId;
  if (runChanged) {
    _clusterAllRows = [];
    _clusterSiteRows = [];
    _clusterLoadedRunId = null;
    _clusterSort = { col: "distinct_days", dir: "desc" };
    document.getElementById("clusterSummaryBar").innerHTML = '<div class="empty-state">Select a run to load cluster data.</div>';
    document.getElementById("clusterTable").innerHTML = '<div class="empty-state">Loading cluster data…</div>';
    document.getElementById("clusterRowCount").textContent = "";
    const canvas = document.getElementById("clusterHistogram");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById("clusterHistogramEmpty").classList.remove("hidden");
    if (_clusterMap) {
      _clusterMap.remove();
      _clusterMap = null;
      _clusterPinLayer = null;
      _sitePinLayer = null;
      document.getElementById("clusterMap").innerHTML = '<div class="empty-state">Load clusters to view the map.</div>';
    }
    document.getElementById("showSitesToggle").checked = false;
  }
  activeRunId = runId;
  const data = await getJson(`/api/runs/${runId}/summary`);
  renderSummary(data);
  if (runChanged) {
    loadClusterExplorer();
  }
}

function formatRows(rows) {
  if (!rows || rows.length === 0) return "none sampled";
  return rows.map(r => escapeHtml(r)).join(", ");
}

function renderSummary(data) {
  const feedback = Array.isArray(data.actionable_feedback) ? data.actionable_feedback : [];
  const visibleFeedback = feedback.filter(item => (item.count ?? 0) > 0);
  const sugg = data.suggestions || { total: 0, suggested: 0, deferred: 0, skipped: 0 };

  const meta = `
    <div class="summary-meta">
      Run <span class="meta-chip">${escapeHtml(data.run_id)}</span>
      <span class="meta-sep">·</span>
      Suggestions: <strong>${escapeHtml(sugg.total)}</strong> total
      <span class="meta-sep">·</span>
      ${escapeHtml(sugg.suggested)} suggested
      <span class="meta-sep">·</span>
      ${escapeHtml(sugg.deferred)} deferred
      <span class="meta-sep">·</span>
      ${escapeHtml(sugg.skipped)} skipped
    </div>`;

  let cardsHtml;
  if (visibleFeedback.length === 0) {
    cardsHtml = `<div class="info-banner">✓ No workbook alignment issues detected.</div>`;
  } else {
    cardsHtml = `<div class="feedback-list">${visibleFeedback.map(item => {
      const loc = item.workbook_location || {};
      const sheet = escapeHtml(loc.sheet || "Unknown sheet");
      const cols = Array.isArray(loc.columns) ? loc.columns.map(c => `<span class="location-chip">${escapeHtml(c)}</span>`).join(" ") : "";
      const rowStart = escapeHtml(loc.row_start ?? "?");
      const rowEnd   = escapeHtml(loc.row_end   ?? "?");
      return `
        <div class="feedback-card">
          <div class="feedback-card-header">
            <div class="feedback-key">${escapeHtml(item.metric_key)}</div>
            <span class="feedback-badge">${escapeHtml(item.count)} issue${item.count !== 1 ? "s" : ""}</span>
          </div>
          <div class="feedback-location">
            <span class="location-chip">${sheet}</span>
            <span class="location-chip">rows ${rowStart}–${rowEnd}</span>
            ${cols}
          </div>
          <div class="feedback-section">
            <div class="feedback-section-label">Do This</div>
            <div class="feedback-section-text">${escapeHtml(item.practical_action || "")}</div>
          </div>
          <div class="feedback-section">
            <div class="feedback-section-label">Goal</div>
            <div class="feedback-section-text">${escapeHtml(item.alignment_goal || "")}</div>
          </div>
          ${item.sample_rows && item.sample_rows.length > 0 ? `
          <div class="feedback-section">
            <div class="feedback-section-label">Sample Rows</div>
            <div class="feedback-section-text">${formatRows(item.sample_rows)}</div>
          </div>` : ""}
        </div>`;
    }).join("")}</div>`;
  }

  const fullHtml = meta + cardsHtml;
  feedbackArea.innerHTML = fullHtml;
  summaryArea.innerHTML = fullHtml;
  rawSummaryEl.textContent = JSON.stringify(data, null, 2);
  rawSummaryWrap.classList.remove("hidden");
}

runLogToggleBtn.addEventListener("click", () => {
  const collapsed = runLogBody.classList.toggle("collapsed");
  runLogToggleBtn.textContent = collapsed ? "Expand" : "Collapse";
});

function showRunLog() {
  runLogLines.innerHTML = "";
  runLogWrap.classList.remove("hidden");
  runLogBody.classList.remove("collapsed");
  runLogToggleBtn.textContent = "Collapse";
}

function appendLogLine(text) {
  const div = document.createElement("div");
  div.className = "run-log-line";
  if (text.includes("complete") || text.includes("Run complete")) {
    div.classList.add("log-complete");
  } else if (text.toLowerCase().includes("error")) {
    div.classList.add("log-error");
  } else if (text.match(/Step \d+\/\d+/)) {
    div.classList.add("log-step");
  }
  div.textContent = text;
  runLogLines.appendChild(div);
  runLogLines.scrollTop = runLogLines.scrollHeight;
}

function stopLogPolling() {
  if (_logPollTimer !== null) {
    clearTimeout(_logPollTimer);
    _logPollTimer = null;
  }
}

const LOG_POLL_MAX_FAILURES = 10;

async function pollRunLog(runId, since, onDone, failureCount = 0) {
  stopLogPolling();
  try {
    const data = await getJson(`/api/runs/${runId}/log?since=${since}`);
    for (const line of data.lines) {
      appendLogLine(line);
    }
    const nextSince = data.total;
    if (data.done) {
      onDone(data.error || null);
    } else {
      _logPollTimer = setTimeout(() => pollRunLog(runId, nextSince, onDone, 0), 400);
    }
  } catch (err) {
    const next = failureCount + 1;
    if (next >= LOG_POLL_MAX_FAILURES) {
      appendLogLine("[error] Log stream unavailable — could not reach server.");
      onDone("Log stream unavailable after repeated failures.");
    } else {
      _logPollTimer = setTimeout(() => pollRunLog(runId, since, onDone, next), 1000);
    }
  }
}

document.getElementById("browseBtn").addEventListener("click", async () => {
  const browseBtn = document.getElementById("browseBtn");
  browseBtn.disabled = true;
  try {
    const res = await fetch("/api/browse");
    if (!res.ok) {
      let detail = `${res.status} error`;
      try { detail = (await res.json()).detail || detail; } catch (_) { detail = await res.text() || detail; }
      setStatus("error", `File browser failed: ${detail}`);
      return;
    }
    const data = await res.json();
    if (data.path) {
      document.getElementById("workbookPath").value = data.path;
      localStorage.setItem("workbookPath", data.path);
    }
  } catch (err) {
    setStatus("error", `File browser failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    browseBtn.disabled = false;
  }
});

async function runIteration() {
  const workbookPath = document.getElementById("workbookPath").value.trim();
  if (!workbookPath) {
    setStatus("error", "Workbook path is required.");
    return;
  }
  const runBtn = document.getElementById("runBtn");
  const runBtnIcon = document.getElementById("runBtnIcon");
  runBtn.disabled = true;
  runBtnIcon.textContent = "⏳";
  setStatus("running", "Running iteration…");
  showRunLog();

  try {
    const payload = {
      workbook_path: workbookPath,
      engage_deferred: document.getElementById("engageDeferred").checked,
      write_suggestions: document.getElementById("writeSuggestions").checked,
    };
    const res = await getJson("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const runId = res.run_id;

    await new Promise((resolve) => {
      pollRunLog(runId, 0, (errorMsg) => {
        resolve(errorMsg);
      });
    }).then(async (errorMsg) => {
      stopLogPolling();
      if (errorMsg) {
        setStatus("error", `Run failed: ${errorMsg}`);
        return;
      }
      setStatus("success", `Run complete: ${runId}`);
      await refreshRuns(true);
      selectRunById(runId);
      await loadSummary(runId);
      navigateTo("history");
    });
  } catch (err) {
    stopLogPolling();
    const message = err instanceof Error ? err.message : String(err);
    setStatus("error", `Run failed: ${message}`);
    console.error("runIteration failed", err);
  } finally {
    runBtn.disabled = false;
    runBtnIcon.textContent = "▶";
  }
}

function selectRunById(runId) {
  runsList.querySelectorAll(".run-entry").forEach(el => {
    el.classList.toggle("active", el.dataset.runId === runId);
  });
}

async function loadTable(name, query = "") {
  if (!activeRunId) {
    setStatus("error", "No run selected. Load a run from Runs History first.");
    return;
  }
  const q = encodeURIComponent(query);
  setStatus("running", `Loading ${name}…`);
  try {
    const data = await getJson(`/api/runs/${activeRunId}/table/${name}?q=${q}`);
    if (name === "suggestions") {
      renderTable(suggestionsTable, data.rows, true);
    } else {
      renderTable(genericTable, data.rows, false);
    }
    setStatus("success", `${data.total} row${data.total !== 1 ? "s" : ""} loaded`);
  } catch (err) {
    setStatus("error", `Failed to load ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function selectedRowIndices() {
  const rows = [];
  suggestionsTable.querySelectorAll(".row-cb:checked").forEach(b => {
    if (b.dataset.row) rows.push(parseInt(b.dataset.row, 10));
  });
  return rows;
}

async function promote(dryRun) {
  const workbookPath = document.getElementById("workbookPath").value.trim();
  const rowIndices = selectedRowIndices();
  if (!activeRunId || !workbookPath || rowIndices.length === 0) {
    setStatus("error", "Need an active run, workbook path, and at least one selected row.");
    return;
  }
  if (!dryRun) {
    const ok = confirm(`Promote ${rowIndices.length} suggestion(s) to the workbook? This writes to the file.`);
    if (!ok) return;
  }
  setStatus("running", dryRun ? "Running dry-run promotion…" : "Promoting suggestions…");
  try {
    const payload = {
      workbook_path: workbookPath,
      run_id: activeRunId,
      row_indices: rowIndices,
      dry_run: dryRun,
    };
    const res = await getJson("/api/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatus("success", dryRun ? "Dry-run complete — no changes written." : `Promotion complete: ${res.applied_count} row(s) written.`);
    alert(JSON.stringify(res, null, 2));
  } catch (err) {
    setStatus("error", `Promotion failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("promote failed", err);
  }
}

function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}

let _clusterAllRows = [];
let _clusterSort = { col: "distinct_days", dir: "desc" };
let _clusterMap = null;
let _clusterPinLayer = null;
let _sitePinLayer = null;
let _clusterSiteRows = [];
let _clusterLoadedRunId = null;
let _activeClusterTab = "table";

const CLUSTER_COLS = [
  { key: "cluster_id",          label: "Cluster ID" },
  { key: "user_site_label",     label: "Label" },
  { key: "distinct_days",       label: "Days",          numeric: true },
  { key: "total_hours",         label: "Hours",         numeric: true },
  { key: "first_seen",          label: "First Seen" },
  { key: "last_seen",           label: "Last Seen" },
  { key: "review_status",       label: "Status" },
  { key: "final_site_decision", label: "Final Decision" },
  { key: "auto_match_grade",    label: "Grade" },
  { key: "nearest_site",        label: "Nearest Site" },
  { key: "distance_to_site_mi", label: "Dist (mi)",     numeric: true },
];

function resetClusterFilters() {
  document.getElementById("clusterSearch").value = "";
  document.getElementById("clusterStatusFilter").value = "";
  document.getElementById("clusterGradeFilter").value = "";
  document.getElementById("clusterMinDays").value = "";
  document.getElementById("clusterMaxDays").value = "";
}

async function loadClusterExplorer(forRunId = activeRunId) {
  if (!forRunId) {
    setStatus("error", "No run selected. Load a run from Runs History first.");
    return;
  }
  resetClusterFilters();
  setStatus("running", "Loading cluster data…");
  try {
    const [statsData, tableData] = await Promise.all([
      getJson(`/api/runs/${forRunId}/cluster-stats`),
      getJson(`/api/runs/${forRunId}/table/matches?limit=5000`),
    ]);
    if (activeRunId !== forRunId) return;
    _clusterLoadedRunId = forRunId;
    _clusterAllRows = tableData.rows || [];
    if (_clusterAllRows.length === 0) {
      document.getElementById("clusterSummaryBar").innerHTML = '<div class="empty-state">No cluster match report for this run.</div>';
      document.getElementById("clusterTable").innerHTML = '<div class="empty-state">No cluster data available for this run.</div>';
      document.getElementById("clusterRowCount").textContent = "";
      renderClusterHistogram([]);
      setStatus("idle", "");
      return;
    }
    renderClusterSummaryBar(statsData);
    renderClusterHistogram(_clusterAllRows);
    applyClusterFilters();
    setStatus("success", `${_clusterAllRows.length} cluster${_clusterAllRows.length !== 1 ? "s" : ""} loaded`);
  } catch (err) {
    if (activeRunId !== forRunId) return;
    _clusterLoadedRunId = forRunId;
    const msg = errMsg(err);
    if (msg.startsWith("404")) {
      document.getElementById("clusterSummaryBar").innerHTML = '<div class="empty-state">No cluster match report for this run.</div>';
      document.getElementById("clusterTable").innerHTML = '<div class="empty-state">No cluster data available for this run.</div>';
      document.getElementById("clusterRowCount").textContent = "";
      renderClusterHistogram([]);
      setStatus("idle", "");
    } else {
      setStatus("error", `Failed to load clusters: ${msg}`);
    }
  }
}

function renderClusterSummaryBar(stats) {
  const bar = document.getElementById("clusterSummaryBar");
  const { total_clusters, total_distinct_days, resolved_count, unresolved_count, overlap_pairs, grade_counts } = stats;
  bar.innerHTML = `
    <div class="cluster-stat-item">
      <div class="cluster-stat-value accent">${total_clusters}</div>
      <div class="cluster-stat-label">Clusters</div>
      <div class="cluster-stat-sub">total locations</div>
    </div>
    <div class="cluster-stat-item">
      <div class="cluster-stat-value">${total_distinct_days}</div>
      <div class="cluster-stat-label">Visit-Days</div>
      <div class="cluster-stat-sub">across all clusters</div>
    </div>
    <div class="cluster-stat-item">
      <div class="cluster-stat-value green">${resolved_count}</div>
      <div class="cluster-stat-label">Resolved</div>
      <div class="cluster-stat-sub">have a status set</div>
    </div>
    <div class="cluster-stat-item">
      <div class="cluster-stat-value amber">${unresolved_count}</div>
      <div class="cluster-stat-label">Unresolved</div>
      <div class="cluster-stat-sub">need attention</div>
    </div>
    <div class="cluster-stat-item">
      <div class="cluster-stat-value ${overlap_pairs > 0 ? "red" : ""}">${overlap_pairs}</div>
      <div class="cluster-stat-label">Overlaps</div>
      <div class="cluster-stat-sub">cluster pairs &lt;0.5 mi</div>
    </div>
    <div class="cluster-summary-prose">
      <strong>${total_clusters} clusters</strong> across <strong>${total_distinct_days} visit-days</strong>
      &nbsp;·&nbsp; ${resolved_count} resolved, <strong>${unresolved_count} unresolved</strong>
      &nbsp;·&nbsp; ${grade_counts.Strong} strong match · ${grade_counts.Near} near · ${grade_counts.unmatched} unmatched
    </div>`;
}

function renderClusterHistogram(rows) {
  const canvas = document.getElementById("clusterHistogram");
  const emptyEl = document.getElementById("clusterHistogramEmpty");

  const buckets = [
    { label: "1 day",    min: 1,  max: 1  },
    { label: "2–5 days", min: 2,  max: 5  },
    { label: "6–20 days",min: 6,  max: 20 },
    { label: "21+ days", min: 21, max: Infinity },
  ];

  const counts = buckets.map(() => 0);
  rows.forEach(r => {
    const d = parseInt(r.distinct_days, 10) || 0;
    for (let i = 0; i < buckets.length; i++) {
      if (d >= buckets[i].min && d <= buckets[i].max) { counts[i]++; break; }
    }
  });

  if (rows.length === 0) {
    canvas.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }
  canvas.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth || 600;
  const H = 160;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const maxCount = Math.max(...counts, 1);
  const padL = 40, padR = 16, padT = 16, padB = 36;
  const drawW = W - padL - padR;
  const drawH = H - padT - padB;
  const barGap = 12;
  const barW = (drawW - barGap * (buckets.length - 1)) / buckets.length;

  const accentColor = "#3b82f6";
  const textColor   = "#8b95aa";
  const gridColor   = "#252d42";

  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i <= 4; i++) {
    const y = padT + drawH - (drawH * i / 4);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + drawW, y);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(maxCount * i / 4), padL - 5, y + 3.5);
  }

  buckets.forEach((b, i) => {
    const x = padL + i * (barW + barGap);
    const barH = counts[i] === 0 ? 0 : Math.max(3, (counts[i] / maxCount) * drawH);
    const y = padT + drawH - barH;

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
    } else {
      ctx.rect(x, y, barW, barH);
    }
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.label, x + barW / 2, H - padB + 14);

    if (counts[i] > 0) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillText(counts[i], x + barW / 2, y - 4);
    }
  });

  canvas._bucketRanges = buckets.map((b, i) => ({
    x: padL + i * (barW + barGap),
    w: barW,
    min: b.min,
    max: b.max,
  }));

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    for (const range of canvas._bucketRanges) {
      if (mx >= range.x && mx <= range.x + range.w) {
        document.getElementById("clusterMinDays").value = range.min === Infinity ? "" : range.min;
        document.getElementById("clusterMaxDays").value = range.max === Infinity ? "" : range.max;
        applyClusterFilters();
        break;
      }
    }
  };
  canvas.style.cursor = "pointer";
  canvas.title = "Click a bar to filter by that frequency range";
}

function applyClusterFilters() {
  const search   = document.getElementById("clusterSearch").value.trim().toLowerCase();
  const status   = document.getElementById("clusterStatusFilter").value;
  const grade    = document.getElementById("clusterGradeFilter").value;
  const minDays  = parseInt(document.getElementById("clusterMinDays").value, 10);
  const maxDays  = parseInt(document.getElementById("clusterMaxDays").value, 10);

  let filtered = _clusterAllRows.filter(r => {
    if (search) {
      const haystack = ((r.user_site_label || "") + " " + (r.nearest_site || "")).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (status === "unresolved") {
      const s = (r.review_status || "").trim().toLowerCase();
      if (s && s !== "unresolved" && s !== "pending") return false;
    }
    if (grade) {
      const g = (r.auto_match_grade || "").trim();
      if (grade === "unmatched") { if (g) return false; }
      else if (g !== grade) return false;
    }
    const days = parseInt(r.distinct_days, 10) || 0;
    if (!isNaN(minDays) && days < minDays) return false;
    if (!isNaN(maxDays) && days > maxDays) return false;
    return true;
  });

  filtered = sortClusterRows(filtered);
  renderClusterTable(filtered);
  if (_activeClusterTab === "map") {
    renderClusterMap(filtered);
  }
}

function gradeToColor(grade) {
  if (grade === "Strong") return "#22c55e";
  if (grade === "Near")   return "#3b82f6";
  return "#8b95aa";
}

function makeCircleIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="9" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -13],
  });
}

function makeSiteIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
    <polygon points="9,1 17,17 1,17" fill="#f59e0b" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 17],
    popupAnchor: [0, -19],
  });
}

function initClusterMap() {
  if (_clusterMap) return;
  const container = document.getElementById("clusterMap");
  container.innerHTML = "";
  _clusterMap = L.map(container, {
    center: [39.5, -98.35],
    zoom: 4,
    zoomControl: true,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(_clusterMap);
  _clusterPinLayer = L.layerGroup().addTo(_clusterMap);
  _sitePinLayer    = L.layerGroup().addTo(_clusterMap);
}

function renderClusterMap(rows) {
  initClusterMap();
  _clusterPinLayer.clearLayers();

  const bounds = [];
  rows.forEach(r => {
    const lat = parseFloat(r.lat || "");
    const lng = parseFloat(r.lng || "");
    if (isNaN(lat) || isNaN(lng)) return;

    const grade = (r.auto_match_grade || "").trim();
    const color = gradeToColor(grade);
    const icon  = makeCircleIcon(color);

    const label    = escapeHtml(r.user_site_label || "—");
    const cid      = escapeHtml(r.cluster_id      || "—");
    const days     = escapeHtml(r.distinct_days    || "—");
    const site     = escapeHtml(r.nearest_site     || "—");
    const gradeStr = escapeHtml(grade              || "unmatched");

    const popup = `
      <div class="map-popup-title">${label}</div>
      <div class="map-popup-row"><span class="map-popup-key">Cluster</span><span class="map-popup-val">${cid}</span></div>
      <div class="map-popup-row"><span class="map-popup-key">Days</span><span class="map-popup-val">${days}</span></div>
      <div class="map-popup-row"><span class="map-popup-key">Grade</span><span class="map-popup-val">${gradeStr}</span></div>
      <div class="map-popup-row"><span class="map-popup-key">Nearest</span><span class="map-popup-val">${site}</span></div>`;

    const marker = L.marker([lat, lng], { icon })
      .bindPopup(popup, { className: "cluster-map-popup", maxWidth: 260 });
    _clusterPinLayer.addLayer(marker);
    bounds.push([lat, lng]);
  });

  if (bounds.length > 0) {
    _clusterMap.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 14 });
    const emptyOverlay = document.getElementById("clusterMapEmpty");
    if (emptyOverlay) emptyOverlay.remove();
  } else {
    if (!document.getElementById("clusterMapEmpty")) {
      const msg = document.createElement("div");
      msg.id = "clusterMapEmpty";
      msg.className = "cluster-map-empty-overlay";
      msg.textContent = rows.length === 0
        ? "No clusters match the current filters."
        : "No clusters have location coordinates.";
      document.getElementById("clusterMap").appendChild(msg);
    }
  }
  _clusterMap.invalidateSize();
}

function renderSiteMap(siteRows) {
  if (!_clusterMap) return;
  _sitePinLayer.clearLayers();
  const siteIcon = makeSiteIcon();
  siteRows.forEach(r => {
    const lat = parseFloat(r.lat || r.site_lat || "");
    const lng = parseFloat(r.lng || r.site_lng || "");
    const name = r.site_name || r.name || r.label || "Known site";
    if (isNaN(lat) || isNaN(lng)) return;
    const popup = `<div class="map-popup-title">${escapeHtml(name)}</div>
      <div class="map-popup-row"><span class="map-popup-key">Site</span><span class="map-popup-val">${escapeHtml(name)}</span></div>`;
    L.marker([lat, lng], { icon: siteIcon })
      .bindPopup(popup, { className: "cluster-map-popup", maxWidth: 220 })
      .addTo(_sitePinLayer);
  });
}

async function loadAndShowSites() {
  if (!activeRunId) return;
  try {
    const data = await getJson(`/api/runs/${activeRunId}/table/sites?limit=2000`);
    _clusterSiteRows = data.rows || [];
    renderSiteMap(_clusterSiteRows);
    if (_clusterSiteRows.length === 0) {
      setStatus("error", "No known site data found for this run.");
    }
  } catch (err) {
    _clusterSiteRows = [];
    setStatus("error", `Could not load known sites: ${errMsg(err)}`);
  }
}

function switchClusterTab(tab) {
  _activeClusterTab = tab;
  document.querySelectorAll(".cluster-tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("clusterTablePane").classList.toggle("active", tab === "table");
  document.getElementById("clusterTablePane").classList.toggle("hidden", tab !== "table");
  document.getElementById("clusterMapPane").classList.toggle("active", tab === "map");
  document.getElementById("clusterMapPane").classList.toggle("hidden", tab !== "map");

  const sitesLabel = document.getElementById("showSitesLabel");
  if (tab === "map") {
    sitesLabel.classList.remove("hidden");
    const filtered = getCurrentFilteredRows();
    renderClusterMap(filtered);
    if (document.getElementById("showSitesToggle").checked) {
      renderSiteMap(_clusterSiteRows);
    }
  } else {
    sitesLabel.classList.add("hidden");
  }
}

function getCurrentFilteredRows() {
  const search   = document.getElementById("clusterSearch").value.trim().toLowerCase();
  const status   = document.getElementById("clusterStatusFilter").value;
  const grade    = document.getElementById("clusterGradeFilter").value;
  const minDays  = parseInt(document.getElementById("clusterMinDays").value, 10);
  const maxDays  = parseInt(document.getElementById("clusterMaxDays").value, 10);

  return _clusterAllRows.filter(r => {
    if (search) {
      const haystack = ((r.user_site_label || "") + " " + (r.nearest_site || "")).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (status === "unresolved") {
      const s = (r.review_status || "").trim().toLowerCase();
      if (s && s !== "unresolved" && s !== "pending") return false;
    }
    if (grade) {
      const g = (r.auto_match_grade || "").trim();
      if (grade === "unmatched") { if (g) return false; }
      else if (g !== grade) return false;
    }
    const days = parseInt(r.distinct_days, 10) || 0;
    if (!isNaN(minDays) && days < minDays) return false;
    if (!isNaN(maxDays) && days > maxDays) return false;
    return true;
  });
}

function sortClusterRows(rows) {
  const { col, dir } = _clusterSort;
  const colDef = CLUSTER_COLS.find(c => c.key === col);
  const numeric = colDef ? colDef.numeric : false;
  return [...rows].sort((a, b) => {
    let av = a[col] ?? "";
    let bv = b[col] ?? "";
    if (numeric) {
      av = parseFloat(av) || 0;
      bv = parseFloat(bv) || 0;
    } else {
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function gradeBadge(grade) {
  if (grade === "Strong") return `<span class="grade-badge grade-strong">Strong</span>`;
  if (grade === "Near")   return `<span class="grade-badge grade-near">Near</span>`;
  return `<span class="grade-badge grade-none">${escapeHtml(grade) || "—"}</span>`;
}

function renderClusterTable(rows) {
  const target = document.getElementById("clusterTable");
  const rowCount = document.getElementById("clusterRowCount");
  rowCount.textContent = rows.length > 0 ? `${rows.length} cluster${rows.length !== 1 ? "s" : ""}` : "";

  if (!rows || rows.length === 0) {
    target.innerHTML = '<div class="empty-state">No clusters match the current filters.</div>';
    return;
  }

  const headCells = CLUSTER_COLS.map(c => {
    const isActive = _clusterSort.col === c.key;
    const indicator = isActive ? `<span class="sort-indicator">${_clusterSort.dir === "asc" ? "▲" : "▼"}</span>` : "";
    return `<th data-col="${c.key}">${escapeHtml(c.label)}${indicator}</th>`;
  }).join("");

  const bodyRows = rows.map((r, idx) => {
    const grade = (r.auto_match_grade || "").trim();
    const cells = CLUSTER_COLS.map(c => {
      if (c.key === "auto_match_grade") return `<td>${gradeBadge(grade)}</td>`;
      return `<td>${escapeHtml(r[c.key] ?? "")}</td>`;
    }).join("");
    return `<tr class="cluster-row-expandable" data-idx="${idx}">${cells}</tr>`;
  }).join("");

  target.innerHTML = `
    <table class="cluster-table">
      <thead><tr>${headCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  target.querySelectorAll("thead th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (_clusterSort.col === col) {
        _clusterSort.dir = _clusterSort.dir === "asc" ? "desc" : "asc";
      } else {
        _clusterSort.col = col;
        _clusterSort.dir = "asc";
      }
      applyClusterFilters();
    });
  });


  target.querySelectorAll(".cluster-row-expandable").forEach(tr => {
    tr.addEventListener("click", () => {
      const idx = parseInt(tr.dataset.idx, 10);
      const tbody = target.querySelector("tbody");
      const existingDetail = tbody.querySelector(".cluster-detail-row");
      if (existingDetail) {
        const prevIdx = parseInt(existingDetail.dataset.forIdx, 10);
        existingDetail.remove();
        if (prevIdx === idx) { return; }
      }
      const row = rows[idx];
      const numCols = CLUSTER_COLS.length;
      const lat  = parseFloat(row.lat || "");
      const lng  = parseFloat(row.lng || "");
      const mapUrl = (!isNaN(lat) && !isNaN(lng))
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : null;

      const allFields = Object.entries(row).map(([k, v]) => `
        <div class="cluster-detail-field">
          <div class="cluster-detail-key">${escapeHtml(k)}</div>
          <div class="cluster-detail-val">${escapeHtml(v ?? "")}</div>
        </div>`).join("");

      const mapBtn = mapUrl
        ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="cluster-map-link">📍 View on Google Maps</a>`
        : "";

      const detailRow = document.createElement("tr");
      detailRow.className = "cluster-detail-row";
      detailRow.dataset.forIdx = idx;
      detailRow.innerHTML = `<td colspan="${numCols}">
        <div class="cluster-detail-card">
          <div class="cluster-detail-grid">${allFields}</div>
          ${mapBtn}
        </div>
      </td>`;
      tr.insertAdjacentElement("afterend", detailRow);
    });
  });
}

function exportClusterCsv() {
  const rows = sortClusterRows(getCurrentFilteredRows());
  if (rows.length === 0) {
    setStatus("error", "No cluster rows to export.");
    return;
  }
  const escape = v => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerRow = CLUSTER_COLS.map(c => escape(c.label)).join(",");
  const lines = [
    headerRow,
    ...rows.map(r => CLUSTER_COLS.map(c => escape(r[c.key] ?? "")).join(",")),
  ];
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const runPart = activeRunId ? `_${activeRunId}` : "";
  const filename = `clusters${runPart}_${ts}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("success", `Exported ${rows.length} cluster${rows.length !== 1 ? "s" : ""} to ${filename}`);
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshRuns().catch(err => setStatus("error", `Failed to refresh: ${errMsg(err)}`));
});
document.getElementById("runBtn").addEventListener("click", runIteration);
document.getElementById("loadSuggestionsBtn").addEventListener("click", () => {
  loadTable("suggestions", document.getElementById("suggestQuery").value);
});
document.getElementById("loadMatchesBtn").addEventListener("click", () => loadTable("matches"));
document.getElementById("loadOverlapsBtn").addEventListener("click", () => loadTable("overlaps"));
document.getElementById("dryPromoteBtn").addEventListener("click", () => promote(true));
document.getElementById("promoteBtn").addEventListener("click", () => promote(false));

document.getElementById("clusterLoadBtn").addEventListener("click", loadClusterExplorer);
document.getElementById("clusterExportBtn").addEventListener("click", exportClusterCsv);

document.querySelectorAll(".cluster-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchClusterTab(btn.dataset.tab));
});

document.getElementById("showSitesToggle").addEventListener("change", (e) => {
  if (e.target.checked) {
    if (_clusterSiteRows.length === 0) {
      loadAndShowSites();
    } else {
      renderSiteMap(_clusterSiteRows);
    }
  } else {
    if (_sitePinLayer) _sitePinLayer.clearLayers();
  }
});

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  if (btn.dataset.view === "clusters") {
    btn.addEventListener("click", () => {
      if (activeRunId && _clusterLoadedRunId !== activeRunId) {
        loadClusterExplorer(activeRunId);
      }
    });
  }
});

["clusterSearch", "clusterStatusFilter", "clusterGradeFilter", "clusterMinDays", "clusterMaxDays"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", applyClusterFilters);
});

const workbookPathInput = document.getElementById("workbookPath");
const savedWorkbookPath = localStorage.getItem("workbookPath");
if (savedWorkbookPath) {
  workbookPathInput.value = savedWorkbookPath;
}
workbookPathInput.addEventListener("input", () => {
  const val = workbookPathInput.value.trim();
  if (val) {
    localStorage.setItem("workbookPath", val);
  } else {
    localStorage.removeItem("workbookPath");
  }
});
workbookPathInput.addEventListener("blur", () => {
  const val = workbookPathInput.value.trim();
  if (val) {
    localStorage.setItem("workbookPath", val);
  } else {
    localStorage.removeItem("workbookPath");
  }
});

refreshRuns().catch(err => {
  setStatus("error", `Failed to load runs: ${errMsg(err)}`);
});

// ─── Evidence Vault ───────────────────────────────────────────────────────────

const VAULT_ZONES = [
  { docType: "w2",   dropzoneId: "dropzoneW2",   fileInputId: "fileW2",   resultId: "resultW2" },
  { docType: "bank", dropzoneId: "dropzoneBank",  fileInputId: "fileBank", resultId: "resultBank" },
  { docType: "maps", dropzoneId: "dropzoneMaps",  fileInputId: "fileMaps", resultId: "resultMaps" },
];

function renderVaultResult(resultEl, dropzone, data) {
  const isPartial = data.parse_status === "partial";
  dropzone.classList.remove("vault-uploading", "vault-error", "vault-success", "vault-partial");
  dropzone.classList.add(isPartial ? "vault-partial" : "vault-success");

  const warnings = Array.isArray(data.parse_warnings) && data.parse_warnings.length > 0
    ? `<div class="vault-warnings">${data.parse_warnings.map(w =>
        `<div class="vault-warning-item">⚠ ${escapeHtml(w)}</div>`
      ).join("")}</div>`
    : "";

  let fields = "";
  if (data.doc_type === "w2") {
    fields = `
      <div class="vault-field-row"><span class="vault-field-key">Tax Year</span><span class="vault-field-val">${escapeHtml(data.tax_year ?? "—")}</span></div>
      <div class="vault-field-row"><span class="vault-field-key">Employer</span><span class="vault-field-val">${escapeHtml(data.employer_name ?? "—")}</span></div>
      <div class="vault-field-row"><span class="vault-field-key">SSN (last 4)</span><span class="vault-field-val">${escapeHtml(data.employee_ssn_last4 ?? "—")}</span></div>
      <div class="vault-field-row"><span class="vault-field-key">Box 1 Wages</span><span class="vault-field-val vault-money">${data.box1_wages ? "$" + escapeHtml(data.box1_wages) : "—"}</span></div>
      <div class="vault-field-row"><span class="vault-field-key">Box 2 Fed. Withheld</span><span class="vault-field-val vault-money">${data.box2_federal_withheld ? "$" + escapeHtml(data.box2_federal_withheld) : "—"}</span></div>`;
  } else if (data.doc_type === "bank") {
    fields = `
      <div class="vault-field-row"><span class="vault-field-key">Transactions</span><span class="vault-field-val">${escapeHtml(data.transaction_count)}</span></div>
      <div class="vault-field-row"><span class="vault-field-key">Date Range</span><span class="vault-field-val">${escapeHtml(data.date_range_start ?? "—")} → ${escapeHtml(data.date_range_end ?? "—")}</span></div>`;
  } else if (data.doc_type === "maps") {
    fields = `
      <div class="vault-field-row"><span class="vault-field-key">Location Records</span><span class="vault-field-val">${escapeHtml(data.location_count)}</span></div>`;
  }

  const statusLabel = isPartial
    ? `<span class="vault-extract-partial">⚠ Partially Parsed</span>`
    : `<span class="vault-extract-ok">✓ Parsed</span>`;

  resultEl.innerHTML = `
    <div class="vault-extract-card${isPartial ? " vault-extract-card-partial" : ""}">
      <div class="vault-extract-header">
        ${statusLabel}
        <span class="vault-extract-filename">${escapeHtml(data.filename)}</span>
      </div>
      <div class="vault-field-list">${fields}</div>
      ${warnings}
      <div class="vault-saved-path">Saved → <code>${escapeHtml(data.saved_path)}</code></div>
    </div>`;
}

function renderVaultError(resultEl, dropzone, message) {
  dropzone.classList.remove("vault-uploading", "vault-success");
  dropzone.classList.add("vault-error");
  resultEl.innerHTML = `<div class="vault-error-msg">✗ ${escapeHtml(message)}</div>`;
}

async function uploadVaultFile(docType, file, resultEl, dropzone) {
  dropzone.classList.remove("vault-success", "vault-error");
  dropzone.classList.add("vault-uploading");
  resultEl.innerHTML = `<div class="vault-uploading-msg"><span class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Parsing…</div>`;

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await fetch(`/api/ingest/${docType}`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = `${res.status} error`;
      try { detail = (await res.json()).detail || detail; } catch (_) { detail = await res.text() || detail; }
      renderVaultError(resultEl, dropzone, detail);
      return;
    }
    const data = await res.json();
    renderVaultResult(resultEl, dropzone, data);
  } catch (err) {
    renderVaultError(resultEl, dropzone, err instanceof Error ? err.message : String(err));
  }
}

VAULT_ZONES.forEach(({ docType, dropzoneId, fileInputId, resultId }) => {
  const dropzone  = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(fileInputId);
  const resultEl  = document.getElementById(resultId);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) uploadVaultFile(docType, file, resultEl, dropzone);
    fileInput.value = "";
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("vault-dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("vault-dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("vault-dragover");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadVaultFile(docType, file, resultEl, dropzone);
  });
});
