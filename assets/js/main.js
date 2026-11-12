/* Page behaviours (no dependencies): scroll reveal, BibTeX copy, time-strip tooltips, message when the 3D viewer cannot start. */
(function () {
  "use strict";
  /* scroll reveal */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  }

  /* BibTeX copy */
  const copyBtn = document.getElementById("copy-bib");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const txt = document.getElementById("bib-text").textContent;
      let ok = true;
      try { await navigator.clipboard.writeText(txt); }
      catch (_) {
        const ta = document.createElement("textarea");
        ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.remove();
      }
      const span = copyBtn.querySelector("span");
      span.textContent = ok ? "Copied" : "Select and copy";
      setTimeout(() => (span.textContent = "Copy"), 1600);
    });
  }

  /* time-strip tooltips: stage name and mean seconds (mouse hover, keyboard focus, tap) */
  const strip = document.querySelector(".strip");
  const tip = strip && strip.querySelector(".tip");
  if (tip) {
    let pinned = null;
    const show = (seg) => {
      tip.textContent = seg.dataset.tip;
      tip.style.display = "block";
      const r = seg.getBoundingClientRect(), s = strip.getBoundingClientRect();
      let x = r.left - s.left + r.width / 2 - tip.offsetWidth / 2;
      x = Math.max(6, Math.min(x, s.width - tip.offsetWidth - 6));
      tip.style.left = x + "px";
      tip.style.top = (r.top - s.top - tip.offsetHeight - 8) + "px";
    };
    const hide = () => { tip.style.display = "none"; pinned = null; };
    strip.querySelectorAll(".strip-bar span[data-tip]").forEach((seg) => {
      seg.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(seg); });
      seg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && pinned !== seg) hide(); });
      seg.addEventListener("focus", () => show(seg));
      seg.addEventListener("blur", () => { if (pinned !== seg) hide(); });
      seg.addEventListener("click", (e) => {
        e.stopPropagation();
        if (pinned === seg) { hide(); } else { pinned = seg; show(seg); }
      });
    });
    document.addEventListener("click", (e) => { if (pinned && !strip.contains(e.target)) hide(); });
    window.addEventListener("resize", hide);
  }

  /* the 3D viewer is an ES module that imports three.js from cdn.jsdelivr.net; say so if it never started */
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (window.__viewerModule) return;
      const label = document.querySelector(".ws-viewer .ws-loader-label");
      if (label) {
        label.textContent = "The 3D viewer could not start: it loads three.js from cdn.jsdelivr.net, which needs an internet connection and a browser with JavaScript modules.";
        label.parentElement.classList.add("error");
      }
    }, 8000);
  });

})();
