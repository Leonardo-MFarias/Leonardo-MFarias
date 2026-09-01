// Gera assets/languages.svg com a % de linguagens usadas em TODOS os repositórios
// (públicos e privados) do usuário. Roda só dentro do GitHub Actions.
//
// Segurança: nunca imprime nomes de repositórios nem corpo de respostas da API
// nos logs (logs de repositório público ficam visíveis para qualquer pessoa).
// Só bytes agregados por linguagem chegam ao SVG final.

import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.STATS_TOKEN;
const username = process.env.GH_USERNAME;
const excludeForks = process.env.EXCLUDE_FORKS !== "false";

if (!token) throw new Error("STATS_TOKEN secret não configurado.");
if (!username) throw new Error("GH_USERNAME não configurado.");

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function listOwnedRepos() {
  const repos = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`Falha ao listar repositórios (HTTP ${res.status}).`);
    }
    const batch = await res.json();
    if (batch.length === 0) break;
    repos.push(...batch);
    page += 1;
  }
  return repos;
}

async function repoLanguages(fullName) {
  const res = await fetch(`https://api.github.com/repos/${fullName}/languages`, { headers });
  if (!res.ok) return {};
  return res.json();
}

const repos = await listOwnedRepos();
const totals = {};

for (const repo of repos) {
  if (excludeForks && repo.fork) continue;
  const langs = await repoLanguages(repo.full_name);
  for (const [lang, bytes] of Object.entries(langs)) {
    totals[lang] = (totals[lang] || 0) + bytes;
  }
}

const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
if (grandTotal === 0) throw new Error("Nenhum byte de linguagem encontrado.");

const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

const TOP_N = 8;
const top = sorted.slice(0, TOP_N);
const otherBytes = sorted.slice(TOP_N).reduce((sum, [, b]) => sum + b, 0);
if (otherBytes > 0) top.push(["Outras", otherBytes]);

const palette = [
  "#3572A5", "#f1e05a", "#e34c26", "#563d7c", "#00ADD8",
  "#178600", "#701516", "#b07219", "#4F5D95", "#dea584",
];

const rows = top.map(([lang, bytes], i) => ({
  lang,
  pct: (bytes / grandTotal) * 100,
  color: palette[i % palette.length],
}));

const width = 420;
const barHeight = 24;
const gap = 10;
const height = rows.length * (barHeight + gap) + gap;
const textColor = "#6e7681";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let bars = "";
rows.forEach((r, i) => {
  const y = gap + i * (barHeight + gap);
  const trackWidth = width - 150;
  const barWidth = Math.max((r.pct / 100) * trackWidth, 2);
  bars += `
  <text x="0" y="${y + barHeight / 2 + 5}" font-family="Segoe UI, sans-serif" font-size="13" fill="${textColor}">${esc(r.lang)}</text>
  <rect x="110" y="${y + 4}" width="${trackWidth}" height="${barHeight - 8}" rx="4" fill="${textColor}" opacity="0.2" />
  <rect x="110" y="${y + 4}" width="${barWidth}" height="${barHeight - 8}" rx="4" fill="${r.color}" />
  <text x="${width - 4}" y="${y + barHeight / 2 + 5}" font-family="Segoe UI, sans-serif" font-size="12" fill="${textColor}" text-anchor="end">${r.pct.toFixed(1)}%</text>`;
});

const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Uso de linguagens em todos os repositórios">
${bars}
</svg>`;

await mkdir("assets", { recursive: true });
await writeFile("assets/languages.svg", svg);

console.log(`OK: ${rows.length} linguagens agregadas a partir de ${repos.length} repositórios (nomes não exibidos).`);
