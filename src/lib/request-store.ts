import { AsyncLocalStorage } from "async_hooks";

export const requestStore = new AsyncLocalStorage<{ token?: string; activeProfile?: string }>();
