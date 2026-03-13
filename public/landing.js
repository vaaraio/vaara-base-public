(() => {
  const byId = (id) => document.getElementById(id);
  const pageMode = document.body && document.body.dataset ? String(document.body.dataset.page || "product").toLowerCase() : "product";
  const summaryEndpoint = "/api/flow/public/summary";
  const protocolsEndpoint = "/api/flow/public/protocols";

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

  const formatTvlDelta = (value) => {
    const n = toNumber(value, Number.NaN);
    if (!Number.isFinite(n)) return { text: "1D TVL delta n/a", tone: "flat" };
    const sign = n > 0 ? "+" : "";
    const tone = n > 0.1 ? "up" : n < -0.1 ? "down" : "flat";
    return { text: `1D TVL delta ${sign}${n.toFixed(2)}%`, tone };
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

  const drawPreviewChart = (rawActions, flowActions) => {
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
    const flow = [];
    const switchGap = Math.max(0, rawActions - flowActions);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const base = 100 + t * 8;
      const rawNoise = Math.sin(i * 0.37) * 2.1 + Math.cos(i * 0.13) * 1.5;
      const flowNoise = Math.sin(i * 0.22) * 0.8 + Math.cos(i * 0.11) * 0.6;
      raw.push(base + rawNoise - t * (switchGap * 0.07));
      flow.push(base + flowNoise + t * (switchGap * 0.11));
    }

    const all = raw.concat(flow);
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
    drawLine(flow, "#4ade80", 2);
  };

  const renderProtocols = (payload) => {
    const root = byId("coverageGrid");
    if (!root) return;

    const protocols = payload && Array.isArray(payload.protocols) ? payload.protocols : [];
    if (!protocols.length) return;

    const existingTrack = root.querySelector(".coverage-marquee-track");
    let priorPhase = null;
    if (existingTrack) {
      const style = window.getComputedStyle(existingTrack);
      const prevDistance = toNumber(style.getPropertyValue("--coverage-roll-distance").replace("px", ""), Number.NaN);
      const tx = Math.abs(parseTranslateX(style.transform));
      if (Number.isFinite(prevDistance) && prevDistance > 0) {
        priorPhase = (tx % prevDistance) / prevDistance;
      }
    }

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

      const deltaInfo = formatTvlDelta(row.tvl_change_1d_pct);
      const tvl = document.createElement("div");
      tvl.className = "coverage-tvl";
      const tvlChoice = pickTvl(row || {});
      tvl.textContent = tvlChoice ? formatTvl(tvlChoice.value, tvlChoice.prefix) : "Live TVL pending";
      tvl.classList.add(`tone-${deltaInfo.tone}`);
      card.classList.add(`tone-${deltaInfo.tone}`);

      const delta = document.createElement("div");
      delta.className = `coverage-delta ${deltaInfo.tone}`;
      delta.textContent = deltaInfo.text;

      card.append(top, desc, tvl, delta);
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
    track.appendChild(groupA);

    root.classList.add("coverage-marquee");
    root.appendChild(track);

    const syncTickerMetrics = () => {
      const width = Math.max(0, Number(groupA.getBoundingClientRect().width || groupA.scrollWidth || 0));
      const viewportWidth = Math.max(0, Number(root.getBoundingClientRect().width || root.clientWidth || 0));
      if (width <= 0 || viewportWidth <= 0) return;
      const requiredGroups = Math.max(2, Math.ceil(viewportWidth / width) + 2);
      while (track.children.length < requiredGroups) {
        track.appendChild(buildGroup(true));
      }
      while (track.children.length > requiredGroups) {
        track.removeChild(track.lastElementChild);
      }
      track.style.setProperty("--coverage-roll-distance", `${width}px`);
      const cycleSec = Math.min(260, Math.max(84, width / 36));
      track.style.setProperty("--coverage-roll-sec", `${cycleSec.toFixed(1)}s`);
      if (Number.isFinite(priorPhase)) {
        track.style.animationDelay = `${(-1 * priorPhase * cycleSec).toFixed(3)}s`;
      }
    };
    requestAnimationFrame(syncTickerMetrics);
    setTimeout(syncTickerMetrics, 120);
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
          toNumber(row && row.base_tvl_usd, 0).toFixed(2),
          toNumber(row && row.tvl_usd, 0).toFixed(2),
          toNumber(row && row.tvl_change_1d_pct, 0).toFixed(2),
        ].join("|")
      )
      .join("||");

  let lastRaw = 37;
  let lastFlow = 9;
  let lastProtocolSignature = "";
  let scrollBound = false;
  let summaryTimer = null;
  let protocolsTimer = null;

  const applySummary = (demo) => {
    const state = stateLabel(demo.market_state || demo.state || "TREND_UP");
    const confidence = toNumber(demo.confidence_pct ?? demo.confidence, 72.4);
    const flowAction = stateLabel(demo.flow_action || "HOLD").toUpperCase();
    const rawAction = stateLabel(demo.raw_action || "BUY").toUpperCase();
    const heldMin = formatInt(demo.held_minutes);
    const rawActions = formatInt(demo.raw_actions_today);
    const flowActions = formatInt(demo.flow_actions_today);
    const switches = formatInt(demo.avoided_switches);
    const costSaved = `${toNumber(demo.cost_saved_bps ?? demo.estimated_cost_saved_bps, 84).toFixed(0)} bps`;

    setText("stateVal", state);
    setStateTone(state);
    setText("pairVal", demo.pair || "WETH/USDC (Base)");
    setText("confVal", `${confidence.toFixed(1)}%`);
    setText("heldVal", `Held ${heldMin} min`);
    setText("actionVal", flowAction);
    setText("rawActionVal", `Raw wanted: ${rawAction}`);
    setText("costVal", costSaved);
    setText("switchesVal", `Switches Avoided: ${switches}`);

    setText("rawActionsVal", rawActions);
    setText("flowActionsVal", flowActions);
    setText("switchesMetricVal", switches);
    setText("costMetricVal", costSaved);
    setText("costSavedHero", costSaved);
    setText("switchesHero", switches);

    lastRaw = toNumber(demo.raw_actions_today, lastRaw);
    lastFlow = toNumber(demo.flow_actions_today, lastFlow);
    drawPreviewChart(lastRaw, lastFlow);
  };

  const refreshSummary = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(summaryEndpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return;
      const payload = await res.json();
      const demo = payload && payload.demo ? payload.demo : null;
      if (!demo || demo.ok === false) return;
      applySummary(demo);
    } catch (_err) {
      // Keep last rendered values as fallback.
    }
  };

  const refreshProtocols = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(protocolsEndpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return;
      const payload = await res.json();
      const rows = extractProtocolRows(payload);
      if (!rows.length) return;
      const sig = protocolSignature(rows);
      if (sig === lastProtocolSignature) return;
      lastProtocolSignature = sig;
      renderProtocols({ protocols: rows });
    } catch (_err) {
      // Keep last rendered protocols as fallback.
    }
  };

  const boot = () => {
    if (pageMode === "product") {
      drawPreviewChart(lastRaw, lastFlow);

      const runSummaryTick = () => {
        if (document.hidden) return;
        refreshSummary();
      };

      const runProtocolsTick = () => {
        if (document.hidden) return;
        refreshProtocols();
      };

      const startPolling = () => {
        if (summaryTimer) clearInterval(summaryTimer);
        if (protocolsTimer) clearInterval(protocolsTimer);
        summaryTimer = setInterval(runSummaryTick, 30000);
        protocolsTimer = setInterval(runProtocolsTick, 45000);
      };

      const stopPolling = () => {
        if (summaryTimer) {
          clearInterval(summaryTimer);
          summaryTimer = null;
        }
        if (protocolsTimer) {
          clearInterval(protocolsTimer);
          protocolsTimer = null;
        }
      };

      const onVisibilityChange = () => {
        if (document.hidden) return;
        refreshSummary();
        refreshProtocols();
      };

      refreshSummary();
      refreshProtocols();
      startPolling();
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", stopPolling);
      window.addEventListener("resize", () => drawPreviewChart(lastRaw, lastFlow));
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
