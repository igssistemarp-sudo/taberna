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

  if ((await prisma.neighborhood.count()) === 0) {
    await prisma.neighborhood.createMany({
      data: [
        { name: "Centro", city: "IGS", deliveryFeeCents: 500, avgDeliveryMinutes: 25 },
        { name: "Jardim America", city: "IGS", deliveryFeeCents: 700, avgDeliveryMinutes: 30 },
        { name: "Vila Nova", city: "IGS", deliveryFeeCents: 900, avgDeliveryMinutes: 35 }
      ]
    });
  }

  if ((await prisma.productCategory.count()) === 0) {
    await prisma.productCategory.createMany({
      data: [
        { name: "Hamburgueres" },
        { name: "Bebidas" },
        { name: "Porcoes" },
        { name: "Combos" },
        { name: "Sobremesas" }
      ]
    });
  }

  const categories = await prisma.productCategory.findMany();
  const byName = (name: string) => {
    const found = categories.find((category) => category.name === name);
    if (!found) throw new Error(`Categoria ausente: ${name}`);
    return found;
  };

  if ((await prisma.paymentMethod.count()) === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        { name: "Dinheiro", allowFee: false },
        { name: "Pix", allowFee: false },
        { name: "Cartao debito", allowFee: true },
        { name: "Cartao credito", allowFee: true },
        { name: "Vale refeicao", allowFee: true },
        { name: "Outros", allowFee: false }
      ]
    });
  }

  if ((await prisma.additional.count()) === 0) {
    await prisma.additional.createMany({
      data: [
        { name: "Blend 160gr de carne bovina", valueCents: 1200, charge: true, category: "Hamburgueres" },
        { name: "Blend 110gr de carne bovina", valueCents: 900, charge: true, category: "Hamburgueres" },
        { name: "Fatia de Bacon", valueCents: 700, charge: true, category: "Hamburgueres" },
        { name: "Trio de Queijo", valueCents: 700, charge: true, category: "Hamburgueres" },
        { name: "Cebola Caramelizada", valueCents: 400, charge: true, category: "Hamburgueres" },
        { name: "Geleia de Abacaxi", valueCents: 300, charge: true, category: "Hamburgueres" },
        { name: "Ovo", valueCents: 300, charge: true, category: "Hamburgueres" },
        { name: "Molho Barbecue", valueCents: 0, charge: false, category: "Molhos" },
        { name: "Molho Chipotle", valueCents: 0, charge: false, category: "Molhos" },
        { name: "Geleia de Pimenta", valueCents: 0, charge: false, category: "Molhos" },
        { name: "Ketchup defumado", valueCents: 0, charge: false, category: "Molhos" }
      ]
    });
  }

  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: [
      { code: 1, name: "Nômade", categoryId: byName("Hamburgueres").id, salePriceCents: 5000, costCents: 2200, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 2, name: "Medieval", categoryId: byName("Hamburgueres").id, salePriceCents: 4000, costCents: 1800, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 3, name: "Ninja", categoryId: byName("Hamburgueres").id, salePriceCents: 3800, costCents: 1700, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 4, name: "Viking's", categoryId: byName("Hamburgueres").id, salePriceCents: 3600, costCents: 1600, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 5, name: "Astecas", categoryId: byName("Hamburgueres").id, salePriceCents: 3300, costCents: 1500, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 6, name: "Bárbaros", categoryId: byName("Hamburgueres").id, salePriceCents: 2800, costCents: 1300, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 7, name: "Kubaba", categoryId: byName("Hamburgueres").id, salePriceCents: 2700, costCents: 1200, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 8, name: "Monge", categoryId: byName("Hamburgueres").id, salePriceCents: 2300, costCents: 1000, stockCurrent: 20, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA },
      { code: 9, name: "Água mineral", categoryId: byName("Bebidas").id, salePriceCents: 350, costCents: 120, stockCurrent: 100, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 10, name: "Água com gás", categoryId: byName("Bebidas").id, salePriceCents: 400, costCents: 130, stockCurrent: 80, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 11, name: "Suco lata 290ml", categoryId: byName("Bebidas").id, salePriceCents: 600, costCents: 260, stockCurrent: 70, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 12, name: "Refrigerante lata 350ml", categoryId: byName("Bebidas").id, salePriceCents: 600, costCents: 250, stockCurrent: 120, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 13, name: "Refrigerante 600ml", categoryId: byName("Bebidas").id, salePriceCents: 800, costCents: 350, stockCurrent: 80, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 14, name: "Limoneto 500ml", categoryId: byName("Bebidas").id, salePriceCents: 800, costCents: 350, stockCurrent: 40, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 15, name: "Coca Cola 1 litro", categoryId: byName("Bebidas").id, salePriceCents: 1000, costCents: 450, stockCurrent: 40, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 16, name: "Energetico Monster Zero", categoryId: byName("Bebidas").id, salePriceCents: 1400, costCents: 700, stockCurrent: 30, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 17, name: "Brahma latao 473ml", categoryId: byName("Bebidas").id, salePriceCents: 700, costCents: 350, stockCurrent: 100, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 18, name: "Original latao 473ml", categoryId: byName("Bebidas").id, salePriceCents: 800, costCents: 380, stockCurrent: 80, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 19, name: "Heineken latao 473ml", categoryId: byName("Bebidas").id, salePriceCents: 900, costCents: 430, stockCurrent: 70, controlStock: true, onlineMenu: true, printTarget: PrinterType.BAR },
      { code: 20, name: "Porcao de batata", categoryId: byName("Porcoes").id, salePriceCents: 2490, costCents: 1100, stockCurrent: 25, controlStock: true, onlineMenu: true, printTarget: PrinterType.COZINHA }
    ]
    });
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
