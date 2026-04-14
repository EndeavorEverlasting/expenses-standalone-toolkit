# ASTAS Integration Contract (Future Adapter)

This toolkit remains standalone-first. ASTAS integration should be implemented as an adapter layer that calls this toolkit, not a rewrite of core logic.

## Integration Model

- Host runtime (ASTAS ARM/extension/plugin) gathers inputs.
- Host runtime invokes Python toolkit command.
- Toolkit writes deterministic artifacts.
- Host runtime ingests artifacts and surfaces status/UI.

## Command Contract

### Reconcile

```bash
python -m product.tax_mileage_toolkit.cli reconcile <workbook_path> <output_dir>
```

Expected outputs:

- `cluster_match_report.csv`
- `cluster_overlap_report.csv`
- `known_site_rollup_report.csv`

### Audit

```bash
python -m product.tax_mileage_toolkit.cli audit <workbook_path> <output_dir>
```

Expected outputs:

- `audit_report.json`

## Input Contract

- Required input: workbook path to `.xlsx`.
- Optional input: explicit output directory path.
- Workbook must contain the expected sheets:
  - `Maps 2025 - Clusters`
  - `Known Site Registry`
  - `Sites & Distance Matrix`
  - `Site-Day Draft`
  - `Mileage Detail - Drafted`
  - `Coord Reconcile Console`
  - `Known Site Rollup`

## Adapter Responsibilities (ASTAS side)

- Validate file presence before invocation.
- Run command and capture stdout/stderr.
- Mark run status (`queued`, `running`, `completed`, `failed`).
- Store outputs with run metadata (timestamp, workbook hash, user/operator).

## Versioning and Compatibility

- Adapter pins a toolkit version tag.
- Contract changes should be additive when possible.
- Breaking changes require:
  - new contract doc version
  - migration note
  - adapter compatibility bump
