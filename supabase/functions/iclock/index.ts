// ZKTeco ADMS ("iclock") push endpoint. Devices call /iclock/cdata and
// /iclock/getrequest; a rewrite (see vercel.json) maps them here.
// Only devices whose serial number is approved are stored.
import { admin } from "../_shared/clients.ts";

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sn = url.searchParams.get("SN") ?? "";
  const path = url.pathname.replace(/\/+$/, "");
  if (!sn) return text("ERROR: missing SN", 400);

  const { data: device } = await admin.from("attendance_devices").select("*").eq("serial_no", sn).maybeSingle();
  if (!device) {
    // remember unknown devices so HR can approve them, but store nothing
    await admin.from("attendance_devices").insert({ serial_no: sn, approved: false, last_seen_at: new Date().toISOString() });
    return text("OK");
  }
  await admin.from("attendance_devices").update({ last_seen_at: new Date().toISOString() }).eq("serial_no", sn);
  if (!device.approved) return text("OK");

  if (path.endsWith("/getrequest") || path.endsWith("/devicecmd")) return text("OK");

  if (req.method === "GET") {
    // handshake: ask the device to push attendance logs in real time
    return text([
      `GET OPTION FROM: ${sn}`,
      "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None",
      "ErrorDelay=30", "Delay=10", "TransTimes=00:00;14:05", "TransInterval=1",
      "TransFlag=TransData AttLog", "TimeZone=3", "Realtime=1", "Encrypt=None",
    ].join("\n"));
  }

  const table = url.searchParams.get("table");
  if (table !== "ATTLOG") return text("OK");

  const body = await req.text();
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pins = [...new Set(lines.map((l) => l.split("\t")[0]))];
  const { data: emps } = await admin.from("employees").select("id, device_user_id").in("device_user_id", pins);
  const byPin = new Map((emps ?? []).map((e) => [e.device_user_id, e.id]));

  const rows = lines.flatMap((line) => {
    const [pin, stamp, status] = line.split("\t");
    const employee_id = byPin.get(pin);
    if (!employee_id || !stamp) return [];
    // device clock is Riyadh local time
    const punched_at = new Date(stamp.replace(" ", "T") + "+03:00").toISOString();
    const punch_type = status === "0" ? "in" : status === "1" ? "out" : "auto";
    return [{ employee_id, punched_at, punch_type, source: "device", device_serial: sn, raw: line }];
  });
  if (rows.length) {
    await admin.from("attendance_logs").upsert(rows, { onConflict: "employee_id,punched_at", ignoreDuplicates: true });
  }
  return text(`OK: ${lines.length}`);
});
