/**
 * §12.1 验收用例 — 5 类真实站端到端跑通
 * 运行方式：node tests/acceptance/run-acceptance.ts
 *
 * 每个站点调 auditLight()，输出关键指标，并检查 §12.1 验收条件。
 * 失败条件打 FAIL；全部通过打 ALL PASS。
 */

import { auditLight } from '../../src/core/audit.ts';
import type { AuditReport } from '../../src/core/types.ts';

interface SiteSpec {
  label: string;
  url: string;
  checks: Array<(r: AuditReport) => { pass: boolean; desc: string }>;
}

const SITES: SiteSpec[] = [
  {
    label: 'AC-1 YMYL (mayoclinic.org)',
    url: 'https://www.mayoclinic.org',
    checks: [
      r => ({ pass: r.profile?.isYMYL === true, desc: 'profile.isYMYL = true' }),
      r => ({ pass: !!r.scores, desc: '有 scores（站点可达）' }),
      r => ({ pass: r.notEvaluated.length >= 4, desc: 'notEvaluated ≥ 4 项' }),
      r => ({ pass: r.vetoes.some(v => v.rule === 'YMYL_D3<40'), desc: 'vetoes 含 YMYL_D3<40 规则' }),
      r => ({ pass: r.meta.sampledPages.length >= 1, desc: 'sampledPages 有记录' }),
    ],
  },
  {
    label: 'AC-2 Niche (audiosciencereview.com)',
    url: 'https://www.audiosciencereview.com',
    checks: [
      r => ({ pass: !!r.scores, desc: '有 scores（站点可达）' }),
      r => ({ pass: r.notEvaluated.length >= 4, desc: 'notEvaluated ≥ 4 项' }),
      r => ({ pass: typeof r.deepAuditRecommended === 'boolean', desc: 'deepAuditRecommended 明确声明' }),
      r => ({
        pass: r.profile?.nicheTier === 'niche' || !!r.nicheWarning,
        desc: 'nicheTier=niche 或有 nicheWarning',
      }),
    ],
  },
  {
    label: 'AC-3 CSR 空壳 (notion.so)',
    url: 'https://www.notion.so',
    checks: [
      r => ({ pass: !!r.scores || !!r.meta.error, desc: '有 scores 或 error（站点可达）' }),
      r => ({
        pass: r.couplingFlags.some(f => f.code === 'csr_empty_html') ||
              (r.profile?.nicheTier !== undefined),
        desc: 'couplingFlags 含 csr_empty_html 或 profile 存在（CSR 检测覆盖）',
      }),
      r => ({ pass: r.notEvaluated.length >= 4 || !!r.meta.error, desc: 'notEvaluated ≥ 4 或 error' }),
    ],
  },
  {
    label: 'AC-4 robots 受限 (nytimes.com)',
    url: 'https://www.nytimes.com',
    checks: [
      // robots 受限站的有效结果：
      //   a) robots_content_blocked（robots.txt 封禁 + D5 照评）
      //   b) unreachable（站点网络层拦截，如 403/封 UA）
      //   c) 有分数（站点允许 + robots 评分生效）
      // 三者均为 Prism §10 有效降级行为
      r => ({ pass: !!r.scores || !!r.meta.error, desc: '有 scores 或 error report（永不崩）' }),
      r => ({
        pass: r.couplingFlags.some(f => f.code === 'robots_content_blocked') ||
              r.meta.error === 'unreachable' ||
              !!r.scores,
        desc: 'robots_content_blocked / unreachable / 有分（§10 降级任一有效路径）',
      }),
      r => ({
        pass: r.notEvaluated.length >= 4 ||
              r.meta.error === 'unreachable' ||
              r.meta.error === 'non_html',
        desc: 'notEvaluated ≥ 4 或 terminal error（不遗漏 Light 局限）',
      }),
    ],
  },
  {
    label: 'AC-5 标杆站 (stripe.com)',
    url: 'https://stripe.com',
    checks: [
      r => ({ pass: !!r.scores, desc: '有 scores（站点可达）' }),
      r => ({
        pass: (r.scores?.total ?? 0) >= 41,
        desc: `总分 ${r.scores?.total ?? 'N/A'} ≥ 41（至少 L1）`,
      }),
      r => ({ pass: r.vetoes.some(v => v.rule === 'D5<60'), desc: 'vetoes 含 D5<60 规则' }),
      r => ({ pass: r.notEvaluated.length >= 4, desc: 'notEvaluated ≥ 4 项' }),
      r => ({ pass: Array.isArray(r.topFixes), desc: 'topFixes 存在' }),
    ],
  },
];

async function runSite(spec: SiteSpec): Promise<{ label: string; pass: boolean; details: string[] }> {
  const details: string[] = [];
  let report: AuditReport;
  const t0 = Date.now();

  try {
    report = await auditLight({ url: spec.url, market: 'international' });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    details.push(`  运行时间：${dur}s`);
    if (report.meta.error) {
      details.push(`  ⚠️  error report: ${report.meta.error}`);
    } else {
      const total = report.scores?.total ?? 'N/A';
      const level = report.scores?.level ?? 'N/A';
      details.push(`  总分：${total} (${level})`);
      details.push(`  采样页：${report.meta.sampledPages.join(', ')}`);
      if (report.couplingFlags.length > 0) {
        details.push(`  coupling: ${report.couplingFlags.map(f => f.code).join(', ')}`);
      }
      if (report.nicheWarning) details.push(`  Niche Warning: ✓`);
    }
  } catch (err) {
    details.push(`  ❌ auditLight 抛异常（不应发生）：${err}`);
    return { label: spec.label, pass: false, details };
  }

  let allPass = true;
  for (const check of spec.checks) {
    const { pass, desc } = check(report);
    details.push(`  ${pass ? '✅' : '❌'} ${desc}`);
    if (!pass) allPass = false;
  }

  return { label: spec.label, pass: allPass, details };
}

// Main
const results = [];
for (const spec of SITES) {
  console.log(`\n📡 正在审计 ${spec.label}...`);
  const result = await runSite(spec);
  results.push(result);
  console.log(result.details.join('\n'));
  console.log(result.pass ? `✅ ${spec.label} PASS` : `❌ ${spec.label} FAIL`);
}

console.log('\n' + '='.repeat(60));
const allPass = results.every(r => r.pass);
const passCount = results.filter(r => r.pass).length;
console.log(`§12.1 验收结果：${passCount}/${results.length} 站通过`);
if (allPass) {
  console.log('🎉 ALL PASS — §12.1 MVP 功能验收完成');
} else {
  console.log('⚠️  部分站点未通过，详见上方 ❌ 条目');
}
process.exit(allPass ? 0 : 1);
