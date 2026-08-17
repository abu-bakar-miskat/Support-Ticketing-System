// The app treats start/due dates as naive calendar dates and assumes the
// server and clients share one timezone (see src/lib/ticket-datetime.ts).
// Vercel's Lambda runtime defaults to UTC, so all-day due dates stamped at
// server-local 23:59 rendered for a +6 (Bangladesh) user rolled onto the next
// day. Pin the runtime to the users' timezone to restore that assumption.
// Override with APP_TZ if the user base ever moves.
export function register() {
  process.env.TZ = process.env.APP_TZ || "Asia/Dhaka";
}
