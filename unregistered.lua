-- Lua initialization for Domainak's OpenResty proxy.
--
-- This lives in its own file instead of an inline `init_by_lua_block` in
-- nginx.conf because nginx parses inline *_by_lua_block code through its
-- small config-file buffer (8 KB). The HTML template below is much larger,
-- so the nginx Lua parser cannot find the closing long bracket and refuses
-- to start with "Lua code block missing the closing long bracket".
--
-- The file is mounted into the container next to nginx.conf (see
-- docker-compose.yaml) and downloaded by setup.sh for deployments.

domainak_unregistered = {
    app_url = "https://domainak.z44d.com",
    app_host = "domainak.z44d.com",
    page = [==[
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" content="#0B0F17" />
    <meta name="robots" content="noindex" />
    <title>@@host@@ · subdomain not registered</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #0b0f17;
        --bg-soft: #121a28;
        --card: rgba(18, 26, 40, 0.82);
        --border: rgba(255, 255, 255, 0.08);
        --text: #e9eef7;
        --muted: #9daac0;
        --accent: #22d3ee;
        --accent-soft: rgba(34, 211, 238, 0.14);
        --shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      }

      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f5f7fb;
          --bg-soft: #ffffff;
          --card: rgba(255, 255, 255, 0.9);
          --border: rgba(13, 21, 36, 0.1);
          --text: #0d1524;
          --muted: #4c5a70;
          --accent: #0891b2;
          --accent-soft: rgba(8, 145, 178, 0.12);
          --shadow: 0 24px 60px rgba(13, 21, 36, 0.12);
        }
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        background: var(--bg);
        color: var(--text);
        font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
        position: relative;
        overflow-x: hidden;
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.5;
        pointer-events: none;
        z-index: 0;
      }

      body::before {
        width: 520px;
        height: 520px;
        top: -180px;
        left: -140px;
        background: radial-gradient(
          circle,
          var(--accent-soft),
          transparent 70%
        );
      }

      body::after {
        width: 460px;
        height: 460px;
        bottom: -200px;
        right: -120px;
        background: radial-gradient(
          circle,
          rgba(139, 92, 246, 0.22),
          transparent 70%
        );
      }

      .wrap {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 620px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px) saturate(150%);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        padding: 30px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: inherit;
      }

      .mark {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #062a33;
        background: linear-gradient(135deg, #67e8f9, #22d3ee);
        box-shadow: 0 6px 18px rgba(34, 211, 238, 0.35);
      }

      .brand-name {
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-weight: 700;
        font-size: 1.12rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .brand-sub {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.2;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 26px 0 16px;
        padding: 5px 13px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .badge-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 4px var(--accent-soft);
      }

      h1 {
        margin: 0 0 12px;
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-size: 2.1rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.035em;
      }

      .lede {
        margin: 0;
        max-width: 46ch;
        color: var(--muted);
      }

      .lede strong {
        color: var(--text);
        font-weight: 600;
      }

      .field {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 22px 0 24px;
        padding: 12px 12px 12px 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(13, 21, 36, 0.28);
      }

      @media (prefers-color-scheme: light) {
        .field {
          background: rgba(13, 21, 36, 0.03);
        }
      }

      .field-host {
        flex: 1;
        min-width: 0;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular,
          Menlo, monospace;
        font-size: 0.95rem;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .copy {
        flex-shrink: 0;
        padding: 7px 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease;
      }

      .copy:hover,
      .copy:focus-visible {
        color: var(--accent);
        border-color: var(--accent);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 24px;
        border-radius: 999px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.18s ease, box-shadow 0.18s ease,
          background 0.18s ease;
      }

      .btn-primary {
        background: linear-gradient(135deg, #67e8f9, #22d3ee);
        color: #062a33;
        box-shadow: 0 10px 26px rgba(34, 211, 238, 0.28);
      }

      .btn-primary:hover,
      .btn-primary:focus-visible {
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(34, 211, 238, 0.36);
      }

      .btn-ghost {
        border: 1px solid var(--border);
        color: var(--muted);
      }

      .btn-ghost:hover,
      .btn-ghost:focus-visible {
        color: var(--text);
        border-color: var(--accent);
      }

      .steps {
        display: grid;
        gap: 10px;
        margin: 26px 0 0;
        padding: 22px 0 0;
        border-top: 1px solid var(--border);
        list-style: none;
      }

      .steps li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .step-index {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
      }

      .steps b {
        color: var(--text);
        font-weight: 600;
      }

      footer {
        margin-top: 18px;
        text-align: center;
        color: var(--muted);
        font-size: 0.8rem;
      }

      footer a {
        color: inherit;
        text-decoration: none;
      }

      footer a:hover,
      footer a:focus-visible {
        color: var(--accent);
      }

      @media (max-width: 560px) {
        .card {
          padding: 24px 20px;
        }

        h1 {
          font-size: 1.7rem;
        }

        .actions .btn {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          transition: none !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="card">
        <a class="brand" href="@@app_url@@">
          <span class="mark" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </span>
          <span>
            <span class="brand-name">Domainak</span>
            <span class="brand-sub">routing control</span>
          </span>
        </a>

        <div class="badge">
          <span class="badge-dot" aria-hidden="true"></span>
          404 · no route
        </div>

        <h1>This subdomain isn&rsquo;t claimed yet.</h1>
        <p class="lede">
          <strong>@@host@@</strong> is not registered on Domainak, so there is
          no destination behind it. Reserve the name, point it at your server
          or tunnel, and it starts serving traffic in under a minute.
        </p>

        <div class="field">
          <span class="field-host" id="host">@@host@@</span>
          <button
            class="copy"
            type="button"
            data-copy="@@host@@"
            data-copy-label
          >
            Copy
          </button>
        </div>

        <div class="actions">
          <a class="btn btn-primary" href="@@claim_url@@">
            Reserve this subdomain
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </a>
          <a class="btn btn-ghost" href="@@app_url@@">
            Go to @@app_host@@
          </a>
        </div>

        <ol class="steps">
          <li>
            <span class="step-index">1</span>
            <span>Sign in with GitHub to open your workspace.</span>
          </li>
          <li>
            <span class="step-index">2</span>
            <span>
              Claim <b>@@host@@</b> and enter a destination host and port, or a
              redirect target.
            </span>
          </li>
          <li>
            <span class="step-index">3</span>
            <span>Domainak proxies the hostname, with traffic stats per route.</span>
          </li>
        </ol>
      </div>

      <footer>
        Served by Domainak ·
        <a href="https://github.com/z44d">github.com/z44d</a>
      </footer>
    </main>

    <script>
      (function () {
        var button = document.querySelector("[data-copy]");
        if (!button) {
          return;
        }

        var value = button.getAttribute("data-copy") || "";
        var label = button.querySelector("[data-copy-label]");
        var original = label ? label.textContent : "";

        function announce(ok) {
          if (!label) {
            return;
          }
          label.textContent = ok ? "Copied" : "Ctrl+C";
          window.setTimeout(function () {
            label.textContent = original;
          }, 1600);
        }

        button.addEventListener("click", function () {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).then(
              function () {
                announce(true);
              },
              function () {
                announce(false);
              },
            );
            return;
          }

          var field = document.createElement("textarea");
          field.value = value;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();

          try {
            announce(document.execCommand("copy"));
          } catch (error) {
            announce(false);
          }

          document.body.removeChild(field);
        });
      })();
    </script>
  </body>
</html>
]==],
}

domainak_banned = {
    app_url = "https://domainak.z44d.com",
    app_host = "domainak.z44d.com",
    page = [==[
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" content="#0B0F17" />
    <meta name="robots" content="noindex" />
    <title>@@host@@ · subdomain banned</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #0b0f17;
        --bg-soft: #121a28;
        --card: rgba(18, 26, 40, 0.82);
        --border: rgba(255, 255, 255, 0.08);
        --text: #e9eef7;
        --muted: #9daac0;
        --accent: #ff4d5e;
        --accent-soft: rgba(255, 77, 94, 0.14);
        --shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      }

      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f5f7fb;
          --bg-soft: #ffffff;
          --card: rgba(255, 255, 255, 0.9);
          --border: rgba(13, 21, 36, 0.1);
          --text: #0d1524;
          --muted: #4c5a70;
          --accent: #dc2626;
          --accent-soft: rgba(220, 38, 38, 0.12);
          --shadow: 0 24px 60px rgba(13, 21, 36, 0.12);
        }
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        background: var(--bg);
        color: var(--text);
        font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
        position: relative;
        overflow-x: hidden;
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.5;
        pointer-events: none;
        z-index: 0;
      }

      body::before {
        width: 520px;
        height: 520px;
        top: -180px;
        left: -140px;
        background: radial-gradient(
          circle,
          var(--accent-soft),
          transparent 70%
        );
      }

      body::after {
        width: 460px;
        height: 460px;
        bottom: -200px;
        right: -120px;
        background: radial-gradient(
          circle,
          rgba(244, 63, 94, 0.22),
          transparent 70%
        );
      }

      .wrap {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 620px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px) saturate(150%);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        padding: 30px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: inherit;
      }

      .mark {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #3d0a0a;
        background: linear-gradient(135deg, #ff9aa4, #ef4444);
        box-shadow: 0 6px 18px rgba(239, 68, 68, 0.35);
      }

      .brand-name {
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-weight: 700;
        font-size: 1.12rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .brand-sub {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.2;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 26px 0 16px;
        padding: 5px 13px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .badge-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 4px var(--accent-soft);
      }

      h1 {
        margin: 0 0 12px;
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-size: 2.1rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.035em;
      }

      .lede {
        margin: 0;
        max-width: 46ch;
        color: var(--muted);
      }

      .lede strong {
        color: var(--text);
        font-weight: 600;
      }

      .reason {
        margin: 18px 0 0;
        padding: 13px 16px;
        border: 1px solid var(--border);
        border-left: 3px solid var(--accent);
        border-radius: 12px;
        background: var(--accent-soft);
      }

      .reason-label {
        display: block;
        margin-bottom: 4px;
        color: var(--accent);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .reason-text {
        margin: 0;
        color: var(--text);
        font-size: 0.92rem;
        overflow-wrap: anywhere;
      }

      .field {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 22px 0 24px;
        padding: 12px 12px 12px 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(13, 21, 36, 0.28);
      }

      @media (prefers-color-scheme: light) {
        .field {
          background: rgba(13, 21, 36, 0.03);
        }
      }

      .field-host {
        flex: 1;
        min-width: 0;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular,
          Menlo, monospace;
        font-size: 0.95rem;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .copy {
        flex-shrink: 0;
        padding: 7px 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease;
      }

      .copy:hover,
      .copy:focus-visible {
        color: var(--accent);
        border-color: var(--accent);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 24px;
        border-radius: 999px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.18s ease, box-shadow 0.18s ease,
          background 0.18s ease;
      }

      .btn-primary {
        background: linear-gradient(135deg, #ff9aa4, #ef4444);
        color: #3d0a0a;
        box-shadow: 0 10px 26px rgba(239, 68, 68, 0.28);
      }

      .btn-primary:hover,
      .btn-primary:focus-visible {
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(239, 68, 68, 0.36);
      }

      .btn-ghost {
        border: 1px solid var(--border);
        color: var(--muted);
      }

      .btn-ghost:hover,
      .btn-ghost:focus-visible {
        color: var(--text);
        border-color: var(--accent);
      }

      .steps {
        display: grid;
        gap: 10px;
        margin: 26px 0 0;
        padding: 22px 0 0;
        border-top: 1px solid var(--border);
        list-style: none;
      }

      .steps li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .step-index {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
      }

      .steps b {
        color: var(--text);
        font-weight: 600;
      }

      footer {
        margin-top: 18px;
        text-align: center;
        color: var(--muted);
        font-size: 0.8rem;
      }

      footer a {
        color: inherit;
        text-decoration: none;
      }

      footer a:hover,
      footer a:focus-visible {
        color: var(--accent);
      }

      @media (max-width: 560px) {
        .card {
          padding: 24px 20px;
        }

        h1 {
          font-size: 1.7rem;
        }

        .actions .btn {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          transition: none !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="card">
        <a class="brand" href="@@app_url@@">
          <span class="mark" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </span>
          <span>
            <span class="brand-name">Domainak</span>
            <span class="brand-sub">routing control</span>
          </span>
        </a>

        <div class="badge">
          <span class="badge-dot" aria-hidden="true"></span>
          403 · banned
        </div>

        <h1>This subdomain is banned.</h1>
        <p class="lede">
          <strong>@@host@@</strong> is blocked on Domainak, so requests to it
          are refused at the edge and never reach a destination. The name
          stays reserved until the ban is lifted.
        </p>

        @@reason_html@@

        <div class="field">
          <span class="field-host" id="host">@@host@@</span>
          <button
            class="copy"
            type="button"
            data-copy="@@host@@"
            data-copy-label
          >
            Copy
          </button>
        </div>

        <div class="actions">
          <a class="btn btn-primary" href="@@app_url@@">
            Go to @@app_host@@
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </a>
          <a
            class="btn btn-ghost"
            href="https://github.com/z44d/domainak"
            target="_blank"
            rel="noopener noreferrer"
          >
            Appeal on GitHub
          </a>
        </div>

        <ol class="steps">
          <li>
            <span class="step-index">1</span>
            <span>Domainak blocks banned hostnames in the proxy, before any
              traffic is forwarded.</span>
          </li>
          <li>
            <span class="step-index">2</span>
            <span>
              Any route for <b>@@host@@</b> is removed when the ban is
              applied.
            </span>
          </li>
          <li>
            <span class="step-index">3</span>
            <span>Think this is a mistake? Open an issue and the maintainers
              will review it.</span>
          </li>
        </ol>
      </div>

      <footer>
        Served by Domainak ·
        <a href="https://github.com/z44d">github.com/z44d</a>
      </footer>
    </main>

    <script>
      (function () {
        var button = document.querySelector("[data-copy]");
        if (!button) {
          return;
        }

        var value = button.getAttribute("data-copy") || "";
        var label = button.querySelector("[data-copy-label]");
        var original = label ? label.textContent : "";

        function announce(ok) {
          if (!label) {
            return;
          }
          label.textContent = ok ? "Copied" : "Ctrl+C";
          window.setTimeout(function () {
            label.textContent = original;
          }, 1600);
        }

        button.addEventListener("click", function () {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).then(
              function () {
                announce(true);
              },
              function () {
                announce(false);
              },
            );
            return;
          }

          var field = document.createElement("textarea");
          field.value = value;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();

          try {
            announce(document.execCommand("copy"));
          } catch (error) {
            announce(false);
          }

          document.body.removeChild(field);
        });
      })();
    </script>
  </body>
</html>
]==],
}

-- Generic edge block page shared by every per-subdomain rule: maintenance
-- mode, country policy and service hours. One template keeps the styling in
-- sync; domainak_apply_settings below fills in @@badge@@/@@title@@/@@lede@@
-- and @@note_html@@ per case.
domainak_unavailable = {
    app_url = "https://domainak.z44d.com",
    app_host = "domainak.z44d.com",
    page = [==[
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" content="#0B0F17" />
    <meta name="robots" content="noindex" />
    <title>@@host@@ · access restricted</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #0b0f17;
        --bg-soft: #121a28;
        --card: rgba(18, 26, 40, 0.82);
        --border: rgba(255, 255, 255, 0.08);
        --text: #e9eef7;
        --muted: #9daac0;
        --accent: #f59e0b;
        --accent-soft: rgba(245, 158, 11, 0.14);
        --shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      }

      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f5f7fb;
          --bg-soft: #ffffff;
          --card: rgba(255, 255, 255, 0.9);
          --border: rgba(13, 21, 36, 0.1);
          --text: #0d1524;
          --muted: #4c5a70;
          --accent: #b45309;
          --accent-soft: rgba(180, 83, 9, 0.12);
          --shadow: 0 24px 60px rgba(13, 21, 36, 0.12);
        }
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        background: var(--bg);
        color: var(--text);
        font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
        position: relative;
        overflow-x: hidden;
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.5;
        pointer-events: none;
        z-index: 0;
      }

      body::before {
        width: 520px;
        height: 520px;
        top: -180px;
        left: -140px;
        background: radial-gradient(
          circle,
          var(--accent-soft),
          transparent 70%
        );
      }

      body::after {
        width: 460px;
        height: 460px;
        bottom: -200px;
        right: -120px;
        background: radial-gradient(
          circle,
          rgba(245, 158, 11, 0.22),
          transparent 70%
        );
      }

      .wrap {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 620px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px) saturate(150%);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        padding: 30px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: inherit;
      }

      .mark {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #451a03;
        background: linear-gradient(135deg, #fcd97f, #f59e0b);
        box-shadow: 0 6px 18px rgba(245, 158, 11, 0.35);
      }

      .brand-name {
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-weight: 700;
        font-size: 1.12rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }

      .brand-sub {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.2;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 26px 0 16px;
        padding: 5px 13px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .badge-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 4px var(--accent-soft);
      }

      h1 {
        margin: 0 0 12px;
        font-family: "Space Grotesk", "Inter", Arial, sans-serif;
        font-size: 2.1rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.035em;
      }

      .lede {
        margin: 0;
        max-width: 46ch;
        color: var(--muted);
      }

      .lede strong {
        color: var(--text);
        font-weight: 600;
      }

      .note {
        margin: 18px 0 0;
        padding: 13px 16px;
        border: 1px solid var(--border);
        border-left: 3px solid var(--accent);
        border-radius: 12px;
        background: var(--accent-soft);
      }

      .note-label {
        display: block;
        margin-bottom: 4px;
        color: var(--accent);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .note-text {
        margin: 0;
        color: var(--text);
        font-size: 0.92rem;
        overflow-wrap: anywhere;
      }

      .field {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 22px 0 24px;
        padding: 12px 12px 12px 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(13, 21, 36, 0.28);
      }

      @media (prefers-color-scheme: light) {
        .field {
          background: rgba(13, 21, 36, 0.03);
        }
      }

      .field-host {
        flex: 1;
        min-width: 0;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular,
          Menlo, monospace;
        font-size: 0.95rem;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .copy {
        flex-shrink: 0;
        padding: 7px 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease;
      }

      .copy:hover,
      .copy:focus-visible {
        color: var(--accent);
        border-color: var(--accent);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 24px;
        border-radius: 999px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.18s ease, box-shadow 0.18s ease,
          background 0.18s ease;
      }

      .btn-primary {
        background: linear-gradient(135deg, #fcd34d, #f59e0b);
        color: #451a03;
        box-shadow: 0 10px 26px rgba(245, 158, 11, 0.28);
      }

      .btn-primary:hover,
      .btn-primary:focus-visible {
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(245, 158, 11, 0.36);
      }

      .btn-ghost {
        border: 1px solid var(--border);
        color: var(--muted);
      }

      .btn-ghost:hover,
      .btn-ghost:focus-visible {
        color: var(--text);
        border-color: var(--accent);
      }

      .steps {
        display: grid;
        gap: 10px;
        margin: 26px 0 0;
        padding: 22px 0 0;
        border-top: 1px solid var(--border);
        list-style: none;
      }

      .steps li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .step-index {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
      }

      .steps b {
        color: var(--text);
        font-weight: 600;
      }

      footer {
        margin-top: 18px;
        text-align: center;
        color: var(--muted);
        font-size: 0.8rem;
      }

      footer a {
        color: inherit;
        text-decoration: none;
      }

      footer a:hover,
      footer a:focus-visible {
        color: var(--accent);
      }

      @media (max-width: 560px) {
        .card {
          padding: 24px 20px;
        }

        h1 {
          font-size: 1.7rem;
        }

        .actions .btn {
          width: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          transition: none !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="card">
        <a class="brand" href="@@app_url@@">
          <span class="mark" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </span>
          <span>
            <span class="brand-name">Domainak</span>
            <span class="brand-sub">routing control</span>
          </span>
        </a>

        <div class="badge">
          <span class="badge-dot" aria-hidden="true"></span>
          @@badge@@
        </div>

        <h1>@@title@@</h1>
        <p class="lede">
          <strong>@@host@@</strong> @@lede@@
        </p>

        @@note_html@@

        <div class="field">
          <span class="field-host" id="host">@@host@@</span>
          <button
            class="copy"
            type="button"
            data-copy="@@host@@"
            data-copy-label
          >
            Copy
          </button>
        </div>

        <div class="actions">
          <a class="btn btn-primary" href="@@app_url@@">
            Go to @@app_host@@
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </a>
          <a class="btn btn-ghost" href="@@app_url@@/dashboard">
            Manage this route
          </a>
        </div>

        <ol class="steps">
          <li>
            <span class="step-index">1</span>
            <span>Domainak applies these rules at the edge, before any
              traffic is forwarded to the destination.</span>
          </li>
          <li>
            <span class="step-index">2</span>
            <span>
              Only public traffic to <b>@@host@@</b> is held back; the route
              itself keeps running in the background.
            </span>
          </li>
          <li>
            <span class="step-index">3</span>
            <span>The owner can update these rules anytime from the
              Domainak dashboard.</span>
          </li>
        </ol>
      </div>

      <footer>
        Served by Domainak ·
        <a href="https://github.com/z44d">github.com/z44d</a>
      </footer>
    </main>

    <script>
      (function () {
        var button = document.querySelector("[data-copy]");
        if (!button) {
          return;
        }

        var value = button.getAttribute("data-copy") || "";
        var label = button.querySelector("[data-copy-label]");
        var original = label ? label.textContent : "";

        function announce(ok) {
          if (!label) {
            return;
          }
          label.textContent = ok ? "Copied" : "Ctrl+C";
          window.setTimeout(function () {
            label.textContent = original;
          }, 1600);
        }

        button.addEventListener("click", function () {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).then(
              function () {
                announce(true);
              },
              function () {
                announce(false);
              },
            );
            return;
          }

          var field = document.createElement("textarea");
          field.value = value;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();

          try {
            announce(document.execCommand("copy"));
          } catch (error) {
            announce(false);
          }

          document.body.removeChild(field);
        });
      })();
    </script>
  </body>
</html>
]==],
}

-- Replaces @@key@@ placeholders in the page template with values[key].
function domainak_render(template, values)
    return (template:gsub("@@([%w_]+)@@", function(key)
        return values[key] or ""
    end))
end

-- Escapes a value for safe interpolation into the HTML page template.
-- OpenResty has no built-in HTML escaper (ngx.escape_html does not exist).
function domainak_escape_html(value)
    return (string.gsub(tostring(value), "[\"'&<>]", function(char)
        if char == "&" then return "&amp;" end
        if char == "<" then return "&lt;" end
        if char == ">" then return "&gt;" end
        if char == "\"" then return "&quot;" end
        return "&#39;"
    end))
end

-- Builds the optional reason block of the banned page. The redis value for
-- a banned host is either the admin supplied reason or "1" when no reason
-- was given (also the shape of keys cached before reasons were stored), so
-- both cases render no block at all.
function domainak_banned_reason_html(value)
    if not value or value == "" or value == "1" then
        return ""
    end

    local escaped = domainak_escape_html(value)
    return '<div class="reason">'
        .. '<span class="reason-label">Reason</span>'
        .. '<p class="reason-text">' .. escaped .. "</p>"
        .. "</div>"
end

-- Builds the optional note block of the block page (maintenance message,
-- service window). The label is always authored by this file, but the value
-- can be user supplied, so both sides go through the escaper.
function domainak_note_html(label, value)
    if not value or value == "" then
        return ""
    end

    return '<div class="note">'
        .. '<span class="note-label">' .. domainak_escape_html(label)
        .. "</span>"
        .. '<p class="note-text">' .. domainak_escape_html(value) .. "</p>"
        .. "</div>"
end

-- Loads the per-host access rules published by the API under
-- "<host>:settings". The shared dict mirrors the 30 second routing cache,
-- and the "-" sentinel records "no rules for this host" so unconfigured
-- subdomains only reach redis once per cache window.
function domainak_load_settings(host, cache)
    local settings_key = host .. "|s"
    local cached = cache:get(settings_key)

    if cached ~= nil then
        if cached == "-" then
            return nil
        end
        local cjson = require "cjson"
        local ok, decoded = pcall(cjson.decode, cached)
        if ok and type(decoded) == "table" then
            return decoded
        end
        return nil
    end

    local redis = require "resty.redis"
    local red = redis:new()
    red:set_timeout(1000)

    local ok, err = red:connect("redis", 6379)
    if not ok then
        -- The route itself already resolved, so a redis hiccup must not
        -- break traffic: skip rule evaluation and retry on the next cache
        -- miss instead of failing the request.
        ngx.log(ngx.ERR, "settings redis connect failed for ", host, ": ",
            err)
        return nil
    end

    local res = red:get(host .. ":settings")
    red:set_keepalive(10000, 100)

    if not res or res == ngx.null or res == "" then
        cache:set(settings_key, "-", 30)
        return nil
    end

    cache:set(settings_key, res, 30)

    local cjson = require "cjson"
    local decoded_ok, decoded = pcall(cjson.decode, res)
    if not decoded_ok or type(decoded) ~= "table" then
        ngx.log(ngx.ERR, "invalid settings payload for ", host)
        return nil
    end
    return decoded
end

-- Renders the block page for a denied request. The page replaces the
-- upstream response, so the request must not be recorded as a visit.
function domainak_deny(status, values, retry_after)
    ngx.ctx.route_found = nil

    if retry_after then
        ngx.header["Retry-After"] = tostring(retry_after)
    end

    ngx.status = status
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(domainak_render(domainak_unavailable.page, values))
    return ngx.exit(status)
end

-- Evaluates the access rules of a registered host in priority order:
-- maintenance first (it overrides every other rule), then the country
-- policy, then the service window. Hosts without rules return immediately.
function domainak_apply_settings(host, cache)
    local settings = domainak_load_settings(host, cache)
    if not settings then
        return
    end

    local escaped_host = domainak_escape_html(host)

    if settings.mm == 1 then
        return domainak_deny(503, {
            host = escaped_host,
            badge = "503 - maintenance",
            title = "Currently not in service.",
            lede = "is closed for maintenance right now and should be "
                .. "back online soon.",
            note_html = domainak_note_html("Message", settings.mmsg),
        }, 1800)
    end

    local geo = settings.geo
    if geo == "allowlist" or geo == "blocklist" then
        -- The tunnel forwards the visitor country in CF-IPCountry; a
        -- missing header means the request bypassed Cloudflare and is not
        -- judged by location, so the route stays testable.
        local country = ngx.req.get_headers()["cf-ipcountry"]
        if type(country) == "table" then
            country = country[1]
        end

        if country and country ~= "" then
            country = string.upper(country)

            -- Listed stays false for unknown countries ("XX") and Tor
            -- ("T1"): an allowlist denies them, a blocklist lets them by.
            local listed = false
            for _, code in ipairs(settings.cc or {}) do
                if code == country then
                    listed = true
                    break
                end
            end

            local blocked = false
            if geo == "allowlist" then
                blocked = not listed
            else
                blocked = listed
            end

            if blocked then
                return domainak_deny(403, {
                    host = escaped_host,
                    badge = "403 - region blocked",
                    title = "Not available in your region.",
                    lede = "cannot be reached from your current location. "
                        .. "This route only serves selected countries.",
                    note_html = "",
                })
            end
        end
    end

    if settings.sh == 1 then
        local start_min = tonumber(settings.s)
        local end_min = tonumber(settings.e)
        local offset = tonumber(settings.off) or 0

        if start_min and end_min then
            -- The window is stored as local wall-clock minutes in the
            -- owner's timezone; the offset published by the API (refreshed
            -- across DST changes) converts "now" into that clock.
            local utc_minutes = math.floor((ngx.time() % 86400) / 60)
            local local_minutes = (utc_minutes + offset) % 1440

            local open = false
            if start_min == end_min then
                open = true
            elseif start_min < end_min then
                open = local_minutes >= start_min
                    and local_minutes < end_min
            else
                -- Overnight window, e.g. 22:00-06:00.
                open = local_minutes >= start_min
                    or local_minutes < end_min
            end

            if not open then
                -- Minutes until the window opens again, handed to
                -- Retry-After so a well-behaved client comes back useful.
                local wait = (start_min - local_minutes) % 1440
                if wait == 0 then
                    wait = 60
                end

                return domainak_deny(503, {
                    host = escaped_host,
                    badge = "503 - service hours",
                    title = "Outside of service hours.",
                    lede = "only serves traffic during its scheduled "
                        .. "window. Please come back when it opens.",
                    note_html = domainak_note_html(
                        "Service window",
                        settings.win
                    ),
                }, wait * 60)
            end
        end
    end
end
