import { describe, it, expect } from "vitest";
import { extractAttachmentIdsFromHtml } from "./attachment-utils";

describe("extractAttachmentIdsFromHtml", () => {
  it("returns empty array for blank html", () => {
    expect(extractAttachmentIdsFromHtml("")).toEqual([]);
  });

  it("extracts attachment ids from file nodes", () => {
    const html =
      '<div data-type="file-node" data-attachment-id="att-1"></div>' +
      '<div data-type="file-node" data-attachment-id="att-2"></div>';
    expect(extractAttachmentIdsFromHtml(html)).toEqual(["att-1", "att-2"]);
  });

  it("deduplicates repeated ids", () => {
    const html =
      '<div data-type="file-node" data-attachment-id="att-1"></div>' +
      '<div data-type="file-node" data-attachment-id="att-1"></div>';
    expect(extractAttachmentIdsFromHtml(html)).toEqual(["att-1"]);
  });
});
