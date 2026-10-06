#!/usr/bin/env python3
"""Refresh the scene count and running time on each homepage presentation card.

Reads animations/src/<deck>/narration.json and audio/manifest.json, and rewrites
the two meta spans of the card whose link points at src/<deck>/index.html.

    python3 tools/update-homepage-meta.py
"""
import json
import re
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
home = repo / "animations" / "index.html"
html = home.read_text()

changed = []
for deck_dir in sorted((repo / "animations" / "src").iterdir()):
    narration = deck_dir / "narration.json"
    manifest = deck_dir / "audio" / "manifest.json"
    if not narration.exists():
        continue
    scenes = len(json.loads(narration.read_text())["scenes"])
    minutes = None
    if manifest.exists():
        m = json.loads(manifest.read_text())
        minutes = max(1, round(sum(s["duration"] for s in m["scenes"].values()) / 60))
    link = f'href="src/{deck_dir.name}/index.html" class="presentation-link"'
    pos = html.find(link)
    if pos < 0:
        continue
    start = html.rfind('<div class="presentation-meta">', 0, pos)
    end = html.find("</div>", start)
    block = html[start:end]
    extra = " + interactive" if deck_dir.name == "test-harness" else ""
    new = re.sub(r"📊 \d+ scenes", f"📊 {scenes} scenes", block)
    if minutes:
        new = re.sub(r"⏱️ ~[^<]*", f"⏱️ ~{minutes} min{extra}", new)
    if new != block:
        html = html[:start] + new + html[end:]
        changed.append(f"{deck_dir.name}: {scenes} scenes, ~{minutes} min")

home.write_text(html)
print("\n".join(changed) or "homepage meta already up to date")
