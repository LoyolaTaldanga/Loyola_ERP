import { NextResponse } from "next/server";

export type ExportFormat = "xlsx" | "pdf";

export function parseFormat(value: string | null): ExportFormat | null {
  return value === "xlsx" || value === "pdf" ? value : null;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function fileResponse(buffer: Buffer, filename: string, format: ExportFormat): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
