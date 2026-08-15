import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Registers /.well-known/openid-configuration, /.well-known/jwks.json and the
// auth sign-in / callback routes on the Convex HTTP endpoint.
auth.addHttpRoutes(http);

export default http;
