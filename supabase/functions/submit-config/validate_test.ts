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
  assertEquals(validate({ ...good, skipperkitContribution: 3 }).ok, false);
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

Deno.test("v2: custom buttons parsed; alone they make a payload valid", () => {
  const r = validate({
    ...good,
    skipperkitContribution: 2,
    buttons: [],
    customButtons: [{ name: "Dismiss rating", viewId: "com.hulu.plus:id/dismiss", label: null }],
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.buttons.length, 0);
    assertEquals(r.value.customButtons.length, 1);
    assertEquals(r.value.customButtons[0].name, "Dismiss rating");
  }
});

Deno.test("v1 payloads have no custom buttons and stay valid", () => {
  const r = validate(good);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.customButtons.length, 0);
});

Deno.test("risky custom buttons are dropped; nameless or matchless ones too", () => {
  const r = validate({
    ...good,
    skipperkitContribution: 2,
    customButtons: [
      { name: "Confirm purchase", viewId: "com.hulu.plus:id/buy_now", label: null },
      { name: "Send", viewId: null, label: "Send message" },
      { name: "No matcher", viewId: null, label: null },
      { viewId: "com.hulu.plus:id/x", label: null },
      { name: "Dismiss", viewId: "com.hulu.plus:id/dismiss", label: null },
    ],
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.customButtons.length, 1);
    assertEquals(r.value.customButtons[0].name, "Dismiss");
  }
});

Deno.test("risky words in the view-id tail are caught", () => {
  const r = validate({
    ...good,
    skipperkitContribution: 2,
    buttons: [],
    customButtons: [{ name: "OK", viewId: "com.hulu.plus:id/confirm_order_button", label: null }],
  });
  assertEquals(r.ok, false); // nothing survives
});

Deno.test("consent-shaped custom buttons are rejected too", () => {
  const r = validate({
    ...good,
    skipperkitContribution: 2,
    buttons: [],
    customButtons: [
      { name: "Agree and continue", viewId: "com.hulu.plus:id/x", label: null },
      { name: "OK", viewId: "com.hulu.plus:id/accept_terms", label: null },
    ],
  });
  assertEquals(r.ok, false);
});

Deno.test("embedded control characters are collapsed to spaces", () => {
  const r = validate({
    ...good,
    buttons: [{ target: "SKIP_INTRO", viewId: null, label: "Skip\nIntro\trow" }],
  });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.buttons[0].label, "Skip Intro row");
});

Deno.test("custom buttons capped at 20, names at 50", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    name: `b${i}`, viewId: `com.hulu.plus:id/b${i}`, label: null,
  }));
  const r = validate({ ...good, skipperkitContribution: 2, customButtons: many });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.customButtons.length, 20);

  const long = validate({
    ...good, skipperkitContribution: 2,
    customButtons: [{ name: "x".repeat(200), viewId: "com.hulu.plus:id/y", label: null }],
  });
  if (long.ok) assertEquals(long.value.customButtons[0].name.length, 50);
});

Deno.test("metadata is optional and capped", () => {
  const r = validate({ ...good, appVersionName: undefined, locale: "x".repeat(999) });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.appVersionName, null);
    assertEquals(r.value.locale!.length, 64);
  }
});
