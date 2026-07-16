import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UsageSummaryCardsProps {
  balance: number;
  spentThisPeriod: number;
  callsThisPeriod: number;
}

export default function UsageSummaryCards({
  balance,
  spentThisPeriod,
  callsThisPeriod,
}: UsageSummaryCardsProps) {
  const items = [
    {
      label: "Current balance",
      value: balance.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      suffix: "credits",
    },
    {
      label: "Spent this period",
      value: spentThisPeriod.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
      suffix: "credits",
    },
    {
      label: "AI calls this period",
      value: callsThisPeriod.toLocaleString(),
      suffix: "calls",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {item.value}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {item.suffix}
              </span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
