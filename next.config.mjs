/** @type {import('next').NextConfig} */
const nextConfig = {
  // scripts/import-report.json is only read via a dynamic fs.readFileSync
  // (path.join(process.cwd(), ...)), which Next's build-time file tracing
  // can't statically resolve — without this, the file gets silently left
  // out of the deployed serverless function bundle, and these routes crash
  // at runtime in production despite building successfully.
  outputFileTracingIncludes: {
    "/admin/import-report": ["./scripts/import-report.json"],
    "/admin/timetable": ["./scripts/import-report.json"],
    "/admin/timetable/review": ["./scripts/import-report.json"],
  },
};

export default nextConfig;
