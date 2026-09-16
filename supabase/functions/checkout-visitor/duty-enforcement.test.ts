import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function dutyClient(
  result: { data: { id: string } | null; error: unknown },
): Parameters<typeof requireActiveGuardDuty>[0] {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: () => Promise.resolve(result),
  };

  return {
    from: (table: string) => {
      assert(table === "guard_duty_sessions", "must query guard duty sessions");
      return query;
    },
  } as unknown as Parameters<typeof requireActiveGuardDuty>[0];
}

Deno.test("OFF DUTY checkout authorization is rejected before mutation", async () => {
  const result = await requireActiveGuardDuty(
    dutyClient({ data: null, error: null }),
    { guardUserId: "guard-1", societyId: "society-1" },
  );

  assert(!result.ok, "expected OFF DUTY rejection");
  assert(result.response.status === 403, "expected forbidden response");

  const body = await result.response.json();
  assert(body.error?.code === "GUARD_OFF_DUTY", "expected duty error code");
});

Deno.test("ON DUTY checkout authorization succeeds", async () => {
  const result = await requireActiveGuardDuty(
    dutyClient({ data: { id: "duty-1" }, error: null }),
    { guardUserId: "guard-1", societyId: "society-1" },
  );

  assert(result.ok, "expected ON DUTY authorization");
});

Deno.test("checkout function requires duty before loading or updating visitor state", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const dutyCheck = source.indexOf("await requireActiveGuardDuty");
  const visitorLoad = source.indexOf('.from("visitor_entries")');
  const visitorUpdate = source.indexOf(".update({");

  assert(dutyCheck >= 0, "checkout must invoke shared duty enforcement");
  assert(visitorLoad > dutyCheck, "duty enforcement must precede visitor load");
  assert(visitorUpdate > dutyCheck, "duty enforcement must precede checkout update");
  assert(
    source.includes("guardUserId: guardUser.id") &&
      source.includes("societyId: society.id"),
    "duty enforcement must use authenticated guard and society",
  );
});

Deno.test("checkout mutation remains common to individual, group, and recurring entries", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const mutation = source.slice(source.indexOf(".update({"));

  assert(
    mutation.includes('status: "checked_out"') &&
      mutation.includes("check_out_at: checkedOutAt"),
    "checkout must retain status and timestamp mutation",
  );
  assert(
    !mutation.includes('.eq("entry_type"') &&
      !mutation.includes('.eq("purpose_code"'),
    "checkout must not exclude group or recurring visitor entries",
  );
});
