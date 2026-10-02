import { type TestProgress } from "@/types/testing";

interface TestProgressProps {
  progress: TestProgress;
  isTesting?: boolean;
}

export function TestProgressBar({ progress, isTesting }: TestProgressProps) {
  const { total, completed, passed, failed, running } = progress;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 100;

  const passedPct = total > 0 ? (passed / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;
  const runningPct = total > 0 ? (running / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-[#dfe5df] bg-white p-3.5 text-xs font-sans">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <div className="flex items-center gap-2 text-[#202a2a] font-semibold">
          {isTesting && <span className="size-1.5 rounded-full bg-[#c7872d] animate-pulse" />}
          <span>Test Suite</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#586760]">
          <span className="font-bold text-[#202a2a]">{completed}</span>
          <span className="text-[#adb9b2]">/</span>
          <span>{total} probes</span>
          <span className="font-bold text-[#2c674f] ml-1">{pct}%</span>
        </div>
      </div>

      {/* High-Precision Segmented Progress Bar */}
      <div className="relative h-1.5 w-full rounded-full bg-[#eef2ee] overflow-hidden flex">
        <div
          style={{ width: `${passedPct}%` }}
          className="h-full bg-[#2c674f] transition-all duration-300"
          title={`Passed: ${passed}`}
        />
        <div
          style={{ width: `${failedPct}%` }}
          className="h-full bg-[#9a5141] transition-all duration-300"
          title={`Failed: ${failed}`}
        />
        {running > 0 && (
          <div
            style={{ width: `${runningPct}%` }}
            className="h-full bg-[#c7872d] animate-pulse transition-all duration-300"
            title={`Running: ${running}`}
          />
        )}
      </div>

      {/* High-Density Inline Stats Row */}
      <div className="flex items-center justify-between pt-1 border-t border-[#f0f4f1] text-[11px] font-mono text-[#586760]">
        <div className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[#2c674f]" />
          <span>{passed} Passed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[#9a5141]" />
          <span className={failed > 0 ? "text-[#9a5141] font-semibold" : ""}>{failed} Failed</span>
        </div>
        <div className="flex items-center gap-1 text-[#202a2a]">
          <span className="text-[#899790]">Resilience:</span>
          <span className="font-semibold text-[#2c674f]">{passRate}%</span>
        </div>
      </div>
    </div>
  );
}
