import "server-only";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal file storage: orders live in one JSON document (written atomically,
 * serialised by an in-process lock) and contact messages in a JSON Lines log.
 * Fine for a single server with a persistent disk — swap for a real database
 * (Postgres, SQLite) when you scale; the exported functions stay the same.
 */
const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

export type PaymentMethod = "cod" | "online";
export type OrderStatus = "new" | "pending_payment" | "paid" | "payment_failed";

export interface OrderRecord {
  ref: string;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    region: string;
    city: string;
    district: string;
    address: string;
    postalCode: string;
    notes: string;
  };
  items: { slug: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  /** VAT (15%) included in total */
  vat: number;
  payment: PaymentMethod;
  status: OrderStatus;
  /** Random secret that lets the customer view their own order page. */
  accessToken?: string;
  /** Payment gateway invoice id (online payments only). */
  invoiceId?: string;
  /** Hosted payment page, so the customer can resume an unfinished payment. */
  invoiceUrl?: string;
  paymentId?: string;
  paidAt?: string;
}

export interface MessageRecord {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  message: string;
}

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
}

async function readOrders(): Promise<OrderRecord[]> {
  try {
    return JSON.parse(await readFile(ORDERS_FILE, "utf8")) as OrderRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeOrders(orders: OrderRecord[]) {
  await ensureDir();
  const tmp = `${ORDERS_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(orders), { mode: 0o600 });
  await rename(tmp, ORDERS_FILE);
}

// Serialises read-modify-write cycles so concurrent requests can't lose updates.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function saveOrder(order: OrderRecord) {
  return locked(async () => {
    const orders = await readOrders();
    orders.push(order);
    await writeOrders(orders);
  });
}

/** Applies `patch` to the order and returns the updated record (or null if not found). */
export function updateOrder(
  ref: string,
  patch: (order: OrderRecord) => Partial<OrderRecord> | null,
): Promise<OrderRecord | null> {
  return locked(async () => {
    const orders = await readOrders();
    const i = orders.findIndex((o) => o.ref === ref);
    if (i === -1) return null;
    const changes = patch(orders[i]);
    if (!changes) return orders[i];
    orders[i] = { ...orders[i], ...changes };
    await writeOrders(orders);
    return orders[i];
  });
}

export async function getOrder(ref: string): Promise<OrderRecord | null> {
  return (await readOrders()).find((o) => o.ref === ref) ?? null;
}

export async function findOrderByInvoice(invoiceId: string): Promise<OrderRecord | null> {
  return (await readOrders()).find((o) => o.invoiceId === invoiceId) ?? null;
}

export const listOrders = async () => (await readOrders()).reverse();

export async function saveMessage(msg: MessageRecord) {
  await ensureDir();
  await appendFile(path.join(DATA_DIR, "messages.jsonl"), JSON.stringify(msg) + "\n", { mode: 0o600 });
}

export async function listMessages(): Promise<MessageRecord[]> {
  try {
    const raw = await readFile(path.join(DATA_DIR, "messages.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as MessageRecord];
        } catch {
          return [];
        }
      })
      .reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
