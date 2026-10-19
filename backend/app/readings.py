"""Modern character readings for display/export; never change stored transcriptions."""
import html
import json
from pathlib import Path

LEXICON = json.loads((Path(__file__).parent / "data" / "inscription-readings.json").read_text(encoding="utf-8"))


def annotated_html(text: str) -> str:
    parts = []
    overrides = {}
    for phrase, readings in LEXICON["phrases"].items():
        start = text.find(phrase)
        while start >= 0:
            overrides.update({start + i: reading for i, reading in enumerate(readings) if reading})
            start = text.find(phrase, start + 1)
    for i, char in enumerate(text):
        reading = overrides.get(i) or LEXICON["characters"].get(char, "")
        if not reading and (0x3400 <= ord(char) <= 0x4DBF or 0x20000 <= ord(char) <= 0x323AF):
            reading = "音未定"
        escaped = html.escape(char)
        # Literal rt text ensures pronunciation survives Word/HTML export without CSS support.
        parts.append(f'<ruby>{escaped}<rt style="font-size:9pt">{html.escape(reading)}</rt></ruby>' if reading else escaped)
    return "".join(parts)
