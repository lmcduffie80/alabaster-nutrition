import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

export const invoiceReadingSchema = z.object({
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("YYYY-MM-DD"),
  invoiceTotal: z.number().nullable().describe("Amount due, in dollars"),
  lines: z.array(
    z.object({
      itemCode: z.string().nullable().describe("The supplier's item or product code, exactly as printed"),
      description: z.string(),
      quantity: z.number().nullable().describe("Quantity shipped or delivered, in the invoice's units"),
      invoiceUnit: z.string().nullable().describe("Like case, each, box"),
      unitPrice: z.number().nullable(),
      lineTotal: z.number().nullable().describe("Extended price for the line, in dollars"),
    }),
  ),
});

export type InvoiceReading = z.infer<typeof invoiceReadingSchema>;

const INSTRUCTIONS = `You read supplier invoices for a small smoothie and nutrition shop.
Return what is printed on the invoice pages, in order.
- One entry in "lines" per product line. Skip subtotals, taxes, and payment lines, but keep fees and deposits as lines.
- Copy item codes exactly, including leading zeros and dashes.
- Use the quantity shipped or delivered when it differs from the quantity ordered.
- If a field is missing, cut off, or unreadable, return null. Never guess a value.`;

export const INVOICE_TIMEOUT_MS = 60_000;

/** The one call to OpenAI. Pages are JPEG bytes, in order. */
export async function readInvoice(pages: Uint8Array[]): Promise<InvoiceReading> {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { output } = await generateText({
    model: openai(process.env.INVOICE_MODEL || "gpt-5.6-terra"),
    output: Output.object({ schema: invoiceReadingSchema }),
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `This invoice has ${pages.length} page${pages.length === 1 ? "" : "s"}.` },
          ...pages.map((data) => ({
            type: "file" as const,
            mediaType: "image/jpeg",
            data,
            providerOptions: { openai: { imageDetail: "high" } },
          })),
        ],
      },
    ],
    timeout: INVOICE_TIMEOUT_MS,
  });
  return output;
}
