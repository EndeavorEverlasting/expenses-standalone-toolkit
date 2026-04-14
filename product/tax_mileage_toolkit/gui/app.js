const statusEl = document.getElementById("status");
const runSelect = document.getElementById("runSelect");
const summaryEl = document.getElementById("summary");
const suggestionsTable = document.getElementById("suggestionsTable");
const genericTable = document.getElementById("genericTable");

function setStatus(text) {
  statusEl.textContent = text;
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
  const head = `<tr>${withSelect ? "<th>pick</th>" : ""}${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  const body = rows.map(r => {
    const pickCell = withSelect ? `<td><input type="checkbox" data-row="${r.row_idx || ""}"></td>` : "";
    return `<tr>${pickCell}${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`;
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
  summaryEl.textContent = JSON.stringify(data, null, 2);
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
  const res = await getJson("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  setStatus(`Run complete: ${res.run_id}`);
  await refreshRuns();
  runSelect.value = res.run_id;
  await loadSummary(res.run_id);
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
  const res = await getJson("/api/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  alert(JSON.stringify(res, null, 2));
  setStatus(dryRun ? "Promotion dry-run complete." : "Promotion write complete.");
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
