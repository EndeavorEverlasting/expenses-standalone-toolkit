const statusEl = document.getElementById("status");
const runSelect = document.getElementById("runSelect");
const summaryEl = document.getElementById("summary");
const rawSummaryEl = document.getElementById("rawSummary");
const suggestionsTable = document.getElementById("suggestionsTable");
const genericTable = document.getElementById("genericTable");

function setStatus(text) {
  statusEl.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
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

function renderTable(target, rows, withSelect = false) {
  if (!rows || rows.length === 0) {
    target.innerHTML = "<p>No rows.</p>";
    return;
  }
  const headers = Object.keys(rows[0]);
  const head = `<tr>${withSelect ? "<th>pick</th>" : ""}${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows.map(r => {
    const pickCell = withSelect ? `<td><input type="checkbox" data-row="${escapeHtml(r.row_idx || "")}"></td>` : "";
    return `<tr>${pickCell}${headers.map(h => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>`;
  }).join("");
  target.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

async function refreshRuns() {
  setStatus("Loading runs...");
  const data = await getJson("/api/runs");
  runSelect.innerHTML = "";
  data.runs.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.id;
    runSelect.appendChild(opt);
  });
  if (data.runs.length > 0) {
    await loadSummary(data.runs[0].id);
  } else {
    summaryEl.textContent = "No runs yet.";
  }
  setStatus(`Runs loaded (${data.runs.length})`);
}

async function loadSummary(runId) {
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
  const suggestions = data.suggestions || { total: 0, suggested: 0, deferred: 0, skipped: 0 };
  const safeRunId = escapeHtml(data.run_id);
  const safeTotal = escapeHtml(suggestions.total);
  const safeSuggested = escapeHtml(suggestions.suggested);
  const safeDeferred = escapeHtml(suggestions.deferred);
  const safeSkipped = escapeHtml(suggestions.skipped);
  const head = `
    <div class="summary-head">
      Run <strong>${safeRunId}</strong> |
      Suggestions: total ${safeTotal}, suggested ${safeSuggested}, deferred ${safeDeferred}, skipped ${safeSkipped}
    </div>
  `;
  if (visibleFeedback.length === 0) {
    summaryEl.innerHTML = `${head}<div class="feedback-item"><div class="feedback-title">No workbook alignment issues detected.</div></div>`;
  } else {
    const items = visibleFeedback.map(item => {
      const loc = item.workbook_location || {};
      const sheet = escapeHtml(loc.sheet || "Unknown sheet");
      const cols = escapeHtml(Array.isArray(loc.columns) ? loc.columns.join(", ") : "");
      const rowStart = escapeHtml(loc.row_start ?? "?");
      const rowEnd = escapeHtml(loc.row_end ?? "?");
      const metricKey = escapeHtml(item.metric_key);
      const metricCount = escapeHtml(item.count);
      const practicalAction = escapeHtml(item.practical_action || "");
      const alignmentGoal = escapeHtml(item.alignment_goal || "");
      return `
        <div class="feedback-item">
          <div class="feedback-title">${metricKey} (${metricCount})</div>
          <div class="feedback-line"><strong>Where:</strong> ${sheet}, rows ${rowStart}-${rowEnd}, columns ${cols}</div>
          <div class="feedback-line"><strong>Do this:</strong> ${practicalAction}</div>
          <div class="feedback-line"><strong>Goal:</strong> ${alignmentGoal}</div>
          <div class="feedback-line"><strong>Sample rows:</strong> ${formatRows(item.sample_rows)}</div>
        </div>
      `;
    }).join("");
    summaryEl.innerHTML = `${head}<div class="feedback-list">${items}</div>`;
  }
  rawSummaryEl.textContent = JSON.stringify(data, null, 2);
}

async function loadTable(name, query = "") {
  const runId = runSelect.value;
  if (!runId) return;
  const q = encodeURIComponent(query);
  const data = await getJson(`/api/runs/${runId}/table/${name}?q=${q}`);
  if (name === "suggestions") {
    renderTable(suggestionsTable, data.rows, true);
  } else {
    renderTable(genericTable, data.rows, false);
  }
}

async function runIteration() {
  const workbookPath = document.getElementById("workbookPath").value.trim();
  if (!workbookPath) return alert("Workbook path is required.");
  const payload = {
    workbook_path: workbookPath,
    engage_deferred: document.getElementById("engageDeferred").checked,
    write_suggestions: document.getElementById("writeSuggestions").checked
  };
  setStatus("Running iteration...");
  try {
    const res = await getJson("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setStatus(`Run complete: ${res.run_id}`);
    await refreshRuns();
    runSelect.value = res.run_id;
    await loadSummary(res.run_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Run failed: ${message}`);
    console.error("runIteration failed", err);
    alert(`Run failed: ${message}`);
  }
}

function selectedRowIndices() {
  const boxes = suggestionsTable.querySelectorAll("input[type=checkbox][data-row]");
  const rows = [];
  boxes.forEach(b => {
    if (b.checked && b.dataset.row) rows.push(parseInt(b.dataset.row, 10));
  });
  return rows;
}

async function promote(dryRun) {
  const runId = runSelect.value;
  const workbookPath = document.getElementById("workbookPath").value.trim();
  const rowIndices = selectedRowIndices();
  if (!runId || !workbookPath || rowIndices.length === 0) {
    return alert("Need run, workbook path, and selected suggestion rows.");
  }
  const payload = { workbook_path: workbookPath, run_id: runId, row_indices: rowIndices, dry_run: dryRun };
  try {
    const res = await getJson("/api/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert(JSON.stringify(res, null, 2));
    setStatus(dryRun ? "Promotion dry-run complete." : "Promotion write complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Promotion failed: ${message}`);
    console.error("promote failed", err);
    alert(`Promotion failed: ${message}`);
  }
}

document.getElementById("refreshBtn").addEventListener("click", refreshRuns);
runSelect.addEventListener("change", () => loadSummary(runSelect.value));
document.getElementById("runBtn").addEventListener("click", runIteration);
document.getElementById("loadSuggestionsBtn").addEventListener("click", () => {
  const q = document.getElementById("suggestQuery").value;
  loadTable("suggestions", q);
});
document.getElementById("loadMatchesBtn").addEventListener("click", () => loadTable("matches"));
document.getElementById("loadOverlapsBtn").addEventListener("click", () => loadTable("overlaps"));
document.getElementById("dryPromoteBtn").addEventListener("click", () => promote(true));
document.getElementById("promoteBtn").addEventListener("click", () => promote(false));

refreshRuns().catch(err => {
  setStatus(`Error: ${err.message}`);
});
