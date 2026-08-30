/* Acute — public status dashboard · progressive enhancement.
 *
 * The page is fully rendered (server-build) and readable with JS disabled.
 * Entrance animations for sections and progress bars are pure CSS
 * (deterministic: they run on load, so every capture method — full-page
 * screenshots, print, save-as — sees the finished page). This script adds:
 *   · relative "last updated" stamp
 *   · count-up animation for the big numbers
 *   · nav scrollspy (highlights the section in view)
 *   · dark-mode toggle (persisted via localStorage, default from prefers-color-scheme)
 *   · reveal-on-scroll via IntersectionObserver (degrades to "always visible")
 *   · screenshots grid renderer (reads data.screenshots from #dash-data)
 * Source of truth: src/app.js → copied to assets/app.js by build.mjs.
 */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── build data (injected by build.mjs) ─────────────────────────────── */
  var payload = null;
  var dataEl = doc.getElementById("dash-data");
  if (dataEl) {
    try {
      payload = JSON.parse(dataEl.textContent);
    } catch (err) {
      payload = null;
    }
  }
  var buildIso = payload && payload.buildIso ? payload.buildIso : null;

  /* ── relative "last updated" ────────────────────────────────────────── */
  var rel = doc.getElementById("updated-relative");
  if (rel && buildIso) {
    var t = Date.parse(buildIso);
    if (!Number.isNaN(t)) {
      var mins = Math.round(Math.abs(Date.now() - t) / 60000);
      var text;
      if (mins < 1) {
        text = "just now";
      } else if (mins < 60) {
        text = mins + " min ago";
      } else if (mins < 1440) {
        text = Math.round(mins / 60) + " h ago";
      } else {
        text = Math.round(mins / 1440) + " d ago";
      }
      rel.textContent = "· " + text;
    }
  }

  /* ── count-up numbers (on load, slightly staggered) ──────────────────── */
  /* Locale-formatted (505,659) so the usage page's big token counts stay
     readable while they animate; the index page's values are all < 1000 so
     their rendering is unchanged. */
  function animateCount(node, delayMs) {
    var target = Number(node.getAttribute("data-count")) || 0;
    if (!target) {
      node.textContent = "0";
      return;
    }
    var dur = 900;
    var t0 = 0;
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(target * eased).toLocaleString("en-US");
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.setTimeout(function () {
      node.textContent = "0";
      window.requestAnimationFrame(frame);
    }, delayMs);
  }

  if (!reduced) {
    var counts = Array.prototype.slice.call(doc.querySelectorAll("[data-count]"));
    counts.forEach(function (node, i) {
      animateCount(node, 180 + i * 80);
    });
  }

  /* ── nav scrollspy ──────────────────────────────────────────────────── */
  var navLinks = Array.prototype.slice.call(doc.querySelectorAll(".site-nav a"));
  var sections = navLinks
    .map(function (a) {
      var hash = a.getAttribute("href") || "";
      return hash.charAt(0) === "#" ? doc.getElementById(hash.slice(1)) : null;
    })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute("id");
          navLinks.forEach(function (a) {
            var active = a.getAttribute("href") === "#" + id;
            a.classList.toggle("active", active);
            if (active) {
              a.setAttribute("aria-current", "true");
            } else {
              a.removeAttribute("aria-current");
            }
          });
        });
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    sections.forEach(function (s) {
      spy.observe(s);
    });
  }

  /* ── reveal-on-scroll ────────────────────────────────────────────────── */
  /* Each .reveal that is below the fold gets a `reveal-pending` class so the
     page starts invisible; the observer swaps it for `reveal-in` (a smooth
     fade-up). Above-the-fold keeps the deterministic CSS load animation. */
  var reveals = Array.prototype.slice.call(doc.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && !reduced && reveals.length) {
    var fold = window.innerHeight * 0.92;
    reveals.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top > fold) el.classList.add("reveal-pending");
    });
    var rev = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          el.classList.remove("reveal-pending");
          el.classList.add("reveal-in");
          rev.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      if (el.classList.contains("reveal-pending")) rev.observe(el);
    });
  }

  /* ── dark-mode toggle ───────────────────────────────────────────────── */
  var toggle = doc.getElementById("theme-toggle");
  function currentTheme() {
    return root.getAttribute("data-theme") || "light";
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(theme === "dark"));
      toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
    try { localStorage.setItem("acute-theme", theme); } catch (_) { /* ignore */ }
  }
  if (toggle) {
    applyTheme(currentTheme());
    toggle.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    /* keyboard: Enter or Space already activate <button>; just reflect state */
    toggle.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        applyTheme(e.key === "ArrowRight" ? "dark" : "light");
      }
    });
  }
  /* Sync if the OS preference changes and the user hasn't explicitly chosen */
  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  if (mql && mql.addEventListener) {
    mql.addEventListener("change", function (e) {
      var stored;
      try { stored = localStorage.getItem("acute-theme"); } catch (_) { stored = null; }
      if (!stored) applyTheme(e.matches ? "dark" : "light");
    });
  }

  /* ── screenshots grid ──────────────────────────────────────────────── */
  var grid = doc.getElementById("screenshots-grid");
  if (grid && payload && payload.screenshots && payload.screenshots.rounds) {
    var rounds = payload.screenshots.rounds;
    if (!rounds.length) {
      var empty = doc.createElement("p");
      empty.className = "screenshots-empty";
      empty.textContent = "No screenshots published yet.";
      grid.appendChild(empty);
    } else {
      rounds.forEach(function (r) {
        var a = doc.createElement("a");
        a.className = "screenshot-card";
        a.href = r.url;
        a.setAttribute("download", "");

        var title = doc.createElement("span");
        title.className = "screenshot-round";
        title.textContent = "Round " + r.round;

        var meta = doc.createElement("span");
        meta.className = "screenshot-meta";
        meta.textContent = r.count + " shots · " + Math.round((r.size_kb || 0)) + " KB zip";

        var date = doc.createElement("span");
        date.className = "screenshot-date";
        date.textContent = r.date + (r.scope ? " · " + r.scope : "");

        var cta = doc.createElement("span");
        cta.className = "screenshot-cta";
        cta.textContent = "Download .zip ↓";

        a.appendChild(title);
        a.appendChild(meta);
        a.appendChild(date);
        a.appendChild(cta);
        grid.appendChild(a);
      });
    }
  }
})();
