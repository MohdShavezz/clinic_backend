import "dotenv/config";
import app from "./app.js";

export default app;

// Vercel invokes the exported Express app as a serverless function. For local
// development, keep the conventional long-running HTTP server.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => {
    console.log(`Server is running at port ${port}`);
  });
}
