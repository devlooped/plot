import {describe, expect, it, vi} from "vitest";
import {describe as describeError, RemoteData, remotePolicy} from "../src/remote.js";

const REMOTE = '{"data": {"a": {"url": "https://data.example/a.csv"}}, "marks": [{"mark": "dot", "data": "a", "x": "x", "y": "y"}]}';
const INLINE = '{"marks": [{"mark": "dot", "data": [{"x": 1}], "x": "x"}]}';

function settled() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return {promise, resolve};
}

describe("remotePolicy", () => {
  it("allows nothing in a workspace that is not trusted", () => {
    expect(remotePolicy(true, false)).toBe(false);
    expect(remotePolicy(["https://a.example"], false)).toBe(false);
  });
  it("reads true, a list of origins, or anything else as false", () => {
    expect(remotePolicy(true, true)).toBe(true);
    expect(remotePolicy([" https://a.example ", "ftp://x", 3], true)).toEqual(["https://a.example"]);
    expect(remotePolicy([], true)).toBe(false);
    expect(remotePolicy("yes", true)).toBe(false);
    expect(remotePolicy(undefined, true)).toBe(false);
  });
});

describe("RemoteData", () => {
  it("leaves blocks alone when remote data is off or the block has no data URL", () => {
    const fetch = vi.fn();
    const remote = new RemoteData({onSettled: () => {}, fetch});
    expect(remote.get(REMOTE, false)).toBeUndefined();
    expect(remote.get(INLINE, true)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads the data, then gives the block with the data inlined", async () => {
    const done = settled();
    const fetch = vi.fn(async () => new Response("x,y\n1,2\n", {status: 200}));
    const remote = new RemoteData({onSettled: done.resolve, fetch});
    expect(remote.get(REMOTE, true)).toEqual({state: "pending"});
    expect(remote.get(REMOTE, true)).toEqual({state: "pending"});
    await done.promise;
    const result = remote.get(REMOTE, true);
    expect(result?.state).toBe("ready");
    expect(JSON.parse((result as {text: string}).text).data.a).toEqual({csv: "x,y\n1,2\n"});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("loads a file once for blocks that differ only elsewhere", async () => {
    const fetch = vi.fn(async () => new Response("x,y\n1,2\n", {status: 200}));
    let count = 0;
    const done = settled();
    const remote = new RemoteData({onSettled: () => ++count === 2 && done.resolve(), fetch});
    remote.get(REMOTE, true);
    remote.get(REMOTE.replace('"dot"', '"line"'), true);
    await done.promise;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("says what failed, with the JSON path", async () => {
    const done = settled();
    const remote = new RemoteData({onSettled: done.resolve, fetch: async () => new Response("", {status: 404})});
    remote.get(REMOTE, true);
    await done.promise;
    expect(remote.get(REMOTE, true)).toEqual({state: "error", message: 'could not load "https://data.example/a.csv": HTTP 404 at $.data.a.url'});
  });

  it("refuses an origin that is not in the list", async () => {
    const done = settled();
    const fetch = vi.fn();
    const remote = new RemoteData({onSettled: done.resolve, fetch});
    remote.get(REMOTE, ["https://other.example"]);
    await done.promise;
    const result = remote.get(REMOTE, ["https://other.example"]);
    expect(result?.state).toBe("error");
    expect((result as {message: string}).message).toMatch(/not from an allowed origin.* at \$\.data\.a\.url$/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forgets everything on clear, and drops loads that were under way", async () => {
    let finish!: (response: Response) => void;
    const onSettled = vi.fn();
    const remote = new RemoteData({onSettled, fetch: () => new Promise<Response>((r) => (finish = r))});
    remote.get(REMOTE, true);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    remote.clear();
    finish(new Response("x,y\n1,2\n"));
    await new Promise((r) => setTimeout(r, 10));
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("describes plain errors too", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("boom")).toBe("boom");
  });
});
