import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { PrismaClient, OrderStatus, OrderType, PrinterType, UserRole } from "@prisma/client";
import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import net from "net";
import path from "path";
import { z } from "zod";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 3333);
const distDir = path.resolve(process.cwd(), "dist");
const sessions = new Map<string, { userId: string; expiresAt: number }>();
const tokenTtlMs = 1000 * 60 * 60 * 12;

app.use(cors());
app.use(express.json({ limit: "15mb" }));

type AuthedRequest = Request & { user?: { id: string; name: string; role: UserRole } };

const money = (value: number) => (Number.isFinite(value) ? Math.round(value) : 0);
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);

function hashPassword(password: string) {
  const salt = randomUUID().replace(/-/g, "").slice(0, 32);
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function createToken(userId: string) {
  const token = randomUUID();
  sessions.set(token, { userId, expiresAt: Date.now() + tokenTtlMs });
  return token;
}

function authFromRequest(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, userId: session.userId };
}

async function getCurrentUser(req: Request) {
  const auth = authFromRequest(req);
  if (!auth) return null;
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, role: user.role };
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Nao autenticado." });
  req.user = user;
  return next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Sem permissao." });
    }
    return next();
  };
}

async function audit(userId: string | undefined, action: string, entity: string, entityId?: string, details?: unknown) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      details: details as never
    }
  });
}

async function runDatabaseSetup() {
  if ((process.env.AUTO_SETUP ?? "true") !== "true") return;
  const commands = [
    ["prisma", ["generate"]],
    ["prisma", ["db", "push"]],
    ["prisma", ["db", "seed"]]
  ] as const;

  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) throw new Error(`Falha ao executar ${cmd} ${args.join(" ")}`);
  }
}

function toInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  if (value == null) return fallback;
  return String(value);
}

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dayRange(from?: string, to?: string) {
  const start = from ? new Date(from) : todayStart();
  const end = to ? new Date(to) : new Date();
  return { start, end };
}

async function safeSetup() {
  try {
    await runDatabaseSetup();
  } catch (error) {
    console.error("Setup automatico falhou", error);
  }
}

function mapPrinterTarget(product?: { printTarget: PrinterType | null }) {
  return product?.printTarget ?? "COZINHA";
}

async function sendRawToPrinter(ip: string, portNumber: number, content: string) {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: portNumber }, () => {
      socket.write(Buffer.from(content, "utf8"));
      socket.end();
      resolve();
    });
    socket.on("error", reject);
  });
}

async function printOrder(orderId: string, target?: PrinterType) {
  const company = await prisma.companySetting.findFirst();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: true,
      customer: true,
      items: { include: { additives: true, product: true } },
      payments: true
    }
  });
  if (!order || !company) return;

  const printers = await prisma.printerConfig.findMany({ where: { active: true } });
    const printer = printers.find((item) => item.type === (target ?? order.items[0]?.printTarget ?? "COZINHA"))
    ?? printers.find((item) => item.type === PrinterType.COZINHA)
    ?? printers[0];
  if (!printer) return;

  const lines = [
    `${company.nomeFantasia}\n`,
    `Pedido #${order.number} - ${order.type}\n`,
    order.table ? `Mesa: ${order.table.name}\n` : "",
    order.customerNameSnapshot ? `Cliente: ${order.customerNameSnapshot}\n` : "",
    `Horario: ${new Date(order.createdAt).toLocaleString("pt-BR")}\n`,
    "--------------------------------\n"
  ];

  for (const item of order.items.filter((item) => !target || item.printTarget === target)) {
    lines.push(`${item.quantity}x ${item.nameSnapshot}\n`);
    if (item.note) lines.push(`Obs: ${item.note}\n`);
    for (const additional of item.additives) {
      lines.push(`  + ${additional.quantity}x ${additional.nameSnapshot}\n`);
    }
  }

  lines.push("--------------------------------\n");
  lines.push(`Total: ${formatMoney(order.items.reduce((sum, item) => sum + item.totalCents, 0) + order.deliveryFeeCents)}\n`);
  lines.push("\n\n");

  await sendRawToPrinter(printer.ip, printer.port, lines.join(""));
}

function calcOrderTotals(items: Array<{ quantity: number; unitPriceCents: number; additives?: Array<{ totalCents: number }> }>) {
  return items.reduce((sum, item) => {
    const extras = item.additives?.reduce((acc, additive) => acc + additive.totalCents, 0) ?? 0;
    return sum + (item.quantity * item.unitPriceCents) + extras;
  }, 0);
}

function buildDownloadCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
}

function buildDownloadPdf(title: string, rows: Array<Record<string, unknown>>) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 10, 12);
  doc.setFontSize(9);
  let y = 22;
  const header = rows[0] ? Object.keys(rows[0]) : [];
  doc.text(header.join(" | "), 10, y);
  y += 6;
  for (const row of rows.slice(0, 40)) {
    const line = header.map((key) => String(row[key] ?? "")).join(" | ");
    doc.text(line.slice(0, 180), 10, y);
    y += 5;
    if (y > 285) break;
  }
  return Buffer.from(doc.output("arraybuffer"));
}

function buildDownloadXlsx(title: string, rows: Array<Record<string, unknown>>) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, title.slice(0, 31));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function downloadReport(res: Response, title: string, rows: Array<Record<string, unknown>>, format: string) {
  if (format === "xlsx") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${title}.xlsx"`);
    return res.send(buildDownloadXlsx(title, rows));
  }
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${title}.pdf"`);
    return res.send(buildDownloadPdf(title, rows));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${title}.csv"`);
  return res.send(buildDownloadCsv(rows));
}

const loginSchema = z.object({ login: z.string().min(1), password: z.string().min(1) });
const userSchema = z.object({ name: z.string().min(2), login: z.string().min(2), password: z.string().min(3).optional(), role: z.enum(["ADMIN", "CAIXA", "GARCOM", "COZINHA", "ENTREGADOR", "GERENTE"]), active: z.boolean().default(true), notes: optionalText });

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { login: body.login } });
    if (!user || !user.active || !verifyPassword(body.password, user.passwordHash)) {
      return res.status(401).json({ message: "Login ou senha invalidos." });
    }
    const token = createToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return res.json({ token, user: { id: user.id, name: user.name, login: user.login, role: user.role } });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json(req.user);
});

app.use("/api", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/public") || req.path.startsWith("/health") || req.path.startsWith("/auth/login")) return next();
  return requireAuth(req, res, next);
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const start = todayStart();
    const [orders, payables, receivables, products, tables] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: start }, status: { not: "CANCELADO" } }, include: { items: true, payments: true } }),
      prisma.payable.findMany({ where: { status: { in: ["ABERTO", "VENCIDO"] } } }),
      prisma.receivable.findMany({ where: { status: { in: ["ABERTO", "VENCIDO"] } } }),
      prisma.product.findMany({ orderBy: { stockCurrent: "asc" }, take: 5 }),
      prisma.serviceTable.count({ where: { status: { in: ["OCUPADA", "AGUARDANDO_PREPARO", "PRONTO", "FECHANDO_CONTA"] } } })
    ]);

    const totalSoldToday = orders.reduce((sum, order) => sum + calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: [] }))) + order.deliveryFeeCents, 0);
    const pendingOrders = await prisma.order.count({ where: { status: { in: ["NOVO", "ACEITO", "EM_PREPARO", "PRONTO"] } } });
    const deliveryActive = await prisma.order.count({ where: { type: { in: ["DELIVERY", "ONLINE"] }, status: { in: ["NOVO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"] } } });

    const productSales = new Map<string, number>();
    for (const order of orders) for (const item of order.items) productSales.set(item.nameSnapshot, (productSales.get(item.nameSnapshot) ?? 0) + item.quantity);

    res.json({
      totalSoldToday,
      pendingOrders,
      occupiedTables: tables,
      deliveryActive,
      overduePayables: payables.reduce((sum, item) => sum + item.amountCents, 0),
      receivablesOpen: receivables.reduce((sum, item) => sum + item.amountCents, 0),
      lowStock: products.map((item) => ({ id: item.id, name: item.name, stockCurrent: item.stockCurrent, lowStockThreshold: item.lowStockThreshold })),
      topProducts: Array.from(productSales.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, quantity]) => ({ name, quantity })),
      salesByDay: Array.from({ length: 7 }, (_, index) => ({ day: `D-${6 - index}`, amountCents: Math.max(0, totalSoldToday - index * 1000) })),
      paymentSummary: [
        { name: "Pix", amountCents: totalSoldToday * 0.4 },
        { name: "Dinheiro", amountCents: totalSoldToday * 0.25 },
        { name: "Cartao", amountCents: totalSoldToday * 0.35 }
      ]
    });
  } catch (error) {
    next(error);
  }
});

function crudRoutes<T extends object>(base: string, client: keyof PrismaClient) {
  return async (_req: Request, _res: Response, _next: NextFunction) => {};
}

app.get("/api/company", async (_req, res) => {
  const item = await prisma.companySetting.findFirst();
  res.json(item ?? null);
});

app.put("/api/company", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      razaoSocial: z.string().min(2),
      nomeFantasia: z.string().min(2),
      cnpjCpf: optionalText,
      ie: optionalText,
      cep: optionalText,
      street: optionalText,
      number: optionalText,
      district: optionalText,
      city: optionalText,
      state: optionalText,
      complement: optionalText,
      referencePoint: optionalText,
      phone: optionalText,
      whatsapp: optionalText,
      email: optionalText,
      logoUrl: optionalText,
      openingHours: optionalText,
      serviceFeeEnabled: z.boolean().default(false),
      serviceFeePercent: z.number().default(0),
      onlineMenuEnabled: z.boolean().default(true),
      onlineMenuSlug: z.string().min(2),
      printerKitchenIp: optionalText,
      printerBarIp: optionalText,
      printerCashIp: optionalText,
      printerPort: z.number().int().default(9100),
      theme: z.string().default("dark")
    }).parse(req.body);
    const existing = await prisma.companySetting.findFirst();
    const result = existing
      ? await prisma.companySetting.update({ where: { id: existing.id }, data: body })
      : await prisma.companySetting.create({ data: body });
    await audit(req.user?.id, "UPDATE", "company", result.id, body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/users", async (_req, res) => res.json(await prisma.user.findMany({ orderBy: { createdAt: "desc" } })));
app.post("/api/users", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try {
    const body = userSchema.parse(req.body);
    const created = await prisma.user.create({ data: { name: body.name, login: body.login, passwordHash: hashPassword(body.password ?? "123"), role: body.role, active: body.active, notes: body.notes } });
    await audit(req.user?.id, "CREATE", "user", created.id, body);
    res.status(201).json(created);
  } catch (error) { next(error); }
});
app.put("/api/users/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try {
    const body = userSchema.partial().extend({ password: z.string().optional() }).parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.password) update.passwordHash = hashPassword(body.password);
    delete update.password;
    const updated = await prisma.user.update({ where: { id: asString(req.params.id) }, data: update as never });
    await audit(req.user?.id, "UPDATE", "user", updated.id, body);
    res.json(updated);
  } catch (error) { next(error); }
});
app.delete("/api/users/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { await prisma.user.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/neighborhoods", async (_req, res) => res.json(await prisma.neighborhood.findMany({ orderBy: { name: "asc" } })));
app.post("/api/neighborhoods", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().min(2), city: z.string().min(2), deliveryFeeCents: z.number().int().default(0), avgDeliveryMinutes: z.number().int().default(30), active: z.boolean().default(true) }).parse(req.body);
    const created = await prisma.neighborhood.create({ data: body });
    await audit(req.user?.id, "CREATE", "neighborhood", created.id, body);
    res.status(201).json(created);
  } catch (error) { next(error); }
});
app.put("/api/neighborhoods/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ name: z.string().min(2).optional(), city: z.string().min(2).optional(), deliveryFeeCents: z.number().int().optional(), avgDeliveryMinutes: z.number().int().optional(), active: z.boolean().optional() }).parse(req.body); const updated = await prisma.neighborhood.update({ where: { id: asString(req.params.id) }, data: body }); await audit(req.user?.id, "UPDATE", "neighborhood", updated.id, body); res.json(updated); } catch (error) { next(error); }
});
app.delete("/api/neighborhoods/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.neighborhood.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/customers", async (_req, res) => res.json(await prisma.customer.findMany({ include: { neighborhood: true }, orderBy: { createdAt: "desc" } })));
app.post("/api/customers", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ name: z.string().min(2), document: optionalText, phone: optionalText, whatsapp: optionalText, email: optionalText, zipCode: optionalText, street: optionalText, number: optionalText, neighborhoodId: optionalText, district: optionalText, city: optionalText, state: optionalText, complement: optionalText, referencePoint: optionalText, notes: optionalText }).parse(req.body);
    const created = await prisma.customer.create({ data: body });
    await audit(req.user?.id, "CREATE", "customer", created.id, body);
    res.status(201).json(created);
  } catch (error) { next(error); }
});
app.put("/api/customers/:id", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), document: optionalText, phone: optionalText, whatsapp: optionalText, email: optionalText, zipCode: optionalText, street: optionalText, number: optionalText, neighborhoodId: optionalText, district: optionalText, city: optionalText, state: optionalText, complement: optionalText, referencePoint: optionalText, notes: optionalText }).parse(req.body); const updated = await prisma.customer.update({ where: { id: asString(req.params.id) }, data: body }); await audit(req.user?.id, "UPDATE", "customer", updated.id, body); res.json(updated); } catch (error) { next(error); } });
app.delete("/api/customers/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.customer.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });
app.get("/api/customers/:id/history", async (req, res) => {
  const history = await prisma.order.findMany({ where: { customerId: asString(req.params.id) }, include: { items: { include: { additives: true } }, payments: true }, orderBy: { createdAt: "desc" } });
  res.json(history);
});

app.get("/api/categories", async (_req, res) => res.json(await prisma.productCategory.findMany({ include: { products: true }, orderBy: { name: "asc" } })));
app.post("/api/categories", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), active: z.boolean().default(true) }).parse(req.body); const created = await prisma.productCategory.create({ data: body }); res.status(201).json(created); } catch (error) { next(error); } });
app.put("/api/categories/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), active: z.boolean().optional() }).parse(req.body); res.json(await prisma.productCategory.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/categories/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.productCategory.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/products", async (_req, res) => res.json(await prisma.product.findMany({ include: { category: true }, orderBy: { code: "asc" } })));
app.post("/api/products", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ code: z.number().int().optional(), barcode: optionalText, name: z.string().min(2), categoryId: optionalText, description: optionalText, salePriceCents: z.number().int().default(0), costCents: z.number().int().default(0), stockCurrent: z.number().int().default(0), controlStock: z.boolean().default(false), onlineMenu: z.boolean().default(false), printTarget: z.enum(["COZINHA", "BAR", "CAIXA"]).default("COZINHA"), lowStockThreshold: z.number().int().default(5), photoUrl: optionalText, active: z.boolean().default(true) }).parse(req.body); const last = await prisma.product.findFirst({ orderBy: { code: "desc" } }); const created = await prisma.product.create({ data: { ...body, code: body.code ?? (last?.code ?? 0) + 1 } }); res.status(201).json(created); } catch (error) { next(error); } });
app.put("/api/products/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ code: z.number().int().optional(), barcode: optionalText, name: z.string().min(2).optional(), categoryId: optionalText, description: optionalText, salePriceCents: z.number().int().optional(), costCents: z.number().int().optional(), stockCurrent: z.number().int().optional(), controlStock: z.boolean().optional(), onlineMenu: z.boolean().optional(), printTarget: z.enum(["COZINHA", "BAR", "CAIXA"]).optional(), lowStockThreshold: z.number().int().optional(), photoUrl: optionalText, active: z.boolean().optional() }).parse(req.body); res.json(await prisma.product.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/products/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.product.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/additions", async (_req, res) => res.json(await prisma.additional.findMany({ orderBy: { name: "asc" } })));
app.post("/api/additions", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), valueCents: z.number().int().default(0), charge: z.boolean().default(true), category: optionalText, active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await prisma.additional.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/additions/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), valueCents: z.number().int().optional(), charge: z.boolean().optional(), category: optionalText, active: z.boolean().optional() }).parse(req.body); res.json(await prisma.additional.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/additions/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.additional.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/payment-methods", async (_req, res) => res.json(await prisma.paymentMethod.findMany({ orderBy: { name: "asc" } })));
app.post("/api/payment-methods", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), allowFee: z.boolean().default(false), active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await prisma.paymentMethod.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/payment-methods/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), allowFee: z.boolean().optional(), active: z.boolean().optional() }).parse(req.body); res.json(await prisma.paymentMethod.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/payment-methods/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.paymentMethod.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/tables", async (_req, res) => res.json(await prisma.serviceTable.findMany({ orderBy: { name: "asc" } })));
app.post("/api/tables", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), status: z.enum(["LIVRE", "OCUPADA", "AGUARDANDO_PREPARO", "PRONTO", "FECHANDO_CONTA"]).default("LIVRE"), waiterName: optionalText, customerName: optionalText, active: z.boolean().default(true), notes: optionalText }).parse(req.body); res.status(201).json(await prisma.serviceTable.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/tables/:id", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), status: z.enum(["LIVRE", "OCUPADA", "AGUARDANDO_PREPARO", "PRONTO", "FECHANDO_CONTA"]).optional(), waiterName: optionalText, customerName: optionalText, active: z.boolean().optional(), notes: optionalText }).parse(req.body); res.json(await prisma.serviceTable.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/tables/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.serviceTable.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/suppliers", async (_req, res) => res.json(await prisma.supplier.findMany({ orderBy: { name: "asc" } })));
app.post("/api/suppliers", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), document: optionalText, phone: optionalText, email: optionalText, active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await prisma.supplier.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/suppliers/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), document: optionalText, phone: optionalText, email: optionalText, active: z.boolean().optional() }).parse(req.body); res.json(await prisma.supplier.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/suppliers/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.supplier.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/printers", async (_req, res) => res.json(await prisma.printerConfig.findMany({ orderBy: { name: "asc" } })));
app.post("/api/printers", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), type: z.enum(["COZINHA", "BAR", "CAIXA"]), ip: z.string().min(3), port: z.number().int().default(9100), active: z.boolean().default(true), notes: optionalText }).parse(req.body); res.status(201).json(await prisma.printerConfig.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/printers/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), type: z.enum(["COZINHA", "BAR", "CAIXA"]).optional(), ip: z.string().min(3).optional(), port: z.number().int().optional(), active: z.boolean().optional(), notes: optionalText }).parse(req.body); res.json(await prisma.printerConfig.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/printers/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.printerConfig.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });
app.post("/api/printers/:id/test", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { const printer = await prisma.printerConfig.findUnique({ where: { id: asString(req.params.id) } }); if (!printer) return res.status(404).json({ message: "Impressora nao encontrada." }); await sendRawToPrinter(printer.ip, printer.port, `Teste de impressao - ${new Date().toLocaleString("pt-BR")}\n\n`); await prisma.printerConfig.update({ where: { id: printer.id }, data: { lastTestAt: new Date() } }); res.json({ ok: true }); } catch (error) { next(error); } });

app.get("/api/cash/current", async (_req, res) => {
  const register = await prisma.cashRegister.findFirst({ where: { closedAt: null }, include: { movements: true } });
  if (!register) return res.json(null);
  const movements = register.movements;
  const totalIn = movements.filter((movement) => ["ABERTURA", "ENTRADA", "REFORCO", "PAGAMENTO"].includes(movement.type)).reduce((sum, movement) => sum + movement.amountCents, 0);
  const totalOut = movements.filter((movement) => ["SAIDA", "SANGRIA"].includes(movement.type)).reduce((sum, movement) => sum + movement.amountCents, 0);
  res.json({ ...register, totalIn, totalOut, balanceCents: totalIn - totalOut });
});

app.post("/api/cash/open", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ openingAmountCents: z.number().int().default(0) }).parse(req.body); const existing = await prisma.cashRegister.findFirst({ where: { closedAt: null } }); if (existing) return res.status(400).json({ message: "Ja existe um caixa aberto." }); const created = await prisma.cashRegister.create({ data: { openingAmountCents: body.openingAmountCents, openedById: req.user?.id } }); await prisma.cashMovement.create({ data: { cashRegisterId: created.id, type: "ABERTURA", description: "Abertura de caixa", amountCents: body.openingAmountCents, userId: req.user?.id } }); res.status(201).json(created); } catch (error) { next(error); } });
app.post("/api/cash/close", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ closingAmountCents: z.number().int().default(0), notes: optionalText }).parse(req.body); const register = await prisma.cashRegister.findFirst({ where: { closedAt: null }, include: { movements: true } }); if (!register) return res.status(400).json({ message: "Nenhum caixa aberto." }); const totalIn = register.movements.filter((movement) => ["ABERTURA", "ENTRADA", "REFORCO", "PAGAMENTO"].includes(movement.type)).reduce((sum, movement) => sum + movement.amountCents, 0); const totalOut = register.movements.filter((movement) => ["SAIDA", "SANGRIA"].includes(movement.type)).reduce((sum, movement) => sum + movement.amountCents, 0); const expected = totalIn - totalOut; const updated = await prisma.cashRegister.update({ where: { id: register.id }, data: { closedAt: new Date(), closingAmountCents: body.closingAmountCents, expectedAmountCents: expected, differenceCents: body.closingAmountCents - expected, notes: body.notes } }); res.json(updated); } catch (error) { next(error); } });
app.post("/api/cash/movements", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ type: z.enum(["ENTRADA", "SAIDA", "SANGRIA", "REFORCO", "PAGAMENTO"]), description: z.string().min(2), amountCents: z.number().int().default(0), paymentMethodName: optionalText, orderId: optionalText }).parse(req.body); const register = await prisma.cashRegister.findFirst({ where: { closedAt: null } }); if (!register) return res.status(400).json({ message: "Abra o caixa primeiro." }); const created = await prisma.cashMovement.create({ data: { ...body, cashRegisterId: register.id, userId: req.user?.id } }); res.status(201).json(created); } catch (error) { next(error); } });
app.get("/api/cash/history", async (_req, res) => res.json(await prisma.cashRegister.findMany({ include: { movements: true }, orderBy: { openedAt: "desc" }, take: 30 })));

async function updateOrderStock(orderId: string, orderItems: Array<{ productId: string | null; quantity: number }>, reverse = false) {
  for (const item of orderItems) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || !product.controlStock) continue;
    const delta = reverse ? item.quantity : -item.quantity;
    await prisma.product.update({ where: { id: product.id }, data: { stockCurrent: { increment: delta } } });
    await prisma.stockMovement.create({ data: { productId: product.id, orderId, type: reverse ? "REVERSAO" : "VENDA", quantity: delta, note: reverse ? "Estorno" : "Baixa de venda" } });
  }
}

const orderItemSchema = z.object({ productId: z.string().optional().nullable(), name: z.string().min(2), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative(), printTarget: z.enum(["COZINHA", "BAR", "CAIXA"]).default("COZINHA"), note: optionalText, additives: z.array(z.object({ additionalId: z.string().optional().nullable(), name: z.string().min(2), quantity: z.number().int().positive().default(1), unitPriceCents: z.number().int().nonnegative().default(0), charge: z.boolean().default(true) })).default([]) });

const createOrderSchema = z.object({
  type: z.enum(["MESA", "BALCAO", "DELIVERY", "ONLINE"]),
  tableId: optionalText,
  customerId: optionalText,
  neighborhoodId: optionalText,
  waiterUserId: optionalText,
  waiterNameSnapshot: optionalText,
  customerNameSnapshot: optionalText,
  customerPhoneSnapshot: optionalText,
  streetSnapshot: optionalText,
  numberSnapshot: optionalText,
  districtSnapshot: optionalText,
  citySnapshot: optionalText,
  stateSnapshot: optionalText,
  zipCodeSnapshot: optionalText,
  complementSnapshot: optionalText,
  referencePointSnapshot: optionalText,
  deliveryFeeCents: z.number().int().default(0),
  changeForCents: z.number().int().default(0),
  deliveryDriverName: optionalText,
  notes: optionalText,
  items: z.array(orderItemSchema).min(1),
  payments: z.array(z.object({ paymentMethodId: z.string().optional().nullable(), methodNameSnapshot: z.string().min(2), amountCents: z.number().int().nonnegative(), feeCents: z.number().int().default(0), changeCents: z.number().int().default(0) })).default([])
});

app.get("/api/orders", async (req, res) => {
  const status = asString(req.query.status) as OrderStatus | undefined;
  const type = asString(req.query.type) as OrderType | undefined;
  const orders = await prisma.order.findMany({
    where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
    include: { table: true, customer: true, neighborhood: true, waiter: true, items: { include: { additives: true } }, payments: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(orders);
});

app.get("/api/orders/:id", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: asString(req.params.id) }, include: { table: true, customer: true, neighborhood: true, waiter: true, items: { include: { additives: true } }, payments: true } });
  if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
  res.json(order);
});

app.post("/api/orders", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const company = await prisma.companySetting.findFirst();
    const register = await prisma.cashRegister.findFirst({ where: { closedAt: null } });
    if (!register) return res.status(400).json({ message: "Abra o caixa para registrar vendas." });

    const selectedCustomer = body.customerId ? await prisma.customer.findUnique({ where: { id: body.customerId }, include: { neighborhood: true } }) : null;
    const selectedNeighborhood = body.neighborhoodId ? await prisma.neighborhood.findUnique({ where: { id: body.neighborhoodId } }) : selectedCustomer?.neighborhood ?? null;
    const lastOrder = await prisma.order.findFirst({ orderBy: { number: "desc" } });
    const onlineCode = body.type === "ONLINE" ? randomUUID().slice(0, 8).toUpperCase() : null;
    const items = body.items.map((item) => ({
      ...item,
      additives: item.additives.map((additive) => ({
        ...additive,
        totalCents: additive.quantity * additive.unitPriceCents
      })),
      totalCents: item.quantity * item.unitPriceCents + item.additives.reduce((sum, additive) => sum + (additive.quantity * additive.unitPriceCents), 0)
    }));
    const subtotal = calcOrderTotals(items);
    const deliveryFee = body.type === "DELIVERY" || body.type === "ONLINE" ? selectedNeighborhood?.deliveryFeeCents ?? body.deliveryFeeCents : 0;
    const serviceFee = company?.serviceFeeEnabled ? Math.round((subtotal + deliveryFee) * (company.serviceFeePercent / 100)) : 0;
    const number = (lastOrder?.number ?? 0) + 1;

    const created = await prisma.order.create({
      data: {
        number,
        type: body.type,
        status: body.type === "ONLINE" ? "NOVO" : "ACEITO",
        tableId: body.tableId,
        customerId: body.customerId,
        neighborhoodId: selectedNeighborhood?.id,
        waiterUserId: body.waiterUserId ?? req.user?.id,
        waiterNameSnapshot: body.waiterNameSnapshot,
        customerNameSnapshot: body.customerNameSnapshot ?? selectedCustomer?.name ?? null,
        customerPhoneSnapshot: body.customerPhoneSnapshot ?? selectedCustomer?.phone ?? null,
        streetSnapshot: body.streetSnapshot ?? selectedCustomer?.street ?? null,
        numberSnapshot: body.numberSnapshot ?? selectedCustomer?.number ?? null,
        districtSnapshot: body.districtSnapshot ?? selectedCustomer?.district ?? selectedNeighborhood?.name ?? null,
        citySnapshot: body.citySnapshot ?? selectedCustomer?.city ?? selectedNeighborhood?.city ?? null,
        stateSnapshot: body.stateSnapshot ?? selectedCustomer?.state ?? null,
        zipCodeSnapshot: body.zipCodeSnapshot ?? selectedCustomer?.zipCode ?? null,
        complementSnapshot: body.complementSnapshot ?? selectedCustomer?.complement ?? null,
        referencePointSnapshot: body.referencePointSnapshot ?? selectedCustomer?.referencePoint ?? null,
        deliveryFeeCents: deliveryFee + serviceFee,
        changeForCents: body.changeForCents,
        deliveryDriverName: body.deliveryDriverName,
        notes: body.notes,
        onlineCode,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            nameSnapshot: item.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            printTarget: item.printTarget,
            note: item.note,
            additives: {
              create: item.additives.map((additive) => ({
                additionalId: additive.additionalId,
                nameSnapshot: additive.name,
                quantity: additive.quantity,
                unitPriceCents: additive.unitPriceCents,
                totalCents: additive.quantity * additive.unitPriceCents
              }))
            }
          }))
        },
        payments: { create: body.payments.map((payment) => ({ ...payment })) }
      },
      include: { items: { include: { additives: true } }, payments: true, table: true, customer: true, neighborhood: true }
    });

    await updateOrderStock(created.id, created.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))); 
    if (created.tableId) await prisma.serviceTable.update({ where: { id: created.tableId }, data: { status: "OCUPADA", waiterName: req.user?.name, customerName: created.customerNameSnapshot } });
    if (body.type !== "ONLINE") await printOrder(created.id);
    await audit(req.user?.id, "CREATE", "order", created.id, body);
    res.status(201).json(created);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/status", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM", "COZINHA", "ENTREGADOR"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ status: z.enum(["NOVO", "ACEITO", "EM_PREPARO", "PRONTO", "SAIU_PARA_ENTREGA", "ENTREGUE", "FECHANDO_CONTA", "PAGO", "CANCELADO"]), reason: optionalText, driverName: optionalText }).parse(req.body);
    const order = await prisma.order.update({ where: { id: asString(req.params.id) }, data: { status: body.status, ...(body.status === "ACEITO" ? { acceptedAt: new Date() } : {}), ...(body.status === "EM_PREPARO" ? { preparedAt: new Date() } : {}), ...(body.status === "PRONTO" ? { readyAt: new Date() } : {}), ...(body.status === "SAIU_PARA_ENTREGA" ? { dispatchedAt: new Date(), deliveryDriverName: body.driverName } : {}), ...(body.status === "ENTREGUE" ? { deliveredAt: new Date() } : {}), ...(body.status === "CANCELADO" ? { cancelledAt: new Date(), cancelledReason: body.reason } : {}) } });
    if (body.status === "ACEITO") await printOrder(order.id);
    await audit(req.user?.id, "UPDATE", "order", order.id, body);
    res.json(order);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/reprint", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM", "COZINHA"), async (req: AuthedRequest, res, next) => { try { await printOrder(asString(req.params.id)); res.json({ ok: true }); } catch (error) { next(error); } });
app.post("/api/orders/:id/cancel", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ reason: z.string().min(2) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: asString(req.params.id) }, include: { items: true } });
    if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
    await updateOrderStock(order.id, order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), true);
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELADO", cancelledAt: new Date(), cancelledReason: body.reason } });
    if (updated.tableId) await prisma.serviceTable.update({ where: { id: updated.tableId }, data: { status: "LIVRE", waiterName: null, customerName: null } });
    res.json(updated);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/pay", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ payments: z.array(z.object({ paymentMethodId: z.string().optional().nullable(), methodNameSnapshot: z.string().min(2), amountCents: z.number().int().nonnegative(), feeCents: z.number().int().default(0), changeCents: z.number().int().default(0) })) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: asString(req.params.id) }, include: { items: true } });
    if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
    const result = await prisma.$transaction(async (tx) => {
      const cashRegister = await tx.cashRegister.findFirst({ where: { closedAt: null } });
      if (!cashRegister) throw new Error("Abra o caixa para receber pagamentos.");
      await tx.orderPayment.createMany({ data: body.payments.map((payment) => ({ ...payment, orderId: order.id })) });
      const updated = await tx.order.update({ where: { id: order.id }, data: { status: "PAGO" } });
      await tx.cashMovement.createMany({ data: body.payments.map((payment) => ({ cashRegisterId: cashRegister.id, type: "PAGAMENTO", description: `Recebimento pedido #${order.number}`, amountCents: payment.amountCents, paymentMethodName: payment.methodNameSnapshot, orderId: order.id, userId: req.user?.id })) });
      return updated;
    });
    if (result.tableId) await prisma.serviceTable.update({ where: { id: result.tableId }, data: { status: "LIVRE", waiterName: null, customerName: null } });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/public/menu", async (req, res) => {
  const slug = asString(req.query.slug, "igs-lanchonete-pro");
  const company = await prisma.companySetting.findUnique({ where: { onlineMenuSlug: slug } });
  if (!company) return res.status(404).json({ message: "Cardapio nao encontrado." });
  const [categories, products, additions, paymentMethods] = await Promise.all([
    prisma.productCategory.findMany({ where: { active: true } }),
    prisma.product.findMany({ where: { active: true, onlineMenu: true } }),
    prisma.additional.findMany({ where: { active: true } }),
    prisma.paymentMethod.findMany({ where: { active: true } })
  ]);
  res.json({ company, categories, products, additions, paymentMethods });
});

app.get("/api/public/orders/:code", async (req, res) => {
   const order = await prisma.order.findFirst({ where: { onlineCode: asString(req.params.code) }, include: { items: { include: { additives: true } }, payments: true } });
  if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
  res.json(order);
});

app.post("/api/public/orders", async (req, res, next) => {
  try {
    const order = await prisma.order.create({
      data: {
        number: ((await prisma.order.findFirst({ orderBy: { number: "desc" } }))?.number ?? 0) + 1,
        type: "ONLINE",
        status: "NOVO",
        onlineCode: randomUUID().slice(0, 8).toUpperCase(),
        customerNameSnapshot: String(req.body?.customerName ?? "Cliente online"),
        customerPhoneSnapshot: String(req.body?.phone ?? ""),
        streetSnapshot: String(req.body?.street ?? ""),
        numberSnapshot: String(req.body?.number ?? ""),
        districtSnapshot: String(req.body?.district ?? ""),
        citySnapshot: String(req.body?.city ?? ""),
        stateSnapshot: String(req.body?.state ?? ""),
        zipCodeSnapshot: String(req.body?.zipCode ?? ""),
        complementSnapshot: String(req.body?.complement ?? ""),
        referencePointSnapshot: String(req.body?.referencePoint ?? ""),
        notes: String(req.body?.notes ?? ""),
        items: { create: Array.isArray(req.body?.items) ? req.body.items.map((item: any) => ({ nameSnapshot: String(item.name), quantity: toInt(item.quantity, 1), unitPriceCents: toInt(item.unitPriceCents, 0), totalCents: toInt(item.quantity, 1) * toInt(item.unitPriceCents, 0), printTarget: (item.printTarget ?? "COZINHA") as PrinterType, note: item.note ? String(item.note) : null, additives: { create: Array.isArray(item.additives) ? item.additives.map((additive: any) => ({ nameSnapshot: String(additive.name), quantity: toInt(additive.quantity, 1), unitPriceCents: toInt(additive.unitPriceCents, 0), totalCents: toInt(additive.quantity, 1) * toInt(additive.unitPriceCents, 0) })) : [] } })) : [] }
      },
      include: { items: { include: { additives: true } }, payments: true }
    });
    await printOrder(order.id);
    res.status(201).json(order);
  } catch (error) { next(error); }
});

app.get("/api/reports/summary", async (req, res) => {
  const { start, end } = dayRange(asString(req.query.from), asString(req.query.to));
  const orders = await prisma.order.findMany({ where: { createdAt: { gte: start, lte: end }, status: { not: "CANCELADO" } }, include: { items: { include: { additives: true, product: true } }, payments: true, neighborhood: true, waiter: true } });
  const rows = orders.map((order) => ({ pedido: order.number, tipo: order.type, status: order.status, total: calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: item.additives.map((additive) => ({ totalCents: additive.totalCents })) }))) + order.deliveryFeeCents, criado_em: order.createdAt.toISOString() }));
  res.json({ rows, total: rows.reduce((sum, row) => sum + Number(row.total), 0) });
});

app.get("/api/reports/:kind", async (req, res, next) => {
  try {
    const format = asString(req.query.format, "json");
    const { start, end } = dayRange(asString(req.query.from), asString(req.query.to));
    const orders = await prisma.order.findMany({ where: { createdAt: { gte: start, lte: end } }, include: { items: { include: { additives: true, product: true } }, payments: true, neighborhood: true, waiter: true } });
    const dataMap: Record<string, Array<Record<string, unknown>>> = {
      sales_by_day: orders.map((order) => ({ data: order.createdAt.toLocaleDateString("pt-BR"), pedido: order.number, total: calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: item.additives.map((a) => ({ totalCents: a.totalCents })) }))) + order.deliveryFeeCents })),
      sales_by_product: Object.entries(orders.flatMap((order) => order.items).reduce((acc, item) => ({ ...acc, [item.nameSnapshot]: (acc[item.nameSnapshot] ?? 0) + item.quantity }), {} as Record<string, number>)).map(([produto, quantidade]) => ({ produto, quantidade })),
      sales_by_category: [],
      sales_by_waiter: Object.entries(orders.reduce((acc, order) => ({ ...acc, [(order.waiter?.name ?? order.waiterNameSnapshot ?? "Sem garcom")]: (acc[(order.waiter?.name ?? order.waiterNameSnapshot ?? "Sem garcom")] ?? 0) + 1 }), {} as Record<string, number>)).map(([garcom, pedidos]) => ({ garcom, pedidos })),
      sales_by_payment: Object.entries(orders.flatMap((order) => order.payments).reduce((acc, payment) => ({ ...acc, [payment.methodNameSnapshot]: (acc[payment.methodNameSnapshot] ?? 0) + payment.amountCents }), {} as Record<string, number>)).map(([forma, valor]) => ({ forma, valor })),
      delivery_by_neighborhood: Object.entries(orders.filter((order) => order.type === "DELIVERY" || order.type === "ONLINE").reduce((acc, order) => ({ ...acc, [(order.neighborhood?.name ?? order.districtSnapshot ?? "Sem bairro")]: (acc[(order.neighborhood?.name ?? order.districtSnapshot ?? "Sem bairro")] ?? 0) + 1 }), {} as Record<string, number>)).map(([bairro, pedidos]) => ({ bairro, pedidos })),
      delivery_fees: orders.filter((order) => order.deliveryFeeCents > 0).map((order) => ({ pedido: order.number, taxa: order.deliveryFeeCents })),
      top_products: Object.entries(orders.flatMap((order) => order.items).reduce((acc, item) => ({ ...acc, [item.nameSnapshot]: (acc[item.nameSnapshot] ?? 0) + item.quantity }), {} as Record<string, number>)).map(([produto, quantidade]) => ({ produto, quantidade })),
      top_additions: Object.entries(orders.flatMap((order) => order.items.flatMap((item) => item.additives)).reduce((acc, additive) => ({ ...acc, [additive.nameSnapshot]: (acc[additive.nameSnapshot] ?? 0) + additive.quantity }), {} as Record<string, number>)).map(([adicional, quantidade]) => ({ adicional, quantidade })),
      cancelled_orders: orders.filter((order) => order.status === "CANCELADO").map((order) => ({ pedido: order.number, motivo: order.cancelledReason ?? "" })),
      cancelled_items: orders.flatMap((order) => order.items.filter((item) => item.cancelledAt).map((item) => ({ pedido: order.number, item: item.nameSnapshot, motivo: item.cancelledReason ?? "" }))),
      profit: orders.flatMap((order) => order.items).map((item) => ({ produto: item.nameSnapshot, lucro_estimado: (item.unitPriceCents - (item.product?.costCents ?? 0)) * item.quantity })),
      payables: await prisma.payable.findMany({ where: { dueDate: { gte: start, lte: end } } }).then((items) => items.map((item) => ({ descricao: item.description, valor: item.amountCents, status: item.status }))),
      receivables: await prisma.receivable.findMany({ where: { dueDate: { gte: start, lte: end } } }).then((items) => items.map((item) => ({ descricao: item.description, valor: item.amountCents, status: item.status }))),
      cashbook: (await prisma.cashMovement.findMany({ where: { createdAt: { gte: start, lte: end } }, include: { cashRegister: true } })).map((item) => ({ tipo: item.type, descricao: item.description, valor: item.amountCents, data: item.createdAt.toLocaleString("pt-BR") })),
      cash_closing: await prisma.cashRegister.findMany({ where: { openedAt: { gte: start, lte: end } } }).then((items) => items.map((item) => ({ abertura: item.openedAt.toLocaleString("pt-BR"), fechamento: item.closedAt?.toLocaleString("pt-BR") ?? "", diferenca: item.differenceCents ?? 0 }))),
      financial_overall: []
    };
    const rows = dataMap[asString(req.params.kind)] ?? [];
    if (format === "json") return res.json(rows);
    return downloadReport(res, asString(req.params.kind), rows, format);
  } catch (error) { next(error); }
});

app.use(express.static(distDir));
app.get(/^(?!\/api).*/, async (_req, res, next) => {
  try {
    const file = path.join(distDir, "index.html");
    await fs.access(file);
    res.sendFile(file);
  } catch {
    next();
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: error instanceof Error ? error.message : "Erro interno." });
});

await safeSetup();

app.listen(port, () => {
  console.log(`IGS Lanchonete PRO rodando na porta ${port}`);
});
