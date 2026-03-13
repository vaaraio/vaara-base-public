(() => {
  const $ = (id) => document.getElementById(id);
  const summaryEndpoint = (() => {
    const fromBody = document.body ? String(document.body.dataset.summaryEndpoint || "").trim() : "";
    return fromBody || "/api/flow/summary";
  })();
  const surfaceMode = (() => {
    const fromBody = document.body ? String(document.body.dataset.surfaceMode || "").trim() : "";
    return (fromBody || "app").toLowerCase();
  })();
  const protocolsEndpoint = (() => {
    const fromBody = document.body ? String(document.body.dataset.protocolsEndpoint || "").trim() : "";
    if (fromBody) return fromBody;
    return surfaceMode === "demo" ? "/api/flow/public/protocols" : "/api/flow/protocols";
  })();

  const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const titleCase = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const toDisplayState = (value) => {
    const txt = titleCase(value);
    return txt || "Range";
  };

  const isPathLike = (value) => /^\s*\/[A-Za-z0-9._~\-\/]*\s*$/.test(String(value || ""));

  const cleanLabel = (value, fallback) => {
    const txt = String(value || "").trim();
    if (!txt) return fallback;
    if (isPathLike(txt)) return fallback;
    return txt;
  };

  const formatInt = (value) => Math.round(toNum(value, 0)).toLocaleString("en-US");

  const compactUtc = (value) => {
    const txt = String(value || "").trim();
    if (!txt) return "n/a";
    const dt = new Date(txt);
    if (!Number.isFinite(dt.getTime())) return txt;
    const iso = dt.toISOString();
    return `${iso.slice(0, 16).replace("T", " ")} UTC`;
  };

  const formatSignedPct = (value) => {
    const n = toNum(value, 0);
    const abs = Math.abs(n).toFixed(2);
    if (n > 0) return `+${abs}%`;
    if (n < 0) return `-${abs}%`;
    return `${abs}%`;
  };

  const formatTvl = (value, prefix = "TVL") => {
    const n = toNum(value, 0);
    if (n <= 0) return "Live TVL pending";
    if (n >= 1e9) return `${prefix} $${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${prefix} $${(n / 1e6).toFixed(2)}M`;
    return `${prefix} $${n.toFixed(0)}`;
  };

  const formatTvlDelta = (value) => {
    const n = toNum(value, Number.NaN);
    if (!Number.isFinite(n)) return { text: "1D TVL flow n/a", tone: "flat" };
    const sign = n > 0 ? "+" : "";
    const tone = n > 0.1 ? "up" : n < -0.1 ? "down" : "flat";
    return { text: `1D TVL flow ${sign}${n.toFixed(2)}%`, tone };
  };

  const pickTvl = (row) => {
    const base = toNum(row.base_tvl_usd, NaN);
    if (Number.isFinite(base) && base > 0) {
      return { value: base, prefix: "Base TVL" };
    }
    const total = toNum(row.tvl_usd, NaN);
    if (Number.isFinite(total) && total > 0) {
      return { value: total, prefix: "TVL" };
    }
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
    const el = $(id);
    if (el) el.textContent = String(value);
  };

  const setSignalState = (value) => {
    const el = $("marketState");
    if (!el) return;
    const key = String(value || "").toUpperCase();
    el.textContent = toDisplayState(value);
    el.className = "signal-value";
    if (key.includes("DOWN")) el.classList.add("down");
    else el.classList.add("up");
  };

  const setActionClasses = (signalId, wideId, action) => {
    const value = String(action || "HOLD").toUpperCase();
    const tone = value === "SELL" ? "down" : "up";
    const signal = $(signalId);
    const wide = $(wideId);

    if (signal) {
      signal.textContent = value;
      signal.className = `signal-value ${tone}`;
    }

    if (wide) {
      const cls = value === "SELL" ? "sell" : "buy";
      wide.textContent = value;
      wide.className = `action-value ${cls}`;
    }
  };

  const normalizeAction = (value) => {
    const action = String(value || "HOLD").toUpperCase();
    if (action === "BUY" || action === "SELL" || action === "HOLD") return action;
    return "HOLD";
  };

  const buildRationale = (demo, confidencePct) => {
    const raw = normalizeAction(demo.raw_action);
    const flow = normalizeAction(demo.flow_action);
    const heldMin = formatInt(demo.held_minutes);
    const marketState = toDisplayState(demo.market_state || "RANGE");
    const confidence = `${toNum(confidencePct, 0).toFixed(1)}%`;

    if (raw === flow) {
      if (flow === "HOLD") {
        return `Raw and Vaara both stay HOLD while ${marketState.toLowerCase()} conditions continue to develop.`;
      }
      return `Raw and Vaara both commit ${flow}; confidence ${confidence} justifies the switch.`;
    }

    if (flow === "HOLD") {
      return `Raw wanted ${raw}, but Vaara stayed HOLD for ${heldMin} min because confidence ${confidence} does not yet justify the switch cost.`;
    }

    return `Raw wanted ${raw}, Vaara committed ${flow} after hold and cost gates; ${marketState} conditions plus ${confidence} cleared the switch.`;
  };

  const buildFlowActionLogic = (demo) => {
    const raw = normalizeAction(demo.raw_action);
    const flow = normalizeAction(demo.flow_action);
    const heldMin = formatInt(demo.held_minutes);

    if (raw === flow) {
      if (flow === "HOLD") return `Preserved prior position via stateful selector (${heldMin} min hold).`;
      return "Committed via stateful selector confirmation.";
    }
    if (flow === "HOLD") return `Preserved prior position to avoid churn (${heldMin} min hold).`;
    return "Committed action filtered from raw signal.";
  };

  const buildActionSupport = (demo) => {
    const raw = normalizeAction(demo.raw_action);
    const flow = normalizeAction(demo.flow_action);
    const confidence = `${toNum(demo.confidence_pct, 0).toFixed(1)}%`;

    if (raw === flow) {
      if (flow === "HOLD") return "Switch rejected on insufficient evidence delta.";
      return `Switch accepted after evidence and cost gates (confidence ${confidence}).`;
    }
    if (flow === "HOLD") return `Switch rejected on insufficient evidence delta (confidence ${confidence}).`;
    return `Committed after evidence cleared hold and cost gates (confidence ${confidence}).`;
  };

  const setContextTone = (id, value) => {
    const el = $(id);
    if (!el) return;
    const key = String(value || "").toUpperCase();
    el.textContent = toDisplayState(value);
    el.className = "context-val";
    if (key.includes("DOWN")) el.classList.add("down");
    if (key.includes("UP")) el.classList.add("up");
  };

  const setMomentum = (id, value) => {
    const el = $(id);
    if (!el) return;
    const n = toNum(value, 0);
    el.textContent = formatSignedPct(n);
    el.className = "mom-val";
    if (n < 0) el.classList.add("neg");
    if (n > 0) el.classList.add("pos");
  };

  const drawLineChart = (canvas, _labels, raw, flow) => {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 220));
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.min(raw.length, flow.length);
    if (n < 2) return;

    const rawSeries = raw.slice(raw.length - n).map((v) => toNum(v, NaN));
    const flowSeries = flow.slice(flow.length - n).map((v) => toNum(v, NaN));
    const all = [...rawSeries, ...flowSeries].filter((v) => Number.isFinite(v));
    if (all.length < 2) return;

    const w = cssW;
    const h = cssH;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = Math.max(1e-9, max - min);
    const padX = 10;
    const padY = 10;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const xAt = (i) => padX + (i / (n - 1)) * plotW;
    const yAt = (v) => h - padY - ((v - min) / span) * plotH;

    const drawSeries = (arr, color, width) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
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

    const isDemoSurface = chartRenderProfile === "demo";
    const rawStyle = isDemoSurface
      ? { color: "rgba(139, 46, 46, 0.68)", width: 1.55 }
      : { color: "#8B2E2E", width: 1.7 };
    const flowStyle = isDemoSurface
      ? { color: "rgba(120, 160, 138, 0.68)", width: 1.55 }
      : { color: "#4A8C5C", width: 2.2 };

    drawSeries(rawSeries, rawStyle.color, rawStyle.width);
    drawSeries(flowSeries, flowStyle.color, flowStyle.width);
  };

  const buildPublicPreviewChart = (demo) => {
    const points = 90;
    const labels = [];
    const raw = [];
    const flow = [];
    const rawActions = toNum(demo.raw_actions_today, 0);
    const flowActions = toNum(demo.flow_actions_today, 0);
    const saved = toNum(demo.cost_saved_bps, 0);
    const switchGap = Math.max(0, rawActions - flowActions);
    const spread = Math.min(0.03, 0.004 + switchGap * 0.00018 + saved * 0.00002);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const drift = 1 + t * 0.02;
      const n1 = Math.sin(i * 0.22) * 0.0016 + Math.cos(i * 0.09) * 0.0008;
      const n2 = Math.sin(i * 0.19) * 0.0011 + Math.cos(i * 0.07) * 0.0007;
      raw.push(drift + n1 - t * spread * 0.65);
      flow.push(drift + n2 + t * spread);
      labels.push(String(i + 1));
    }
    return { labels, raw, flow };
  };

  const smoothSeries = (series, radius = 2) => {
    const arr = Array.isArray(series) ? series.map((v) => toNum(v, NaN)) : [];
    if (arr.length < 3) return arr;
    return arr.map((_, idx) => {
      let sum = 0;
      let count = 0;
      for (let off = -radius; off <= radius; off += 1) {
        const j = idx + off;
        if (j < 0 || j >= arr.length) continue;
        const v = arr[j];
        if (!Number.isFinite(v)) continue;
        sum += v;
        count += 1;
      }
      return count > 0 ? sum / count : arr[idx];
    });
  };

  const compressVariance = (series, factor = 0.72) => {
    const arr = Array.isArray(series) ? series.map((v) => toNum(v, NaN)) : [];
    if (arr.length < 2) return arr;
    const finite = arr.filter((v) => Number.isFinite(v));
    if (!finite.length) return arr;
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    return arr.map((v) => (Number.isFinite(v) ? mean + (v - mean) * factor : v));
  };

  const downsampleAligned = (labels, raw, flow, targetPoints = 20) => {
    const n = Math.min(labels.length, raw.length, flow.length);
    if (n <= targetPoints || n < 2) {
      return {
        labels: labels.slice(0, n),
        raw: raw.slice(0, n),
        flow: flow.slice(0, n),
      };
    }
    const outL = [];
    const outR = [];
    const outF = [];
    const step = (n - 1) / Math.max(1, targetPoints - 1);
    for (let i = 0; i < targetPoints; i += 1) {
      const idx = Math.min(n - 1, Math.round(i * step));
      outL.push(labels[idx]);
      outR.push(raw[idx]);
      outF.push(flow[idx]);
    }
    return { labels: outL, raw: outR, flow: outF };
  };

  const toDemoPreviewSeries = (labels, rawSeries, flowSeries) => {
    const down = downsampleAligned(labels, rawSeries, flowSeries, 20);
    const rawSm = compressVariance(smoothSeries(down.raw, 2), 0.72).map((v) => Number(toNum(v, 0).toFixed(4)));
    const flowSm = compressVariance(smoothSeries(down.flow, 2), 0.72).map((v) => Number(toNum(v, 0).toFixed(4)));
    return { labels: down.labels, raw: rawSm, flow: flowSm };
  };

  let lastChart = { labels: [], raw: [], flow: [] };
  let lastProtocolSignature = "";
  let chartRenderProfile = surfaceMode === "demo" ? "demo" : "app";
  let scrollBound = false;

  const redrawChart = () => {
    drawLineChart($("deltaChart"), lastChart.labels, lastChart.raw, lastChart.flow);
  };

  const bindScrollState = () => {
    if (scrollBound) return;
    const setScrollState = () => {
      document.body.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", setScrollState, { passive: true });
    setScrollState();
    scrollBound = true;
  };

  const renderDemo = (demo) => {
    const pair = demo.pair || "WETH/USDC (Base)";
    const confidence = toNum(demo.confidence_pct, 0);
    const rawAction = String(demo.raw_action || "HOLD").toUpperCase();
    const flowAction = String(demo.flow_action || "HOLD").toUpperCase();
    const heldMin = formatInt(demo.held_minutes);
    const rawActions = formatInt(demo.raw_actions_today);
    const flowActions = formatInt(demo.flow_actions_today);
    const switches = formatInt(demo.avoided_switches);
    const savedBps = `${toNum(demo.cost_saved_bps, 0).toFixed(1)} bps`;

    setText("pairName", pair);
    setText("pairNameContext", pair);
    setText("pairNameContextMirror", pair);
    setSignalState(demo.market_state || "RANGE");
    setText("heldMinutes", heldMin);
    setText("confidencePct", `${confidence.toFixed(1)}%`);
    setText("confidencePctWide", `${confidence.toFixed(1)}%`);

    const confidenceStatus =
      confidence >= 75 ? "High conviction" : confidence >= 55 ? "Moderate conviction" : "Low conviction";
    setText("confidenceStatus", confidenceStatus);

    const confFill = $("confidenceFill");
    if (confFill) confFill.style.width = `${Math.max(0, Math.min(confidence, 100)).toFixed(1)}%`;

    setActionClasses("flowAction", "flowActionWide", flowAction);
    setActionClasses("rawAction", "rawActionWide", rawAction);

    setText("rawActionsToday", rawActions);
    setText("flowActionsToday", flowActions);
    setText("avoidedSwitches", switches);
    setText("avoidedSwitchesWide", switches);
    setText("costSavedBps", savedBps);
    setText("costSavedBpsWide", savedBps);

    const isPublicDemo = surfaceMode === "demo" || Boolean(demo.public_safe_mode);
    setText("flowActionLogic", buildFlowActionLogic(demo));
    setText("flowActionDemoHint", isPublicDemo ? "Public preview: detailed decision-layer logic is intentionally limited." : "");
    setText("flowRationale", buildRationale(demo, confidence));
    setText(
      "flowRationaleDemo",
      isPublicDemo ? "Public-safe surface: delayed, aggregated outcomes only. Private live surface shows full switch rationale." : ""
    );
    setText("actionSupport", buildActionSupport(demo));

    const proof = demo.proof_counter || {};
    const ds = demo.data_source || {};
    const freshness = demo.data_freshness || {};

    const signalSource = String(ds.signal_source || "heuristic");
    const signalSymbol = String(ds.signal_symbol || "");
    const signalCoverage = toNum(ds.signal_coverage_pct, NaN);
    setText("pilotSignalSource", signalSource === "ml_packets" ? "ML packets" : titleCase(signalSource || "heuristic"));
    if (Number.isFinite(signalCoverage)) {
      setText("pilotSignalCoverage", `${signalCoverage.toFixed(0)}% matched`);
    } else if (signalSource === "ml_packets") {
      setText("pilotSignalCoverage", "0% matched");
    } else {
      setText("pilotSignalCoverage", "Live source");
    }
    setText("pilotCounterStart", compactUtc(proof.first_tick_utc || proof.started_utc));
    setText("pilotLastTick", compactUtc(freshness.last_live_tick_utc || demo.updated_utc));

    const mode = String(proof.mode || "live_from_first_tick");
    const seedLabel = String(proof.seed_label || "");
    let proofModeText = "Live counters begin on first Coinbase tick.";
    if (mode === "seeded_estimate_plus_live") {
      proofModeText = seedLabel
        ? `Seeded baseline + live updates: ${seedLabel}`
        : "Seeded baseline + live updates (estimated baseline)";
    }
    if (isPublicDemo) {
      proofModeText = "Public preview · delayed + aggregated · read-only metrics.";
    } else {
      if (signalSource === "ml_packets") {
        const covSuffix = Number.isFinite(signalCoverage) ? ` · ${signalCoverage.toFixed(0)}% matched` : "";
        proofModeText += signalSymbol ? ` · Decision layer: ML packets (${signalSymbol})${covSuffix}` : ` · Decision layer: ML packets${covSuffix}`;
      } else {
        proofModeText += " · Decision layer: heuristic";
      }
    }
    setText("proofMode", proofModeText);

    setContextTone("trendAlignment", demo.trend_alignment || "MIXED");
    setContextTone("volumeRegime", demo.volume_regime || "NORM");
    setContextTone("breakoutState", demo.breakout_signal || "NONE");

    const mom = demo.momentum_confluence || {};
    setMomentum("mom5", mom.m5_pct);
    setMomentum("mom15", mom.m15_pct);
    setMomentum("mom60", mom.m60_pct);

    const chart = demo.chart || {};
    let labels = Array.isArray(chart.labels) ? chart.labels : [];
    let rawSeries = Array.isArray(chart.raw_equity) ? chart.raw_equity : [];
    let flowSeries = Array.isArray(chart.flow_equity) ? chart.flow_equity : [];
    const shouldUsePreview = labels.length < 8 || rawSeries.length < 8 || flowSeries.length < 8;
    if (shouldUsePreview) {
      const preview = buildPublicPreviewChart(demo);
      labels = preview.labels;
      rawSeries = preview.raw;
      flowSeries = preview.flow;
    }
    chartRenderProfile = isPublicDemo ? "demo" : "app";
    if (isPublicDemo) {
      const previewSeries = toDemoPreviewSeries(labels, rawSeries, flowSeries);
      labels = previewSeries.labels;
      rawSeries = previewSeries.raw;
      flowSeries = previewSeries.flow;
    }
    lastChart = {
      labels,
      raw: rawSeries,
      flow: flowSeries,
    };
    redrawChart();
  };

  const renderProtocols = (payload) => {
    const root = $("coverageStrip");
    if (!root) return;

    const protocols = payload && Array.isArray(payload.protocols) ? payload.protocols : [];
    if (!protocols.length) return;

    const existingTrack = root.querySelector(".coverage-marquee-track");
    let priorPhase = null;
    if (existingTrack) {
      const style = window.getComputedStyle(existingTrack);
      const prevDistance = toNum(style.getPropertyValue("--coverage-roll-distance").replace("px", ""), Number.NaN);
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
      const cycleSec =
        surfaceMode === "demo" ? Math.min(320, Math.max(112, width / 30)) : Math.min(240, Math.max(78, width / 38));
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
          toNum(row && row.base_tvl_usd, 0).toFixed(2),
          toNum(row && row.tvl_usd, 0).toFixed(2),
          toNum(row && row.tvl_change_1d_pct, 0).toFixed(2),
        ].join("|")
      )
      .join("||");

  let summaryTimer = null;
  let protocolsTimer = null;

  const renderError = (msg) => {
    const stateEl = $("marketState");
    if (stateEl) {
      stateEl.textContent = "Unavailable";
      stateEl.className = "signal-value down";
    }
    setText("lastUpdated", String(msg || "Vaara feed unavailable"));
  };

  const formatAge = (ageSec) => {
    if (!Number.isFinite(ageSec) || ageSec < 0) return "";
    if (ageSec < 60) return `${Math.floor(ageSec)}s`;
    const mins = Math.floor(ageSec / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const refreshSummary = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const r = await fetch(summaryEndpoint, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const demo = payload.demo || {};

      if (!demo.ok) {
        renderError(demo.message || "Vaara feed unavailable");
        return;
      }

      renderDemo(demo);

      const freshness = demo.data_freshness || {};
      const ageSec = Number(freshness.age_sec);
      const ageText = formatAge(ageSec);
      const source = String(freshness.source || "live");
      const stale = Boolean(freshness.stale);
      const isPublicDemo = surfaceMode === "demo" || Boolean(demo.public_safe_mode);
      let signalTag = "";
      if (!isPublicDemo) {
        const ds = demo.data_source || {};
        const signalSource = String(ds.signal_source || "heuristic");
        signalTag = signalSource === "ml_packets" ? "Decision layer ML" : "Decision layer heuristic";
      }

      let statusText = `Updated ${demo.updated_utc || payload.updated_utc || ""}`;
      if (source === "cached_fallback" && ageText) {
        statusText = `Fallback cache active · ${ageText} old`;
      } else if (stale && ageText) {
        statusText = `Live feed stale · ${ageText} old`;
      } else if (source === "live" && ageText) {
        statusText = `Updated ${ageText} ago`;
      }
      if (isPublicDemo && source === "live" && ageText) {
        statusText = `Public preview · delayed ${ageText}`;
      }
      if (signalTag) {
        statusText = `${statusText} · ${signalTag}`;
      }
      setText("lastUpdated", statusText);
    } catch (err) {
      renderError(`Vaara fetch error: ${String(err)}`);
    }
  };

  const refreshProtocols = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const r = await fetch(protocolsEndpoint, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) return;
      const payload = await r.json();
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
    bindScrollState();

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
    window.addEventListener("resize", redrawChart);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
