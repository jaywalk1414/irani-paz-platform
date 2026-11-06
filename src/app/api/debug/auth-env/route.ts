console.log("[AUTH CONFIG]", {
  hasSecret: Boolean(process.env.AUTH_SECRET),
  trustHost: true,
  nodeEnv: process.env.NODE_ENV,
});
