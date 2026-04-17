type Props = {
  percentage: number; // 0–100
  tooltip?: string;   // e.g. "3/5 required fields complete"
};

export function MiniProgressBar({ percentage, tooltip }: Props) {
  const fillColor =
    percentage >= 80
      ? "bg-green-500"
      : percentage > 0
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="flex flex-col items-start gap-0.5" title={tooltip}>
      <div className="w-[60px] h-[4px] rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fillColor}`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400">{percentage}%</span>
    </div>
  );
}
