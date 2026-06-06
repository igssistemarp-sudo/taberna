import "dotenv/config";
import { randomBytes, scryptSync } from "crypto";
import { PrismaClient, PrinterType, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const passwordHash = hashPassword("123");

  const company = await prisma.companySetting.upsert({
    where: { onlineMenuSlug: "igs-lanchonete-pro" },
    update: {
      razaoSocial: "IGS Lanchonete PRO Ltda",
      nomeFantasia: "IGS Lanchonete PRO",
      openingHours: "Segunda a Domingo, 18h00 - 00h30",
      onlineMenuEnabled: true,
      theme: "dark"
    },
    create: {
      razaoSocial: "IGS Lanchonete PRO Ltda",
      nomeFantasia: "IGS Lanchonete PRO",
      openingHours: "Segunda a Domingo, 18h00 - 00h30",
      onlineMenuEnabled: true,
      onlineMenuSlug: "igs-lanchonete-pro",
      theme: "dark"
    }
  });

  if ((await prisma.user.count()) === 0) {
    await prisma.user.createMany({
      data: [
        { name: "Administrador", login: "admin", passwordHash, role: UserRole.ADMIN },
        { name: "Caixa", login: "caixa", passwordHash, role: UserRole.CAIXA },
        { name: "Garcom", login: "garcom", passwordHash, role: UserRole.GARCOM },
        { name: "Cozinha", login: "cozinha", passwordHash, role: UserRole.COZINHA },
        { name: "Entregador", login: "entregador", passwordHash, role: UserRole.ENTREGADOR },
        { name: "Gerente", login: "gerente", passwordHash, role: UserRole.GERENTE }
      ]
    });
  }

  for (const neighborhood of [
    { name: "Centro", city: "IGS", deliveryFeeCents: 500, avgDeliveryMinutes: 25 },
    { name: "Jardim America", city: "IGS", deliveryFeeCents: 700, avgDeliveryMinutes: 30 },
    { name: "Vila Nova", city: "IGS", deliveryFeeCents: 900, avgDeliveryMinutes: 35 }
  ]) {
    await prisma.neighborhood.upsert({
      where: { id: `${neighborhood.name}-${neighborhood.city}` },
      update: neighborhood,
      create: neighborhood
    }).catch(async () => {
      const existing = await prisma.neighborhood.findFirst({ where: { name: neighborhood.name, city: neighborhood.city } });
      if (existing) await prisma.neighborhood.update({ where: { id: existing.id }, data: neighborhood });
      else await prisma.neighborhood.create({ data: neighborhood });
    });
  }

  for (const categoryName of ["Hamburgueres", "Bebidas", "Adicionais", "Molhos"]) {
    const existing = await prisma.productCategory.findUnique({ where: { name: categoryName } });
    if (!existing) await prisma.productCategory.create({ data: { name: categoryName } });
  }

  const categories = await prisma.productCategory.findMany();
  const byName = (name: string) => {
    const found = categories.find((category) => category.name === name);
    if (!found) throw new Error(`Categoria ausente: ${name}`);
    return found;
  };

  for (const paymentMethod of [
    { name: "Dinheiro", allowFee: false },
    { name: "Pix", allowFee: false },
    { name: "Cartao debito", allowFee: true },
    { name: "Cartao credito", allowFee: true },
    { name: "Vale refeicao", allowFee: true },
    { name: "Outros", allowFee: false }
  ]) {
    const existing = await prisma.paymentMethod.findFirst({ where: { name: paymentMethod.name } });
    if (existing) await prisma.paymentMethod.update({ where: { id: existing.id }, data: paymentMethod });
    else await prisma.paymentMethod.create({ data: paymentMethod });
  }

  for (const additional of [
    { name: "Blend 160gr de carne bovina", valueCents: 1200, charge: true, category: "Adicionais" },
    { name: "Blend 110gr de carne bovina", valueCents: 900, charge: true, category: "Adicionais" },
    { name: "Fatia de Bacon", valueCents: 700, charge: true, category: "Adicionais" },
    { name: "Trio de Queijo", valueCents: 700, charge: true, category: "Adicionais" },
    { name: "Cebola Caramelizada", valueCents: 400, charge: true, category: "Adicionais" },
    { name: "Geleia de Abacaxi", valueCents: 300, charge: true, category: "Adicionais" },
    { name: "Ovo", valueCents: 300, charge: true, category: "Adicionais" },
    { name: "Molho Barbecue", valueCents: 0, charge: false, category: "Molhos" },
    { name: "Molho Chipotle", valueCents: 0, charge: false, category: "Molhos" },
    { name: "Geleia de Pimenta", valueCents: 0, charge: false, category: "Molhos" },
    { name: "Ketchup defumado", valueCents: 0, charge: false, category: "Molhos" }
  ]) {
    const existing = await prisma.additional.findFirst({ where: { name: additional.name } });
    if (existing) await prisma.additional.update({ where: { id: existing.id }, data: additional });
    else await prisma.additional.create({ data: additional });
  }

  const products = [
    { code: 1, name: "Nômade", categoryName: "Hamburgueres", salePriceCents: 5000, costCents: 2200, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 2, name: "Medieval", categoryName: "Hamburgueres", salePriceCents: 4000, costCents: 1800, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 3, name: "Ninja", categoryName: "Hamburgueres", salePriceCents: 3800, costCents: 1700, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 4, name: "Viking's", categoryName: "Hamburgueres", salePriceCents: 3600, costCents: 1600, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 5, name: "Astecas", categoryName: "Hamburgueres", salePriceCents: 3300, costCents: 1500, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 6, name: "Bárbaros", categoryName: "Hamburgueres", salePriceCents: 2800, costCents: 1300, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 7, name: "Kubaba", categoryName: "Hamburgueres", salePriceCents: 2700, costCents: 1200, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 8, name: "Monge", categoryName: "Hamburgueres", salePriceCents: 2300, costCents: 1000, stockCurrent: 20, printTarget: PrinterType.COZINHA },
    { code: 9, name: "Água mineral", categoryName: "Bebidas", salePriceCents: 350, costCents: 120, stockCurrent: 100, printTarget: PrinterType.BAR },
    { code: 10, name: "Água com gás", categoryName: "Bebidas", salePriceCents: 400, costCents: 130, stockCurrent: 80, printTarget: PrinterType.BAR },
    { code: 11, name: "Suco lata 290ml", categoryName: "Bebidas", salePriceCents: 600, costCents: 260, stockCurrent: 70, printTarget: PrinterType.BAR },
    { code: 12, name: "Refrigerante lata 350ml", categoryName: "Bebidas", salePriceCents: 600, costCents: 250, stockCurrent: 120, printTarget: PrinterType.BAR },
    { code: 13, name: "Refrigerante 600ml", categoryName: "Bebidas", salePriceCents: 800, costCents: 350, stockCurrent: 80, printTarget: PrinterType.BAR },
    { code: 14, name: "Limoneto 500ml", categoryName: "Bebidas", salePriceCents: 800, costCents: 350, stockCurrent: 40, printTarget: PrinterType.BAR },
    { code: 15, name: "Coca Cola 1 litro", categoryName: "Bebidas", salePriceCents: 1000, costCents: 450, stockCurrent: 40, printTarget: PrinterType.BAR },
    { code: 16, name: "Energético Monster Zero", categoryName: "Bebidas", salePriceCents: 1400, costCents: 700, stockCurrent: 30, printTarget: PrinterType.BAR },
    { code: 17, name: "Brahma latão 473ml", categoryName: "Bebidas", salePriceCents: 700, costCents: 350, stockCurrent: 100, printTarget: PrinterType.BAR },
    { code: 18, name: "Original latão 473ml", categoryName: "Bebidas", salePriceCents: 800, costCents: 380, stockCurrent: 80, printTarget: PrinterType.BAR },
    { code: 19, name: "Heineken latão 473ml", categoryName: "Bebidas", salePriceCents: 900, costCents: 430, stockCurrent: 70, printTarget: PrinterType.BAR }
  ];

  for (const product of products) {
    const category = byName(product.categoryName);
    const existing = await prisma.product.findUnique({ where: { code: product.code } });
    const data = {
      name: product.name,
      categoryId: category.id,
      salePriceCents: product.salePriceCents,
      costCents: product.costCents,
      stockCurrent: product.stockCurrent,
      controlStock: true,
      onlineMenu: true,
      printTarget: product.printTarget
    };
    if (existing) await prisma.product.update({ where: { id: existing.id }, data });
    else await prisma.product.create({ data: { code: product.code, ...data } });
  }

  if ((await prisma.serviceTable.count()) === 0) {
    await prisma.serviceTable.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({ name: `Mesa ${index + 1}`, status: "LIVRE" as const }))
    });
  }

  if ((await prisma.printerConfig.count()) === 0) {
    await prisma.printerConfig.createMany({
      data: [
        { name: "Cozinha", type: PrinterType.COZINHA, ip: "192.168.0.100", port: 9100, active: false },
        { name: "Bar", type: PrinterType.BAR, ip: "192.168.0.101", port: 9100, active: false },
        { name: "Caixa", type: PrinterType.CAIXA, ip: "192.168.0.102", port: 9100, active: false }
      ]
    });
  }

  if ((await prisma.payable.count()) === 0) {
    await prisma.payable.create({
      data: {
        supplierName: "Fornecedor padrao",
        description: "Compra inicial",
        category: "Estoque",
        amountCents: 0,
        dueDate: new Date(),
        status: "ABERTO"
      }
    });
  }

  if ((await prisma.receivable.count()) === 0) {
    await prisma.receivable.create({
      data: {
        customerName: "Cliente exemplo",
        description: "Pedido a receber",
        amountCents: 0,
        dueDate: new Date(),
        status: "ABERTO"
      }
    });
  }

  await prisma.companySetting.update({
    where: { id: company.id },
    data: {
      printerKitchenIp: "192.168.0.100",
      printerBarIp: "192.168.0.101",
      printerCashIp: "192.168.0.102"
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
