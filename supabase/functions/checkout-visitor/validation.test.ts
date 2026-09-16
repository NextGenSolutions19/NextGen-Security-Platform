import {
  validateCheckoutVisitorInput,
} from "../_shared/visitor-checkout.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("requires visitor_entry_id", () => {
  const result = validateCheckoutVisitorInput({});
  assert(!result.ok, "expected failure");
});

Deno.test("rejects invalid uuid", () => {
  const result = validateCheckoutVisitorInput({
    visitor_entry_id: "not-a-uuid",
  });
  assert(!result.ok, "expected failure");
});

Deno.test("rejects client-supplied status", () => {
  const result = validateCheckoutVisitorInput({
    visitor_entry_id: "33333333-3333-4333-a333-333333333301",
    status: "checked_out",
  });
  assert(!result.ok, "expected failure");
});

Deno.test("accepts valid payload", () => {
  const result = validateCheckoutVisitorInput({
    visitor_entry_id: "33333333-3333-4333-a333-333333333301",
  });
  assert(result.ok, "expected success");
});
