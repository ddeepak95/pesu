import { callCloudFunction } from "@/lib/cloud-functions";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const data = await callCloudFunction("hello_world");
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
