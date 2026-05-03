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


def parse_w2(file_bytes: bytes, filename: str, processed_dir: Path) -> dict[str, Any]:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required for W-2 PDF parsing. Run: pip install pdfplumber")

    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"

    def find_box(patterns: list[str]) -> str | None:
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                raw = m.group(1).replace(",", "").replace("$", "").strip()
                return raw
        return None

    wages = find_box([
        r"(?:box\s*1|wages[,\s]+tips)[^\n]{0,60}?\$?([\d,]+\.\d{2})",
        r"1\s+Wages[,\s]+tips[^\n]{0,40}?\$?([\d,]+\.\d{2})",
        r"wages.*?\$?([\d,]+\.\d{2})",
    ])
    federal_withheld = find_box([
        r"(?:box\s*2|federal\s+income\s+tax\s+withheld)[^\n]{0,60}?\$?([\d,]+\.\d{2})",
        r"2\s+Federal[^\n]{0,40}?\$?([\d,]+\.\d{2})",
        r"federal.*?withheld.*?\$?([\d,]+\.\d{2})",
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
    if not wages:
        parse_warnings.append("Could not extract Box 1 wages — verify PDF is text-based, not scanned.")
    if not federal_withheld:
        parse_warnings.append("Could not extract Box 2 federal tax withheld.")

    parse_status = "partial" if (not wages or not federal_withheld) else "ok"

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
        "raw_text_length": len(text),
        "parse_warnings": parse_warnings,
    }

    stem = Path(filename).stem
    result["extract_path"] = str(_save_extract(processed_dir, stem, result))
    return result


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
            (h for h in headers if re.search(r"amount|credit|debit|charge", h, re.I)), None
        )
        desc_col = next(
            (h for h in headers if re.search(r"desc|narr|memo|detail|payee|merchant", h, re.I)), None
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
            parse_warnings.append("Could not identify a date column in the CSV.")
        if not amount_col:
            parse_warnings.append("Could not identify an amount column in the CSV.")

    elif fname_lower.endswith(".pdf"):
        try:
            import pdfplumber
        except ImportError:
            raise RuntimeError("pdfplumber is required for bank statement PDF parsing.")

        text = ""
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text += page_text + "\n"

        pattern = re.compile(
            r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2})"
            r"[^\n]{0,80}"
            r"(-?\$?[\d,]+\.\d{2})",
            re.MULTILINE,
        )
        for m in pattern.finditer(text):
            transactions.append({"date": m.group(1), "amount": m.group(2).replace("$", ""), "description": ""})

        if not transactions:
            parse_warnings.append(
                "Could not parse transactions from PDF — the file may be scanned. "
                "A CSV export is recommended for best results."
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
