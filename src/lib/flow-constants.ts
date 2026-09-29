// Kept out of the live-state service so the client bundle of the flow diagram does not pull the server-side mapper.
// Below this a flow is noise (inverter idle draw, meter jitter): it shows as "0,0 kW" with no direction word.
export const MIN_FLOW_W = 50;
