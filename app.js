"use strict";

function validateData(characters, data) {
  if (!Array.isArray(characters) || !characters.length) throw new Error("キャラクターデータが空です。");
  const ids = new Set();
  for (const c of characters) {
    if (typeof c.id !== "string" || ids.has(c.id) || typeof c.name !== "string" || typeof c.ohisa !== "boolean" || typeof c.version_id !== "string" || typeof c.version !== "string" || !/^icons\/[^/\\]+\.png$/.test(c.filename)) throw new Error("キャラクター情報または画像パスが不正です。");
    ids.add(c.id);
  }
  const start = Date.parse(data.event?.start), end = Date.parse(data.event?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Array.isArray(data.announcements)) throw new Error("開催期間または発表データが不正です。");
  let previous = -Infinity;
  for (const a of data.announcements) {
    const date = Date.parse(a.date);
    if (!Number.isFinite(date) || date < start || date <= previous || typeof a.label !== "string" || !["pending", "verified"].includes(a.status) || !Number.isInteger(a.expectedCount) || a.expectedCount < 1 || !Array.isArray(a.ranks)) throw new Error("発表日の順序・状態・件数が不正です。");
    previous = date;
    const seen = new Set();
    for (const row of a.ranks) {
      if (!ids.has(row.id) || seen.has(row.id) || !Number.isInteger(row.rank) || row.rank < 1 || row.rank > a.expectedCount) throw new Error(`${a.label}のキャラIDまたは順位が不正です。`);
      seen.add(row.id);
    }
    if (a.status === "pending" && a.ranks.length) throw new Error("未登録の発表に順位が含まれています。");
    if (a.status === "verified" && a.ranks.length !== a.expectedCount) throw new Error(`${a.label}の登録件数が予定件数と一致しません。`);
    if (!/^https:\/\//.test(a.source) || !/^https:\/\//.test(data.event.source)) throw new Error("出典URLが不正です。");
  }
  return data;
}

if (typeof module !== "undefined") module.exports = { validateData };

if (typeof document !== "undefined") {
  const $ = id => document.getElementById(id);
  let characters = [], data, selected = null, imageErrors = new Set();
  const tooltip = $("tooltip");
  const formatDate = date => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(date));
  const imagePath = filename => filename.split("/").map(encodeURIComponent).join("/");
  const info = c => `${c.name}\n初登場：${c.version}\nおひさ：${c.ohisa ? "あり" : "なし"}`;
  function showTooltip(c, target) {
    tooltip.textContent = info(c); tooltip.hidden = false;
    const box = target.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(box.left, innerWidth - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(box.bottom + 8, innerHeight - tooltip.offsetHeight - 12))}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }
  addEventListener("scroll", hideTooltip, true);
  addEventListener("resize", hideTooltip);
  addEventListener("keydown", e => { if (e.key === "Escape") hideTooltip(); });
  function icon(c, className) {
    const button = document.createElement("button");
    button.className = className + (selected === c.id ? " selected" : "");
    button.type = "button"; button.setAttribute("aria-label", info(c));
    button.setAttribute("aria-pressed", String(selected === c.id));
    const img = document.createElement("img"); img.src = imagePath(c.filename); img.alt = ""; img.width = 32; img.height = 32;
    img.loading = className === "character" ? "lazy" : "eager";
    img.addEventListener("error", () => { imageErrors.add(c.id); updateStatus(); });
    button.append(img);
    button.addEventListener("pointerenter", () => showTooltip(c, button));
    button.addEventListener("pointerleave", hideTooltip);
    button.addEventListener("focus", () => showTooltip(c, button));
    button.addEventListener("blur", hideTooltip);
    button.addEventListener("click", () => { selected = selected === c.id ? null : c.id; hideTooltip(); render(); });
    return button;
  }
  function updateStatus() {
    const pending = data.announcements.filter(a => a.status === "pending");
    $("status").textContent = (pending.length ? `${pending.map(a => `${formatDate(a.date)} ${a.label}`).join("、")}の順位データは未登録です。現在のひろばには順位未確認のキャラも含まれます。` : "") + (imageErrors.size ? ` ⚠ アイコン読み込み失敗：${imageErrors.size}件。再読み込みしても直らない場合はキャラ名を管理者にお知らせください。` : "");
    $("status").hidden = !$("status").textContent;
  }
  function render() {
    hideTooltip();
    const visible = characters.filter(c => (!$("version").value || c.version_id === $("version").value) && (!$("ohisa").value || String(c.ohisa) === $("ohisa").value));
    const latest = data.announcements.at(-1);
    const latestRanks = new Map(latest?.status === "verified" ? latest.ranks.map(r => [r.id, r.rank]) : []);
    const waiting = visible.filter(c => !latestRanks.has(c.id));
    $("waiting-count").textContent = `${waiting.length} / ${characters.length}キャラ`;
    $("waiting-description").textContent = latest?.status === "verified" ? `${formatDate(latest.date)}の発表に順位が掲載されていないキャラです。正確な順位は未発表です。` : "最新発表の順位データが未登録のため、全キャラがここで待機しています。圏外という意味ではありません。";
    $("waiting").replaceChildren(...waiting.map(c => { const button = icon(c, "character"); const name = document.createElement("span"); name.textContent = c.name; button.append(name); return button; }));
    $("empty").hidden = waiting.length !== 0;
    const chosen = characters.find(c => c.id === selected);
    $("selection").textContent = chosen ? `${info(chosen).replaceAll("\n", " ｜ ")} ｜ 最新：${latestRanks.has(chosen.id) ? `${latestRanks.get(chosen.id)}位` : "順位未確認"}${visible.includes(chosen) ? "" : "（現在のフィルタ対象外）"}` : "気になるキャラを選んでみよう。";
    drawChart(visible);
  }
  function drawChart(visible) {
    const [low, high] = $("band").value.split(":").map(Number);
    const width = 1040, top = 100, bottom = 65, height = top + (high - low) * 40 + bottom;
    const left = 72, right = 70, start = Date.parse(data.event.start), end = Date.parse(data.event.end);
    const x = date => left + (Date.parse(date) - start) / (end - start) * (width - left - right);
    const y = rank => top + (rank - low) * 40;
    const chart = $("chart"); chart.replaceChildren(); chart.style.width = `${width}px`; chart.style.height = `${height}px`;
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"); svg.setAttribute("width", width); svg.setAttribute("height", height); svg.classList.add("chart-svg"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${low}位から${high}位の順位推移。詳細はアイコンを選択して確認できます。`); chart.append(svg);
    function element(tag, attrs, text) { const el = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); if (text) el.textContent = text; svg.append(el); return el; }
    const line = (x1,y1,x2,y2,color,dash) => element("line",{x1,y1,x2,y2,stroke:color,"stroke-dasharray":dash || ""});
    for (let rank = low; rank <= high; rank++) { line(left,y(rank),width-right,y(rank),"#eee8dd"); element("text",{x:20,y:y(rank)+4,fill:"#63716c","font-size":12},`${rank}位`); }
    const marks = [{date:data.event.start,label:"スタート"},...data.announcements,{date:data.event.end,label:"投票終了"}];
    for (const mark of marks) { line(x(mark.date),top-15,x(mark.date),height-bottom+15,"#d3dcd5","4 5"); element("text",{x:x(mark.date),y:30,"text-anchor":"middle",fill:"#147b7d","font-size":12},formatDate(mark.date)); element("text",{x:x(mark.date),y:50,"text-anchor":"middle",fill:"#596670","font-size":11},mark.label); }
    let count = 0;
    const maps = data.announcements.map(a => new Map(a.status === "verified" ? a.ranks.map(r => [r.id,r.rank]) : []));
    const points = [];
    const defs = element("defs",{}), clip = document.createElementNS(ns,"clipPath"); clip.id = "plot-clip"; const rect = document.createElementNS(ns,"rect"); for (const [k,v] of Object.entries({x:left,y:top-18,width:width-left-right,height:height-top-bottom+36})) rect.setAttribute(k,v); clip.append(rect); defs.append(clip);
    for (const c of visible) {
      let hasPoint = false;
      const color = selected === c.id ? "#db466e" : selected ? "#dae3df" : "#72a7a3";
      maps.forEach((map, i) => {
        const rank = map.get(c.id), prior = maps[i-1]?.get(c.id);
        if (rank !== undefined && prior !== undefined) { const path = line(x(data.announcements[i-1].date),y(prior),x(data.announcements[i].date),y(rank),color); path.setAttribute("clip-path","url(#plot-clip)"); path.setAttribute("stroke-width",selected === c.id ? 3 : 1.5); }
        if (rank >= low && rank <= high) { hasPoint = true; points.push({c,i,rank}); }
      });
      if (hasPoint) count++;
    }
    const overlaps = new Map();
    for (const {c,i,rank} of points) {
      const key = `${i}:${rank}`, offset = overlaps.get(key) || 0; overlaps.set(key,offset+1);
      const button = icon(c,"chart-icon"); if (selected && selected !== c.id) button.classList.add("dim");
      button.style.left = `${x(data.announcements[i].date)+offset*36}px`; button.style.top = `${y(rank)}px`;
      if (i === data.announcements.length - 1) {
        const name = document.createElement("span");
        name.className = "chart-name";
        name.textContent = c.name;
        if (x(data.announcements[i].date) > width / 2) name.classList.add("chart-name-left");
        button.append(name);
      }
      button.setAttribute("aria-label",`${info(c)}\n${data.announcements[i].label}：${rank}位`); chart.append(button);
    }
    $("chart-count").textContent = `${count}キャラ表示`;
    if (!points.length) element("text",{x:width/2,y:80,"text-anchor":"middle",fill:"#94602c","font-size":13},"この条件で表示できる順位データはありません");
  }
  async function init() {
    try {
      const results = await Promise.all(["characters.json","rankings.json"].map(async path => { const response = await fetch(path); if (!response.ok) throw new Error(`${path}を取得できません（HTTP ${response.status}）。`); return response.json(); }));
      characters = results[0].characters; data = validateData(characters,results[1]);
      const versions = new Map(characters.map(c => [c.version_id,c.version]));
      for (const [value,name] of versions) { const option = document.createElement("option"); option.value = value; option.textContent = name; $("version").append(option); }
      for (const id of ["version","ohisa","band"]) { $(id).disabled = false; $(id).addEventListener("change",render); }
      $("reset").disabled = false; $("reset").addEventListener("click", () => { for (const id of ["version","ohisa"]) $(id).value = ""; $("band").value = "1:300"; selected = null; render(); });
      for (const source of [{label:"公式イベント概要",source:data.event.source},...data.announcements]) { const p = document.createElement("p"), a = document.createElement("a"); a.href = source.source; a.textContent = `${source.label} ↗`; a.target = "_blank"; a.rel = "noopener"; p.append(a); $("sources").append(p); }
      updateStatus(); render();
    } catch (error) { $("status").classList.add("error"); $("status").setAttribute("role","alert"); $("status").textContent = `データを読み込めませんでした。${error.message} 再読み込みしても直らない場合は、このメッセージを管理者にお知らせください。`; }
  }
  init();
}
