/**
 * Host half of the Scratchpad bundle.
 *
 * Everything the user sees lives in the browser module (`./client.js`): the
 * left-sidebar entry is registered into `sidebar.panellist` and the panel into
 * the keyed `main` slot, both under the same id. This row exists so the bundle
 * has a Host entry, which is what makes the client module scanner pick up the
 * package's `dsh.client` declaration; it owns no Host-side service.
 */
export function apply() {}
