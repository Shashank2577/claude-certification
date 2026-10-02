import { requireUser } from "@/lib/auth";
import { addDays, dayKey, daysBetween } from "@/lib/dates";
import { getSettings } from "@/lib/repo/settings";

// A daily "five-minute start" reminder as an .ics file the learner imports into their calendar.
// Times are floating (no TZID, no Z), so 19:00 means 19:00 wherever the learner's device is.

const DEFAULT_COUNT = 30;

function compact(day: string) {
  return day.replaceAll("-", "");
}

/** RFC 5545 lines are at most 75 octets; longer ones continue on lines starting with a space. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(req: Request) {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  const now = Date.now();
  const today = dayKey(now, settings.tz);
  const url = `${new URL(req.url).origin}/today`;

  // Repeat until the exam if it's ahead, otherwise for the next 30 days.
  const exam = settings.examDate && /^\d{4}-\d{2}-\d{2}$/.test(settings.examDate) ? settings.examDate : null;
  const until = exam && daysBetween(today, exam) >= 0 ? exam : null;
  const rrule = until ? `RRULE:FREQ=DAILY;UNTIL=${compact(until)}T190000` : `RRULE:FREQ=DAILY;COUNT=${DEFAULT_COUNT}`;
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lastDay = until ?? addDays(today, DEFAULT_COUNT - 1);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Architect Prep//Daily reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:daily-start-${user.id}@architect-prep`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${compact(today)}T190000`,
    `DTEND:${compact(today)}T191000`,
    rrule,
    "SUMMARY:Study: 5-minute start",
    `DESCRIPTION:${escapeText(`Open today’s plan and do five minutes. Stop after that if you want. Repeats daily until ${lastDay}.\n${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Study: 5-minute start",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="study-reminder.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
