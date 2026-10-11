#!/usr/bin/env python3
"""Island Outbreak browser visual audit. Requires: pip install playwright && playwright install chromium
Run: python tools/visual_audit.py --url http://127.0.0.1:4173 --out visual-audit
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

PAGES = ("mission", "fieldkit", "wildcards", "records", "challenges", "upgrades")
SETTINGS = ("controls", "graphics", "player", "diagnostics")
SIZES = ((854, 393), (915, 412), (1280, 720), (1536, 691))

def box_data(locator):
    return locator.evaluate("""e => {
      const r=e.getBoundingClientRect();
      const st=getComputedStyle(e);
      return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),
        h:Math.round(r.height),display:st.display,visibility:st.visibility,
        scrollH:e.scrollHeight,clientH:e.clientHeight,scrollW:e.scrollWidth,
        clientW:e.clientWidth};
    }""")

def run(url, out, sizes):
    out.mkdir(parents=True, exist_ok=True)
    report = {"url": url, "screens": [], "warnings": [], "errors": []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--disable-web-security"])
        for width, height in sizes:
            context = browser.new_context(viewport={"width":width,"height":height},
                device_scale_factor=1, is_mobile=True, has_touch=True, reduced_motion="reduce")
            # The browser-run audit checks layout, not actual fullscreen permission.
            # Mock fullscreen readiness only for screenshot capture.
            context.add_init_script("""() => {
              try { Object.defineProperty(document, 'fullscreenElement', {
                configurable:true, get:()=>document.documentElement }); } catch(e) {}
            }""")
            page = context.new_page()
            page.on("pageerror", lambda error: report["errors"].append(str(error)))
            size_name=f"{width}x{height}"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.locator("#survivalLobby").wait_for(state="visible", timeout=20000)
                page.wait_for_timeout(750)
                for section in PAGES:
                    button=page.locator(f'[data-lobby-page="{section}"]')
                    button.click(timeout=5000)
                    panel=page.locator(f'[data-lobby-panel="{section}"]')
                    panel.wait_for(state="visible", timeout=5000)
                    path=out/f"{size_name}-{section}.png"
                    page.screenshot(path=str(path), animations="disabled")
                    stage=box_data(page.locator(".lobbyStage"))
                    footer=box_data(page.locator(".lobbyFooter"))
                    panel_data=box_data(panel)
                    info={"viewport":size_name,"page":section,"image":str(path),
                          "stage":stage,"footer":footer,"panel":panel_data}
                    if section=="wildcards":
                        cards=page.locator(".wildcardCollection .wildcardCard")
                        info["card_count"]=cards.count()
                        if cards.count()>0:
                            rects=[box_data(cards.nth(i)) for i in range(cards.count())]
                            info["cards"]=rects
                            info["columns"]=len({r["x"] for r in rects})
                            info["rows"]=len({r["y"] for r in rects})
                            if info["rows"]>2:
                                report["warnings"].append(f"{size_name}: Wildcards use {info['rows']} rows")
                    if panel_data["y"] < stage["y"]-1 or panel_data["y"]+panel_data["h"] > stage["y"]+stage["h"]+3:
                        report["warnings"].append(f"{size_name} {section}: panel extends beyond visible stage; check screenshot and scrolling")
                    report["screens"].append(info)
                page.locator("#lobbyOptionsBtn").click(timeout=5000)
                overlay=page.locator("#settingsOverlay")
                overlay.wait_for(state="visible", timeout=5000)
                for section in SETTINGS:
                    page.locator(f'[data-settings-tab="{section}"]').click(timeout=5000)
                    active=page.locator(f'.settingsPage[data-settings-page="{section}"]')
                    active.wait_for(state="visible", timeout=5000)
                    visible=[p.get_attribute("data-settings-page") for p in page.locator(".settingsPage").all() if p.is_visible()]
                    if visible != [section]:
                        report["errors"].append(f"{size_name}: selecting {section} exposed {visible}")
                    path=out/f"{size_name}-settings-{section}.png"
                    page.screenshot(path=str(path), animations="disabled")
                    report["screens"].append({"viewport":size_name,"page":f"settings-{section}",
                                              "image":str(path),"visible_settings":visible,
                                              "panel":box_data(active)})
            except Exception as exc:
                report["errors"].append(f"{size_name}: {exc}")
                page.screenshot(path=str(out/f"{size_name}-failure.png"))
            finally:
                context.close()
        browser.close()
    (out/"report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"screenshots":len(report["screens"]),
                      "warnings":report["warnings"],"errors":report["errors"]},indent=2))
    if report["errors"]:
        raise SystemExit(1)

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--url",default="http://127.0.0.1:4173")
    ap.add_argument("--out",type=Path,default=Path("visual-audit"))
    ap.add_argument("--sizes",default="",help="Comma-separated WIDTHxHEIGHT viewports")
    a=ap.parse_args()
    sizes=[tuple(map(int,s.split("x"))) for s in a.sizes.split(",") if s] if a.sizes else SIZES
    run(a.url,a.out,sizes)
