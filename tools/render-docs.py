#!/usr/bin/env python3
"""Regenerate docs/*.html from docs/*.md using the PSTN2 documentation template.

Usage:
    python3 tools/render-docs.py                 # render every docs/*.md
    python3 tools/render-docs.py SPECIFICATION.md EXAMPLES.md   # render specific docs

Each render wraps the pandoc-converted (GitHub-flavoured markdown) body in the
site template: <head> with "<Doc Title> | PSTN2" title and ../docs/documentation.css
stylesheet, a doc-header with back-link, a doc-nav of top-level (h2) section
anchors plus a "View Markdown" link, the body in <main class="doc-container">,
and the standard footer.

Requires pandoc (default: /opt/homebrew/bin/pandoc, override with $PANDOC).
"""

import html
import os
import re
import subprocess
import sys
from pathlib import Path

PANDOC = os.environ.get("PANDOC", "/opt/homebrew/bin/pandoc")
ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | PSTN2</title>
    <link rel="stylesheet" href="{prefix}docs/documentation.css">
</head>
<body>
    <header class="doc-header">
        <a href="{prefix}index.html" class="back-link">← Back to Home</a>
        <h1>{title}</h1>
    </header>

        <nav class="doc-nav">
            <div class="doc-nav-links">
{nav}
            </div>
        </nav>
    <main class="doc-container">
{body}
    </main>

    <footer class="doc-footer">
        <p>&copy; 2025 PSTN2 Project | <a href="{prefix}index.html">Home</a> | <a href="mailto:nick.holland@8x8.com">Contact</a></p>
    </footer>
</body>
</html>
"""


def doc_title(md_text: str) -> str:
    """First level-1 heading of the markdown file."""
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "PSTN2 Document"


def remap_internal_anchors(body_html: str, md_name: str):
    """Rewrite in-body href="#..." links that don't match any generated id.

    Markdown TOCs commonly link `#introduction` while pandoc's gfm auto
    identifier for the heading "1. Introduction" is `1-introduction`. For each
    unresolved href, suffix-match against the set of generated ids ("-" +
    target); when several ids match, prefer the one whose remaining prefix is
    purely a section number (digits), then the shortest. Truly unresolvable
    hrefs are left unchanged with a warning.

    Returns (new_body, fixed_count, unresolved_targets).
    """
    ids = set(re.findall(r'id="([^"]+)"', body_html))
    mapping: dict[str, str | None] = {}
    stats = {"fixed": 0}
    unresolved: list[str] = []

    def resolve(target: str):
        candidates = [i for i in ids if i.endswith("-" + target)]
        numeric = [i for i in candidates if re.fullmatch(r"\d+", i[: -(len(target) + 1)])]
        pool = numeric or candidates
        return min(pool, key=len) if pool else None

    def repl(m: re.Match) -> str:
        target = m.group(1)
        if target in ids:
            return m.group(0)
        if target not in mapping:
            mapping[target] = resolve(target)
            if mapping[target] is None:
                unresolved.append(target)
                print(f"warning: {md_name}: unresolvable anchor #{target} left unchanged")
        if mapping[target] is None:
            return m.group(0)
        stats["fixed"] += 1
        return 'href="#%s"' % mapping[target]

    new_body = re.sub(r'href="#([^"]+)"', repl, body_html)
    return new_body, stats["fixed"], unresolved


def build_nav(body_html: str, md_name: str) -> str:
    """Anchor links for every top-level (h2) section id in the rendered body."""
    lines = []
    for m in re.finditer(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', body_html, re.S):
        text = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        lines.append(
            '                <a href="#%s">%s</a>' % (m.group(1), html.escape(text))
        )
    lines.append('                <a href="%s">View Markdown</a>' % md_name)
    return "\n".join(lines)


def render(md_path: Path) -> Path:
    md_text = md_path.read_text(encoding="utf-8")
    title = doc_title(md_text)

    result = subprocess.run(
        [PANDOC, "-f", "gfm", "-t", "html", str(md_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    body = result.stdout.rstrip()
    body, fixed, unresolved = remap_internal_anchors(body, md_path.name)
    if fixed or unresolved:
        print(
            f"  {md_path.name}: remapped {fixed} internal anchor href(s), "
            f"{len(unresolved)} unresolved"
        )

    depth = len(md_path.parent.relative_to(ROOT).parts)
    page = TEMPLATE.format(
        title=html.escape(title, quote=False),
        nav=build_nav(body, md_path.name),
        body=body,
        prefix="../" * depth,
    )
    out_path = md_path.with_suffix(".html")
    out_path.write_text(page, encoding="utf-8")
    return out_path


def main(argv: list[str]) -> int:
    if not Path(PANDOC).exists():
        print(f"error: pandoc not found at {PANDOC} (set $PANDOC)", file=sys.stderr)
        return 1

    if argv:
        targets = []
        for arg in argv:
            p = Path(arg)
            if not p.is_absolute():
                candidate = ROOT / arg
                p = candidate if candidate.exists() else DOCS / p.name
            if p.suffix != ".md" or not p.exists():
                print(f"error: not a markdown file under the repo: {arg}", file=sys.stderr)
                return 1
            targets.append(p)
    else:
        targets = sorted(DOCS.glob("*.md"))

    for md_path in targets:
        out = render(md_path)
        print(f"rendered {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
