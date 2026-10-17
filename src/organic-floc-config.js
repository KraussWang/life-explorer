// Metres in the existing 240 m ocean. The first three are placed along a short
// exploratory path; the rest use rejection sampling throughout this region.
export const ORGANIC_FLOC_CONFIG={
 count:15,
 baseScale:.55,
 scaleVariation:.15,
 minSpacing:9,
 requiredAbsorptions:3,
 rangeX:[-70,70],
 rangeZ:[-75,65],
 floorClearance:[2.5,7],
 nearOffsets:[[0,-7],[7,-18],[-5,-29]],
};
