"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function testCloudFunction() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/cloud-function-test", { method: "POST" });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout>
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-4 text-muted-foreground">Welcome to your dashboard!</p>

        <div className="mt-8 space-y-4">
          <Button onClick={testCloudFunction} disabled={loading}>
            {loading ? "Calling..." : "Test Cloud Function"}
          </Button>

          {result && (
            <pre className="rounded-md border bg-muted p-4 text-sm whitespace-pre-wrap">
              {result}
            </pre>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
