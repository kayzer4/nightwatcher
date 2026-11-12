export const debugVisibility = {
  connectors: typeof window !== "undefined" && localStorage.getItem("nw_showConnectors") === "true",
  attractors: typeof window !== "undefined" && localStorage.getItem("nw_showAttractors") !== "false",
  vectors: typeof window !== "undefined" && localStorage.getItem("nw_showVectors") === "true",
  lightLevels: typeof window !== "undefined" ? localStorage.getItem("nw_showLightLevels") !== "false" : true,
  lightRays: typeof window !== "undefined" && localStorage.getItem("nw_showLightRays") === "true",
};
