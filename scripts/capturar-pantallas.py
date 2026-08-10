"""Capture UI screenshots for the activity report."""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "entregables" / "capturas"
BASE = "http://localhost:3000"


def shot(page, name: str, full_page: bool = False) -> None:
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=full_page)
    print(f"ok {path.name}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        page.goto(BASE, wait_until="networkidle")
        shot(page, "01-inicio")

        page.goto(f"{BASE}/book", wait_until="networkidle")
        page.wait_for_timeout(800)
        shot(page, "02-reservas", full_page=True)

        page.goto(f"{BASE}/login", wait_until="networkidle")
        shot(page, "03-login")

        page.fill("#username", "admin")
        page.fill("#password", "admin123")
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard**", timeout=15000)
        page.wait_for_timeout(1000)
        shot(page, "04-dashboard", full_page=True)

        page.goto(f"{BASE}/dashboard/services", wait_until="networkidle")
        shot(page, "05-servicios")

        page.goto(f"{BASE}/dashboard/customers", wait_until="networkidle")
        shot(page, "06-clientes")

        page.goto(f"{BASE}/dashboard/agenda", wait_until="networkidle")
        shot(page, "07-agenda", full_page=True)

        browser.close()

    print(f"Capturas en {OUT}")


if __name__ == "__main__":
    main()
