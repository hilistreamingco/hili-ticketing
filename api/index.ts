import serverless from "serverless-http";
import { createServer } from "../server/index.js";

export default serverless(createServer());
