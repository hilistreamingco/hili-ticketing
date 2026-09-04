import serverless from "serverless-http";
import { createServer } from "../server";

export default serverless(createServer());
