/*
 * Settoku insights + UTM attribution beacon
 * ------------------------------------------
 * Drop this on EVERY page of your funnel / opt-in / landing sites (it lives on
 * your marketing pages, NOT inside the Settoku dashboard). It does three things:
 *
 *   1. Captures FIRST-TOUCH UTMs from the URL and remembers them (localStorage),
 *      so the original source survives across pages and sessions.
 *   2. Forwards those UTMs onto your checkout / booking links (Stripe, Whop,
 *      FanBasis, Calendly, Cal.com, Typeform, Kit, ...) so the source rides all
 *      the way to the payment. Hand-tagged links are never overridden.
 *   3. On any form submit that has an email, beacons { email, utm_* } to your
 *      Settoku /api/attribution endpoint. Settoku stores first-touch UTM per
 *      email, then joins your buyers back to it by email, so every sale is
 *      attributed to the source that produced it, even when the payment
 *      processor strips UTMs.
 *
 * Setup: one script tag, configured with data-* attributes:
 *
 *   <script src="/settoku-insights.js"
 *           data-endpoint="https://YOUR-SETTOKU-DOMAIN/api/attribution"
 *           data-ga4="G-XXXXXXXXXX"
 *           data-checkout-hosts="stripe.com,whop.com,calendly.com"
 *           async></script>
 *
 *   data-endpoint        REQUIRED. Your deployed Settoku URL + /api/attribution.
 *                        (Needs FANBASIS_TARGET_AGENCY_ID set in your Settoku env
 *                        so captures land in the right workspace.)
 *   data-ga4             Optional. A GA4 Measurement ID. If set, also loads GA4
 *                        and sends page_view / begin_checkout / generate_lead /
 *                        scroll-depth events for the dashboard's traffic funnel.
 *   data-checkout-hosts  Optional. Comma-separated hostnames to treat as
 *                        checkout/booking links. Defaults to the common ones.
 *
 * No keys or secrets live here. The attribution endpoint is public by design
 * (guarded server-side by email validation + your workspace's env scope).
 */
(function () {
  var self =
    document.currentScript ||
    document.querySelector('script[src*="settoku-insights"]');
  function cfg(name, dflt) {
    var v = self && self.getAttribute("data-" + name);
    return v == null || v === "" ? dflt : v;
  }

  var ATTR_ENDPOINT = cfg("endpoint", "");
  var GA_ID = cfg("ga4", "");
  var CHECKOUT_HOSTS_RAW = cfg(
    "checkout-hosts",
    "stripe.com,whop.com,fanbasis.com,iclosed.io,calendly.com,cal.com,typeform.com,kit.com"
  );

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var STORE_KEY = "settoku_utms";
  var LAND_KEY = "settoku_landing";
  var pagePath = location.pathname;

  // Build a host-matching regex from the configured list (dots escaped).
  var FORWARD_HOSTS = new RegExp(
    CHECKOUT_HOSTS_RAW.split(",")
      .map(function (h) {
        return h.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .filter(Boolean)
      .join("|") || "a^", // "a^" = matches nothing if list is empty
    "i"
  );

  // ---- Optional GA4 (only if a measurement id was provided) ----
  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }
  var GA_ON = !!GA_ID;
  if (GA_ON) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    (document.head || document.documentElement).appendChild(s);
    window.gtag = window.gtag || gtag;
    window.gtag("js", new Date());
    window.gtag("config", GA_ID); // GA4 auto-captures utm_source / utm_medium / utm_campaign
  }
  function track(name, params) {
    if (!GA_ON) return;
    try {
      window.gtag("event", name, params || {});
    } catch (e) {}
  }

  // ---- Storage helpers (localStorage, falling back to sessionStorage) ----
  function store(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      try {
        sessionStorage.setItem(k, v);
      } catch (e2) {}
    }
  }
  function load(k) {
    try {
      return localStorage.getItem(k) || sessionStorage.getItem(k) || "";
    } catch (e) {
      return "";
    }
  }
  function readStoredUtms() {
    try {
      return JSON.parse(load(STORE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  // ---- 1. First-touch UTM capture ----
  function captureUtms() {
    var params = new URLSearchParams(location.search);
    var found = {};
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) found[k] = v;
    });
    // Only store if we found UTMs AND nothing was captured before (first touch wins).
    if (Object.keys(found).length && !Object.keys(readStoredUtms()).length) {
      store(STORE_KEY, JSON.stringify(found));
      store(LAND_KEY, location.pathname);
    }
  }

  // ---- 2. Forward stored UTMs onto checkout / booking links ----
  function decorateLinks() {
    var utms = readStoredUtms();
    if (!Object.keys(utms).length) return;
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (!FORWARD_HOSTS.test(href)) continue;
      try {
        var u = new URL(href, location.href);
        UTM_KEYS.forEach(function (k) {
          if (utms[k] && !u.searchParams.has(k)) u.searchParams.set(k, utms[k]); // respect hand-tagged links
        });
        links[i].setAttribute("href", u.toString());
      } catch (e) {}
    }
  }

  // ---- 3. Beacon { email, utm_* } to Settoku on opt-in ----
  function beaconAttribution(email) {
    if (!ATTR_ENDPOINT) return; // not configured -> nothing to send to
    try {
      var utms = readStoredUtms();
      var payload = {
        email: email,
        landing_path: load(LAND_KEY) || pagePath,
        referrer: document.referrer || "",
      };
      UTM_KEYS.forEach(function (k) {
        payload[k] = utms[k] || "";
      });
      var json = JSON.stringify(payload);
      // text/plain avoids a CORS preflight (sendBeacon can't preflight); the endpoint JSON-parses the text.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          ATTR_ENDPOINT,
          new Blob([json], { type: "text/plain;charset=UTF-8" })
        );
      } else {
        fetch(ATTR_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: json,
          keepalive: true,
          mode: "cors",
        });
      }
    } catch (e) {}
  }

  // ---- Form submits: capture the email, fire generate_lead (GA), beacon attribution ----
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      var emailEl =
        form.querySelector &&
        form.querySelector(
          "input[type=email], input[name*=email i], input[id*=email i]"
        );
      var email = emailEl && emailEl.value ? String(emailEl.value).trim() : "";
      track("generate_lead", { page_path: pagePath, has_email: !!email });
      if (email) beaconAttribution(email);
    },
    true
  );

  // ---- begin_checkout: clicks to checkout/booking hosts or buy-intent CTAs (GA only) ----
  var CHECKOUT_TEXT = /\b(apply|book|join|enrol|enroll|checkout|buy|secure|claim|reserve|get\s*started|pay|register|save my seat|grab)\b/i;
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest ? e.target.closest("a, button") : null;
      if (!el) return;
      var href = (el.getAttribute && el.getAttribute("href")) || "";
      if (FORWARD_HOSTS.test(href)) decorateLinks(); // re-decorate dynamically added links
      var label = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (FORWARD_HOSTS.test(href) || (CHECKOUT_TEXT.test(label) && (href || el.tagName === "BUTTON"))) {
        track("begin_checkout", { page_path: pagePath, link_url: href, link_text: label });
      }
    },
    true
  );

  // ---- Optional scroll-depth -> on-page section funnel (GA only) ----
  // Rename/extend these to match your page's sections; they power the dashboard's drop-off funnel.
  if (GA_ON) {
    var SECTIONS = [
      { pct: 0, name: "section_hero" },
      { pct: 15, name: "section_who_its_for" },
      { pct: 35, name: "section_offer" },
      { pct: 55, name: "section_pricing" },
      { pct: 75, name: "section_proof" },
      { pct: 90, name: "section_final_cta" },
    ];
    var fired = {};
    function fire(name, pct) {
      fired[name] = true;
      track(name, { page_path: pagePath, scroll_pct: pct });
    }
    fire("section_hero", 0); // top of page = seen on load
    function onScroll() {
      var doc = document.documentElement;
      var scrolled = window.scrollY || doc.scrollTop || 0;
      var max = doc.scrollHeight - doc.clientHeight || 1;
      var pct = Math.min(100, Math.round((scrolled / max) * 100));
      for (var i = 0; i < SECTIONS.length; i++) {
        var sec = SECTIONS[i];
        if (!fired[sec.name] && pct >= sec.pct) fire(sec.name, sec.pct);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("load", onScroll);
  }

  // ---- Boot ----
  captureUtms();
  window.addEventListener("load", decorateLinks);
})();
