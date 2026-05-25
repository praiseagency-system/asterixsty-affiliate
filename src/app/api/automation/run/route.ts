import { NextResponse } from "next/server";
import { runReminderEngine } from "@/lib/reminder-engine";

export async function POST() {
  try {
    const result = await runReminderEngine();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
