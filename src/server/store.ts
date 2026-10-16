import "server-only";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal append-only JSON Lines storage. Swap for a real database
 * (Postgres, SQLite) in production — the function signatures stay the same.
 */
const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));

export interface OrderRecord {
  ref: string;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    governorate: string;
    city: string;
    address: string;
    notes: string;
  };
  items: { slug: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  payment: "cod";
  status: "new";
}

export interface MessageRecord {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  message: string;
}

async function append(file: string, record: unknown) {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await appendFile(path.join(DATA_DIR, file), JSON.stringify(record) + "\n", { mode: 0o600 });
}

async function readAll<T>(file: string): Promise<T[]> {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export const saveOrder = (order: OrderRecord) => append("orders.jsonl", order);
export const saveMessage = (msg: MessageRecord) => append("messages.jsonl", msg);
export const listOrders = async () => (await readAll<OrderRecord>("orders.jsonl")).reverse();
export const listMessages = async () => (await readAll<MessageRecord>("messages.jsonl")).reverse();
