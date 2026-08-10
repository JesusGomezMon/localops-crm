"""Render code/log text files into PNG evidence for the Word report."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "entregables" / "capturas"


def render(text: str, name: str, title: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = text.splitlines() or [""]
    try:
        font = ImageFont.truetype("consola.ttf", 15)
        title_font = ImageFont.truetype("consola.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        title_font = font

    pad = 24
    line_h = 20
    width = 1100
    height = pad * 3 + 28 + line_h * (len(lines) + 1)
    img = Image.new("RGB", (width, height), "#0d1117")
    draw = ImageDraw.Draw(img)
    draw.text((pad, pad), title, fill="#58a6ff", font=title_font)
    y = pad + 32
    for line in lines:
        draw.text((pad, y), line[:140], fill="#c9d1d9", font=font)
        y += line_h
    path = OUT / name
    img.save(path)
    print(f"ok {path.name}")


def main() -> None:
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    render(ci, "09-cicd-workflow.png", ".github/workflows/ci.yml")

    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    render(compose, "11-docker-compose.png", "docker-compose.yml")

    log = (OUT / "test-output.txt").read_text(encoding="utf-8", errors="replace")
    # Keep last ~45 lines for readability
    tail = "\n".join(log.splitlines()[-45:])
    render(tail, "08-pruebas.png", "pnpm test (salida)")


if __name__ == "__main__":
    main()
