// serves static media from R2 (videos now, future images later).
// streams the body directly and supports HTTP range requests so html5
// video can seek mid-playback without re-downloading the whole file.

import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// GET /demo/:filename — fetch a demo video from R2.
// Path matches what the frontend's <video src="/demo/..."> tags already use,
// so no React changes needed.
app.get("/demo/:filename", async (context) => {
    const filename = context.req.param("filename");
    const objectKey = `demo/${ filename }`;

    // parse range header. browsers send "bytes=0-" on first load,
    // then "bytes=N-" or "bytes=N-M" when seeking.
    // we track offset+length as plain numbers because R2Range is a
    // discriminated union that TS won't narrow cleanly downstream.
    const range = context.req.header("range");
    let rangeOffset: number | undefined;
    let rangeLength: number | undefined;
    if (range) {
        const match = range.match(/^bytes=(\d+)-(\d+)?$/);
        if (match) {
            rangeOffset = Number.parseInt(match[1]!, 10);
            const endStr = match[2];
            if (endStr) {
                const end = Number.parseInt(endStr, 10);
                rangeLength = end - rangeOffset + 1;
            }
        }
    }

    const r2Options =
        rangeOffset !== undefined
            ? { range: { offset: rangeOffset, length: rangeLength } }
            : undefined;
    const object = r2Options
        ? await context.env.MEDIA.get(objectKey, r2Options)
        : await context.env.MEDIA.get(objectKey);

    if (!object) {
        return context.json(
            { code: "NOT_FOUND", message: `Asset not found: ${ objectKey }` },
            404,
        );
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("accept-ranges", "bytes");

    if (rangeOffset !== undefined) {
        // partial content (206) for range requests
        const totalSize = object.size;
        const end = rangeLength ? rangeOffset + rangeLength - 1 : totalSize - 1;
        headers.set("content-range", `bytes ${ rangeOffset }-${ end }/${ totalSize }`);
        return new Response(object.body, { status: 206, headers });
    }

    return new Response(object.body, { headers });
});

export { app as assetsRoutes };
