"use client";

import { useEffect } from "react";
import { cart } from "./cart-store";

/** Empties the cart once an order is confirmed. */
export function ClearCart() {
  useEffect(() => cart.clear(), []);
  return null;
}
