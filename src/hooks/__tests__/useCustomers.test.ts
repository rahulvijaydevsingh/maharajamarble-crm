import { describe, expect, it } from "vitest";
import { mergeCustomerById, type Customer } from "../useCustomers";

const customer = (id: string, name: string) => ({ id, name }) as Customer;

describe("mergeCustomerById", () => {
  it("keeps exactly one customer when the saved row arrives again from realtime", () => {
    const savedCustomer = customer("customer-1", "Amit Sharma");
    const nextCustomers = mergeCustomerById([savedCustomer], savedCustomer);

    expect(nextCustomers).toHaveLength(1);
    expect(nextCustomers[0].id).toBe("customer-1");
  });
});
