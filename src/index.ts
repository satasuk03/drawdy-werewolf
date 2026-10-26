import type { DriverModule } from "@drawdy/driver-protocol";
import { createDriver } from "./driver";

const driver = createDriver();

export const activate: DriverModule["activate"] = (ctx) => driver.activate(ctx);
export const onEvent: DriverModule["onEvent"] = (event) => driver.onEvent(event);
