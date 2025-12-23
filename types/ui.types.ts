
/**
 * Domain: UI and Interactive State.
 * Settings for manual tool placement tools and interactive modes.
 */

export interface NibbleSettings {
  extensionStart: number; // e1
  extensionEnd: number;   // e2
  minOverlap: number;     // v
  hitPointMode: 'offset' | 'centerLine';
  toolPosition: 'long' | 'short';
  // If set, overrides standard extension logic for micro-joints (negative extension)
  isMicroJointStart?: boolean; 
  isMicroJointEnd?: boolean;
}

export interface DestructSettings {
    overlap: number;
    scallop: number;
    notchExpansion: number;
}
