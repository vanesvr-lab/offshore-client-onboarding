"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  BarChart3,
  Info,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface AvgDaysPoint {
  month: string;
  days: number | null;
}

export interface StageTimeRow {
  stageKey: string;
  stageName: string;
  avgDays: number;
}

export interface ApprovalRatePoint {
  month: string;
  rate: number;
}

export interface StatusCountBar {
  status: string;
  label: string;
  count: number;
  fill: string;
}

export interface DashboardAnalyticsData {
  avgDaysToApproval: AvgDaysPoint[];
  timeInStage: StageTimeRow[];
  approvalRate: ApprovalRatePoint[];
  appsByStatus: StatusCountBar[];
}

function CardShell({
  title,
  icon: Icon,
  exploreHref,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  exploreHref: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-brand-navy shrink-0" />
            <p className="text-sm font-medium text-gray-700">{title}</p>
          </div>
          <div className="flex items-center gap-1 text-gray-300">
            <button title="Info" className="hover:text-gray-400">
              <Info className="h-3.5 w-3.5" />
            </button>
            <button title="Settings" className="hover:text-gray-400">
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-3">
        {children}
        <div className="text-right mt-3">
          <Link
            href={exploreHref}
            className="text-xs text-brand-blue hover:underline"
          >
            Explore →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardAnalytics({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const maxStageAvg = Math.max(...data.timeInStage.map((s) => s.avgDays), 1);
  const longestStageKey =
    data.timeInStage.length > 0
      ? data.timeInStage.reduce((a, b) => (a.avgDays >= b.avgDays ? a : b)).stageKey
      : null;

  return (
    <div>
      {/* Section header + filter bar */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-brand-navy">
          Onboarding KPIs
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <button className="hover:text-gray-600 transition-colors">
            Filters
          </button>
          <span>|</span>
          <button className="hover:text-gray-600 transition-colors">
            Export
          </button>
          <span>|</span>
          <button className="hover:text-gray-600 transition-colors">
            Customize
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Card 1: Avg Days to Approval — Line chart */}
        <CardShell
          title="Avg Days to Approval"
          icon={TrendingUp}
          exploreHref="/admin/applications"
        >
          {data.avgDaysToApproval.every((d) => d.days === null) ? (
            <div className="h-28 flex items-center justify-center text-xs text-gray-400">
              No approved applications yet
            </div>
          ) : (
            <div className="h-28 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.avgDaysToApproval}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: unknown) =>
                      v != null ? [`${v} days`, "Avg"] : ["—", "Avg"]
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="days"
                    stroke="#1e3a8a"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#1e3a8a" }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>

        {/* Card 2: Time in Stage — list view */}
        <CardShell
          title="Time in Stage"
          icon={Clock}
          exploreHref="/admin/applications"
        >
          {data.timeInStage.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-xs text-gray-400">
              No stage transition data yet
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {data.timeInStage.map((row) => {
                const isLongest = row.stageKey === longestStageKey;
                const barWidth =
                  maxStageAvg > 0
                    ? Math.round((row.avgDays / maxStageAvg) * 100)
                    : 0;
                return (
                  <div key={row.stageKey}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-gray-600 truncate max-w-[120px]">
                        {row.stageName}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          isLongest ? "text-brand-accent" : "text-gray-500"
                        }`}
                      >
                        {row.avgDays.toFixed(1)}d
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          isLongest ? "bg-brand-accent" : "bg-brand-blue"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {isLongest && (
                      <p className="text-[10px] text-brand-accent mt-0.5">
                        Longest phase
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardShell>

        {/* Card 3: Approval Rate — Bar chart */}
        <CardShell
          title="Approval Rate"
          icon={CheckCircle}
          exploreHref="/admin/applications"
        >
          {data.approvalRate.every((d) => d.rate === 0) ? (
            <div className="h-28 flex items-center justify-center text-xs text-gray-400">
              No completed applications yet
            </div>
          ) : (
            <div className="h-28 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.approvalRate}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: unknown) => [`${v}%`, "Approval rate"]}
                  />
                  <Bar dataKey="rate" fill="#10B981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>

        {/* Card 4: Applications by Status — Bar chart */}
        <CardShell
          title="Applications by Status"
          icon={BarChart3}
          exploreHref="/admin/applications"
        >
          {data.appsByStatus.every((d) => d.count === 0) ? (
            <div className="h-28 flex items-center justify-center text-xs text-gray-400">
              No applications yet
            </div>
          ) : (
            <div className="h-28 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.appsByStatus}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={32}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: unknown, _: unknown, props: { payload?: { label?: string } }) => [
                      String(v),
                      props.payload?.label ?? "",
                    ]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {data.appsByStatus.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>
      </div>
    </div>
  );
}
