(() => {
  const byId = (id) => document.getElementById(id);
  const pageMode = document.body && document.body.dataset
    ? String(document.body.dataset.page || "product").toLowerCase()
    : "product";

  const productSnapshot = {
    marketState: "Trend Down",
    pair: "WETH/USDC (Base)",
    held: "Held 10 min",
    confidence: "90.0%",
    action: "SELL",
    rawWanted: "Raw wanted: SELL",
    costSaved: "1,160 bps",
    switches: "Switches Avoided: 115",
    rawActions: "190",
    vaaraActions: "75",
  };

  const protocols = [
    { name: "Aerodrome Finance", focus: "DEX anchor on Base", tvl: "Base TVL $337.29M", delta: "+1.25%", tone: "up", badge: "Fixed" },
    { name: "Moonwell", focus: "Lending (Coinbase-adjacent)", tvl: "Base TVL $82.41M", delta: "+0.88%", tone: "up", badge: "Fixed" },
    { name: "Seamless Protocol", focus: "Native lending", tvl: "Base TVL $28.57M", delta: "+0.42%", tone: "up", badge: "Fixed" },
    { name: "Extra Finance", focus: "Leveraged yield", tvl: "Base TVL $40.33M", delta: "-0.14%", tone: "down", badge: "Fixed" },
    { name: "Beefy Finance", focus: "Yield aggregation", tvl: "Base TVL $22.41M", delta: "+0.19%", tone: "up", badge: "Fixed" },
    { name: "Overnight Finance", focus: "Stablecoin yield / depeg angle", tvl: "Base TVL $7.69M", delta: "-0.28%", tone: "down", badge: "Fixed" },
    { name: "Gains Network", focus: "Perpetuals risk surface", tvl: "Base TVL $2.63M", delta: "+0.06%", tone: "flat", badge: "Fixed" },
    { name: "Reserve Protocol", focus: "RToken deployer behavior", tvl: "Base TVL $3.61M", delta: "-1.00%", tone: "down", badge: "Fixed" },
    { name: "Rocket Pool", focus: "LST exposure", tvl: "Base TVL $1.19B", delta: "+0.08%", tone: "up", badge: "Fixed" },
    { name: "AIFI Protocol", focus: "Highest TVL Base launch in last 90 days", tvl: "Base TVL $176.39M", delta: "+0.64%", tone: "up", badge: "Dynamic 90d" },
  ];

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

  const drawPreviewChart = (rawActions, vaaraActions) => {
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
    const rawSeries = [];
    const vaaraSeries = [];
    const switchGap = Math.max(0, rawActions - vaaraActions);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const base = 100 + t * 8;
      const rawNoise = Math.sin(i * 0.37) * 2.1 + Math.cos(i * 0.13) * 1.5;
      const signalNoise = Math.sin(i * 0.22) * 0.8 + Math.cos(i * 0.11) * 0.6;
      rawSeries.push(base + rawNoise - t * (switchGap * 0.07));
      vaaraSeries.push(base + signalNoise + t * (switchGap * 0.11));
    }

    const all = rawSeries.concat(vaaraSeries);
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
    drawLine(rawSeries, "#ef4444", 1.5);
    drawLine(vaaraSeries, "#4ade80", 2);
  };

  const renderProtocols = () => {
    const root = byId("coverageGrid");
    if (!root) return;
    root.textContent = "";

    protocols.forEach((row) => {
      const card = document.createElement("article");
      card.className = `coverage-card tone-${row.tone}`;

      const top = document.createElement("div");
      top.className = "coverage-card-top";

      const name = document.createElement("div");
      name.className = "coverage-name";
      name.textContent = row.name;

      const badge = document.createElement("span");
      badge.className = `coverage-badge ${row.badge.includes("Dynamic") ? "badge-dynamic" : "badge-fixed"}`;
      badge.textContent = row.badge;

      const desc = document.createElement("div");
      desc.className = "coverage-desc";
      desc.textContent = row.focus;

      const tvl = document.createElement("div");
      tvl.className = `coverage-tvl tone-${row.tone}`;
      tvl.textContent = row.tvl;

      const delta = document.createElement("div");
      delta.className = `coverage-delta ${row.tone}`;
      delta.textContent = `1D TVL delta ${row.delta}`;

      top.append(name, badge);
      card.append(top, desc, tvl, delta);
      root.appendChild(card);
    });
  };

  const applyProductSnapshot = () => {
    setText("stateVal", productSnapshot.marketState);
    setStateTone(productSnapshot.marketState);
    setText("pairVal", productSnapshot.pair);
    setText("confVal", productSnapshot.confidence);
    setText("heldVal", productSnapshot.held);
    setText("actionVal", productSnapshot.action);
    setText("rawActionVal", productSnapshot.rawWanted);
    setText("costVal", productSnapshot.costSaved);
    setText("switchesVal", productSnapshot.switches);
    setText("costSavedHero", productSnapshot.costSaved);
    setText("switchesHero", productSnapshot.switches.replace("Switches Avoided: ", ""));
    drawPreviewChart(Number(productSnapshot.rawActions), Number(productSnapshot.vaaraActions));
  };

  const bindScrollState = () => {
    const setScrollState = () => {
      document.body.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", setScrollState, { passive: true });
    setScrollState();
  };

  const boot = () => {
    if (pageMode === "product") {
      applyProductSnapshot();
      renderProtocols();
      window.addEventListener("resize", () => drawPreviewChart(Number(productSnapshot.rawActions), Number(productSnapshot.vaaraActions)));
    }
    bindScrollState();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
