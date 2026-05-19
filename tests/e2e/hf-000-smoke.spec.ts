import { test, expect } from "@playwright/test";

/**
 * HF-000 smoke spec — proves the bootstrap is wired.
 *
 * Acceptance: `/` renders the "HYDRANT FINDER" wordmark in Barlow Condensed 800
 * on a #0a0a0a background. Design tokens (--color-black, --color-red,
 * --color-yellow, --color-paper, --font-display, --font-ui, --font-mono) are
 * registered and reachable from CSS.
 */

const BLACK = "rgb(10, 10, 10)";
const RED = "rgb(225, 29, 41)";
const YELLOW = "rgb(252, 211, 77)";
const PAPER = "rgb(244, 242, 235)";

test.describe("HF-000 bootstrap", () => {
  test("home renders HYDRANT FINDER wordmark on black", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");

    // Wordmark visible
    const wordmark = page.getByRole("heading", { name: /HYDRANT FINDER/i });
    await expect(wordmark).toBeVisible();

    // Body bg is #0a0a0a
    const bodyBg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe(BLACK);

    // Wordmark uses --font-display family (Barlow Condensed)
    const wordmarkFont = await wordmark.evaluate(
      (el) => window.getComputedStyle(el as HTMLElement).fontFamily,
    );
    expect(wordmarkFont.toLowerCase()).toContain("barlow condensed");

    // Wordmark is bold (weight >= 700)
    const wordmarkWeight = await wordmark.evaluate((el) =>
      Number(window.getComputedStyle(el as HTMLElement).fontWeight),
    );
    expect(wordmarkWeight).toBeGreaterThanOrEqual(700);

    // No console errors
    expect(consoleErrors, `console had errors: ${consoleErrors.join(" · ")}`).toEqual([]);

    await page.screenshot({
      path: "tests/screenshots/hf-000/01-home-wordmark.png",
      fullPage: true,
    });
  });

  test("design tokens are registered in Tailwind theme", async ({ page }) => {
    await page.goto("/");

    // Read tokens off the resolved <body> CSS — Tailwind v4 @theme inline maps
    // these to CSS custom properties accessible from any element.
    const tokens = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      return {
        black: root.getPropertyValue("--color-black").trim(),
        red: root.getPropertyValue("--color-red").trim(),
        yellow: root.getPropertyValue("--color-yellow").trim(),
        paper: root.getPropertyValue("--color-paper").trim(),
        display: root.getPropertyValue("--font-display").trim(),
        ui: root.getPropertyValue("--font-ui").trim(),
        mono: root.getPropertyValue("--font-mono").trim(),
      };
    });

    expect(tokens.black.toLowerCase()).toBe("#0a0a0a");
    expect(tokens.red.toUpperCase()).toBe("#E11D29");
    expect(tokens.yellow.toUpperCase()).toBe("#FCD34D");
    expect(tokens.paper.toLowerCase()).toBe("#f4f2eb");
    expect(tokens.display).not.toBe("");
    expect(tokens.ui).not.toBe("");
    expect(tokens.mono).not.toBe("");
  });

  test("tailwind utilities resolve to project palette", async ({ page }) => {
    await page.goto("/");

    // Each probe div uses a Tailwind utility; we verify it resolves to the
    // expected colour so future stories can rely on `bg-red`, `text-yellow`, etc.
    const colours = await page.evaluate(() => {
      const make = (className: string) => {
        const el = document.createElement("div");
        el.className = className;
        document.body.appendChild(el);
        const style = window.getComputedStyle(el);
        const result = {
          bg: style.backgroundColor,
          color: style.color,
        };
        el.remove();
        return result;
      };
      return {
        red: make("bg-red").bg,
        yellow: make("bg-yellow").bg,
        paper: make("bg-paper").bg,
        textBlack: make("text-black").color,
      };
    });

    expect(colours.red).toBe(RED);
    expect(colours.yellow).toBe(YELLOW);
    expect(colours.paper).toBe(PAPER);
    expect(colours.textBlack).toBe(BLACK);
  });
});
