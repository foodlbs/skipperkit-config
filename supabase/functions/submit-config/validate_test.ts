// validate_test.ts
import { assertEquals } from "jsr:@std/assert";
import { validate } from "./validate.ts";

const good = {
  skipperkitContribution: 1,
  packageName: "com.hulu.plus",
  displayName: "Hulu",
  buttons: [{ target: "SKIP_INTRO", viewId: "com.hulu.plus:id/skip", label: null }],
  appVersionName: "5.1.0",
  skipperkitVersion: "0.1.0",
  locale: "en",
};

Deno.test("accepts a valid payload", () => {
  const r = validate(good);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.buttons.length, 1);
});

Deno.test("rejects wrong format marker / version", () => {
  assertEquals(validate({ ...good, skipperkitContribution: 2 }).ok, false);
  assertEquals(validate({ packageName: "com.hulu.plus", buttons: [] }).ok, false);
});

Deno.test("rejects malformed package names", () => {
  assertEquals(validate({ ...good, packageName: "no-dots" }).ok, false);
  assertEquals(validate({ ...good, packageName: "com.x; rm -rf" }).ok, false);
});

Deno.test("drops NEXT_EPISODE and id-less/label-less buttons, keeps the rest", () => {
  const r = validate({
    ...good,
    buttons: [
      { target: "NEXT_EPISODE", viewId: "x:id/next" },
      { target: "SKIP_RECAP" },
      { target: "SKIP_RECAP", label: "Skip Recap" },
    ],
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.buttons.length, 1);
    assertEquals(r.value.buttons[0].label, "Skip Recap");
  }
});

Deno.test("rejects when no buttons survive", () => {
  assertEquals(validate({ ...good, buttons: [{ target: "NEXT_EPISODE", viewId: "x" }] }).ok, false);
});

Deno.test("caps buttons at 20 and strings at 256", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({
    target: "SKIP_INTRO", viewId: `com.hulu.plus:id/skip${i}`,
  }));
  const r = validate({ ...good, buttons: many });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.buttons.length, 20);

  const long = validate({ ...good, buttons: [{ target: "SKIP_INTRO", label: "x".repeat(9999) }] });
  if (long.ok) assertEquals(long.value.buttons[0].label!.length, 256);
});

Deno.test("metadata is optional and capped", () => {
  const r = validate({ ...good, appVersionName: undefined, locale: "x".repeat(999) });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.appVersionName, null);
    assertEquals(r.value.locale!.length, 64);
  }
});
