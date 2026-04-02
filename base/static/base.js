(() => {
  const $ = (id) => document.getElementById(id);
  const summaryEndpoint = (() => {
    const fromBody = document.body ? String(document.body.dataset.summaryEndpoint || "").trim() : "";
    return fromBody || "/api/base/summary";
  })();
  const surfaceMode = (() => {
    const fromBody = document.body ? String(document.body.dataset.surfaceMode || "").trim() : "";
    return (fromBody || "app").toLowerCase();
  })();
  const protocolsEndpoint = (() => {
    const fromBody = document.body ? String(document.body.dataset.protocolsEndpoint || "").trim() : "";
    if (fromBody) return fromBody;
    return surfaceMode === "demo" ? "/api/base/public/protocols" : "/api/base/protocols";
  })();
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

  const formatTvlDelta = (value, capped) => {
    const n = toNum(value, Number.NaN);
    if (!Number.isFinite(n)) return { text: "1D TVL change n/a", tone: "flat" };
    if (capped) return { text: "New listing", tone: "up" };
    const sign = n > 0 ? "+" : "";
    const tone = n > 0.1 ? "up" : n < -0.1 ? "down" : "flat";
    return { text: `1D TVL change ${sign}${n.toFixed(2)}%`, tone };
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
    const baseAction = normalizeAction(demo.base_action || demo.flow_action);
    const heldMin = formatInt(demo.held_minutes);
    const marketState = toDisplayState(demo.market_state || "RANGE");
    const confidence = `${toNum(confidencePct, 0).toFixed(1)}%`;

    if (raw === baseAction) {
      if (baseAction === "HOLD") {
        return `Raw and Base both stay HOLD while ${marketState.toLowerCase()} conditions continue to develop.`;
      }
      return `Raw and Base both commit ${baseAction}; confidence ${confidence} justifies the switch.`;
    }

    if (baseAction === "HOLD") {
      return `Raw wanted ${raw}, but Base stayed HOLD for ${heldMin} min because confidence ${confidence} does not yet justify the switch cost.`;
    }

    return `Raw wanted ${raw}, Base committed ${baseAction} after hold and cost gates; ${marketState} conditions plus ${confidence} cleared the switch.`;
  };

  const buildBaseActionLogic = (demo) => {
    const raw = normalizeAction(demo.raw_action);
    const baseAction = normalizeAction(demo.base_action || demo.flow_action);
    const heldMin = formatInt(demo.held_minutes);

    if (raw === baseAction) {
      if (baseAction === "HOLD") return `Preserved prior position via stateful selector (${heldMin} min hold).`;
      return "Committed via stateful selector confirmation.";
    }
    if (baseAction === "HOLD") return `Preserved prior position to avoid churn (${heldMin} min hold).`;
    return "Committed action filtered from raw signal.";
  };

  const buildActionSupport = (demo) => {
    const raw = normalizeAction(demo.raw_action);
    const baseAction = normalizeAction(demo.base_action || demo.flow_action);
    const confidence = `${toNum(demo.confidence_pct, 0).toFixed(1)}%`;

    if (raw === baseAction) {
      if (baseAction === "HOLD") return "Switch rejected on insufficient evidence delta.";
      return `Switch accepted after evidence and cost gates (confidence ${confidence}).`;
    }
    if (baseAction === "HOLD") return `Switch rejected on insufficient evidence delta (confidence ${confidence}).`;
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

  const setMomentum = (id, value, options = {}) => {
    const el = $(id);
    if (!el) return;
    if (options.redacted) {
      el.textContent = "Redacted";
      el.className = "mom-val redacted";
      return;
    }
    const n = toNum(value, 0);
    el.textContent = formatSignedPct(n);
    el.className = "mom-val";
    if (n < 0) el.classList.add("neg");
    if (n > 0) el.classList.add("pos");
  };

  const drawLineChart = (canvas, _labels, raw, baseSeriesInput) => {
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

    const n = Math.min(raw.length, baseSeriesInput.length);
    if (n < 2) return;

    const rawSeries = raw.slice(raw.length - n).map((v) => toNum(v, NaN));
    const baseSeries = baseSeriesInput.slice(baseSeriesInput.length - n).map((v) => toNum(v, NaN));
    const all = [...rawSeries, ...baseSeries].filter((v) => Number.isFinite(v));
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
    const baseStyle = isDemoSurface
      ? { color: "rgba(120, 160, 138, 0.68)", width: 1.55 }
      : { color: "#4A8C5C", width: 2.2 };

    drawSeries(rawSeries, rawStyle.color, rawStyle.width);
    drawSeries(baseSeries, baseStyle.color, baseStyle.width);
  };

  const buildPublicPreviewChart = (demo) => {
    const points = 90;
    const labels = [];
    const raw = [];
    const base = [];
    const rawActions = toNum(demo.raw_actions_today, 0);
    const baseActions = toNum(demo.base_actions_today ?? demo.flow_actions_today, 0);
    const saved = toNum(demo.cost_saved_bps, 0);
    const confidence = Math.max(0, Math.min(100, toNum(demo.confidence_pct, 50)));
    const conviction = confidence / 100;
    const marketState = String(demo.market_state || demo.state || "RANGE").toUpperCase();
    const stateBias = marketState.includes("UP") ? 0.35 : marketState.includes("DOWN") ? -0.35 : 0;
    const switchGap = Math.max(0, rawActions - baseActions);
    const spread = Math.min(0.024, 0.003 + switchGap * 0.00011 + saved * 0.000014);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const sharedWave = Math.sin(i * 0.27) * 0.0024 + Math.cos(i * 0.11) * 0.0012 + Math.sin(i * 0.53) * 0.0008;
      const rawNoise = sharedWave + Math.sin(i * 0.17 + 0.8) * 0.0009;
      const baseNoise = sharedWave * 0.82 + Math.cos(i * 0.13 + 0.4) * 0.0007;
      const rawTrend = 1 + t * (0.009 + stateBias * 0.003 - spread * 0.02);
      const baseTrend = 1 + t * (0.011 + stateBias * 0.003 + spread * 0.55);
      raw.push(rawTrend + rawNoise * (1.0 + (1 - conviction) * 0.25));
      base.push(baseTrend + baseNoise * (0.8 + conviction * 0.12));
      labels.push(String(i + 1));
    }
    return { labels, raw, base };
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

  const downsampleAligned = (labels, raw, baseSeries, targetPoints = 20) => {
    const n = Math.min(labels.length, raw.length, baseSeries.length);
    if (n <= targetPoints || n < 2) {
      return {
        labels: labels.slice(0, n),
        raw: raw.slice(0, n),
        base: baseSeries.slice(0, n),
      };
    }
    const outL = [];
    const outR = [];
    const outB = [];
    const step = (n - 1) / Math.max(1, targetPoints - 1);
    for (let i = 0; i < targetPoints; i += 1) {
      const idx = Math.min(n - 1, Math.round(i * step));
      outL.push(labels[idx]);
      outR.push(raw[idx]);
      outB.push(baseSeries[idx]);
    }
    return { labels: outL, raw: outR, base: outB };
  };

  const toDemoPreviewSeries = (labels, rawSeries, baseSeries) => {
    const down = downsampleAligned(labels, rawSeries, baseSeries, 20);
    const rawSm = compressVariance(smoothSeries(down.raw, 2), 0.72).map((v) => Number(toNum(v, 0).toFixed(4)));
    const baseSm = compressVariance(smoothSeries(down.base, 2), 0.72).map((v) => Number(toNum(v, 0).toFixed(4)));
    return { labels: down.labels, raw: rawSm, base: baseSm };
  };

  let lastChart = { labels: [], raw: [], base: [] };
  let lastProtocolSignature = "";
  let chartRenderProfile = surfaceMode === "demo" ? "demo" : "app";
  let scrollBound = false;

  const redrawChart = () => {
    drawLineChart($("deltaChart"), lastChart.labels, lastChart.raw, lastChart.base);
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
    const baseAction = String(demo.base_action || demo.flow_action || "HOLD").toUpperCase();
    const heldMin = formatInt(demo.held_minutes);
    const rawActions = formatInt(demo.raw_actions_today);
    const baseActions = formatInt(demo.base_actions_today ?? demo.flow_actions_today);
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

    setActionClasses("baseAction", "baseActionWide", baseAction);
    setActionClasses("rawAction", "rawActionWide", rawAction);

    setText("rawActionsToday", rawActions);
    setText("baseActionsToday", baseActions);
    setText("avoidedSwitches", switches);
    setText("avoidedSwitchesWide", switches);
    setText("costSavedBps", savedBps);
    setText("costSavedBpsWide", savedBps);

    const isPublicDemo = surfaceMode === "demo" || Boolean(demo.public_safe_mode);
    const strictPublicRedaction = (() => {
      const engineVersion = String(demo.engine_version || "").trim().toLowerCase();
      const note = String(demo.public_safe_note || "").trim().toLowerCase();
      return isPublicDemo && (engineVersion === "public-safe" || note.includes("strict public-safe mode") || note.includes("redacted"));
    })();
    setText("baseActionLogic", buildBaseActionLogic(demo));
    setText("baseActionDemoHint", isPublicDemo ? "Preview mode: full selector rationale is shown in the private live surface." : "");
    setText("baseRationale", buildRationale(demo, confidence));
    if (isPublicDemo) {
      setText("baseRationaleDemo", "Preview mode shows outcomes only. Full decision rationale is available in the private live surface.");
    } else {
      setText("baseRationaleDemo", "");
    }
    setText("actionSupport", buildActionSupport(demo));

    const proof = demo.proof_counter || {};
    const ds = demo.data_source || {};
    const freshness = demo.data_freshness || {};
    const proofEfficiency = demo.proof_efficiency || {};

    const signalSource = String(ds.signal_source || "heuristic");
    const signalSymbol = String(ds.signal_symbol || "");
    const signalCoverage = toNum(ds.signal_coverage_pct, NaN);
    setText("pilotSignalSource", strictPublicRedaction ? "Public-safe aggregate" : (signalSource === "ml_packets" ? "ML packets" : titleCase(signalSource || "heuristic")));
    if (Number.isFinite(signalCoverage)) {
      setText("pilotSignalCoverage", `${signalCoverage.toFixed(0)}% matched`);
    } else if (strictPublicRedaction) {
      setText("pilotSignalCoverage", "100% matched");
    } else if (signalSource === "ml_packets") {
      setText("pilotSignalCoverage", "0% matched");
    } else {
      setText("pilotSignalCoverage", "Live source");
    }
    const counterStartUtc = (() => {
      const primary = String(proof.first_tick_utc || proof.started_utc || "").trim();
      if (primary) return primary;
      const uptimeHours = toNum(proofEfficiency.uptime_hours, Number.NaN);
      const updated = new Date(String(demo.updated_utc || "").trim());
      if (Number.isFinite(uptimeHours) && uptimeHours > 0 && Number.isFinite(updated.getTime())) {
        const backMs = Math.round(uptimeHours * 3600 * 1000);
        return new Date(updated.getTime() - backMs).toISOString();
      }
      if (Number.isFinite(updated.getTime())) {
        return updated.toISOString();
      }
      return "";
    })();
    setText("pilotCounterStart", compactUtc(counterStartUtc));
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
      const firstTick = counterStartUtc || proof.first_tick_utc || proof.started_utc;
      if (firstTick) {
        const dt = new Date(firstTick);
        if (Number.isFinite(dt.getTime())) {
          const mon = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          proofModeText = `Live from ${mon} · Public preview mode · delayed + aggregated metrics.`;
        } else {
          proofModeText = "Public preview mode · delayed + aggregated · read-only metrics.";
        }
      } else {
        proofModeText = "Public preview mode · delayed + aggregated · read-only metrics.";
      }
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
    setMomentum("mom5", mom.m5_pct, { redacted: false });
    setMomentum("mom15", mom.m15_pct, { redacted: false });
    setMomentum("mom60", mom.m60_pct, { redacted: false });

    const chart = demo.chart || {};
    let labels = Array.isArray(chart.labels) ? chart.labels : [];
    let rawSeries = Array.isArray(chart.raw_equity) ? chart.raw_equity : [];
    let baseSeries = Array.isArray(chart.base_equity) ? chart.base_equity : (Array.isArray(chart.flow_equity) ? chart.flow_equity : []);
    const shouldUsePreview = labels.length < 8 || rawSeries.length < 8 || baseSeries.length < 8;
    if (shouldUsePreview) {
      const preview = buildPublicPreviewChart(demo);
      labels = preview.labels;
      rawSeries = preview.raw;
      baseSeries = preview.base;
    }
    chartRenderProfile = isPublicDemo ? "demo" : "app";
    if (isPublicDemo) {
      const previewSeries = toDemoPreviewSeries(labels, rawSeries, baseSeries);
      labels = previewSeries.labels;
      rawSeries = previewSeries.raw;
      baseSeries = previewSeries.base;
    }
    lastChart = {
      labels,
      raw: rawSeries,
      base: baseSeries,
    };
    redrawChart();
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
    const root = $("coverageStrip");
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
    track.appendChild(groupA);

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
      const requiredGroups = 2;
      while (track.children.length < requiredGroups) {
        track.appendChild(buildGroup(true));
      }
      while (track.children.length > requiredGroups) {
        track.removeChild(track.lastElementChild);
      }
      const cycleSec =
        surfaceMode === "demo" ? Math.min(320, Math.max(112, width / 30)) : Math.min(240, Math.max(78, width / 38));
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

  const measureWidth = (el) => {
    if (!el) return 0;
    const rectWidth = typeof el.getBoundingClientRect === "function" ? Number(el.getBoundingClientRect().width || 0) : 0;
    return Math.max(0, toNum(el.scrollWidth, 0), toNum(el.offsetWidth, 0), rectWidth);
  };

  let summaryTimer = null;
  let protocolsTimer = null;
  let tickerHealthTimer = null;
  let summaryInFlight = false;
  let protocolsInFlight = false;
  let protocolsLocked = false;
  let resizeQueued = false;
  let coverageVisible = !("IntersectionObserver" in window);
  let protocolStableCycles = 0;
  let lastProtocolRows = [];

  const syncProtocolsTicker = () => {
    const root = $("coverageStrip");
    if (!root) return;
    const sync = root.__coverageSync;
    if (typeof sync === "function") sync(0);
  };

  const ensureProtocolsTicker = () => {
    const root = $("coverageStrip");
    if (!root || !lastProtocolRows.length) return false;
    const track = root.querySelector(".coverage-marquee-track");
    if (!track) {
      renderProtocols({ protocols: lastProtocolRows });
      return true;
    }
    const style = window.getComputedStyle(track);
    const duration = toNum(String(style.getPropertyValue("--coverage-roll-sec") || "").replace("s", ""), Number.NaN);
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
    if (summaryInFlight || document.hidden || navigator.onLine === false) return;
    summaryInFlight = true;
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4500);
      const r = await fetch(summaryEndpoint, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

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
      const r = await fetch(protocolsEndpoint, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!r.ok) return;
      const payload = await r.json();
      const rows = extractProtocolRows(payload);
      if (!rows.length) return false;
      const sig = protocolSignature(rows);
      if (sig === lastProtocolSignature) {
        protocolStableCycles = Math.min(protocolStableCycles + 1, 4);
        lastProtocolRows = rows.slice();
        patchRenderedProtocols($("coverageStrip"), rows);
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
    bindScrollState();

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

    const coverageProbe = $("coverage") || $("coverageStrip");
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
        redrawChart();
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
        redrawChart();
        syncProtocolsTicker();
      });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
