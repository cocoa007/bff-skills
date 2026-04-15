#!/usr/bin/env bun
/**
 * hodlmm-bin-vorticity.ts — Day 118 cocoa007 Bitflow Skills Comp
 *
 * Bin vorticity analyzer — rotational flow patterns and circulation dynamics
 * of reserve distributions using fluid dynamics concepts.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const MIN_POPULATED_BINS = 5;

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId?: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface VorticityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  vorticityIndex: number;
  vorticityClass: string;
  circulation: number;
  circulationDirection: string;
  vorticityMagnitude: number;
  peakVorticityBin: number;
  enstrophy: number;
  enstrophyClass: string;
  vortexCoreId: number;
  vortexCoreIntensity: number;
  helicity: number;
  helicityClass: string;
  rossbyNumber: number;
  flowRegime: string;
  vortexStretching: number;
  stretchingClass: string;
  palinstrophy: number;
  palinstrophyTrend: string;
  relativeVorticity: number;
  planetaryVorticity: number;
  vorticityRatio: number;
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const pools: AppPool[] = body.data?.pools ?? body.pools ?? body ?? [];
  return pools.filter((p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null);
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!res.ok) throw new Error(`Active bin fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.okay || !data.result) throw new Error("Active bin read failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const tupleHex = hex.slice(2);
    let offset = 0;
    const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
    offset += 2;
    for (let i = 0; i < numEntries; i++) {
      const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
      offset += 2;
      const nameBytes = tupleHex.slice(offset, offset + nameLen * 2);
      offset += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      if (name === "active-bin-id" || name === "bin-id") {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01") {
          return parseInt(tupleHex.slice(offset, offset + 32), 16);
        }
      } else {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01" || typePrefix === "00") offset += 32;
        else if (typePrefix === "0a") offset += 32;
        else break;
      }
    }
  }
  const match = hex.match(/01([0-9a-f]{32})/);
  if (match) return parseInt(match[1], 16);
  throw new Error("Cannot parse active bin");
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;
  const batchSize = 5;
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
      batch.push(j);
    }
    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin-reserves`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: SENDER,
              arguments: [
                `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`,
                `0x01000000000000000000000000${binId.toString(16).padStart(8, "0")}`,
              ],
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          if (!data.okay || !data.result) return null;
          const hex = data.result.replace("0x", "");
          let reserveX = 0,
            reserveY = 0;
          if (hex.startsWith("09")) {
            const tupleHex = hex.slice(2);
            let offset = 0;
            const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
              offset += 2;
              const nameRaw = tupleHex.slice(offset, offset + nameLen * 2);
              offset += nameLen * 2;
              const nm = Buffer.from(nameRaw, "hex").toString("ascii");
              const typePrefix = tupleHex.slice(offset, offset + 2);
              offset += 2;
              const val = parseInt(tupleHex.slice(offset, offset + 32), 16);
              offset += 32;
              if (nm === "reserve-x") reserveX = val;
              else if (nm === "reserve-y") reserveY = val;
            }
          } else {
            const uints = hex.match(/01([0-9a-f]{32})/g) ?? [];
            if (uints.length >= 2) {
              reserveX = parseInt(uints[0].slice(2), 16);
              reserveY = parseInt(uints[1].slice(2), 16);
            }
          }
          const decX = pool.token0Decimals || 8;
          const decY = pool.token1Decimals || 6;
          const rX = reserveX / 10 ** decX;
          const rY = reserveY / 10 ** decY;
          const rXUsd = rX * (pool.token0PriceUsd || 0);
          const rYUsd = rY * (pool.token1PriceUsd || 0);
          return {
            binId,
            reserveX: rX,
            reserveY: rY,
            reserveXUsd: rXUsd,
            reserveYUsd: rYUsd,
            totalUsd: rXUsd + rYUsd,
          } as BinReserves;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && (r.reserveX > 0 || r.reserveY > 0)) bins.push(r);
    }
  }
  return bins;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeLocalVorticity(bins: BinReserves[], idx: number): number {
  if (idx <= 0 || idx >= bins.length - 1) return 0;
  const prev = bins[idx - 1];
  const curr = bins[idx];
  const next = bins[idx + 1];
  const dxForward = next.reserveXUsd - curr.reserveXUsd;
  const dxBackward = curr.reserveXUsd - prev.reserveXUsd;
  const dyForward = next.reserveYUsd - curr.reserveYUsd;
  const dyBackward = curr.reserveYUsd - prev.reserveYUsd;
  return (dyForward - dyBackward) - (dxForward - dxBackward);
}

function computeCirculation(bins: BinReserves[], activeBin: number): {
  circulation: number;
  direction: string;
} {
  let circ = 0;
  for (let i = 0; i < bins.length - 1; i++) {
    const curr = bins[i];
    const next = bins[i + 1];
    const vX = (next.reserveXUsd - curr.reserveXUsd);
    const vY = (next.reserveYUsd - curr.reserveYUsd);
    const dl = next.binId - curr.binId;
    circ += (vX + vY) * dl;
  }
  if (bins.length > 1) {
    const last = bins[bins.length - 1];
    const first = bins[0];
    const vX = (first.reserveXUsd - last.reserveXUsd);
    const vY = (first.reserveYUsd - last.reserveYUsd);
    circ += (vX + vY);
  }

  let direction: string;
  const totalReserve = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const normCirc = circ / totalReserve;
  if (Math.abs(normCirc) < 0.01) direction = "irrotational";
  else if (normCirc > 0) direction = "counter-clockwise";
  else direction = "clockwise";

  return { circulation: round(circ), direction };
}

function computeVorticityField(bins: BinReserves[]): number[] {
  const field: number[] = [];
  for (let i = 0; i < bins.length; i++) {
    field.push(computeLocalVorticity(bins, i));
  }
  return field;
}

function computeEnstrophy(vorticityField: number[], totalUsd: number): {
  enstrophy: number;
  enstClass: string;
} {
  let enst = 0;
  for (const v of vorticityField) {
    enst += v * v;
  }
  const normalized = totalUsd > 0 ? enst / (totalUsd * totalUsd) * 1e6 : 0;

  let enstClass: string;
  if (normalized < 1) enstClass = "laminar";
  else if (normalized < 10) enstClass = "moderate";
  else if (normalized < 100) enstClass = "turbulent";
  else enstClass = "chaotic";

  return { enstrophy: round(normalized), enstClass };
}

function findVortexCore(bins: BinReserves[], vorticityField: number[]): {
  coreId: number;
  intensity: number;
} {
  let maxIdx = 0;
  let maxAbs = 0;
  for (let i = 0; i < vorticityField.length; i++) {
    const abs = Math.abs(vorticityField[i]);
    if (abs > maxAbs) {
      maxAbs = abs;
      maxIdx = i;
    }
  }
  return {
    coreId: bins[maxIdx]?.binId ?? 0,
    intensity: round(maxAbs),
  };
}

function computeHelicity(bins: BinReserves[], vorticityField: number[]): {
  helicity: number;
  helClass: string;
} {
  let hel = 0;
  for (let i = 1; i < bins.length; i++) {
    const velocity = bins[i].totalUsd - bins[i - 1].totalUsd;
    hel += velocity * vorticityField[i];
  }
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const normalized = hel / (totalUsd * totalUsd) * 1e6;

  let helClass: string;
  if (Math.abs(normalized) < 0.5) helClass = "achiral";
  else if (normalized > 0) helClass = "right-handed";
  else helClass = "left-handed";

  return { helicity: round(normalized), helClass };
}

function computeRossbyNumber(bins: BinReserves[], activeBin: number, vorticityField: number[]): {
  rossby: number;
  regime: string;
} {
  let inertialForce = 0;
  for (let i = 1; i < bins.length; i++) {
    const dv = Math.abs(bins[i].totalUsd - bins[i - 1].totalUsd);
    inertialForce += dv;
  }

  const avgVorticity = vorticityField.reduce((s, v) => s + Math.abs(v), 0) / (vorticityField.length || 1);
  const totalSpan = bins.length > 1 ? bins[bins.length - 1].binId - bins[0].binId : 1;

  const rotationalForce = avgVorticity * totalSpan;
  const rossby = rotationalForce > 0 ? inertialForce / rotationalForce : 999;

  let regime: string;
  if (rossby < 0.1) regime = "geostrophic";
  else if (rossby < 1) regime = "quasi-geostrophic";
  else if (rossby < 10) regime = "transitional";
  else regime = "turbulent";

  return { rossby: round(Math.min(rossby, 999)), regime };
}

function computeVortexStretching(bins: BinReserves[], vorticityField: number[]): {
  stretching: number;
  stretchClass: string;
} {
  let totalStretch = 0;
  let count = 0;

  for (let i = 1; i < bins.length - 1; i++) {
    const vortBefore = vorticityField[i - 1];
    const vortAfter = vorticityField[i + 1];
    const crossSection = bins[i].totalUsd || 1;
    const crossPrev = bins[i - 1].totalUsd || 1;
    const crossNext = bins[i + 1].totalUsd || 1;

    const sectionChange = (crossNext - crossPrev) / (2 * crossSection);
    const vortChange = (vortAfter - vortBefore) / 2;

    totalStretch += sectionChange * Math.abs(vorticityField[i]);
    count++;
  }

  const avgStretch = count > 0 ? totalStretch / count : 0;
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const normalized = avgStretch / totalUsd * 1e6;

  let stretchClass: string;
  if (Math.abs(normalized) < 0.1) stretchClass = "neutral";
  else if (normalized > 0) stretchClass = "stretching";
  else stretchClass = "compressing";

  return { stretching: round(normalized), stretchClass };
}

function computePalinstrophy(vorticityField: number[], totalUsd: number): {
  palinstrophy: number;
  trend: string;
} {
  let palin = 0;
  for (let i = 1; i < vorticityField.length; i++) {
    const grad = vorticityField[i] - vorticityField[i - 1];
    palin += grad * grad;
  }
  const normalized = totalUsd > 0 ? palin / (totalUsd * totalUsd) * 1e8 : 0;

  let trend: string;
  if (normalized < 0.1) trend = "decaying";
  else if (normalized < 1) trend = "steady";
  else if (normalized < 10) trend = "growing";
  else trend = "cascading";

  return { palinstrophy: round(normalized), trend };
}

function computeRelativeVorticity(bins: BinReserves[], activeBin: number): {
  relative: number;
  planetary: number;
  ratio: number;
} {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const avgSpacing = bins.length > 1
    ? (bins[bins.length - 1].binId - bins[0].binId) / (bins.length - 1)
    : 1;

  const planetary = 2 * Math.PI / (avgSpacing * bins.length);

  let dynamicVort = 0;
  for (const b of bins) {
    const offset = b.binId - activeBin;
    const weight = b.totalUsd / totalUsd;
    dynamicVort += weight * offset;
  }
  const relative = dynamicVort / (bins.length || 1);

  const ratio = Math.abs(planetary) > 0 ? Math.abs(relative) / planetary : 0;

  return {
    relative: round(relative),
    planetary: round(planetary),
    ratio: round(ratio),
  };
}

function computeVorticityIndex(
  circulation: number,
  enstrophy: number,
  rossby: number,
  stretching: number,
  palinstrophy: number,
  totalUsd: number
): number {
  const normCirc = totalUsd > 0 ? Math.abs(circulation) / totalUsd : 0;
  const circScore = Math.min(normCirc * 50, 25);

  const enstScore = enstrophy < 1 ? 25 : enstrophy < 10 ? 20 : enstrophy < 100 ? 10 : 0;

  const rossbyScore = rossby < 0.1 ? 25 : rossby < 1 ? 20 : rossby < 10 ? 10 : 0;

  const stretchScore = Math.abs(stretching) < 0.1 ? 25 : Math.abs(stretching) < 1 ? 20 : 10;

  return Math.min(100, Math.max(0, circScore + enstScore + rossbyScore + stretchScore));
}

function classifyVorticity(index: number): string {
  if (index >= 80) return "laminar";
  if (index >= 60) return "organized";
  if (index >= 40) return "transitional";
  if (index >= 20) return "turbulent";
  return "chaotic";
}

function analyzeVorticity(bins: BinReserves[], activeBin: number, pool: AppPool): VorticityProfile {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const circ = computeCirculation(bins, activeBin);
  const vorticityField = computeVorticityField(bins);
  const peakIdx = vorticityField.reduce((maxI, v, i, arr) => Math.abs(v) > Math.abs(arr[maxI]) ? i : maxI, 0);
  const enst = computeEnstrophy(vorticityField, totalUsd);
  const core = findVortexCore(bins, vorticityField);
  const hel = computeHelicity(bins, vorticityField);
  const rossby = computeRossbyNumber(bins, activeBin, vorticityField);
  const stretch = computeVortexStretching(bins, vorticityField);
  const palin = computePalinstrophy(vorticityField, totalUsd);
  const rel = computeRelativeVorticity(bins, activeBin);

  const vortIdx = computeVorticityIndex(circ.circulation, enst.enstrophy, rossby.rossby, stretch.stretching, palin.palinstrophy, totalUsd);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    vorticityIndex: Math.round(vortIdx),
    vorticityClass: classifyVorticity(vortIdx),
    circulation: circ.circulation,
    circulationDirection: circ.direction,
    vorticityMagnitude: round(Math.abs(vorticityField[peakIdx] || 0)),
    peakVorticityBin: bins[peakIdx]?.binId ?? activeBin,
    enstrophy: enst.enstrophy,
    enstrophyClass: enst.enstClass,
    vortexCoreId: core.coreId,
    vortexCoreIntensity: core.intensity,
    helicity: hel.helicity,
    helicityClass: hel.helClass,
    rossbyNumber: rossby.rossby,
    flowRegime: rossby.regime,
    vortexStretching: stretch.stretching,
    stretchingClass: stretch.stretchClass,
    palinstrophy: palin.palinstrophy,
    palinstrophyTrend: palin.trend,
    relativeVorticity: rel.relative,
    planetaryVorticity: rel.planetary,
    vorticityRatio: rel.ratio,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function renderVorticityMap(profile: VorticityProfile, bins: BinReserves[]): string {
  const lines: string[] = [];
  const vorticityField = computeVorticityField(bins);

  lines.push(`\n=== VORTICITY MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Vorticity Index: ${profile.vorticityIndex}/100 (${profile.vorticityClass})`);
  lines.push(`Circulation: ${profile.circulation} (${profile.circulationDirection})`);
  lines.push(`Peak Vorticity: ${profile.vorticityMagnitude} at bin ${profile.peakVorticityBin}`);
  lines.push(`Enstrophy: ${profile.enstrophy} (${profile.enstrophyClass})`);
  lines.push(`Vortex Core: bin ${profile.vortexCoreId} (intensity ${profile.vortexCoreIntensity})`);
  lines.push(`Helicity: ${profile.helicity} (${profile.helicityClass})`);
  lines.push(`Rossby Number: ${profile.rossbyNumber} (${profile.flowRegime})`);
  lines.push(`Vortex Stretching: ${profile.vortexStretching} (${profile.stretchingClass})`);
  lines.push(`Palinstrophy: ${profile.palinstrophy} (${profile.palinstrophyTrend})`);
  lines.push(`Relative Vorticity: ${profile.relativeVorticity} | Planetary: ${profile.planetaryVorticity} | Ratio: ${profile.vorticityRatio}`);
  lines.push("");

  if (bins.length > 0 && vorticityField.length > 0) {
    const maxVort = Math.max(...vorticityField.map(Math.abs)) || 1;
    const width = 40;
    lines.push("Vorticity Field (local curl magnitude):");
    const step = Math.max(1, Math.floor(bins.length / 25));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const v = vorticityField[i];
      const offset = b.binId - profile.activeBin;
      const barLen = Math.round((Math.abs(v) / maxVort) * width);
      const marker = b.binId === profile.vortexCoreId ? ">>>" : offset === 0 ? " * " : "   ";
      const sign = v > 0 ? "+" : v < 0 ? "-" : "0";
      lines.push(
        `${marker} ${String(offset).padStart(4)} | ${sign}${"█".repeat(barLen)}${"░".repeat(width - barLen)}`
      );
    }
    lines.push("");

    lines.push("Circulation Flow Diagram:");
    const leftBins = bins.filter((b) => b.binId < profile.activeBin);
    const rightBins = bins.filter((b) => b.binId > profile.activeBin);
    const leftFlow = leftBins.reduce((s, b) => s + b.reserveXUsd, 0);
    const rightFlow = rightBins.reduce((s, b) => s + b.reserveYUsd, 0);
    const maxFlow = Math.max(leftFlow, rightFlow) || 1;
    const leftBar = Math.round((leftFlow / maxFlow) * 20);
    const rightBar = Math.round((rightFlow / maxFlow) * 20);
    const arrow = profile.circulationDirection === "counter-clockwise" ? "  CCW >>>" :
                  profile.circulationDirection === "clockwise" ? "  <<< CW " : "  === IRR";
    lines.push(`  X-flow ${"█".repeat(leftBar)}${"░".repeat(20 - leftBar)} $${leftFlow.toFixed(0)}`);
    lines.push(arrow);
    lines.push(`  Y-flow ${"█".repeat(rightBar)}${"░".repeat(20 - rightBar)} $${rightFlow.toFixed(0)}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(
  pool: AppPool
): Promise<{ profile: VorticityProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeVorticity(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-vorticity")
  .description("HODLMM bin vorticity analyzer — circulation, enstrophy, vortex cores, flow regime classification");

program
  .command("doctor")
  .description("Validate API connectivity")
  .action(async () => {
    try {
      const [bffRes, hiroRes] = await Promise.all([
        fetch(`${BFF_APP_BASE}/pools`).then((r) => ({ ok: r.ok, status: r.status })),
        fetch(`${HIRO_API}/v2/info`).then((r) => ({ ok: r.ok, status: r.status })),
      ]);
      console.log(
        JSON.stringify({
          result: "doctor",
          data: {
            bff: { ok: bffRes.ok, status: bffRes.status },
            hiro: { ok: hiroRes.ok, status: hiroRes.status },
            allHealthy: bffRes.ok && hiroRes.ok,
            analyses: ["run", "status"],
          },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("run")
  .description("Full vorticity analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let selected: AppPool[];
      if (opts.pool) {
        selected = pools.filter((p) => p.poolId === parseInt(opts.pool));
        if (selected.length === 0) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
      } else {
        selected = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, parseInt(opts.top));
      }

      const results: VorticityProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderVorticityMap(result.profile, result.bins);
        }
      }

      const avgIndex =
        results.length > 0 ? results.reduce((s, r) => s + r.vorticityIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "vorticity_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgVorticityIndex: Math.round(avgIndex),
              laminar: results.filter((r) => r.vorticityIndex >= 80).length,
              organized: results.filter((r) => r.vorticityIndex >= 60).length,
              turbulent: results.filter((r) => r.vorticityIndex < 40).length,
              chaotic: results.filter((r) => r.vorticityIndex < 20).length,
              avgEnstrophy: round(
                results.reduce((s, r) => s + r.enstrophy, 0) / (results.length || 1)
              ),
              avgRossby: round(
                results.reduce((s, r) => s + r.rossbyNumber, 0) / (results.length || 1)
              ),
              regimeDistribution: {
                geostrophic: results.filter((r) => r.flowRegime === "geostrophic").length,
                quasiGeostrophic: results.filter((r) => r.flowRegime === "quasi-geostrophic").length,
                transitional: results.filter((r) => r.flowRegime === "transitional").length,
                turbulent: results.filter((r) => r.flowRegime === "turbulent").length,
              },
            },
          },
        })
      );

      if (outputText) console.error(outputText);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("status")
  .description("Quick vorticity summary for top pools")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const top = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 5);
      const results: any[] = [];

      for (const pool of top) {
        const result = await analyzePool(pool);
        if (result) {
          results.push({
            pair: result.profile.pair,
            poolId: result.profile.poolId,
            vorticityIndex: result.profile.vorticityIndex,
            vorticityClass: result.profile.vorticityClass,
            circulationDirection: result.profile.circulationDirection,
            enstrophy: result.profile.enstrophy,
            enstrophyClass: result.profile.enstrophyClass,
            rossbyNumber: result.profile.rossbyNumber,
            flowRegime: result.profile.flowRegime,
            helicityClass: result.profile.helicityClass,
            palinstrophyTrend: result.profile.palinstrophyTrend,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "vorticity_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
