export interface DemoContactSeed {
  id: string;
  name: string;
}

/** Shared between the background mock transport and the content script's demo seed, so ids line up. */
export const DEMO_CONTACTS: DemoContactSeed[] = [
  { id: "alex", name: "Alex" },
  { id: "riya", name: "Riya" },
  { id: "sam", name: "Sam" },
];
