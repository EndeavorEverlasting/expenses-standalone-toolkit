let activeRunId = null;
let statusDismissTimer = null;

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
  activeRunId = runId;
  const data = await getJson(`/api/runs/${runId}/summary`);
  renderSummary(data);
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
    setStatus("success", `Run complete: ${res.run_id}`);
    await refreshRuns(true);
    selectRunById(res.run_id);
    await loadSummary(res.run_id);
    navigateTo("history");
  } catch (err) {
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

refreshRuns().catch(err => {
  setStatus("error", `Failed to load runs: ${errMsg(err)}`);
});
