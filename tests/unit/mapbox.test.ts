import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMatrix, getRoute, MapboxError } from "@/lib/mapbox";

// We mock global fetch. Each test sets up its own response.
const realFetch = global.fetch;

beforeEach(() => {
  process.env.MAPBOX_SECRET_TOKEN = "sk.test-token";
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: () => Promise.resolve(response.body ?? {}),
    text: () => Promise.resolve(response.text ?? JSON.stringify(response.body ?? {})),
  } as Response);
  global.fetch = fetchSpy;
  return fetchSpy;
}

describe("getMatrix", () => {
  it("constructs the correct URL with source first, destinations following", async () => {
    const spy = mockFetch({
      body: { code: "Ok", durations: [[10, 20, 30]], distances: [[100, 200, 300]] },
    });
    await getMatrix(
      { lat: 43.0, lng: -70.0 },
      [
        { lat: 43.1, lng: -70.1 },
        { lat: 43.2, lng: -70.2 },
        { lat: 43.3, lng: -70.3 },
      ],
    );
    expect(spy).toHaveBeenCalledOnce();
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe(
      "/directions-matrix/v1/mapbox/driving/-70,43;-70.1,43.1;-70.2,43.2;-70.3,43.3",
    );
    expect(url.searchParams.get("sources")).toBe("0");
    expect(url.searchParams.get("destinations")).toBe("1;2;3");
    expect(url.searchParams.get("annotations")).toBe("duration,distance");
    expect(url.searchParams.get("access_token")).toBe("sk.test-token");
  });

  it("returns just the source-row of durations and distances", async () => {
    mockFetch({
      body: {
        code: "Ok",
        durations: [[10, 20, 30]],
        distances: [[100, 200, 300]],
      },
    });
    const result = await getMatrix(
      { lat: 43, lng: -70 },
      [
        { lat: 44, lng: -70 },
        { lat: 45, lng: -70 },
        { lat: 46, lng: -70 },
      ],
    );
    expect(result.durations).toEqual([10, 20, 30]);
    expect(result.distances).toEqual([100, 200, 300]);
  });

  it("short-circuits with empty result when no destinations are passed", async () => {
    const spy = mockFetch({ body: { code: "Ok", durations: [], distances: [] } });
    const result = await getMatrix({ lat: 43, lng: -70 }, []);
    expect(result).toEqual({ durations: [], distances: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws MapboxError with upstream status on non-ok response", async () => {
    mockFetch({ ok: false, status: 429, text: "Too many requests" });
    await expect(
      getMatrix({ lat: 43, lng: -70 }, [{ lat: 44, lng: -70 }]),
    ).rejects.toMatchObject({
      name: "MapboxError",
      upstreamStatus: 429,
    });
  });

  it("throws MapboxError on unexpected code in response body", async () => {
    mockFetch({ body: { code: "NoSegment", message: "no road found" } });
    await expect(
      getMatrix({ lat: 43, lng: -70 }, [{ lat: 44, lng: -70 }]),
    ).rejects.toMatchObject({
      name: "MapboxError",
      upstreamStatus: 502,
    });
  });

  it("throws MapboxError when MAPBOX_SECRET_TOKEN is missing", async () => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    await expect(
      getMatrix({ lat: 43, lng: -70 }, [{ lat: 44, lng: -70 }]),
    ).rejects.toBeInstanceOf(MapboxError);
  });
});

describe("getRoute", () => {
  it("constructs the correct Directions v5 URL", async () => {
    const spy = mockFetch({
      body: {
        code: "Ok",
        routes: [
          {
            geometry: { type: "LineString", coordinates: [[-70, 43], [-70.1, 43.1]] },
            distance: 12345,
            duration: 678,
          },
        ],
      },
    });
    await getRoute({ lat: 43, lng: -70 }, { lat: 43.1, lng: -70.1 });
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/directions/v5/mapbox/driving/-70,43;-70.1,43.1");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("overview")).toBe("full");
    expect(url.searchParams.get("access_token")).toBe("sk.test-token");
  });

  it("returns geometry + distance + duration from the first route", async () => {
    mockFetch({
      body: {
        code: "Ok",
        routes: [
          {
            geometry: { type: "LineString", coordinates: [[-70, 43], [-70.5, 43.5]] },
            distance: 50_000,
            duration: 3600,
          },
        ],
      },
    });
    const result = await getRoute({ lat: 43, lng: -70 }, { lat: 43.5, lng: -70.5 });
    expect(result.geometry.type).toBe("LineString");
    expect(result.geometry.coordinates).toHaveLength(2);
    expect(result.distanceM).toBe(50_000);
    expect(result.durationS).toBe(3600);
  });

  it("throws MapboxError when no routes are returned", async () => {
    mockFetch({ body: { code: "NoRoute", routes: [] } });
    await expect(
      getRoute({ lat: 43, lng: -70 }, { lat: 44, lng: -70 }),
    ).rejects.toMatchObject({ name: "MapboxError" });
  });

  it("throws MapboxError on non-ok HTTP response", async () => {
    mockFetch({ ok: false, status: 500, text: "internal" });
    await expect(
      getRoute({ lat: 43, lng: -70 }, { lat: 44, lng: -70 }),
    ).rejects.toMatchObject({
      name: "MapboxError",
      upstreamStatus: 500,
    });
  });
});
