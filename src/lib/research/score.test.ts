import { describe, expect, it } from "vitest";
import { DRAFT_MAX_BYTES, DRAFT_TYPES, FOREIGN_UPLOAD_MESSAGE, isDraftPathFor } from "./score";

const AGENCY = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER = "1b4e28ba-2fa1-11d2-883f-b9a761bde3fb";
const FILE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("which uploads a workspace may score", () => {
  it("accepts only an upload this dashboard made for this workspace", () => {
    expect(isDraftPathFor(AGENCY, `${AGENCY}/${FILE}.mp4`)).toBe(true);
    expect(isDraftPathFor(AGENCY, `${AGENCY}/${FILE}.mov`)).toBe(true);
    expect(isDraftPathFor(AGENCY, `${AGENCY}/${FILE}.webm`)).toBe(true);
  });

  it("refuses another workspace's upload, and anything hand written", () => {
    expect(isDraftPathFor(AGENCY, `${OTHER}/${FILE}.mp4`)).toBe(false);
    expect(isDraftPathFor(AGENCY, `${AGENCY}/../${OTHER}/${FILE}.mp4`)).toBe(false);
    expect(isDraftPathFor(AGENCY, `${AGENCY}/${FILE}.exe`)).toBe(false);
    expect(isDraftPathFor(AGENCY, `${AGENCY}/anything.mp4`)).toBe(false);
    expect(isDraftPathFor(AGENCY, null)).toBe(false);
    expect(isDraftPathFor("not-an-agency", `${AGENCY}/${FILE}.mp4`)).toBe(false);
  });

  it("says so in words a student can act on", () => {
    expect(FOREIGN_UPLOAD_MESSAGE).toContain("Upload the video again");
  });
});

describe("what an upload may be", () => {
  it("takes the three kinds of video a phone actually produces, up to 25MB", () => {
    expect(Object.keys(DRAFT_TYPES)).toEqual(["video/mp4", "video/quicktime", "video/webm"]);
    expect(DRAFT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});
