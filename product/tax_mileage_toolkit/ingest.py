import csv
import io
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any


_DATE_FORMATS = [
    "%m/%d/%Y", "%m-%d-%Y",
    "%Y/%m/%d", "%Y-%m-%d",
    "%m/%d/%y", "%m-%d-%y",
    "%d/%m/%Y", "%d-%m-%Y",
    "%b %d, %Y", "%B %d, %Y",
    "%d %b %Y", "%d %B %Y",
]


def _parse_date(date_str: str) -> date | None:
    s = date_str.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _save_extract(dest_dir: Path, stem: str, data: dict[str, Any]) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{stem}_extract.json"
    out.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    return out


def _clean_amount(raw: str) -> str:
    return raw.replace(",", "").replace("$", "").strip()


def _w2_find_box_in_tables(tables: list[list[list[str | None]]], box_num: str) -> str | None:
    """
    Search pdfplumber table rows for a W-2 box value.

    A cell qualifies as a box label when:
    - It exactly equals the box number, OR
    - It starts with the box number followed by a space/letter (e.g. "1 Wages"),
      AND it is NOT itself a plain dollar amount.

    When a label cell is found, the cell immediately to its right is preferred
    as the value. If that cell is also a label (or empty), scanning continues
    rightward until an amount is found or a non-empty non-amount cell is hit.

    Also handles the case where label and value are in the same cell
    (e.g., "Box 1  52,341.00").
    """
    amount_re = re.compile(r"^\$?([\d,]+\.\d{2})$")
    inline_amount_re = re.compile(r"\$?([\d,]+\.\d{2})\s*$")
    box_label_re = re.compile(
        rf"(?:^|(?<=\s)|(?<=Box\s)){re.escape(box_num)}(?:\s|$|[A-Za-z,])",
        re.IGNORECASE,
    )

    for table in tables:
        for row in table:
            cells = [str(c).strip() if c else "" for c in row]
            for i, cell in enumerate(cells):
                if not box_label_re.search(cell):
                    continue
                if amount_re.match(cell):
                    continue

                m_inline = inline_amount_re.search(cell)
                if m_inline:
                    return _clean_amount(m_inline.group(1))

                for offset in range(1, len(cells)):
                    j = i + offset
                    if j >= len(cells):
                        break
                    candidate = cells[j]
                    if amount_re.match(candidate):
                        return _clean_amount(candidate)
                    if candidate and not amount_re.match(candidate):
                        break
    return None


def parse_w2(file_bytes: bytes, filename: str, processed_dir: Path) -> dict[str, Any]:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required for W-2 PDF parsing. Run: pip install pdfplumber")

    text = ""
    all_tables: list[list[list[str | None]]] = []
    is_scanned = False

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
            try:
                page_tables = page.extract_tables() or []
                all_tables.extend(page_tables)
            except Exception:
                pass

    if len(text.strip()) < 20:
        is_scanned = True

    def find_box_text(patterns: list[str]) -> str | None:
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return _clean_amount(m.group(1))
        return None

    wages = _w2_find_box_in_tables(all_tables, "1") or _w2_find_box_in_tables(all_tables, "Box 1")
    if not wages:
        wages = find_box_text([
            r"(?:box\s*1|wages[,\s]+tips[,\s]+other[,\s]+comp(?:ensation)?)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
            r"1\s+Wages[,\s]+tips[^\n]{0,60}?\$?([\d,]+\.\d{2})",
            r"(?:^|\s)1\s+\$?([\d,]+\.\d{2})",
            r"wages.*?\$?([\d,]+\.\d{2})",
        ])

    federal_withheld = _w2_find_box_in_tables(all_tables, "2") or _w2_find_box_in_tables(all_tables, "Box 2")
    if not federal_withheld:
        federal_withheld = find_box_text([
            r"(?:box\s*2|federal\s+income\s+tax\s+withheld)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
            r"2\s+Federal\s+income\s+tax[^\n]{0,60}?\$?([\d,]+\.\d{2})",
            r"(?:^|\s)2\s+\$?([\d,]+\.\d{2})",
            r"federal.*?withheld.*?\$?([\d,]+\.\d{2})",
        ])

    social_security_wages = _w2_find_box_in_tables(all_tables, "3") or find_box_text([
        r"(?:box\s*3|social\s+security\s+wages)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
        r"3\s+Social\s+security\s+wages[^\n]{0,60}?\$?([\d,]+\.\d{2})",
    ])

    social_security_withheld = _w2_find_box_in_tables(all_tables, "4") or find_box_text([
        r"(?:box\s*4|social\s+security\s+tax\s+withheld)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
        r"4\s+Social\s+security\s+tax[^\n]{0,60}?\$?([\d,]+\.\d{2})",
    ])

    medicare_wages = _w2_find_box_in_tables(all_tables, "5") or find_box_text([
        r"(?:box\s*5|medicare\s+wages)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
        r"5\s+Medicare\s+wages[^\n]{0,60}?\$?([\d,]+\.\d{2})",
    ])

    medicare_withheld = _w2_find_box_in_tables(all_tables, "6") or find_box_text([
        r"(?:box\s*6|medicare\s+tax\s+withheld)[^\n]{0,80}?\$?([\d,]+\.\d{2})",
        r"6\s+Medicare\s+tax[^\n]{0,60}?\$?([\d,]+\.\d{2})",
    ])

    employer_m = re.search(
        r"(?:employer['s]?\s+name[,\s]+address[^\n]{0,10}\n|c\s+employer)[^\n]{0,4}\n?([A-Z][^\n]{3,60})",
        text,
        re.IGNORECASE,
    )
    employer_name = employer_m.group(1).strip() if employer_m else None

    ssn_m = re.search(r"(\d{3}-\d{2}-\d{4}|\*{3}-\*{2}-\d{4}|XXX-XX-\d{4})", text)
    employee_ssn_last4 = ssn_m.group(1)[-4:] if ssn_m else None

    year_m = re.search(r"\b(20\d{2})\b", text)
    tax_year = year_m.group(1) if year_m else None

    parse_warnings: list[str] = []
    used_table_extraction = bool(all_tables)

    if is_scanned:
        parse_warnings.append(
            "Scanned-image PDF detected — text could not be extracted. "
            "OCR is not applied; Box 1 and Box 2 values will be missing. "
            "Try uploading a text-based PDF or a typed W-2."
        )
    else:
        if not wages:
            if used_table_extraction:
                parse_warnings.append(
                    "Text-based PDF detected but Box 1 (wages) not found in tables or text — "
                    "try a different PDF layout or verify this is a W-2."
                )
            else:
                parse_warnings.append(
                    "Text-based PDF detected but Box 1 (wages) not found — "
                    "the PDF may use an unusual layout. Try a different PDF."
                )
        if not federal_withheld:
            if used_table_extraction:
                parse_warnings.append(
                    "Text-based PDF detected but Box 2 (federal tax withheld) not found in tables or text — "
                    "try a different PDF layout or verify this is a W-2."
                )
            else:
                parse_warnings.append(
                    "Text-based PDF detected but Box 2 (federal tax withheld) not found — "
                    "the PDF may use an unusual layout."
                )

    parse_status = "partial" if (not wages or not federal_withheld or parse_warnings) else "ok"

    result: dict[str, Any] = {
        "doc_type": "w2",
        "parse_status": parse_status,
        "filename": filename,
        "parsed_at": datetime.utcnow().isoformat(),
        "tax_year": tax_year,
        "employer_name": employer_name,
        "employee_ssn_last4": employee_ssn_last4,
        "box1_wages": wages,
        "box2_federal_withheld": federal_withheld,
        "box3_ss_wages": social_security_wages,
        "box4_ss_withheld": social_security_withheld,
        "box5_medicare_wages": medicare_wages,
        "box6_medicare_withheld": medicare_withheld,
        "raw_text_length": len(text),
        "table_count": len(all_tables),
        "parse_warnings": parse_warnings,
    }

    stem = Path(filename).stem
    result["extract_path"] = str(_save_extract(processed_dir, stem, result))
    return result


def _normalize_bank_table_rows(
    tables: list[list[list[str | None]]],
) -> list[dict[str, str]]:
    """
    Convert pdfplumber table output into transaction dicts.

    Column detection strategy (in priority order):
    1. Look for a header row containing recognisable date/description/amount names.
       Split debit/credit/withdrawal/deposit columns are merged: the non-empty
       non-zero value from the debit column is treated as a negative amount and
       the credit column as a positive amount.
    2. When no header is recognised, inspect the first data row heuristically for
       date and amount patterns.

    A row is accepted as a transaction only when BOTH a date AND a non-empty
    amount are present.
    """
    transactions: list[dict[str, str]] = []
    date_re = re.compile(
        r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2}"
    )
    amount_re = re.compile(r"-?\$?[\d,]+\.\d{2}")

    for table in tables:
        if not table:
            continue

        date_col = amount_col = desc_col = None
        debit_col = credit_col = None

        first_row = [str(c).strip() if c else "" for c in table[0]]
        has_header = any(re.search(r"date|posted|trans", h, re.I) for h in first_row) or \
                     any(re.search(r"amount|debit|credit|withdrawal|deposit|charge", h, re.I) for h in first_row)

        if has_header:
            for i, h in enumerate(first_row):
                if date_col is None and re.search(r"date|posted|trans", h, re.I):
                    date_col = i
                if desc_col is None and re.search(r"desc|narr|memo|detail|payee|merchant|reference", h, re.I):
                    desc_col = i
                if re.search(r"^(amount|charge|net)$", h, re.I):
                    amount_col = i
                elif re.search(r"debit|withdrawal|out", h, re.I) and debit_col is None:
                    debit_col = i
                elif re.search(r"credit|deposit|in", h, re.I) and credit_col is None:
                    credit_col = i
            if amount_col is None and (debit_col is not None or credit_col is not None):
                pass
            elif amount_col is None:
                for i, h in enumerate(first_row):
                    if re.search(r"amount|credit|debit|charge|withdrawal|deposit", h, re.I):
                        amount_col = i
                        break
            data_rows = table[1:]
        else:
            data_rows = table
            for i, cell in enumerate(first_row):
                if date_col is None and date_re.search(cell):
                    date_col = i
                if amount_col is None and amount_re.search(cell):
                    amount_col = i

        for row in data_rows:
            cells = [str(c).strip() if c else "" for c in row]
            if not any(cells):
                continue

            entry: dict[str, str] = {}

            if date_col is not None and date_col < len(cells):
                entry["date"] = cells[date_col]
            else:
                for cell in cells:
                    if date_re.search(cell):
                        entry["date"] = cell
                        break

            if amount_col is not None and amount_col < len(cells):
                raw = cells[amount_col]
                if raw:
                    entry["amount"] = raw.replace("$", "")
            elif debit_col is not None or credit_col is not None:
                debit_val = cells[debit_col].replace("$", "").replace(",", "") if debit_col is not None and debit_col < len(cells) else ""
                credit_val = cells[credit_col].replace("$", "").replace(",", "") if credit_col is not None and credit_col < len(cells) else ""
                try:
                    debit_f = float(debit_val) if debit_val else 0.0
                except ValueError:
                    debit_f = 0.0
                try:
                    credit_f = float(credit_val) if credit_val else 0.0
                except ValueError:
                    credit_f = 0.0
                if debit_f != 0.0:
                    entry["amount"] = f"-{abs(debit_f):.2f}"
                elif credit_f != 0.0:
                    entry["amount"] = f"{credit_f:.2f}"
            else:
                for cell in cells:
                    if amount_re.search(cell):
                        entry["amount"] = cell.replace("$", "")
                        break

            if desc_col is not None and desc_col < len(cells):
                entry["description"] = cells[desc_col]

            if entry.get("date") and entry.get("amount"):
                if date_re.search(entry["date"]):
                    transactions.append(entry)

    return transactions


def parse_bank_statement(file_bytes: bytes, filename: str, processed_dir: Path) -> dict[str, Any]:
    fname_lower = filename.lower()
    transactions: list[dict[str, str]] = []
    parse_warnings: list[str] = []

    if fname_lower.endswith(".csv"):
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []

        date_col = next(
            (h for h in headers if re.search(r"date|posted|trans", h, re.I)), None
        )
        amount_col = next(
            (h for h in headers if re.search(r"amount|credit|debit|charge|withdrawal|deposit", h, re.I)), None
        )
        desc_col = next(
            (h for h in headers if re.search(r"desc|narr|memo|detail|payee|merchant|reference|note", h, re.I)), None
        )

        if not date_col:
            date_col = next(
                (h for h in headers if re.search(r"^(dt|day|on|at)$", h, re.I)), None
            )
        if not amount_col:
            amount_col = next(
                (h for h in headers if re.search(r"^(value|sum|total|net|paid)$", h, re.I)), None
            )
        if not desc_col:
            desc_col = next(
                (h for h in headers if re.search(r"^(name|text|label|info|activity)$", h, re.I)), None
            )

        for row in reader:
            entry: dict[str, str] = {}
            if date_col:
                entry["date"] = (row.get(date_col) or "").strip()
            if amount_col:
                entry["amount"] = (row.get(amount_col) or "").strip()
            if desc_col:
                entry["description"] = (row.get(desc_col) or "").strip()
            if entry:
                transactions.append(entry)

        if not date_col:
            parse_warnings.append(
                f"Could not identify a date column in the CSV. "
                f"Available columns: {', '.join(headers) if headers else 'none'}. "
                "Rename the date column to 'Date', 'Posted', or 'Transaction Date'."
            )
        if not amount_col:
            parse_warnings.append(
                f"Could not identify an amount column in the CSV. "
                f"Available columns: {', '.join(headers) if headers else 'none'}. "
                "Rename the amount column to 'Amount', 'Debit', 'Credit', or 'Charge'."
            )
        if not desc_col:
            parse_warnings.append(
                "Could not identify a description column in the CSV — "
                "transaction descriptions will be missing."
            )

    elif fname_lower.endswith(".pdf"):
        try:
            import pdfplumber
        except ImportError:
            raise RuntimeError("pdfplumber is required for bank statement PDF parsing.")

        text_fallback_pattern = re.compile(
            r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2})"
            r"[^\n]{0,80}"
            r"(-?\$?[\d,]+\.\d{2})",
            re.MULTILINE,
        )

        full_text = ""
        pages_with_table_txns = 0
        pages_with_text_txns = 0
        is_scanned = False

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text += page_text + "\n"

                page_table_txns: list[dict[str, str]] = []
                try:
                    page_tables = page.extract_tables() or []
                    if page_tables:
                        page_table_txns = _normalize_bank_table_rows(page_tables)
                except Exception:
                    page_tables = []

                if page_table_txns:
                    transactions.extend(page_table_txns)
                    pages_with_table_txns += 1
                else:
                    for m in text_fallback_pattern.finditer(page_text):
                        transactions.append({
                            "date": m.group(1),
                            "amount": m.group(2).replace("$", ""),
                            "description": "",
                        })
                        pages_with_text_txns += 1

        if len(full_text.strip()) < 20:
            is_scanned = True
            transactions.clear()

        if is_scanned:
            parse_warnings.append(
                "Scanned-image PDF detected — text and tables could not be extracted. "
                "A CSV export from your bank is recommended for best results."
            )
        else:
            if not transactions:
                parse_warnings.append(
                    "Text-based PDF detected but no transactions found — "
                    "the layout may be non-standard or use an unusual date/amount format. "
                    "Try exporting as CSV from your bank portal."
                )
            elif pages_with_text_txns > 0 and pages_with_table_txns == 0:
                parse_warnings.append(
                    "No tables found in PDF; transactions were extracted via text pattern matching "
                    "and descriptions may be missing. A CSV export will give more complete results."
                )
            elif pages_with_text_txns > 0:
                parse_warnings.append(
                    f"{pages_with_text_txns} page(s) had no table data and were parsed via text "
                    "pattern matching — those transactions may be missing descriptions."
                )
    else:
        raise ValueError(f"Unsupported file type for bank statement: {filename}. Use CSV or PDF.")

    parsed_dates: list[date] = []
    for t in transactions:
        d = _parse_date(t.get("date") or "")
        if d:
            parsed_dates.append(d)

    if parsed_dates:
        date_range_start = str(min(parsed_dates))
        date_range_end = str(max(parsed_dates))
    else:
        raw_dates = [t["date"] for t in transactions if t.get("date")]
        date_range_start = raw_dates[0] if raw_dates else None
        date_range_end = raw_dates[-1] if raw_dates else None
        if raw_dates and not parsed_dates:
            parse_warnings.append(
                "Date format was not recognized — date range may be inaccurate. "
                "Check the dates in the extracted transactions."
            )

    parse_status = "partial" if not transactions or parse_warnings else "ok"

    result: dict[str, Any] = {
        "doc_type": "bank",
        "parse_status": parse_status,
        "filename": filename,
        "parsed_at": datetime.utcnow().isoformat(),
        "transaction_count": len(transactions),
        "date_range_start": date_range_start,
        "date_range_end": date_range_end,
        "transactions": transactions[:500],
        "parse_warnings": parse_warnings,
    }

    stem = Path(filename).stem
    result["extract_path"] = str(_save_extract(processed_dir, stem, result))
    return result


def parse_maps_timeline(file_bytes: bytes, filename: str, processed_dir: Path) -> dict[str, Any]:
    fname_lower = filename.lower()
    locations: list[dict[str, Any]] = []
    parse_warnings: list[str] = []

    if fname_lower.endswith(".json"):
        try:
            raw = json.loads(file_bytes.decode("utf-8", errors="replace"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in Maps timeline file: {exc}") from exc

        timeline_objects = raw.get("timelineObjects", [])

        for obj in timeline_objects:
            place = obj.get("placeVisit")
            activity = obj.get("activitySegment")

            if place:
                loc = place.get("location", {})
                duration = place.get("duration", {})
                start_ts = duration.get("startTimestamp") or duration.get("startTimestampMs")
                entry: dict[str, Any] = {
                    "type": "place_visit",
                    "name": loc.get("name") or loc.get("address"),
                    "address": loc.get("address"),
                    "lat": loc.get("latitudeE7", 0) / 1e7 if loc.get("latitudeE7") else None,
                    "lng": loc.get("longitudeE7", 0) / 1e7 if loc.get("longitudeE7") else None,
                    "timestamp": start_ts,
                }
                locations.append(entry)
            elif activity:
                duration = activity.get("duration", {})
                start_ts = duration.get("startTimestamp") or duration.get("startTimestampMs")
                start_loc = activity.get("startLocation", {})
                entry = {
                    "type": "activity",
                    "activity_type": activity.get("activityType"),
                    "lat": start_loc.get("latitudeE7", 0) / 1e7 if start_loc.get("latitudeE7") else None,
                    "lng": start_loc.get("longitudeE7", 0) / 1e7 if start_loc.get("longitudeE7") else None,
                    "timestamp": start_ts,
                }
                locations.append(entry)

        if not timeline_objects and not locations:
            semanticSegments = raw.get("semanticSegments", [])
            for seg in semanticSegments:
                visit = seg.get("visit")
                if visit:
                    top_cand = visit.get("topCandidate", {})
                    place_loc = top_cand.get("placeLocation", {})
                    lat_e7 = place_loc.get("latLng", {})
                    entry = {
                        "type": "place_visit",
                        "name": top_cand.get("semanticType"),
                        "address": None,
                        "lat": None,
                        "lng": None,
                        "timestamp": seg.get("startTime"),
                    }
                    locations.append(entry)

        if not locations:
            parse_warnings.append(
                "No timeline objects found. Ensure this is a Google Takeout "
                "Semantic Location History JSON file."
            )

    elif fname_lower.endswith((".png", ".jpg", ".jpeg", ".webp")):
        try:
            import pytesseract
            from PIL import Image
        except ImportError:
            raise RuntimeError("pytesseract and Pillow are required for image OCR.")

        img = Image.open(io.BytesIO(file_bytes))
        ocr_text = pytesseract.image_to_string(img)

        coord_pattern = re.compile(r"(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})")
        date_pattern = re.compile(r"\b(\w{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/\d{4})\b")

        coords = coord_pattern.findall(ocr_text)
        dates_found = date_pattern.findall(ocr_text)

        for i, (lat, lng) in enumerate(coords):
            locations.append({
                "type": "ocr_coordinate",
                "lat": float(lat),
                "lng": float(lng),
                "timestamp": dates_found[i] if i < len(dates_found) else None,
                "name": None,
            })

        if not locations:
            parse_warnings.append(
                "OCR did not find recognizable coordinates in the screenshot. "
                "Try a Google Maps timeline screenshot with visible lat/lng values, "
                "or use a Google Takeout JSON export for best results."
            )
            locations.append({
                "type": "ocr_raw_text",
                "text_excerpt": ocr_text[:500],
                "lat": None,
                "lng": None,
                "timestamp": None,
                "name": None,
            })
    else:
        raise ValueError(
            f"Unsupported file type for Maps timeline: {filename}. "
            "Use a Google Takeout JSON file or a screenshot (PNG/JPG)."
        )

    parse_status = "partial" if parse_warnings else "ok"

    result: dict[str, Any] = {
        "doc_type": "maps",
        "parse_status": parse_status,
        "filename": filename,
        "parsed_at": datetime.utcnow().isoformat(),
        "location_count": len(locations),
        "locations": locations[:200],
        "parse_warnings": parse_warnings,
    }

    stem = Path(filename).stem
    result["extract_path"] = str(_save_extract(processed_dir, stem, result))
    return result
