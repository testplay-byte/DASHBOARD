/* Acute — public status dashboard · progressive enhancement.
 *
 * The page is fully rendered (server-build) and readable with JS disabled.
 * Entrance animations for sections and progress bars are pure CSS
 * (deterministic: they run on load, so every capture method — full-page
 * screenshots, print, save-as — sees the finished page). This script adds:
 *   · a relative "last updated" stamp
 *   · count-up animation for the big numbers
 *   · nav scrollspy (highlights the section in view)
 * Source of truth: src/app.js → copied to assets/app.js by build.mjs.
 */
(function () {
  "use strict";

  var doc = document;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── build data (injected by build.mjs) ─────────────────────────────── */
  var buildIso = null;
  var dataEl = doc.getElementById("dash-data");
  if (dataEl) {
    try {
      var payload = JSON.parse(dataEl.textContent);
      buildIso = payload && payload.buildIso ? payload.buildIso : null;
    } catch (err) {
      /* malformed payload — page still renders, just skip relative time */
    }
  }

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
  /* server renders the final value; if JS runs we re-play it from zero */
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
      node.textContent = String(Math.round(target * eased));
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
})();
