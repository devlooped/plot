// The plotdown.cc image service (packages/service) as one Vercel function.
// vercel.json rewrites /svg, /svg/pako:…, /png, /png/pako:… and /api/health to
// it, and the function routes on the original URL. The workspace package must
// be built first (the build command of vercel.json does it).
export {default} from "@devlooped/plotdown-service/vercel";
