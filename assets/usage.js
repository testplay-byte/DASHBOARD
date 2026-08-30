/* Acute — usage page · progressive enhancement (src/usage.js → assets/usage.js).
 *
 * The usage page is fully server-rendered: every project and session is real
 * HTML (native <details>/<summary> collapsibles work without JS — the filter
 * and bulk toggling below are the only additions). This script adds:
 *   · opening the most recent project on load (the rest stay collapsed)
 *   · the "All sessions / Sub-agents only" filter (CSS class toggling on
 *     <main>; hiding + auto-opening is purely presentational)
 *   · "Expand all / Collapse all" bulk toggles
 * The shared assets/app.js (also loaded) handles the theme toggle, count-up
 * numbers, nav scrollspy, reveal-on-scroll and the relative timestamp.
 */
(function () {
  "use strict";

  var doc = document;
  var main = doc.getElementById("main");
  var projects = Array.prototype.slice.call(doc.querySelectorAll(".proj"));

  /* Open the most recent project so the page never lands on a wall of
     collapsed headers. Deterministic: the first card in DOM order (build
     sorts by last activity, newest first). */
  if (projects.length) {
    projects[0].open = true;
  }

  /* ── session filter: all vs sub-agents only ─────────────────────────── */
  var filter = doc.querySelector(".u-filter");
  if (filter && main) {
    var buttons = Array.prototype.slice.call(filter.querySelectorAll(".u-filter-btn"));
    var subSessions = Array.prototype.slice.call(doc.querySelectorAll(".sess.has-subs"));

    function setFilter(mode) {
      main.setAttribute("data-sf", mode);
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode));
      });
      if (mode === "subs") {
        /* make the sub-agent rows reachable: open their parent sessions and
           the projects that contain them (restore-free: switching back to
           "all" leaves things open — harmless and predictable) */
        subSessions.forEach(function (s) { s.open = true; });
        projects.forEach(function (p) {
          if (p.querySelector(".sess.has-subs")) p.open = true;
        });
      }
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        setFilter(b.getAttribute("data-mode"));
      });
    });
  }

  /* ── expand / collapse all ───────────────────────────────────────────── */
  var expandBtn = doc.getElementById("u-expand-all");
  var collapseBtn = doc.getElementById("u-collapse-all");
  if (expandBtn) {
    expandBtn.addEventListener("click", function () {
      projects.forEach(function (p) { p.open = true; });
      Array.prototype.slice.call(doc.querySelectorAll(".sess")).forEach(function (s) { s.open = true; });
    });
  }
  if (collapseBtn) {
    collapseBtn.addEventListener("click", function () {
      projects.forEach(function (p) { p.open = false; });
      Array.prototype.slice.call(doc.querySelectorAll(".sess")).forEach(function (s) { s.open = false; });
    });
  }
})();
