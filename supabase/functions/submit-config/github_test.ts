// github_test.ts — pure pieces only (isPublished, mergeIntoConfig, prBody).
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { isPublished, mergeIntoConfig, prBody, type PendingRow } from "./github.ts";

const config = {
  apps: [{
    packageName: "com.hulu.plus",
    skipIntroViewIds: ["com.hulu.plus:id/skip"], skipIntroLabels: [],
    skipRecapViewIds: [], skipRecapLabels: [],
    customButtons: [{ key: "com.hulu.plus:id/dismiss", name: "Dismiss", viewIds: ["com.hulu.plus:id/dismiss"], labels: [], enabled: true }],
  }],
};

const customRow: PendingRow = {
  package: "com.hulu.plus", target: "CUSTOM", view_id: "com.hulu.plus:id/rate_later",
  label: null, name: "Rate later", report_count: 3, app_versions: ["5.1.0"], locales: ["en"],
};

Deno.test("isPublished sees existing custom buttons by view-id and label", () => {
  assertEquals(isPublished(config, "com.hulu.plus", { target: "CUSTOM", viewId: "com.hulu.plus:id/dismiss", label: null }), true);
  assertEquals(isPublished(config, "com.hulu.plus", { target: "CUSTOM", viewId: "com.hulu.plus:id/rate_later", label: null }), false);
  assertEquals(isPublished(config, "com.hulu.plus", { target: "SKIP_INTRO", viewId: "com.hulu.plus:id/skip", label: null }), true);
});

Deno.test("mergeIntoConfig appends new custom buttons and skips known ones", () => {
  const merged = mergeIntoConfig(config, "com.hulu.plus", [
    customRow,
    { ...customRow, view_id: "com.hulu.plus:id/dismiss", name: "Dismiss" }, // already published
  ]);
  const app = merged.apps[0];
  assertEquals(app.customButtons.length, 2);
  assertEquals(app.customButtons[1], {
    key: "com.hulu.plus:id/rate_later", name: "Rate later",
    viewIds: ["com.hulu.plus:id/rate_later"], labels: [], enabled: false,
  });
});

Deno.test("mergeIntoConfig creates customButtons array and uses label keys", () => {
  const bare = { apps: [{ packageName: "com.x.y", skipIntroViewIds: [], skipIntroLabels: [], skipRecapViewIds: [], skipRecapLabels: [] }] };
  const merged = mergeIntoConfig(bare, "com.x.y", [
    { package: "com.x.y", target: "CUSTOM", view_id: null, label: "Rate Later", name: "Rate later", report_count: 1, app_versions: [], locales: [] },
  ]);
  assertEquals(merged.apps[0].customButtons, [{
    key: "label:rate later", name: "Rate later", viewIds: [], labels: ["Rate Later"], enabled: false,
  }]);
});

Deno.test("prBody includes the custom button's name", () => {
  assertStringIncludes(prBody("com.hulu.plus", [customRow]), "Rate later");
});

Deno.test("prBody neutralizes markdown and newlines in submitted strings", () => {
  const body = prBody("com.hulu.plus", [{
    ...customRow, name: "**bold**\nrow | smuggle",
  }]);
  assertStringIncludes(body, "\\*\\*bold\\*\\* row \\| smuggle");
});
