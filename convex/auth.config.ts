// CONVEX_SITE_URL is injected automatically into every Convex deployment.
// It is the issuer/audience domain for the auth JWTs.
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
