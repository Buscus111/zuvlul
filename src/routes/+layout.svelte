<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import "@picocss/pico/css/pico.min.css";

  let { children } = $props();

  // Saved choice wins. Otherwise follow the browser. No preference means dark.
  function themeFromBrowser(): "light" | "dark" {
    if (!browser) return "dark";
    try {
      const stored = localStorage.getItem("nandch-theme");
      if (stored === "light" || stored === "dark") return stored;
      if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch {
      return "dark";
    }
    return "dark";
  }

  let theme = $state<"light" | "dark">(themeFromBrowser());
  let askCookies = $state(false);

  function applyTheme(next: "light" | "dark") {
    theme = next;
    document.documentElement.dataset.theme = next;
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("nandch-theme", next);
    } catch {
      // The choice still applies until the page is closed.
    }
  }

  function allowCookies() {
    try {
      localStorage.setItem("nandch-cookies", "1");
    } catch {
      // The consent cookie below is enough for this browser.
    }
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `nandch_consent=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    askCookies = false;
  }

  function declineCookies() {
    try {
      localStorage.setItem("nandch-cookies", "0");
    } catch {
      // Closing the notice is enough for this visit.
    }
    document.cookie = "nandch_consent=; Path=/; Max-Age=0; SameSite=Lax";
    askCookies = false;
  }

  onMount(() => {
    applyTheme(themeFromBrowser());

    const lightMedia = window.matchMedia("(prefers-color-scheme: light)");
    const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("nandch-theme");
      } catch {
        saved = "keep";
      }
      if (saved) return;
      applyTheme(themeFromBrowser());
    };
    lightMedia.addEventListener("change", onSystem);
    darkMedia.addEventListener("change", onSystem);

    let choice: string | null = null;
    try {
      choice = localStorage.getItem("nandch-cookies");
    } catch {
      choice = document.cookie.includes("nandch_consent=1") ? "1" : null;
    }
    askCookies = choice !== "1" && choice !== "0";

    return () => {
      lightMedia.removeEventListener("change", onSystem);
      darkMedia.removeEventListener("change", onSystem);
    };
  });
</script>

<div class="chrome">
  <div class="bar container">
    <a class="brand" href="/">Zuvlul</a>
    <button
      type="button"
      class="theme"
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      onclick={toggleTheme}
    >
    {#if theme === "dark"}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        />
      </svg>
    {:else}
      <svg class="moon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9.53 1.72a.75.75 0 0 1 .16.82A9 9 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.46-.69.75.75 0 0 1 .98.98 10.5 10.5 0 0 1-9.69 6.46c-5.8 0-10.5-4.7-10.5-10.5 0-4.37 2.67-8.11 6.46-9.7a.75.75 0 0 1 .82.17Z"
        />
      </svg>
    {/if}
    </button>
  </div>

  {@render children()}
</div>

{#if askCookies}
  <aside class="cookies" role="dialog" aria-label="Файлы cookie">
    <p>
      Мы используем файлы cookie для корректной работы сайта. Продолжая пользоваться сайтом, вы
      соглашаетесь на использование файлов cookie.
    </p>
    <div class="cookie-actions">
      <button type="button" class="outline secondary" onclick={declineCookies}>Отклонить</button>
      <button type="button" onclick={allowCookies}>Принять</button>
    </div>
  </aside>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  a.brand,
  a.brand:hover,
  a.brand:focus,
  a.brand:focus-visible {
    color: var(--pico-contrast);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  button.theme {
    position: fixed;
    z-index: 20;
    top: 0.9rem;
    right: max(1.25rem, env(safe-area-inset-right));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    border-radius: 999px;
  }

  button.theme svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  button.theme svg.moon {
    fill: currentColor;
    stroke: none;
  }

  .cookies {
    position: fixed;
    z-index: 30;
    right: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    left: 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid color-mix(in srgb, var(--pico-color) 16%, transparent);
    border-radius: var(--pico-border-radius);
    background: color-mix(in srgb, var(--pico-background-color) 78%, var(--pico-color) 22%);
    box-shadow: 0 0.7rem 1.8rem rgb(0 0 0 / 32%);
  }

  @media (min-width: 48rem) {
    .cookies {
      right: auto;
      left: 1rem;
      width: 24rem;
    }
  }

  .cookies p {
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
  }

  .cookie-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .cookie-actions button {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0.35rem 0.9rem;
  }
</style>
