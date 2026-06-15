import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "public",
    "downloads",
    "palindrome.py",
  );

  try {
    const body = await readFile(filePath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/x-python; charset=utf-8",
        "Content-Disposition": 'attachment; filename="palindrome.py"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
