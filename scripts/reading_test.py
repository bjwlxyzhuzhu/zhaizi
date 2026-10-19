"""Verify reading/export invariants without a database or external requests."""
from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.readings import LEXICON, annotated_html


class BaseText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_rt = False
        self.text = ""

    def handle_starttag(self, tag, attrs):
        self.in_rt = tag == "rt"

    def handle_endtag(self, tag):
        if tag == "rt":
            self.in_rt = False

    def handle_data(self, data):
        if not self.in_rt:
            self.text += data


class ReadingsTest(unittest.TestCase):
    def test_vessel_names_and_extension_characters(self):
        for char, reading in {"逨": "lái", "㝬": "hú", "𢦚": "huài", "簋": "guǐ", "虢": "guó", "盉": "hé", "镈": "bó"}.items():
            self.assertEqual(LEXICON["characters"][char], reading)
            self.assertIn(f'>{reading}</rt>', annotated_html(char))
        self.assertEqual(annotated_html("𢦚").count("<ruby>"), 1)

    def test_context_and_repeated_names(self):
        result = annotated_html("单逨、单公、单逨；殷商、伐殷")
        self.assertEqual(result.count('>shàn</rt>'), 3)
        self.assertEqual(result.count('>yīn</rt>'), 2)
        self.assertEqual(annotated_html("单独"), "单独")

    def test_original_unicode_and_html_escaping(self):
        text = '单逨曰：夨𢦚散邑。<script>alert("x")</script>&\n㝬簋'
        result = annotated_html(text)
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)
        parser = BaseText()
        parser.feed(result)
        self.assertEqual(parser.text, text)

    def test_unknown_reading_is_never_invented(self):
        self.assertIn("音未定", annotated_html("𰻞"))
        self.assertEqual(annotated_html("研究平台 ABC 123 😀"), "研究平台 ABC 123 😀")


if __name__ == "__main__":
    unittest.main(verbosity=2)
