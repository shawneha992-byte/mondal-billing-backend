import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { QuotationStatus, StockRefType } from "@prisma/client";


// ============================
// Create Quotation
// ============================
export const createQuotation = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      branchCode,
      quotationDate,
      validTill,
      notes,
      termsConditions,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      items,
      additionalCharges,
      subTotal,
      taxableAmount,
      discountAmount,
      additionalChargesTotal,
      taxAmount,
      roundOff,
      totalAmount,
    } = req.body;

    if (!partyId || !items || items.length === 0) {
      return res.status(400).json({ message: "Party and items are required" });
    }

    const quotation = await prisma.$transaction(async (tx) => {
      // ── Read (or auto-create) QuotationSettings ────────────────────────
      let settings = await tx.quotationSettings.findFirst();
      if (!settings) {
        settings = await tx.quotationSettings.create({
          data: { prefix: "", sequenceNumber: 1, branchCode: null },
        });
      }

      // ── Build quotation number from prefix + sequence ──────────────────
      const seq        = settings.sequenceNumber;
        const rawPrefix = (settings.prefix ?? "QTN").replace(/-+$/, "").trim();
        const prefix = `${rawPrefix}-`;
      // Check existing quotations to avoid duplicates (handles gaps/deletions)
      const generatedQuotationNo =
          `${prefix}${String(seq).padStart(5, "0")}`;
          await tx.quotationSettings.update({
          where: { id: settings.id },
          data: { sequenceNumber: seq + 1 }
        });

      const created = await tx.quotation.create({
        data: {
          quotationNo:     generatedQuotationNo,            // ← always from settings
          partyId:         Number(partyId),
          branchCode:      branchCode || settings.branchCode || null,
          quotationDate:   quotationDate ? new Date(quotationDate) : new Date(),
          validTill:       validTill ? new Date(validTill) : null,
          notes,
          termsConditions,
          ewayBillNo:      ewayBillNo     || null,
          challanNo:       challanNo      || null,
          financedBy:      financedBy     || null,
          salesman:        salesman       || null,
          emailId:         emailId        || null,
          warrantyPeriod:  warrantyPeriod || null,
          subTotal,
          taxableAmount,
          discountAmount,
          additionalChargesTotal,
          taxAmount,
          roundOff,
          totalAmount,
          items: {
            create: items.map((item: any) => ({
              productId: Number(item.productId),
              quantity:  Number(item.quantity),
              price:     item.price,
              discount:  item.discount,
              taxRate:   item.taxRate,
              taxAmount: item.taxAmount,
              total:     item.total,
            })),
          },
          additionalCharges: {
            create: additionalCharges?.map((charge: any) => ({
              name:   charge.name,
              amount: charge.amount,
            })) || [],
          },
        },
        include: {
          party: true,
          items: { include: { product: true } },
          additionalCharges: true,
        },
      });

      return created;
    });

    res.status(201).json(quotation);
  } catch (error) {
    console.error("Create Quotation Error:", error);
    res.status(500).json({ error: "Failed to create quotation" });
  }
};



// ============================
// Get All Quotations (with filters)
// ============================
export const getAllQuotations = async (req: Request, res: Response) => {
  try {
    const { search, status, startDate, endDate } = req.query;

    const where: any = {};

    // Default to OPEN when no status param is provided.
    // Frontend sends status=all to see everything, status=CONVERTED to see converted.
    if (!status || status === "") {
      where.status = "OPEN";
    } else if (status !== "all") {
      where.status = String(status).toUpperCase();
    }
    // if status === "all" → no status filter → return everything

    if (startDate || endDate) {
      where.quotationDate = {};
      if (startDate) where.quotationDate.gte = new Date(String(startDate));
      if (endDate)   where.quotationDate.lte = new Date(String(endDate) + "T23:59:59.999Z");
    }

    if (search) {
      where.OR = [
        { quotationNo: { contains: String(search), mode: "insensitive" } },
        { party: { partyName: { contains: String(search), mode: "insensitive" } } },
      ];
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        party: true,
        items: { include: { product: true } },
        additionalCharges: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(quotations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
};


// ============================
// Duplicate Quotation
// ============================
export const duplicateQuotation = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const source = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true, additionalCharges: true },
    });

    if (!source) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    // Get next sequence number from settings
    const settingsRecord = await prisma.quotationSettings.findFirst();
    const seqDup    = settingsRecord?.sequenceNumber ?? 1;
    const rawPfxDup = (settingsRecord?.prefix ?? "").trim();
const prefixDup = rawPfxDup ? `${rawPfxDup}-` : "QTN-";
    const newQuotationNo = `${prefixDup}${String(seqDup).padStart(5, "0")}`;

    const duplicate = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          quotationNo: newQuotationNo,
          partyId: source.partyId,
          branchCode: source.branchCode,
          quotationDate: new Date(),
          validTill: source.validTill,
          notes: source.notes,
          termsConditions: source.termsConditions,
          subTotal: source.subTotal,
          taxableAmount: source.taxableAmount,
          discountAmount: source.discountAmount,
          additionalChargesTotal: source.additionalChargesTotal,
          taxAmount: source.taxAmount,
          roundOff: source.roundOff,
          totalAmount: source.totalAmount,
          status: "OPEN",
          items: {
            create: source.items.map((item) => ({
                  productId: Number(item.productId),
                  godownId: Number(item.godownId),
                  quantity: Number(item.quantity),
              price: item.price,
              discount: item.discount,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              total: item.total,
            })),
          },
          additionalCharges: {
            create: source.additionalCharges.map((c) => ({
              name: c.name,
              amount: c.amount,
            })),
          },
        },
        include: { party: true, items: { include: { product: true } }, additionalCharges: true },
      });

      // Bump sequence in settings
      if (settingsRecord) {
        await tx.quotationSettings.update({
          where: { id: settingsRecord.id },
          data: { sequenceNumber: seqDup + 1 },
        });
      }

      return created;
    });

    res.status(201).json(duplicate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to duplicate quotation" });
  }
};


// ============================
// Get Quotation Settings
// ============================
export const getQuotationSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.quotationSettings.findFirst();

    if (!settings) {
      // Auto-create defaults if none exist
      settings = await prisma.quotationSettings.create({
        data: { prefix: "", sequenceNumber: 1, branchCode: null },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch quotation settings" });
  }
};


// ============================
// Save Quotation Settings
// ============================
export const saveQuotationSettings = async (req: Request, res: Response) => {
  try {
    const { prefix, sequenceNumber, branchCode } = req.body;

    let settings = await prisma.quotationSettings.findFirst();

    if (settings) {
      settings = await prisma.quotationSettings.update({
        where: { id: settings.id },
        data: {
          ...(prefix !== undefined && { prefix }),
          ...(sequenceNumber !== undefined && { sequenceNumber: Number(sequenceNumber) }),
          ...(branchCode !== undefined && { branchCode }),
        },
      });
    } else {
      settings = await prisma.quotationSettings.create({
        data: {
          prefix: prefix ?? "",
          sequenceNumber: sequenceNumber ? Number(sequenceNumber) : 1,
          branchCode: branchCode ?? null,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save quotation settings" });
  }
};



// ============================
// Get Quotation By ID
// ============================
export const getQuotationById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        party: true,
        items: {
          include: {
            product: true
          }
        },
        additionalCharges: true
      }
    });

    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    res.json(quotation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching quotation" });
  }
};



// ============================
// Update Quotation
// ============================
export const updateQuotation = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    const {
      status,                // ← allow status-only updates (e.g. CONVERTED from invoice flow)
      notes,
      termsConditions,
      validTill,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      items,
      additionalCharges,
      subTotal,
      taxableAmount,
      discountAmount,
      additionalChargesTotal,
      taxAmount,
      roundOff,
      totalAmount,
    } = req.body;

    // ── Status-only update (e.g. marking CONVERTED after invoice save) ────
    if (status && !items) {
      const updated = await prisma.quotation.update({
        where: { id },
        data: { status: status.toUpperCase() as QuotationStatus },
        include: {
          party: true,
          items: { include: { product: true } },
          additionalCharges: true,
        },
      });
      return res.json(updated);
    }

    const quotation = await prisma.$transaction(async (tx) => {
   
      // ── Delete old items & charges ────────────────────────────────────
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      await tx.quotationAdditionalCharge.deleteMany({ where: { quotationId: id } });

      // ── Update quotation with all fields ──────────────────────────────
      const updated = await tx.quotation.update({
        where: { id },
        data: {
          notes,
          termsConditions,
          validTill:       validTill ? new Date(validTill) : null,
          ewayBillNo:      ewayBillNo      ?? null,
          challanNo:       challanNo       ?? null,
          financedBy:      financedBy      ?? null,
          salesman:        salesman        ?? null,
          emailId:         emailId         ?? null,
          warrantyPeriod:  warrantyPeriod  ?? null,
          subTotal:        subTotal        ?? existing.subTotal,
          taxableAmount:   taxableAmount   ?? existing.taxableAmount,
          discountAmount:  discountAmount  ?? existing.discountAmount,
          additionalChargesTotal: additionalChargesTotal ?? existing.additionalChargesTotal,
          taxAmount:       taxAmount       ?? existing.taxAmount,
          roundOff:        roundOff        ?? existing.roundOff,
          totalAmount,
          items: {
            create: items.map((item: any) => ({
              productId: Number(item.productId),
              quantity:  Number(item.quantity),
              price:     item.price,
              discount:  item.discount,
              taxRate:   item.taxRate,
              taxAmount: item.taxAmount,
              total:     item.total,
            })),
          },
          additionalCharges: {
            create: additionalCharges?.map((c: any) => ({
              name:   c.name,
              amount: c.amount,
            })) || [],
          },
        },
        include: {
          party: true,
          items: { include: { product: true } },
          additionalCharges: true,
        },
      });

    
      return updated;
    });

    res.json(quotation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update quotation" });
  }
};



// ============================
// Delete Quotation
// ============================
export const deleteQuotation = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    await prisma.$transaction(async (tx) => {
    
      await tx.quotation.delete({ where: { id } });
    });

    res.json({ message: "Quotation deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete quotation" });
  }
};



// ============================
// Convert Quotation → Invoice
// ============================
export const convertQuotationToInvoice = async (
  req: Request,
  res: Response
) => {
  try {
    const quotationId = Number(req.params.id);

    // Load quotation with ALL related data needed for the invoice
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: true,
        additionalCharges: true,
      },
    });

    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    if (quotation.status === "CONVERTED") {
      return res.status(400).json({ message: "Quotation already converted to invoice" });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // ── Read (or auto-create) InvoiceSettings for invoice numbering ────
      let invoiceSettings = await tx.invoiceSettings.findFirst();
      if (!invoiceSettings) {
        invoiceSettings = await tx.invoiceSettings.create({
          data: {
            prefix: "",
            sequenceNumber: 1,
            enablePrefix: false,
          },
        });
      }

      // ── Build invoice number from InvoiceSettings prefix + sequence ────
  const updatedSettings = await tx.invoiceSettings.update({
  where: { id: invoiceSettings.id },
  data: {
    sequenceNumber: { increment: 1 }
  }
});

const seq = updatedSettings.sequenceNumber;

const invPrefix =
  invoiceSettings.enablePrefix && invoiceSettings.prefix
    ? invoiceSettings.prefix
    : "INV-";

const invoiceNo = `${invPrefix}${String(seq).padStart(5, "0")}`;


      // ── Create invoice copying ALL fields from the quotation ───────────
 // Check if quotation already converted
const existingInvoice = await tx.invoice.findFirst({
  where: { quotationId }
});

if (existingInvoice) {
  throw new Error("Quotation already converted to invoice");
}

// Now create invoice
const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNo,
          quotationId:           quotation.id,
          partyId:               quotation.partyId,
          branchCode:            quotation.branchCode,
          invoiceDate:           new Date(),
          // Financial fields
          subTotal:              quotation.subTotal,
          taxableAmount:         quotation.taxableAmount,
          discountAmount:        quotation.discountAmount,
          additionalChargesTotal: quotation.additionalChargesTotal,
          taxAmount:             quotation.taxAmount,
          roundOff:              quotation.roundOff,
          totalAmount:           quotation.totalAmount,
          outstandingAmount:     quotation.totalAmount,
          // Extra detail fields
          notes:                 quotation.notes,
          termsConditions:       quotation.termsConditions,
          ewayBillNo:            quotation.ewayBillNo,
          challanNo:             quotation.challanNo,
          financedBy:            quotation.financedBy,
          salesman:              quotation.salesman,
          emailId:               quotation.emailId,
          warrantyPeriod:        quotation.warrantyPeriod,
          // Line items
          items: {
            create: quotation.items.map((item) => ({
              productId: Number(item.productId),
              godownId: Number(item.godownId),
              quantity: Number(item.quantity),
              price:     item.price,
              discount:  item.discount,
              taxRate:   item.taxRate,
              taxAmount: item.taxAmount,
              total:     item.total,
            })),
          },
          // Additional charges
          additionalCharges: {
            create: quotation.additionalCharges.map((c) => ({
              name:   c.name,
              amount: c.amount,
            })),
          },
        },
        include: {
          party: true,
          items: { include: { product: true } },
          additionalCharges: true,
        },
      });
      
// ── Reduce stock for each item (Invoice affects stock) ─────────────
for (const item of quotation.items) {
  if (!item.godownId) {
    throw new Error(`Godown not selected for product ${item.productId}`);
  }

  const stockRecord = await tx.productStock.findUnique({
    where: {
      productId_godownId: {
        productId: item.productId,
        godownId: item.godownId
      }
    }
  });

  if (!stockRecord) {
    throw new Error("Stock record not found for this godown");
  }

const currentBalance = Number(
  stockRecord.currentStock ?? stockRecord.openingStock ?? 0
);


  if (currentBalance < item.quantity) {
    throw new Error(`Insufficient stock for product ${item.productId}`);
  }

  const newBalance = currentBalance - item.quantity;

  await tx.productStock.update({
    where: { id: stockRecord.id },
    data: { currentStock: newBalance }
  });

  await tx.stockLedger.create({
    data: {
      productId: item.productId,
      godownId: item.godownId!,
       date: new Date(),
      refType: StockRefType.SALE,
      refId: createdInvoice.id,
      quantityIn: 0,
      quantityOut: item.quantity,
      balance: newBalance,
      remarks: `Sales Invoice ${createdInvoice.invoiceNo}`
    }
  });

}
      // ── Mark quotation as CONVERTED ────────────────────────────────────
      await tx.quotation.update({
        where: { id: quotationId },
        data:  { status: QuotationStatus.CONVERTED },
      });

      return createdInvoice;
    });

    res.json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to convert quotation" });
  }
  
};