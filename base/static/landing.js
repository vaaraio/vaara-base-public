(() => {
  const byId = (id) => document.getElementById(id);
  const pageMode = document.body && document.body.dataset ? String(document.body.dataset.page || "product").toLowerCase() : "product";
  const summaryEndpoint = document.body && document.body.dataset && document.body.dataset.summaryEndpoint
    ? String(document.body.dataset.summaryEndpoint)
    : "/api/base/public/summary";
  const protocolsEndpoint = document.body && document.body.dataset && document.body.dataset.protocolsEndpoint
    ? String(document.body.dataset.protocolsEndpoint)
    : "/api/base/public/protocols";
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const isConstrainedNetwork = () => {
    if (!connection) return false;
    if (Boolean(connection.saveData)) return true;
    const profile = String(connection.effectiveType || "").toLowerCase();
    return profile === "slow-2g" || profile === "2g";
  };
  const getSummaryPollMs = () => (isConstrainedNetwork() ? 45000 : 30000);
  const getProtocolsPollMs = () => (isConstrainedNetwork() ? 60000 : 45000);
  const getProtocolsMaxPollMs = () => (isConstrainedNetwork() ? 180000 : 120000);

  const stateLabel = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "Range";

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const formatInt = (value) => Math.round(toNumber(value, 0)).toLocaleString("en-US");

  const isPathLike = (value) => /^\s*\/[A-Za-z0-9._~\-\/]*\s*$/.test(String(value || ""));

  const cleanLabel = (value, fallback) => {
    const txt = String(value || "").trim();
    if (!txt || isPathLike(txt)) return fallback;
    return txt;
  };

  const formatTvl = (value, prefix = "TVL") => {
    const n = toNumber(value, 0);
    if (n <= 0) return "Live TVL pending";
    if (n >= 1e9) return `${prefix} $${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${prefix} $${(n / 1e6).toFixed(2)}M`;
    return `${prefix} $${n.toFixed(0)}`;
  };

  const formatTvlDelta = (value, capped) => {
    const n = toNumber(value, Number.NaN);
    if (!Number.isFinite(n)) return { text: "1D TVL change n/a", tone: "flat" };
    if (capped) return { text: "New listing", tone: "up" };
    const sign = n > 0 ? "+" : "";
    const tone = n > 0.1 ? "up" : n < -0.1 ? "down" : "flat";
    return { text: `1D TVL change ${sign}${n.toFixed(2)}%`, tone };
  };

  const pickTvl = (row) => {
    const base = toNumber(row.base_tvl_usd, NaN);
    if (Number.isFinite(base) && base > 0) return { value: base, prefix: "Base TVL" };
    const total = toNumber(row.tvl_usd, NaN);
    if (Number.isFinite(total) && total > 0) return { value: total, prefix: "TVL" };
    return null;
  };

  const parseTranslateX = (transformValue) => {
    const txt = String(transformValue || "").trim();
    if (!txt || txt === "none") return 0;
    if (txt.startsWith("matrix3d(") && txt.endsWith(")")) {
      const parts = txt
        .slice(9, -1)
        .split(",")
        .map((p) => Number(p.trim()));
      if (parts.length === 16 && Number.isFinite(parts[12])) return parts[12];
      return 0;
    }
    if (txt.startsWith("matrix(") && txt.endsWith(")")) {
      const parts = txt
        .slice(7, -1)
        .split(",")
        .map((p) => Number(p.trim()));
      if (parts.length === 6 && Number.isFinite(parts[4])) return parts[4];
    }
    return 0;
  };

  const setText = (id, value) => {
    const el = byId(id);
    if (el) el.textContent = value;
  };

  const setStateTone = (value) => {
    const el = byId("stateVal");
    if (!el) return;
    const key = String(value || "").toUpperCase();
    const classes = ["signal-value"];
    if (key.includes("UP")) classes.push("up");
    else if (key.includes("DOWN")) classes.push("down");
    else classes.push("up");
    el.className = classes.join(" ");
  };

  const drawPreviewChart = (rawActions, baseActions) => {
    const canvas = byId("proofChart");
    if (!canvas || !canvas.getContext) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 640));
    const height = Math.max(180, Math.floor(rect.height || 200));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const points = 80;
    const pad = 18;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const raw = [];
    const baseSeries = [];
    const switchGap = Math.max(0, rawActions - baseActions);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const base = 100 + t * 8;
      const rawNoise = Math.sin(i * 0.37) * 2.1 + Math.cos(i * 0.13) * 1.5;
      const baseNoise = Math.sin(i * 0.22) * 0.8 + Math.cos(i * 0.11) * 0.6;
      raw.push(base + rawNoise - t * (switchGap * 0.07));
      baseSeries.push(base + baseNoise + t * (switchGap * 0.11));
    }

    const all = raw.concat(baseSeries);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = Math.max(1, max - min);

    const xAt = (i) => pad + (i / (points - 1)) * innerW;
    const yAt = (v) => pad + innerH - ((v - min) / span) * innerH;

    const drawLine = (arr, color, widthPx) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      arr.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, innerW, innerH);

    drawLine(raw, "#ef4444", 1.5);
    drawLine(baseSeries, "#4ade80", 2);
  };

  const measureWidth = (el) => {
    if (!el) return 0;
    const rectWidth = typeof el.getBoundingClientRect === "function" ? Number(el.getBoundingClientRect().width || 0) : 0;
    return Math.max(0, toNumber(el.scrollWidth, 0), toNumber(el.offsetWidth, 0), rectWidth);
  };

  const setCoverageTone = (card, tvl, delta, tone) => {
    const nextTone = tone === "up" || tone === "down" ? tone : "flat";
    card.classList.remove("tone-up", "tone-down", "tone-flat");
    tvl.classList.remove("tone-up", "tone-down", "tone-flat");
    delta.classList.remove("up", "down", "flat");
    card.classList.add(`tone-${nextTone}`);
    tvl.classList.add(`tone-${nextTone}`);
    delta.classList.add(nextTone);
  };

  const patchCoverageCard = (card, row) => {
    if (!card || !row) return;
    const name = card.querySelector(".coverage-name");
    const badge = card.querySelector(".coverage-badge");
    const desc = card.querySelector(".coverage-desc");
    const tvl = card.querySelector(".coverage-tvl");
    const delta = card.querySelector(".coverage-delta");
    if (!name || !badge || !desc || !tvl || !delta) return;

    name.textContent = cleanLabel(row.name, "Unknown protocol");
    const slot = String(row.slot || "fixed").toLowerCase();
    const risk = String(row.risk_band || "").toLowerCase();
    const badgeClass = slot.includes("dynamic")
      ? "badge-dynamic"
      : risk === "anchor"
        ? "badge-anchor"
        : "badge-fixed";
    badge.className = `coverage-badge ${badgeClass}`;
    badge.textContent = slot.includes("dynamic") ? "Dynamic 90d" : "Fixed";

    desc.textContent = cleanLabel(row.focus, "Base protocol monitoring");
    const deltaInfo = formatTvlDelta(row.tvl_change_1d_pct, row.tvl_change_1d_capped);
    const tvlChoice = pickTvl(row || {});
    tvl.textContent = tvlChoice ? formatTvl(tvlChoice.value, tvlChoice.prefix) : "Live TVL pending";
    delta.textContent = deltaInfo.text;
    setCoverageTone(card, tvl, delta, deltaInfo.tone);
  };

  const patchRenderedProtocols = (root, protocols) => {
    if (!root || !protocols.length) return false;
    const groups = Array.from(root.querySelectorAll(".coverage-marquee-group"));
    if (!groups.length) return false;
    groups.forEach((group) => {
      Array.from(group.children).forEach((card, index) => patchCoverageCard(card, protocols[index % protocols.length]));
    });
    return true;
  };

  const renderProtocols = (payload) => {
    const root = byId("coverageGrid");
    if (!root) return;

    const protocols = payload && Array.isArray(payload.protocols) ? payload.protocols : [];
    if (!protocols.length) return;
    lastProtocolRows = protocols.slice();

    root.classList.remove("coverage-marquee");
    root.textContent = "";

    const buildCard = (row) => {
      const card = document.createElement("article");
      card.className = "coverage-card";

      const top = document.createElement("div");
      top.className = "coverage-card-top";

      const name = document.createElement("div");
      name.className = "coverage-name";
      name.textContent = cleanLabel(row.name, "Unknown protocol");

      const badge = document.createElement("span");
      const slot = String(row.slot || "fixed").toLowerCase();
      const risk = String(row.risk_band || "").toLowerCase();
      const badgeClass = slot.includes("dynamic")
        ? "badge-dynamic"
        : risk === "anchor"
          ? "badge-anchor"
          : "badge-fixed";
      badge.className = `coverage-badge ${badgeClass}`;
      badge.textContent = slot.includes("dynamic") ? "Dynamic 90d" : "Fixed";
      top.append(name, badge);

      const desc = document.createElement("div");
      desc.className = "coverage-desc";
      desc.textContent = cleanLabel(row.focus, "Base protocol monitoring");

      const tvl = document.createElement("div");
      tvl.className = "coverage-tvl";

      const delta = document.createElement("div");
      delta.className = "coverage-delta";

      card.append(top, desc, tvl, delta);
      patchCoverageCard(card, row);
      return card;
    };

    const track = document.createElement("div");
    track.className = "coverage-marquee-track";

    const buildGroup = (isClone = false) => {
      const group = document.createElement("div");
      group.className = "coverage-marquee-group";
      if (isClone) group.setAttribute("aria-hidden", "true");
      protocols.forEach((row) => group.appendChild(buildCard(row)));
      return group;
    };

    const groupA = buildGroup(false);
    const groupB = buildGroup(true);
    track.appendChild(groupA);
    track.appendChild(groupB);

    root.classList.add("coverage-marquee");
    root.appendChild(track);

    const syncTickerMetrics = (attempt = 0) => {
      const width = measureWidth(groupA);
      const viewportWidth = measureWidth(root);
      if (width <= 0 || viewportWidth <= 0) {
        if (attempt < 8) {
          window.setTimeout(() => syncTickerMetrics(attempt + 1), 120 * (attempt + 1));
        }
        return;
      }
      const cycleSec = Math.min(260, Math.max(120, width / 32));
      track.style.setProperty("--coverage-roll-sec", `${cycleSec.toFixed(1)}s`);
      track.style.removeProperty("animation-delay");
      root.dataset.coverageReady = "1";
    };
    root.__coverageSync = syncTickerMetrics;
    requestAnimationFrame(() => syncTickerMetrics(0));
    [120, 420, 1000].forEach((delay) => window.setTimeout(() => syncTickerMetrics(0), delay));
  };

  const extractProtocolRows = (payload) => {
    if (payload && Array.isArray(payload.protocols)) return payload.protocols;
    if (payload && payload.protocols && Array.isArray(payload.protocols.protocols)) return payload.protocols.protocols;
    return [];
  };

  const protocolSignature = (rows) =>
    rows
      .map((row) =>
        [
          cleanLabel(row && row.name, "Unknown protocol"),
          cleanLabel(row && row.slot, "fixed"),
          cleanLabel(row && row.risk_band, "growth"),
          cleanLabel(row && row.focus, "Base protocol monitoring"),
        ].join("|")
      )
      .join("||");

  let lastRaw = 37;
  let lastBase = 9;
  let lastProtocolRows = [];
  let lastProtocolSignature = "";
  let scrollBound = false;
  let summaryTimer = null;
  let protocolsTimer = null;
  let tickerHealthTimer = null;
  let summaryInFlight = false;
  let protocolsInFlight = false;
  let protocolsLocked = false;
  let resizeQueued = false;
  let coverageVisible = pageMode !== "product" || !("IntersectionObserver" in window);
  let protocolStableCycles = 0;

  const syncProtocolsTicker = () => {
    const root = byId("coverageGrid");
    if (!root) return;
    const sync = root.__coverageSync;
    if (typeof sync === "function") sync(0);
  };

  const ensureProtocolsTicker = () => {
    const root = byId("coverageGrid");
    if (!root || !lastProtocolRows.length) return false;
    const track = root.querySelector(".coverage-marquee-track");
    if (!track) {
      renderProtocols({ protocols: lastProtocolRows });
      return true;
    }
    const style = window.getComputedStyle(track);
    const duration = toNumber(String(style.getPropertyValue("--coverage-roll-sec") || "").replace("s", ""), Number.NaN);
    if (track.children.length !== 2 || !Number.isFinite(duration) || duration <= 0) {
      renderProtocols({ protocols: lastProtocolRows });
      return true;
    }
    if (style.animationName === "none" || style.animationPlayState === "paused") {
      syncProtocolsTicker();
      return true;
    }
    return false;
  };

  const applySummary = (demo) => {
    const state = stateLabel(demo.market_state || demo.state || "TREND_UP");
    const confidence = toNumber(demo.confidence_pct ?? demo.confidence, 0);
    const baseAction = stateLabel(demo.base_action || demo.flow_action || "HOLD").toUpperCase();
    const rawAction = stateLabel(demo.raw_action || "BUY").toUpperCase();
    const heldMin = formatInt(demo.held_minutes);
    const rawActions = formatInt(demo.raw_actions_today);
    const baseActions = formatInt(demo.base_actions_today ?? demo.flow_actions_today);
    const switches = formatInt(demo.avoided_switches);
    const costSaved = `${toNumber(demo.cost_saved_bps ?? demo.estimated_cost_saved_bps, 0).toFixed(0)} bps`;
    const proof = (demo.proof_counter && typeof demo.proof_counter === "object") ? demo.proof_counter : {};
    const firstTick = proof.first_tick_utc || proof.started_utc || "";
    let switchesSub = `Switches Avoided: ${switches}`;
    if (firstTick) {
      const dt = new Date(firstTick);
      if (Number.isFinite(dt.getTime())) {
        const mon = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        switchesSub = `Switches Avoided: ${switches} · since ${mon}`;
      }
    }

    setText("stateVal", state);
    setStateTone(state);
    setText("pairVal", demo.pair || "WETH/USDC (Base)");
    setText("confVal", `${confidence.toFixed(1)}%`);
    setText("heldVal", `Held ${heldMin} min`);
    setText("actionVal", baseAction);
    setText("rawActionVal", `Raw wanted: ${rawAction}`);
    setText("costVal", costSaved);
    setText("switchesVal", switchesSub);

    setText("costSavedHero", costSaved);
    setText("switchesHero", switches);

    lastRaw = toNumber(demo.raw_actions_today, lastRaw);
    lastBase = toNumber(demo.base_actions_today ?? demo.flow_actions_today, lastBase);
    drawPreviewChart(lastRaw, lastBase);
  };

  const refreshSummary = async () => {
    if (summaryInFlight || document.hidden || navigator.onLine === false) return;
    summaryInFlight = true;
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(summaryEndpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return;
      const payload = await res.json();
      const demo = payload && payload.demo ? payload.demo : null;
      if (!demo || demo.ok === false) return;
      applySummary(demo);
    } catch (_err) {
      // Keep last rendered values as fallback.
    } finally {
      if (timeout) clearTimeout(timeout);
      summaryInFlight = false;
    }
  };

  const refreshProtocols = async () => {
    if (protocolsLocked) return false;
    if (protocolsInFlight || !coverageVisible || document.hidden || navigator.onLine === false) return false;
    protocolsInFlight = true;
    let timeout = null;
    let changed = false;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(protocolsEndpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return;
      const payload = await res.json();
      const rows = extractProtocolRows(payload);
      if (!rows.length) return false;
      const sig = protocolSignature(rows);
      if (sig === lastProtocolSignature) {
        protocolStableCycles = Math.min(protocolStableCycles + 1, 4);
        lastProtocolRows = rows.slice();
        patchRenderedProtocols(byId("coverageGrid"), rows);
        ensureProtocolsTicker();
        return false;
      }
      protocolStableCycles = 0;
      lastProtocolSignature = sig;
      renderProtocols({ protocols: rows });
      protocolsLocked = true;
      if (protocolsTimer) {
        clearTimeout(protocolsTimer);
        protocolsTimer = null;
      }
      changed = true;
      return true;
    } catch (_err) {
      // Keep last rendered protocols as fallback.
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
      protocolsInFlight = false;
    }
  };

  const boot = () => {
    if (pageMode === "product" || pageMode === "company") {
      drawPreviewChart(lastRaw, lastBase);

      const runSummaryTick = () => {
        refreshSummary();
      };

      const runProtocolsTick = async () => {
        if (!coverageVisible || document.hidden || navigator.onLine === false) {
          scheduleProtocolsTick(Math.min(getProtocolsMaxPollMs(), Math.round(getProtocolsPollMs() * 1.5)));
          return;
        }
        const changed = await refreshProtocols();
        const nextDelay = changed
          ? getProtocolsPollMs()
          : Math.min(getProtocolsMaxPollMs(), Math.round(getProtocolsPollMs() * (1 + protocolStableCycles * 0.5)));
        scheduleProtocolsTick(nextDelay);
      };

      const scheduleSummaryPolling = () => {
        if (summaryTimer) clearInterval(summaryTimer);
        summaryTimer = setInterval(runSummaryTick, getSummaryPollMs());
      };

      const scheduleProtocolsTick = (delay = getProtocolsPollMs()) => {
        if (protocolsTimer) clearTimeout(protocolsTimer);
        protocolsTimer = setTimeout(runProtocolsTick, Math.max(15000, Math.round(delay)));
      };

      const stopPolling = () => {
        if (summaryTimer) {
          clearInterval(summaryTimer);
          summaryTimer = null;
        }
        if (protocolsTimer) {
          clearTimeout(protocolsTimer);
          protocolsTimer = null;
        }
        if (tickerHealthTimer) {
          clearInterval(tickerHealthTimer);
          tickerHealthTimer = null;
        }
      };

      const onVisibilityChange = () => {
        if (document.hidden) return;
        refreshSummary();
        if (coverageVisible && !protocolsLocked) {
          ensureProtocolsTicker();
          refreshProtocols();
          scheduleProtocolsTick(getProtocolsPollMs());
        }
      };

      const coverageProbe = byId("coverage") || byId("coverageGrid");
      if (coverageProbe && "IntersectionObserver" in window) {
        const coverageObserver = new IntersectionObserver(
          (entries) => {
            coverageVisible = entries.some((entry) => entry.isIntersecting);
            if (coverageVisible && !protocolsLocked) {
              ensureProtocolsTicker();
              refreshProtocols();
              scheduleProtocolsTick(getProtocolsPollMs());
            }
          },
          { rootMargin: "260px 0px", threshold: 0.01 }
        );
        coverageObserver.observe(coverageProbe);
      }

      const onConnectionChange = () => {
        scheduleSummaryPolling();
        if (coverageVisible && !protocolsLocked) scheduleProtocolsTick(getProtocolsPollMs());
        if (!document.hidden) {
          refreshSummary();
          if (coverageVisible && !protocolsLocked) {
            ensureProtocolsTicker();
            refreshProtocols();
          }
        }
      };

      refreshSummary();
      scheduleSummaryPolling();

      if (coverageVisible && !protocolsLocked) {
        ensureProtocolsTicker();
        refreshProtocols();
      }

      if (!protocolsLocked) {
        scheduleProtocolsTick(coverageVisible ? getProtocolsPollMs() : Math.min(getProtocolsMaxPollMs(), getProtocolsPollMs() * 2));
      }
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("online", onConnectionChange);
      window.addEventListener("pagehide", stopPolling);
      window.addEventListener("pageshow", onVisibilityChange);
      if (connection && typeof connection.addEventListener === "function") {
        connection.addEventListener("change", onConnectionChange);
      }
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(() => {
          drawPreviewChart(lastRaw, lastBase);
          syncProtocolsTicker();
        });
      }
      tickerHealthTimer = window.setInterval(() => {
        if (coverageVisible && !document.hidden) ensureProtocolsTicker();
      }, 20000);
      window.addEventListener("resize", () => {
        if (resizeQueued) return;
        resizeQueued = true;
        window.requestAnimationFrame(() => {
          resizeQueued = false;
          drawPreviewChart(lastRaw, lastBase);
          syncProtocolsTicker();
        });
      });
    }

    if (!scrollBound) {
      const setScrollState = () => {
        document.body.classList.toggle("is-scrolled", window.scrollY > 8);
      };
      window.addEventListener("scroll", setScrollState, { passive: true });
      setScrollState();
      scrollBound = true;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
