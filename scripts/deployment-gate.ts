import { assertDeploymentAllowed } from "@/lib/deployment/gate";

assertDeploymentAllowed(process.env);
