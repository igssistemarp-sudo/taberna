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

function normalizePhone(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function customerClassification(totalOrders: number, totalSpentCents: number) {
  if (totalOrders >= 50 || totalSpentCents >= 500000) return "DIAMANTE";
  if (totalOrders >= 25 || totalSpentCents >= 250000) return "OURO";
  if (totalOrders >= 10 || totalSpentCents >= 100000) return "PRATA";
  return "BRONZE";
}

async function ensureUniqueCustomerPhones(phone?: string | null, whatsapp?: string | null, ignoreId?: string) {
  const values = [normalizePhone(phone), normalizePhone(whatsapp)].filter(Boolean);
  if (!values.length) return;
  const existing = await prisma.customer.findFirst({
    where: {
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      OR: values.flatMap((value) => [{ phone: value }, { whatsapp: value }])
    }
  });
  if (existing) throw new Error("Telefone ou WhatsApp já cadastrado para outro cliente.");
}

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

type ReportFilters = {
  from: string;
  to: string;
  fromHour: number | null;
  toHour: number | null;
  userId: string | null;
  waiterId: string | null;
  driverName: string | null;
  customerId: string | null;
  neighborhoodId: string | null;
  paymentMethod: string | null;
};

function parseReportFilters(req: Request): ReportFilters {
  return {
    from: asString(req.query.from),
    to: asString(req.query.to),
    fromHour: asString(req.query.fromHour) ? Number(asString(req.query.fromHour)) : null,
    toHour: asString(req.query.toHour) ? Number(asString(req.query.toHour)) : null,
    userId: asString(req.query.userId) || null,
    waiterId: asString(req.query.waiterId) || null,
    driverName: asString(req.query.driverName) || null,
    customerId: asString(req.query.customerId) || null,
    neighborhoodId: asString(req.query.neighborhoodId) || null,
    paymentMethod: asString(req.query.paymentMethod) || null
  };
}

function orderNetTotal(order: {
  items: Array<{ quantity: number; unitPriceCents: number; additives: Array<{ totalCents: number }> }>;
  deliveryFeeCents: number;
}) {
  return calcOrderTotals(order.items) + order.deliveryFeeCents;
}

function orderGrossTotal(order: { items: Array<{ totalCents: number }>; deliveryFeeCents: number }) {
  return order.items.reduce((sum, item) => sum + item.totalCents, 0) + order.deliveryFeeCents;
}

function reportDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function loadFilteredOrders(filters: ReportFilters) {
  const { start, end } = dayRange(filters.from, filters.to);
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(filters.userId ? { waiterUserId: filters.userId } : {}),
      ...(filters.waiterId ? { waiterUserId: filters.waiterId } : {}),
      ...(filters.driverName ? { deliveryDriverName: filters.driverName } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.neighborhoodId ? { neighborhoodId: filters.neighborhoodId } : {})
    },
    include: { items: { include: { additives: true, product: { include: { category: true } } } }, payments: true, neighborhood: true, waiter: true, customer: true, table: true }
  });

  return orders.filter((order) => {
    const hour = order.createdAt.getHours();
    if (filters.fromHour !== null && hour < filters.fromHour) return false;
    if (filters.toHour !== null && hour > filters.toHour) return false;
    if (filters.paymentMethod && !order.payments.some((payment) => payment.methodNameSnapshot === filters.paymentMethod)) return false;
    return true;
  });
}

function sumBy<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + value(item));
  return map;
}

function topRows(map: Map<string, number>, labelName: string, valueName: string) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ [labelName]: label, [valueName]: value }))
    .sort((a, b) => Number((b as Record<string, number>)[valueName]) - Number((a as Record<string, number>)[valueName]));
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

  const init = "\x1b@";
  const normal = "\x1b!\x00";
  const big = "\x1b!\x30";
  const tall = "\x1b!\x10";
  const boldOn = "\x1bE\x01";
  const boldOff = "\x1bE\x00";

  const lines = [
    init,
    `${big}${company.nomeFantasia}${normal}\n`,
    `${boldOn}${tall}PEDIDO #${order.number} - ${order.type}${normal}${boldOff}\n`,
    order.table ? `Mesa: ${order.table.name}\n` : "",
    order.customerNameSnapshot ? `Cliente: ${order.customerNameSnapshot}\n` : "",
    order.customerPhoneSnapshot ? `Telefone: ${order.customerPhoneSnapshot}\n` : "",
    order.streetSnapshot ? `Endereco: ${order.streetSnapshot}, ${order.numberSnapshot ?? ""}\n` : "",
    order.districtSnapshot || order.citySnapshot ? `Bairro/Cidade: ${order.districtSnapshot ?? ""} ${order.citySnapshot ?? ""}\n` : "",
    order.complementSnapshot ? `Compl: ${order.complementSnapshot}\n` : "",
    order.referencePointSnapshot ? `Referencia: ${order.referencePointSnapshot}\n` : "",
    `Horario: ${new Date(order.createdAt).toLocaleString("pt-BR")}\n`,
    "--------------------------------\n"
  ];

  for (const item of order.items.filter((item) => !target || item.printTarget === target)) {
    lines.push(`${boldOn}${tall}${item.quantity}x ${item.nameSnapshot.toUpperCase()}${normal}${boldOff}\n`);
    if (item.note) lines.push(`${boldOn}OBS ITEM: ${item.note}${boldOff}\n`);
    for (const additional of item.additives) {
      lines.push(`${boldOn}  >>> OPCIONAL: ${additional.quantity}x ${additional.nameSnapshot.toUpperCase()}${boldOff}\n`);
    }
    lines.push("--------------------------------\n");
  }

  lines.push(`${boldOn}${tall}TOTAL: ${formatMoney(order.items.reduce((sum, item) => sum + item.totalCents, 0) + order.deliveryFeeCents)}${normal}${boldOff}\n`);
  if (order.notes) lines.push(`${boldOn}OBS/PAGAMENTO:${boldOff}\n${order.notes}\n`);
  if (order.changeForCents > 0) lines.push(`${boldOn}LEVAR TROCO PARA: ${formatMoney(order.changeForCents)}${boldOff}\n`);
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

    const salesByTypeMap = new Map<string, number>();
    for (const order of orders) {
      const total = calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: [] }))) + order.deliveryFeeCents;
      salesByTypeMap.set(order.type, (salesByTypeMap.get(order.type) ?? 0) + total);
    }
    const salesByType = Array.from(salesByTypeMap.entries()).sort((a, b) => b[1] - a[1]).map(([type, amountCents]) => ({ type, amountCents }));

    const paymentMap = new Map<string, number>();
    for (const order of orders) {
      for (const pmt of order.payments) {
        paymentMap.set(pmt.methodNameSnapshot, (paymentMap.get(pmt.methodNameSnapshot) ?? 0) + pmt.amountCents);
      }
    }
    const paymentSummary = Array.from(paymentMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, amountCents]) => ({ name, amountCents }));

    const sevenDaysAgo = new Date(start);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const weekOrders = await prisma.order.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, status: { not: "CANCELADO" } },
      include: { items: true }
    });
    const dayTotals = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
      dayTotals.set(key, 0);
    }
    for (const order of weekOrders) {
      const key = new Date(order.createdAt).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
      const total = calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: [] }))) + order.deliveryFeeCents;
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + total);
    }
    const salesByDay = Array.from(dayTotals.entries()).map(([day, amountCents]) => ({ day, amountCents }));

    const hourTotals = new Map<string, number>();
    for (let h = 0; h < 24; h++) hourTotals.set(`${h}h`, 0);
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      const key = `${hour}h`;
      const total = calcOrderTotals(order.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: [] }))) + order.deliveryFeeCents;
      hourTotals.set(key, (hourTotals.get(key) ?? 0) + total);
    }
    const salesByHour = Array.from(hourTotals.entries()).map(([hour, amountCents]) => ({ hour, amountCents }));

    const activeDeliveries = await prisma.order.findMany({
      where: { type: { in: ["DELIVERY", "ONLINE"] }, status: { in: ["NOVO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"] } },
      include: { items: true, neighborhood: true },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    res.json({
      totalSoldToday,
      pendingOrders,
      occupiedTables: tables,
      deliveryActive,
      overduePayables: payables.reduce((sum, item) => sum + item.amountCents, 0),
      receivablesOpen: receivables.reduce((sum, item) => sum + item.amountCents, 0),
      lowStock: products.map((item) => ({ id: item.id, name: item.name, stockCurrent: item.stockCurrent, lowStockThreshold: item.lowStockThreshold })),
      topProducts: Array.from(productSales.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, quantity]) => ({ name, quantity })),
      salesByDay,
      paymentSummary,
      salesByType,
      salesByHour,
      activeDeliveries: activeDeliveries.map((o) => ({
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        customerName: o.customerNameSnapshot,
        neighborhoodName: o.neighborhood?.name ?? null,
        deliveryFeeCents: o.deliveryFeeCents,
        totalCents: calcOrderTotals(o.items.map((item) => ({ quantity: item.quantity, unitPriceCents: item.unitPriceCents, additives: [] }))) + o.deliveryFeeCents,
        minutesAgo: Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000),
        driver: o.deliveryDriverName ?? null
      }))
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

app.get("/api/customers", async (_req, res) => res.json(await prisma.customer.findMany({
  include: { neighborhood: true, addresses: { include: { neighborhood: true } } },
  orderBy: { createdAt: "desc" }
})));
app.get("/api/customers/search", async (req, res, next) => {
  try {
    const q = asString(req.query.q ?? "");
    if (q.length < 2) return res.json([]);
    const digits = q.replace(/\D/g, "");
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { phone: { contains: digits } },
          { whatsapp: { contains: digits } },
          { name: { contains: q, mode: "insensitive" } }
        ]
      },
      include: { neighborhood: true, addresses: { include: { neighborhood: true }, take: 5 }, _count: { select: { orders: true } } },
      orderBy: [{ totalOrders: "desc" }],
      take: 10
    });
    res.json(customers.map(c => ({ ...c, orderCount: c._count.orders, _count: undefined })));
  } catch (error) { next(error); }
});
app.get("/api/customers/:id", async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: asString(req.params.id) },
      include: { neighborhood: true, addresses: { include: { neighborhood: true }, orderBy: { isMain: "desc" } } }
    });
    if (!customer) return res.status(404).json({ message: "Cliente não encontrado" });
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      include: { items: { include: { additives: true } }, payments: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const totalSpent = orders.reduce((sum, o) => {
      const subtotal = o.items.reduce((s, i) => s + i.totalCents, 0);
      return sum + subtotal + o.deliveryFeeCents - o.discountCents;
    }, 0);
    const lastOrder = orders[0] ?? null;
    res.json({ ...customer, orders, totalSpent, lastOrder });
  } catch (error) { next(error); }
});
app.post("/api/customers", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(2), nickname: optionalText,
      document: optionalText, rg: optionalText, birthDate: optionalText, gender: optionalText,
      phone: optionalText, whatsapp: optionalText, commercialPhone: optionalText, email: optionalText,
      zipCode: optionalText, street: optionalText, number: optionalText,
      neighborhoodId: optionalText, district: optionalText, city: optionalText, state: optionalText,
      complement: optionalText, referencePoint: optionalText,
      latitude: z.number().optional(), longitude: z.number().optional(),
      hasDog: z.boolean().optional(), hasDoorman: z.boolean().optional(),
      apartment: optionalText, block: optionalText, condoName: optionalText,
      bestDeliveryTime: optionalText, deliveryNotes: optionalText,
      notes: optionalText
    }).parse(req.body);
    body.phone = normalizePhone(body.phone) as any || null;
    body.whatsapp = normalizePhone(body.whatsapp) as any || null;
    body.commercialPhone = normalizePhone(body.commercialPhone) as any || null;
    await ensureUniqueCustomerPhones(body.phone, body.whatsapp);
    if (body.birthDate) body.birthDate = new Date(body.birthDate as any) as any;
    const created = await prisma.customer.create({ data: body as any });
    await audit(req.user?.id, "CREATE", "customer", created.id, body);
    res.status(201).json(created);
  } catch (error) { next(error); }
});
app.put("/api/customers/:id", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(2).optional(), nickname: optionalText,
      document: optionalText, rg: optionalText, birthDate: optionalText, gender: optionalText,
      phone: optionalText, whatsapp: optionalText, commercialPhone: optionalText, email: optionalText,
      zipCode: optionalText, street: optionalText, number: optionalText,
      neighborhoodId: optionalText, district: optionalText, city: optionalText, state: optionalText,
      complement: optionalText, referencePoint: optionalText,
      latitude: z.number().optional(), longitude: z.number().optional(),
      hasDog: z.boolean().optional(), hasDoorman: z.boolean().optional(),
      apartment: optionalText, block: optionalText, condoName: optionalText,
      bestDeliveryTime: optionalText, deliveryNotes: optionalText,
      notes: optionalText
    }).parse(req.body);
    body.phone = normalizePhone(body.phone) as any || null;
    body.whatsapp = normalizePhone(body.whatsapp) as any || null;
    body.commercialPhone = normalizePhone(body.commercialPhone) as any || null;
    await ensureUniqueCustomerPhones(body.phone, body.whatsapp, asString(req.params.id));
    if (body.birthDate) body.birthDate = new Date(body.birthDate as any) as any;
    const updated = await prisma.customer.update({ where: { id: asString(req.params.id) }, data: body as any });
    await audit(req.user?.id, "UPDATE", "customer", updated.id, body);
    res.json(updated);
  } catch (error) { next(error); }
});
app.delete("/api/customers/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.customer.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });
app.get("/api/customers/:id/orders", async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: asString(req.params.id) },
      include: { items: { include: { additives: true } }, payments: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json(orders);
  } catch (error) { next(error); }
});
app.post("/api/customers/:id/orders/:orderId/repeat", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const source = await prisma.order.findUnique({ where: { id: asString(req.params.orderId) }, include: { items: { include: { additives: true } } } });
    if (!source) return res.status(404).json({ message: "Pedido não encontrado" });
    const orderNumber = ((await prisma.order.findFirst({ orderBy: { number: "desc" } }))?.number ?? 0) + 1;
    const newOrder = await prisma.order.create({
      data: {
        number: orderNumber, type: source.type, status: "NOVO",
        customerId: source.customerId, neighborhoodId: source.neighborhoodId,
        notes: `Repetido do pedido #${source.number}`,
        items: { create: source.items.map(i => ({
          productId: i.productId, nameSnapshot: i.nameSnapshot,
          quantity: i.quantity, unitPriceCents: i.unitPriceCents,
          totalCents: i.totalCents, printTarget: i.printTarget,
          additives: { create: i.additives.map(a => ({
            additionalId: a.additionalId, nameSnapshot: a.nameSnapshot,
            quantity: a.quantity, unitPriceCents: a.unitPriceCents, totalCents: a.totalCents
          })) }
        })) }
      }
    });
    await audit(req.user?.id, "CREATE", "order", newOrder.id, { repeatedFrom: source.id });
    res.status(201).json(newOrder);
  } catch (error) { next(error); }
});
// Customer addresses
app.post("/api/customers/:id/addresses", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      label: z.string().default("Casa"), zipCode: optionalText, street: optionalText, number: optionalText,
      complement: optionalText, district: optionalText, city: optionalText, state: optionalText,
      neighborhoodId: optionalText, referencePoint: optionalText,
      latitude: z.number().optional(), longitude: z.number().optional(),
      hasDog: z.boolean().optional(), hasDoorman: z.boolean().optional(),
      apartment: optionalText, block: optionalText, condoName: optionalText,
      bestDeliveryTime: optionalText, deliveryNotes: optionalText, isMain: z.boolean().optional()
    }).parse(req.body);
    const created = await prisma.customerAddress.create({ data: { ...body, customerId: asString(req.params.id) } as any });
    res.status(201).json(created);
  } catch (error) { next(error); }
});
app.put("/api/customers/:id/addresses/:addrId", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      label: optionalText, zipCode: optionalText, street: optionalText, number: optionalText,
      complement: optionalText, district: optionalText, city: optionalText, state: optionalText,
      neighborhoodId: optionalText, referencePoint: optionalText,
      latitude: z.number().optional(), longitude: z.number().optional(),
      hasDog: z.boolean().optional(), hasDoorman: z.boolean().optional(),
      apartment: optionalText, block: optionalText, condoName: optionalText,
      bestDeliveryTime: optionalText, deliveryNotes: optionalText, isMain: z.boolean().optional()
    }).parse(req.body);
    const updated = await prisma.customerAddress.update({ where: { id: asString(req.params.addrId) }, data: body as any });
    res.json(updated);
  } catch (error) { next(error); }
});
app.delete("/api/customers/:id/addresses/:addrId", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { await prisma.customerAddress.delete({ where: { id: asString(req.params.addrId) } }); res.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/categories", async (_req, res) => res.json(await prisma.productCategory.findMany({ include: { products: true }, orderBy: { name: "asc" } })));
app.post("/api/categories", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), active: z.boolean().default(true) }).parse(req.body); const created = await prisma.productCategory.create({ data: body }); res.status(201).json(created); } catch (error) { next(error); } });
app.put("/api/categories/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), active: z.boolean().optional() }).parse(req.body); res.json(await prisma.productCategory.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/categories/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.productCategory.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

const productSchema = z.object({
  code: z.number().int().optional(), barcode: optionalText, internalCode: optionalText,
  name: z.string().min(2), shortDescription: optionalText, fullDescription: optionalText,
  categoryId: optionalText, subcategory: optionalText, description: optionalText,
  salePriceCents: z.number().int().default(0), costCents: z.number().int().default(0),
  marginPercent: z.number().default(0), profitCents: z.number().int().default(0),
  promoPriceCents: z.number().int().nullable().optional(),
  promoStart: z.string().nullable().optional(), promoEnd: z.string().nullable().optional(),
  stockCurrent: z.number().int().default(0), stockMin: z.number().int().default(0),
  stockMax: z.number().int().default(0), stockUnit: z.string().default("UN"),
  controlStock: z.boolean().default(false), onlineMenu: z.boolean().default(false),
  availableDelivery: z.boolean().default(true), availableBalcao: z.boolean().default(true),
  availableMesas: z.boolean().default(true), featured: z.boolean().default(false),
  printTarget: z.string().default("COZINHA"), prepTimeMinutes: z.number().int().default(0),
  lowStockThreshold: z.number().int().default(5), photoUrl: optionalText,
  nutritionWeight: optionalText, nutritionCalories: optionalText,
  containsGluten: z.boolean().default(false), containsLactose: z.boolean().default(false),
  isVegan: z.boolean().default(false), isVegetarian: z.boolean().default(false),
  observations: optionalText, active: z.boolean().default(true)
});

const productUpdateSchema = productSchema.partial();

app.get("/api/products", async (_req, res) => res.json(await prisma.product.findMany({ include: { category: true, photos: { orderBy: { sortOrder: "asc" } }, recipeIngredients: true, comboItems: { include: { child: true } }, productAdditions: { include: { addition: true } } }, orderBy: { code: "asc" } })));

app.get("/api/products/:id", async (req, res, next) => {
  try { const item = await prisma.product.findUnique({ where: { id: asString(req.params.id) }, include: { category: true, photos: { orderBy: { sortOrder: "asc" } }, recipeIngredients: true, comboItems: { include: { child: true } }, productAdditions: { include: { addition: true } } } }); res.json(item); }
  catch (error) { next(error); }
});

app.post("/api/products", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const body = productSchema.parse(req.body); const last = await prisma.product.findFirst({ orderBy: { code: "desc" } }); const created = await prisma.product.create({ data: { ...body, code: body.code ?? (last?.code ?? 0) + 1, promoStart: body.promoStart ? new Date(body.promoStart) : null, promoEnd: body.promoEnd ? new Date(body.promoEnd) : null } }); await audit(req.user?.id, "CREATE", "product", created.id, body); res.status(201).json(created); }
  catch (error) { next(error); }
});

app.put("/api/products/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const old = await prisma.product.findUnique({ where: { id: asString(req.params.id) } }); const body = productUpdateSchema.parse(req.body); const data = { ...body, promoStart: body.promoStart !== undefined ? (body.promoStart ? new Date(body.promoStart) : null) : undefined, promoEnd: body.promoEnd !== undefined ? (body.promoEnd ? new Date(body.promoEnd) : null) : undefined }; const updated = await prisma.product.update({ where: { id: asString(req.params.id) }, data }); if (old && (old.salePriceCents !== updated.salePriceCents || old.costCents !== updated.costCents)) { await prisma.productPriceLog.create({ data: { productId: updated.id, userId: req.user?.id, oldPriceCents: old.salePriceCents, newPriceCents: updated.salePriceCents, oldCostCents: old.costCents, newCostCents: updated.costCents } }); } await audit(req.user?.id, "UPDATE", "product", updated.id, body); res.json(updated); }
  catch (error) { next(error); }
});

app.delete("/api/products/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.product.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

// Product photos
app.post("/api/products/:id/photos", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ url: z.string(), sortOrder: z.number().int().default(0) }).parse(req.body); const created = await prisma.productPhoto.create({ data: { productId: asString(req.params.id), url: body.url, sortOrder: body.sortOrder } }); res.status(201).json(created); }
  catch (error) { next(error); }
});

app.delete("/api/products/photos/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.productPhoto.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

// Recipe ingredients
app.post("/api/products/:id/ingredients", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ name: z.string(), quantity: z.number().default(1), unit: z.string().default("UN") }).parse(req.body); const created = await prisma.recipeIngredient.create({ data: { ...body, productId: asString(req.params.id) } }); res.status(201).json(created); }
  catch (error) { next(error); }
});

app.put("/api/products/ingredients/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ name: z.string().optional(), quantity: z.number().optional(), unit: z.string().optional() }).parse(req.body); res.json(await prisma.recipeIngredient.update({ where: { id: asString(req.params.id) }, data: body })); }
  catch (error) { next(error); }
});

app.delete("/api/products/ingredients/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.recipeIngredient.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

// Combo items
app.post("/api/products/:id/combos", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ productId: z.string(), quantity: z.number().int().default(1), overridePrice: z.number().int().nullable().optional() }).parse(req.body); const created = await prisma.comboItem.create({ data: { childId: body.productId, comboId: asString(req.params.id), quantity: body.quantity, overridePrice: body.overridePrice } }); res.status(201).json(created); }
  catch (error) { next(error); }
});

app.delete("/api/products/combos/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.comboItem.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

// Product additions mapping
app.post("/api/products/:id/additions", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ additionId: z.string(), maxQty: z.number().int().default(1) }).parse(req.body); const created = await prisma.productAddition.create({ data: { ...body, productId: asString(req.params.id) } }); res.status(201).json(created); }
  catch (error) { next(error); }
});

app.delete("/api/products/additions/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.productAddition.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

// Price history
app.get("/api/products/:id/price-log", async (req, res, next) => {
  try { res.json(await prisma.productPriceLog.findMany({ where: { productId: asString(req.params.id) }, orderBy: { createdAt: "desc" }, take: 50 })); }
  catch (error) { next(error); }
});

app.get("/api/additions", async (_req, res) => res.json(await prisma.additional.findMany({ orderBy: { name: "asc" } })));
app.post("/api/additions", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), valueCents: z.number().int().default(0), charge: z.boolean().default(true), category: optionalText, active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await prisma.additional.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/additions/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), valueCents: z.number().int().optional(), charge: z.boolean().optional(), category: optionalText, active: z.boolean().optional() }).parse(req.body); res.json(await prisma.additional.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/additions/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.additional.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.get("/api/payment-methods", async (_req, res) => res.json(await prisma.paymentMethod.findMany({ orderBy: { name: "asc" } })));
app.post("/api/payment-methods", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), allowFee: z.boolean().default(false), active: z.boolean().default(true) }).parse(req.body); res.status(201).json(await prisma.paymentMethod.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/payment-methods/:id", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), allowFee: z.boolean().optional(), active: z.boolean().optional() }).parse(req.body); res.json(await prisma.paymentMethod.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/payment-methods/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.paymentMethod.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

const tableStatuses = ["LIVRE", "OCUPADA", "AGUARDANDO_PREPARO", "PRONTO", "FECHANDO_CONTA", "AGUARDANDO_PAGAMENTO", "BLOQUEADA"] as const;

app.get("/api/tables", async (_req, res) => res.json(await prisma.serviceTable.findMany({ orderBy: { name: "asc" } })));
app.post("/api/tables", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2), status: z.enum(tableStatuses).default("LIVRE"), waiterName: optionalText, customerName: optionalText, active: z.boolean().default(true), notes: optionalText }).parse(req.body); res.status(201).json(await prisma.serviceTable.create({ data: body })); } catch (error) { next(error); } });
app.put("/api/tables/:id", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => { try { const body = z.object({ name: z.string().min(2).optional(), status: z.enum(tableStatuses).optional(), waiterName: optionalText, customerName: optionalText, active: z.boolean().optional(), notes: optionalText }).parse(req.body); res.json(await prisma.serviceTable.update({ where: { id: asString(req.params.id) }, data: body })); } catch (error) { next(error); } });
app.delete("/api/tables/:id", requireRole("ADMIN", "GERENTE"), async (req: AuthedRequest, res, next) => { try { await prisma.serviceTable.delete({ where: { id: asString(req.params.id) } }); res.status(204).end(); } catch (error) { next(error); } });

app.put("/api/tables/:id/open", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ customerName: optionalText }).parse(req.body); console.log("[OPEN_TABLE] body:", JSON.stringify(body), "params:", req.params); const table = await prisma.serviceTable.findUnique({ where: { id: asString(req.params.id) } }); if (!table) return res.status(404).json({ message: "Mesa nao encontrada." }); if (table.status !== "LIVRE") return res.status(400).json({ message: "Mesa ja esta ocupada." }); const updated = await prisma.serviceTable.update({ where: { id: table.id }, data: { status: "OCUPADA", waiterName: req.user?.name, customerName: body.customerName || null } }); console.log("[OPEN_TABLE] updated:", JSON.stringify(updated)); await prisma.tableLog.create({ data: { tableId: table.id, userId: req.user?.id, action: "ABERTURA", description: `Mesa ${table.name} aberta por ${req.user?.name}${body.customerName ? ` - Cliente: ${body.customerName}` : ""}` } }); res.json(updated); } catch (error) { console.error("[OPEN_TABLE] error:", error); next(error); }
});

app.put("/api/tables/:id/close", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const order = await prisma.order.findFirst({ where: { tableId: asString(req.params.id), status: { notIn: ["CANCELADO", "PAGO"] } } }); if (order) return res.status(400).json({ message: "Existe pedido em aberto nesta mesa. Finalize o pedido primeiro." }); const table = await prisma.serviceTable.findUnique({ where: { id: asString(req.params.id) } }); if (!table) return res.status(404).json({ message: "Mesa nao encontrada." }); const updated = await prisma.serviceTable.update({ where: { id: table.id }, data: { status: "LIVRE", waiterName: null, customerName: null } }); await prisma.tableLog.create({ data: { tableId: table.id, userId: req.user?.id, action: "LIBERACAO", description: `Mesa ${table.name} liberada por ${req.user?.name}` } }); res.json(updated); } catch (error) { next(error); }
});

app.post("/api/tables/:id/cancel", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const table = await prisma.serviceTable.findUnique({ where: { id: asString(req.params.id) } }); if (!table) return res.status(404).json({ message: "Mesa nao encontrada." }); await prisma.$transaction(async (tx) => { const orders = await tx.order.findMany({ where: { tableId: table.id, status: { notIn: ["CANCELADO", "PAGO"] } } }); for (const order of orders) { await tx.order.update({ where: { id: order.id }, data: { status: "CANCELADO" } }); } await tx.serviceTable.update({ where: { id: table.id }, data: { status: "LIVRE", waiterName: null, customerName: null } }); await tx.tableLog.create({ data: { tableId: table.id, userId: req.user?.id, action: "CANCELAMENTO", description: `Mesa ${table.name} cancelada por ${req.user?.name}` } }); }); res.json({ ok: true }); } catch (error) { next(error); }
});

app.post("/api/tables/transfer", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ fromTableId: z.string(), toTableId: z.string() }).parse(req.body); if (body.fromTableId === body.toTableId) return res.status(400).json({ message: "Selecione mesas diferentes." }); const [fromTable, toTable] = await Promise.all([prisma.serviceTable.findUnique({ where: { id: body.fromTableId } }), prisma.serviceTable.findUnique({ where: { id: body.toTableId } })]); if (!fromTable || !toTable) return res.status(404).json({ message: "Mesa nao encontrada." }); if (toTable.status !== "LIVRE") return res.status(400).json({ message: "Mesa destino precisa estar livre." }); const orders = await prisma.order.findMany({ where: { tableId: body.fromTableId, status: { notIn: ["CANCELADO", "PAGO"] } } }); if (!orders.length) return res.status(400).json({ message: "Mesa origem nao possui pedidos." }); await prisma.$transaction(async (tx) => { for (const order of orders) await tx.order.update({ where: { id: order.id }, data: { tableId: body.toTableId } }); await tx.serviceTable.update({ where: { id: body.fromTableId }, data: { status: "LIVRE", waiterName: null, customerName: null } }); await tx.serviceTable.update({ where: { id: body.toTableId }, data: { status: "OCUPADA", waiterName: fromTable.waiterName } }); await tx.tableLog.create({ data: { tableId: body.fromTableId, userId: req.user?.id, action: "TRANSFERENCIA_SAIDA", description: `Mesa ${fromTable.name} transferida para ${toTable.name}` } }); await tx.tableLog.create({ data: { tableId: body.toTableId, userId: req.user?.id, action: "TRANSFERENCIA_ENTRADA", description: `Mesa ${toTable.name} recebeu itens da ${fromTable.name}` } }); }); res.json({ ok: true }); } catch (error) { next(error); }
});

app.post("/api/orders/transfer-items", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ fromTableId: z.string(), toTableId: z.string(), orderItemIds: z.array(z.string()).min(1) }).parse(req.body); if (body.fromTableId === body.toTableId) return res.status(400).json({ message: "Selecione mesas diferentes." }); const [fromTable, toTable] = await Promise.all([prisma.serviceTable.findUnique({ where: { id: body.fromTableId } }), prisma.serviceTable.findUnique({ where: { id: body.toTableId } })]); if (!fromTable || !toTable) return res.status(404).json({ message: "Mesa nao encontrada." }); const items = await prisma.orderItem.findMany({ where: { id: { in: body.orderItemIds }, cancelledAt: null }, include: { order: true } }); if (!items.length) return res.status(400).json({ message: "Nenhum item valido para transferencia." }); const sourceOrderId = items[0].orderId; if (!items.every((i) => i.orderId === sourceOrderId)) return res.status(400).json({ message: "Itens precisam pertencer ao mesmo pedido." }); await prisma.$transaction(async (tx) => { let destOrder = await tx.order.findFirst({ where: { tableId: body.toTableId, status: { notIn: ["CANCELADO", "PAGO"] } } }); if (!destOrder) { destOrder = await tx.order.create({ data: { type: "MESA", tableId: body.toTableId, status: "NOVO", number: ((await tx.order.findFirst({ orderBy: { number: "desc" } }))?.number ?? 0) + 1 } }); } for (const item of items) { await tx.orderItem.update({ where: { id: item.id }, data: { orderId: destOrder.id } }); } const remaining = await tx.orderItem.count({ where: { orderId: sourceOrderId, cancelledAt: null } }); if (remaining === 0) { await tx.order.update({ where: { id: sourceOrderId }, data: { status: "CANCELADO" } }); } if (toTable.status === "LIVRE") { await tx.serviceTable.update({ where: { id: body.toTableId }, data: { status: "OCUPADA" } }); } await tx.tableLog.create({ data: { tableId: body.fromTableId, userId: req.user?.id, action: "TRANSFERENCIA_SAIDA", description: `Itens transferidos da ${fromTable.name} para ${toTable.name}` } }); await tx.tableLog.create({ data: { tableId: body.toTableId, userId: req.user?.id, action: "TRANSFERENCIA_ENTRADA", description: `Recebeu itens da ${fromTable.name}` } }); }); res.json({ ok: true }); } catch (error) { next(error); }
});

app.post("/api/tables/merge", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ mainTableId: z.string(), secondaryTableIds: z.array(z.string()).min(1) }).parse(req.body); if (body.secondaryTableIds.includes(body.mainTableId)) return res.status(400).json({ message: "Mesa principal nao pode estar entre as secundarias." }); const [mainTable, ...secondaryTables] = await Promise.all([prisma.serviceTable.findUnique({ where: { id: body.mainTableId } }), ...body.secondaryTableIds.map((id) => prisma.serviceTable.findUnique({ where: { id } }))]); if (!mainTable || secondaryTables.some((t) => !t)) return res.status(404).json({ message: "Mesa nao encontrada." }); await prisma.$transaction(async (tx) => { for (const sec of secondaryTables) { const secOrders = await tx.order.findMany({ where: { tableId: sec!.id, status: { notIn: ["CANCELADO", "PAGO"] } } }); for (const order of secOrders) await tx.order.update({ where: { id: order.id }, data: { tableId: body.mainTableId } }); await tx.serviceTable.update({ where: { id: sec!.id }, data: { status: "LIVRE", waiterName: null, customerName: null } }); await tx.tableLog.create({ data: { tableId: sec!.id, userId: req.user?.id, action: "JUNCAO", description: `Mesa ${sec!.name} juntada a ${mainTable.name}` } }); } await tx.tableLog.create({ data: { tableId: body.mainTableId, userId: req.user?.id, action: "JUNCAO", description: `Mesa ${mainTable.name} recebeu mesas ${secondaryTables.map((t) => t!.name).join(", ")}` } }); }); res.json({ ok: true }); } catch (error) { next(error); }
});

app.get("/api/tables/:id/pre-conta", async (req, res, next) => {
  try { const table = await prisma.serviceTable.findUnique({ where: { id: asString(req.params.id) } }); if (!table) return res.status(404).json({ message: "Mesa nao encontrada." }); const orders = await prisma.order.findMany({ where: { tableId: table.id, status: { notIn: ["CANCELADO", "PAGO"] } }, include: { items: { include: { additives: true } }, payments: true, waiter: true, customer: true } }); res.json({ table, orders }); } catch (error) { next(error); }
});

app.get("/api/tables/:id/logs", async (req, res, next) => {
  try { const logs = await prisma.tableLog.findMany({ where: { tableId: asString(req.params.id) }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }); res.json(logs); } catch (error) { next(error); }
});

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
  discountCents: z.number().int().default(0),
  discountPercent: z.number().default(0),
  serviceFeeCents: z.number().int().default(0),
  items: z.array(orderItemSchema),
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
        discountCents: body.discountCents,
        discountPercent: body.discountPercent,
        serviceFeeCents: body.serviceFeeCents,
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
    if (created.customerId) {
      const spent = created.items.reduce((sum, item) => sum + item.totalCents, 0) + created.deliveryFeeCents - created.discountCents;
      const customer = await prisma.customer.findUnique({ where: { id: created.customerId } });
      if (customer) {
        const totalOrders = customer.totalOrders + 1;
        const totalSpentCents = customer.totalSpentCents + spent;
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            totalOrders,
            totalSpentCents,
            lastPurchaseAt: created.createdAt,
            loyaltyPoints: customer.loyaltyPoints + Math.floor(spent / 100),
            classification: customerClassification(totalOrders, totalSpentCents)
          }
        });
      }
    }
    if (created.tableId) await prisma.serviceTable.update({ where: { id: created.tableId }, data: { status: "OCUPADA", waiterName: req.user?.name, customerName: created.customerNameSnapshot } });
    if (body.type !== "ONLINE") {
      const targets = Array.from(new Set(created.items.map((item) => item.printTarget)));
      for (const printTarget of targets) await printOrder(created.id, printTarget);
    }
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

app.post("/api/orders/:id/items", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ productId: z.string().optional().nullable(), nameSnapshot: z.string().min(1), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative(), totalCents: z.number().int().nonnegative(), printTarget: z.string().default("COZINHA"), note: optionalText, additives: z.array(z.object({ additionalId: z.string().optional().nullable(), name: z.string().min(1), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative() })).default([]) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: asString(req.params.id) } });
    if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
    const created = await prisma.orderItem.create({ data: { orderId: order.id, productId: body.productId, nameSnapshot: body.nameSnapshot, quantity: body.quantity, unitPriceCents: body.unitPriceCents, totalCents: body.totalCents, printTarget: body.printTarget as PrinterType, note: body.note, additives: { create: body.additives.map((a) => ({ additionalId: a.additionalId, nameSnapshot: a.name, quantity: a.quantity, unitPriceCents: a.unitPriceCents, totalCents: a.quantity * a.unitPriceCents })) } }, include: { additives: true } });
    await audit(req.user?.id, "ADD_ITEM", "order", order.id, { itemId: created.id, ...body });
    res.status(201).json(created);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/cancel-item", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ itemId: z.string(), reason: z.string().min(2) }).parse(req.body); const item = await prisma.orderItem.findUnique({ where: { id: body.itemId }, include: { order: true } }); if (!item) return res.status(404).json({ message: "Item nao encontrado." }); if (item.cancelledAt) return res.status(400).json({ message: "Item ja cancelado." }); await prisma.orderItem.update({ where: { id: item.id }, data: { cancelledAt: new Date(), cancelledReason: body.reason, totalCents: 0 } }); await audit(req.user?.id, "CANCEL_ITEM", "order", item.orderId, { itemId: body.itemId, reason: body.reason }); res.json({ ok: true }); } catch (error) { next(error); }
});

app.post("/api/orders/:id/apply-discount", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ discountCents: z.number().int().default(0), discountPercent: z.number().default(0) }).parse(req.body); const updated = await prisma.order.update({ where: { id: asString(req.params.id) }, data: { discountCents: body.discountCents, discountPercent: body.discountPercent } }); res.json(updated); } catch (error) { next(error); }
});

app.put("/api/orders/:id/delivery", requireRole("ADMIN", "GERENTE", "CAIXA", "GARCOM", "ENTREGADOR"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({
      deliveryDriverName: optionalText,
      notes: optionalText,
      changeForCents: z.number().int().optional(),
      status: z.enum(["NOVO", "ACEITO", "EM_PREPARO", "PRONTO", "SAIU_PARA_ENTREGA", "ENTREGUE", "FECHANDO_CONTA", "PAGO", "CANCELADO"]).optional()
    }).parse(req.body);
    const updated = await prisma.order.update({
      where: { id: asString(req.params.id) },
      data: {
        deliveryDriverName: body.deliveryDriverName,
        notes: body.notes,
        ...(body.changeForCents !== undefined ? { changeForCents: body.changeForCents } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.status === "SAIU_PARA_ENTREGA" ? { dispatchedAt: new Date() } : {}),
        ...(body.status === "ENTREGUE" ? { deliveredAt: new Date() } : {})
      },
      include: { items: { include: { additives: true } }, payments: true, customer: true, neighborhood: true }
    });
    await audit(req.user?.id, "UPDATE_DELIVERY", "order", updated.id, body);
    res.json(updated);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/pay", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try {
    const body = z.object({ customerId: optionalText, payments: z.array(z.object({ paymentMethodId: z.string().optional().nullable(), methodNameSnapshot: z.string().min(2), amountCents: z.number().int().nonnegative(), feeCents: z.number().int().default(0), changeCents: z.number().int().default(0) })), generateReceivable: z.boolean().default(false), receivableDueDate: z.string().optional() }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: asString(req.params.id) }, include: { items: true, customer: true } });
    if (!order) return res.status(404).json({ message: "Pedido nao encontrado." });
    if (body.generateReceivable && !body.customerId && !order.customerId) return res.status(400).json({ message: "Selecione um cliente para pagamento a prazo." });
    const result = await prisma.$transaction(async (tx) => {
      const cashRegister = await tx.cashRegister.findFirst({ where: { closedAt: null } });
      if (!cashRegister) throw new Error("Abra o caixa para receber pagamentos.");
      await tx.orderPayment.deleteMany({ where: { orderId: order.id } });
      await tx.cashMovement.deleteMany({ where: { orderId: order.id, type: "PAGAMENTO" } });
      await tx.orderPayment.createMany({ data: body.payments.map((payment) => ({ ...payment, orderId: order.id })) });
      const updated = await tx.order.update({ where: { id: order.id }, data: { status: "PAGO" } });
      await tx.cashMovement.createMany({ data: body.payments.map((payment) => ({ cashRegisterId: cashRegister.id, type: "PAGAMENTO", description: `Recebimento pedido #${order.number}`, amountCents: payment.amountCents, paymentMethodName: payment.methodNameSnapshot, orderId: order.id, userId: req.user?.id })) });
      if (body.generateReceivable) {
        await tx.receivable.create({ data: { customerId: body.customerId ?? order.customerId, customerName: order.customerNameSnapshot, description: `Pedido #${order.number} - ${order.customerNameSnapshot ?? "Pagamento a prazo"}`, amountCents: body.payments.reduce((s, p) => s + p.amountCents, 0), dueDate: body.receivableDueDate ? new Date(body.receivableDueDate) : new Date(Date.now() + 30 * 86400000), status: "ABERTO" } });
      }
      return updated;
    });
    if (result.tableId) await prisma.serviceTable.update({ where: { id: result.tableId }, data: { status: "LIVRE", waiterName: null, customerName: null } });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/finance/payables", async (_req, res) => res.json(await prisma.payable.findMany({ orderBy: { dueDate: "asc" } })));
app.post("/api/finance/payables", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ supplierName: optionalText, description: z.string().min(2), category: optionalText, amountCents: z.number().int(), dueDate: z.string(), paymentMethod: optionalText, notes: optionalText }).parse(req.body); res.status(201).json(await prisma.payable.create({ data: { ...body, dueDate: new Date(body.dueDate), status: "ABERTO" } })); } catch (error) { next(error); }
});
app.put("/api/finance/payables/:id/pay", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { res.json(await prisma.payable.update({ where: { id: asString(req.params.id) }, data: { status: "PAGO", paidAt: new Date() } })); } catch (error) { next(error); }
});
app.get("/api/finance/receivables", async (_req, res) => res.json(await prisma.receivable.findMany({ orderBy: { dueDate: "asc" } })));
app.post("/api/finance/receivables", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { const body = z.object({ customerName: optionalText, description: z.string().min(2), amountCents: z.number().int(), dueDate: z.string(), paymentMethod: optionalText, notes: optionalText }).parse(req.body); res.status(201).json(await prisma.receivable.create({ data: { ...body, dueDate: new Date(body.dueDate), status: "ABERTO" } })); } catch (error) { next(error); }
});
app.put("/api/finance/receivables/:id/pay", requireRole("ADMIN", "GERENTE", "CAIXA"), async (req: AuthedRequest, res, next) => {
  try { res.json(await prisma.receivable.update({ where: { id: asString(req.params.id) }, data: { status: "PAGO", receivedAt: new Date() } })); } catch (error) { next(error); }
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

app.get("/api/reports/summary", async (req, res, next) => {
  try {
    const filters = parseReportFilters(req);
    const orders = await loadFilteredOrders(filters);
    const total = orders.reduce((sum, order) => sum + orderNetTotal(order), 0);
    res.json({ rows: orders.length, total });
  } catch (error) { next(error); }
});

app.get("/api/reports/:kind", async (req, res, next) => {
  try {
    const format = asString(req.query.format, "json");
    const filters = parseReportFilters(req);
    const orders = await loadFilteredOrders(filters);
    const allOrders = await prisma.order.findMany({ include: { items: { include: { additives: true, product: true } }, payments: true, neighborhood: true, waiter: true, customer: true } });
    const products = await prisma.product.findMany({ include: { category: true } });
    const kind = asString(req.params.kind);
    const fromDate = filters.from ? new Date(filters.from) : todayStart();
    const toDate = filters.to ? new Date(filters.to) : new Date();
    const paymentRows = orders.flatMap((order) => order.payments.map((payment) => ({ order, payment })));
    const itemRows = orders.flatMap((order) => order.items.map((item) => ({ order, item })));
    const additionRows = orders.flatMap((order) => order.items.flatMap((item) => item.additives.map((addition) => ({ order, item, addition }))));
    const byDate = sumBy(orders, (order) => reportDateKey(order.createdAt), (order) => orderNetTotal(order));
    const byHour = sumBy(orders, (order) => `${String(order.createdAt.getHours()).padStart(2, "0")}h`, () => 1);
    const byWeekday = sumBy(orders, (order) => ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][order.createdAt.getDay()], (order) => orderNetTotal(order));
    const byMonth = sumBy(orders, (order) => `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, "0")}`, (order) => orderNetTotal(order));
    const byProductQty = sumBy(itemRows, (row) => row.item.nameSnapshot, (row) => row.item.quantity);
    const byProductRevenue = sumBy(itemRows, (row) => row.item.nameSnapshot, (row) => row.item.totalCents);
    const byCategoryQty = sumBy(itemRows, (row) => row.item.product?.category?.name ?? "Sem categoria", (row) => row.item.quantity);
    const byCategoryRevenue = sumBy(itemRows, (row) => row.item.product?.category?.name ?? "Sem categoria", (row) => row.item.totalCents);
    const byAdditionQty = sumBy(additionRows, (row) => row.addition.nameSnapshot, (row) => row.addition.quantity);
    const byAdditionRevenue = sumBy(additionRows, (row) => row.addition.nameSnapshot, (row) => row.addition.totalCents);
    const byCustomer = sumBy(orders.filter((order) => order.customerNameSnapshot), (order) => order.customerNameSnapshot ?? "Sem cliente", (order) => orderNetTotal(order));
    const byNeighborhood = sumBy(orders.filter((order) => order.type === "DELIVERY" || order.type === "ONLINE"), (order) => order.neighborhood?.name ?? order.districtSnapshot ?? "Sem bairro", (order) => orderNetTotal(order));
    const byDriver = sumBy(orders.filter((order) => order.deliveryDriverName), (order) => order.deliveryDriverName ?? "Sem entregador", (order) => 1);
    const byWaiter = sumBy(orders, (order) => order.waiter?.name ?? order.waiterNameSnapshot ?? "Sem garcom", (order) => orderNetTotal(order));
    const byTable = sumBy(orders.filter((order) => order.table?.name), (order) => order.table?.name ?? "Sem mesa", (order) => orderNetTotal(order));
    const payables = await prisma.payable.findMany({ where: { dueDate: { gte: fromDate, lte: toDate } } });
    const receivables = await prisma.receivable.findMany({ where: { dueDate: { gte: fromDate, lte: toDate } } });
    const stockMovements = await prisma.stockMovement.findMany({ where: { createdAt: { gte: fromDate, lte: toDate } }, include: { product: true } });
    const allCustomers = await prisma.customer.findMany();

    const lastPurchaseMap = new Map<string, { cliente: string; ultimo_pedido: string; valor: number }>();
    for (const order of allOrders) {
      if (!order.customerNameSnapshot) continue;
      const current = lastPurchaseMap.get(order.customerNameSnapshot);
      if (!current || new Date(current.ultimo_pedido).getTime() < order.createdAt.getTime()) {
        lastPurchaseMap.set(order.customerNameSnapshot, { cliente: order.customerNameSnapshot, ultimo_pedido: order.createdAt.toISOString(), valor: orderNetTotal(order) });
      }
    }

    const lastPurchaseRows = Array.from(lastPurchaseMap.values()).sort((a, b) => b.ultimo_pedido.localeCompare(a.ultimo_pedido));
    const inactiveRows = allCustomers.flatMap((customer) => {
      const customerOrders = allOrders.filter((order) => order.customerId === customer.id || order.customerNameSnapshot === customer.name);
      if (!customerOrders.length) return [{ cliente: customer.name, dias_sem_compra: 9999 }];
      const last = customerOrders.reduce((acc, order) => (order.createdAt > acc.createdAt ? order : acc), customerOrders[0]);
      const days = Math.floor((Date.now() - last.createdAt.getTime()) / 86400000);
      if (days >= 30) return [{ cliente: customer.name, dias_sem_compra: days }];
      return [];
    });

    const rowsByKind: Record<string, Array<Record<string, unknown>>> = {
      sales_by_period: [{
        quantidade_pedidos: orders.length,
        valor_bruto: orders.reduce((sum, order) => sum + orderGrossTotal(order), 0),
        descontos: 0,
        taxas_entrega: orders.reduce((sum, order) => sum + order.deliveryFeeCents, 0),
        valor_liquido: orders.reduce((sum, order) => sum + orderNetTotal(order), 0),
        ticket_medio: orders.length ? orders.reduce((sum, order) => sum + orderNetTotal(order), 0) / orders.length : 0
      }],
      sales_by_day: Array.from(byDate.entries()).map(([data, total]) => ({ data, total_vendido: total, pedidos: orders.filter((order) => reportDateKey(order.createdAt) === data).length, ticket_medio: orders.filter((order) => reportDateKey(order.createdAt) === data).length ? total / orders.filter((order) => reportDateKey(order.createdAt) === data).length : 0 })),
      sales_by_hour: Array.from(byHour.entries()).map(([hora, quantidade]) => ({ hora, quantidade_pedidos: quantidade, valor_vendido: orders.filter((order) => `${String(order.createdAt.getHours()).padStart(2, "0")}h` === hora).reduce((sum, order) => sum + orderNetTotal(order), 0) })),
      sales_by_weekday: Array.from(byWeekday.entries()).map(([dia, total]) => ({ dia, total_vendido: total, quantidade_pedidos: orders.filter((order) => ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][order.createdAt.getDay()] === dia).length })),
      sales_by_month: Array.from(byMonth.entries()).map(([mes, faturamento]) => ({ mes, faturamento, crescimento: 0 })),
      top_products: Array.from(byProductQty.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([produto, quantidade]) => ({ produto, quantidade, valor_faturado: byProductRevenue.get(produto) ?? 0 })),
      bottom_products: Array.from(byProductQty.entries()).sort((a, b) => a[1] - b[1]).slice(0, 20).map(([produto, quantidade]) => ({ produto, quantidade })),
      profit_by_product: products.map((product) => ({ produto: product.name, custo: product.costCents, venda: product.salePriceCents, lucro_unitario: product.salePriceCents - product.costCents, lucro_total: itemRows.filter((row) => row.item.productId === product.id).reduce((sum, row) => sum + ((row.item.unitPriceCents - product.costCents) * row.item.quantity), 0) })),
      sales_by_category: Array.from(byCategoryQty.entries()).map(([categoria, quantidade]) => ({ categoria, quantidade, valor_vendido: byCategoryRevenue.get(categoria) ?? 0 })),
      top_additions: Array.from(byAdditionQty.entries()).sort((a, b) => b[1] - a[1]).map(([adicional, quantidade]) => ({ adicional, quantidade, valor_gerado: byAdditionRevenue.get(adicional) ?? 0 })),
      additional_revenue: [{ valor_gerado: additionRows.reduce((sum, row) => sum + row.addition.totalCents, 0) }],
      top_customers: Array.from(byCustomer.entries()).sort((a, b) => b[1] - a[1]).map(([cliente, valor]) => ({ cliente, quantidade_pedidos: orders.filter((order) => order.customerNameSnapshot === cliente).length, valor_gasto: valor })),
      customer_last_purchase: lastPurchaseRows,
      inactive_customers: inactiveRows,
      delivery_by_neighborhood: Array.from(byNeighborhood.entries()).sort((a, b) => b[1] - a[1]).map(([bairro, valor]) => ({ bairro, quantidade_pedidos: orders.filter((order) => (order.neighborhood?.name ?? order.districtSnapshot ?? "Sem bairro") === bairro).length, valor_vendido: valor })),
      delivery_fee_by_neighborhood: Array.from(byNeighborhood.entries()).map(([bairro]) => ({ bairro, taxa_arrecadada: orders.filter((order) => (order.neighborhood?.name ?? order.districtSnapshot ?? "Sem bairro") === bairro).reduce((sum, order) => sum + order.deliveryFeeCents, 0) })),
      delivery_time: orders.filter((order) => order.type === "DELIVERY" || order.type === "ONLINE").map((order) => {
        const endTime = order.deliveredAt ?? order.dispatchedAt ?? order.readyAt ?? order.createdAt;
        const minutes = Math.max(0, Math.round((endTime.getTime() - order.createdAt.getTime()) / 60000));
        return { cliente: order.customerNameSnapshot ?? "", bairro: order.neighborhood?.name ?? order.districtSnapshot ?? "", tempo_medio_min: minutes, tempo_minimo_min: minutes, tempo_maximo_min: minutes };
      }),
      delivery_orders: orders.filter((order) => order.type === "DELIVERY" || order.type === "ONLINE").map((order) => ({ cliente: order.customerNameSnapshot ?? "", bairro: order.neighborhood?.name ?? order.districtSnapshot ?? "", entregador: order.deliveryDriverName ?? "", valor: orderNetTotal(order), horario: order.createdAt.toLocaleString("pt-BR") })),
      delivery_performance: Array.from(byDriver.entries()).sort((a, b) => b[1] - a[1]).map(([entregador, entregas]) => ({ entregador, quantidade_entregas: entregas, valor_transportado: orders.filter((order) => order.deliveryDriverName === entregador).reduce((sum, order) => sum + orderNetTotal(order), 0) })),
      delivery_driver_commission: Array.from(byDriver.entries()).map(([entregador, entregas]) => ({ entregador, total_entregas: entregas, valor_comissao: entregas * 2, valor_a_receber: entregas * 2 })),
      waiter_sales: Array.from(byWaiter.entries()).sort((a, b) => b[1] - a[1]).map(([garcom, valor]) => ({ garcom, quantidade_pedidos: orders.filter((order) => (order.waiter?.name ?? order.waiterNameSnapshot ?? "Sem garcom") === garcom).length, valor_vendido: valor })),
      waiter_commission: Array.from(byWaiter.entries()).map(([garcom, valor]) => ({ garcom, percentual: 5, valor_gerado: valor, valor_comissao: valor * 0.05 })),
      table_turnover: Array.from(byTable.entries()).sort((a, b) => b[1] - a[1]).map(([mesa, valor]) => ({ mesa, quantidade_atendimentos: orders.filter((order) => (order.table?.name ?? "Sem mesa") === mesa).length, tempo_medio_permanencia_min: 0, valor_consumido: valor })),
      table_consumption: Array.from(byTable.entries()).map(([mesa, valor]) => ({ mesa, valor_consumido: valor })),
      cashbook: (await prisma.cashMovement.findMany({ where: { createdAt: { gte: fromDate, lte: toDate } }, include: { cashRegister: true } })).map((item) => ({ tipo: item.type, descricao: item.description, valor: item.amountCents, data: item.createdAt.toLocaleString("pt-BR") })),
      cash_closing: await prisma.cashRegister.findMany({ where: { openedAt: { gte: fromDate, lte: toDate } } }).then((items) => items.map((item) => ({ abertura: item.openedAt.toLocaleString("pt-BR"), fechamento: item.closedAt?.toLocaleString("pt-BR") ?? "", valor_esperado: item.expectedAmountCents ?? 0, valor_informado: item.closingAmountCents ?? 0, diferenca: item.differenceCents ?? 0 }))),
      payable_summary: [
        { status: "Abertas", total: payables.filter((item) => item.status === "ABERTO").length },
        { status: "Pagas", total: payables.filter((item) => item.status === "PAGO").length },
        { status: "Vencidas", total: payables.filter((item) => item.status === "VENCIDO").length }
      ],
      receivable_summary: [
        { status: "Em aberto", total: receivables.filter((item) => item.status === "ABERTO").length },
        { status: "Recebidas", total: receivables.filter((item) => item.status === "PAGO").length },
        { status: "Vencidas", total: receivables.filter((item) => item.status === "VENCIDO").length }
      ],
      flow_cash: [
        { tipo: "Entradas", valor: paymentRows.reduce((sum, row) => sum + row.payment.amountCents, 0) },
        { tipo: "Saídas", valor: payables.filter((item) => item.status !== "PAGO").reduce((sum, item) => sum + item.amountCents, 0) }
      ],
      dre_simplificada: [{
        receitas: orders.reduce((sum, order) => sum + orderNetTotal(order), 0),
        custos: itemRows.reduce((sum, row) => sum + ((row.item.product?.costCents ?? 0) * row.item.quantity), 0),
        despesas: payables.filter((item) => item.status !== "PAGO").reduce((sum, item) => sum + item.amountCents, 0),
        lucro: orders.reduce((sum, order) => sum + orderNetTotal(order), 0) - itemRows.reduce((sum, row) => sum + ((row.item.product?.costCents ?? 0) * row.item.quantity), 0) - payables.filter((item) => item.status !== "PAGO").reduce((sum, item) => sum + item.amountCents, 0)
      }],
      stock_current: products.map((product) => ({ produto: product.name, quantidade: product.stockCurrent, custo: product.costCents })),
      stock_low: products.filter((product) => product.stockCurrent <= product.lowStockThreshold).map((product) => ({ produto: product.name, quantidade: product.stockCurrent, minimo: product.lowStockThreshold })),
      stock_movement: stockMovements.map((movement) => ({ tipo: movement.type, produto: movement.product.name, quantidade: movement.quantity, data: movement.createdAt.toLocaleString("pt-BR") })),
      cancelled_orders: orders.filter((order) => order.status === "CANCELADO").map((order) => ({ usuario: order.waiter?.name ?? order.waiterNameSnapshot ?? "", motivo: order.cancelledReason ?? "", valor: orderNetTotal(order) })),
      cancelled_items: orders.flatMap((order) => order.items.filter((item) => item.cancelledAt).map((item) => ({ produto: item.nameSnapshot, quantidade: item.quantity, motivo: item.cancelledReason ?? "" }))),
      cancellation_ranking: Array.from(sumBy(orders.filter((order) => order.status === "CANCELADO"), (order) => order.waiter?.name ?? order.waiterNameSnapshot ?? "Sem usuario", () => 1).entries()).map(([usuario, cancelamentos]) => ({ usuario, cancelamentos })),
      executive_dashboard: [{
        faturamento_hoje: orders.filter((order) => reportDateKey(order.createdAt) === reportDateKey(new Date())).reduce((sum, order) => sum + orderNetTotal(order), 0),
        faturamento_mes: orders.reduce((sum, order) => sum + orderNetTotal(order), 0),
        pedidos_hoje: orders.filter((order) => reportDateKey(order.createdAt) === reportDateKey(new Date())).length,
        delivery_hoje: orders.filter((order) => (order.type === "DELIVERY" || order.type === "ONLINE") && reportDateKey(order.createdAt) === reportDateKey(new Date())).length,
        mesas_ocupadas: await prisma.serviceTable.count({ where: { status: { in: ["OCUPADA", "AGUARDANDO_PREPARO", "PRONTO", "FECHANDO_CONTA"] } } }),
        ticket_medio: orders.length ? orders.reduce((sum, order) => sum + orderNetTotal(order), 0) / orders.length : 0,
        produto_mais_vendido: Array.from(byProductQty.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
        bairro_que_mais_compra: Array.from(byNeighborhood.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
        entregador_destaque: Array.from(byDriver.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
        garcom_destaque: Array.from(byWaiter.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
        lucro_estimado: itemRows.reduce((sum, row) => sum + ((row.item.unitPriceCents - (row.item.product?.costCents ?? 0)) * row.item.quantity), 0),
        contas_a_pagar_vencidas: payables.filter((item) => item.status === "VENCIDO").reduce((sum, item) => sum + item.amountCents, 0),
        fluxo_de_caixa: paymentRows.reduce((sum, row) => sum + row.payment.amountCents, 0) - payables.filter((item) => item.status !== "PAGO").reduce((sum, item) => sum + item.amountCents, 0)
      }]
    };

    const rows = rowsByKind[kind] ?? [];
    if (kind === "customer_last_purchase" || kind === "executive_dashboard") {
      if (format === "json") return res.json(rows);
      return downloadReport(res, kind, rows, format);
    }
    if (format === "json") return res.json(rows);
    return downloadReport(res, kind, rows, format);
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
