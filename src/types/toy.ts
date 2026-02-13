/**
 * Parsed toy shape: mirrors ElementSchema in toySchema.ts.
 * Use for typing when defining, manipulating, and inserting data into the database.
 * All fields optional; parser omits missing elements.
 */

export interface ToyComment {
  text?: string;
  author?: string;
  date?: string;
}

export interface ToyManufacturer {
  name?: string;
  country?: string;
}

export interface ToyStore {
  name?: string;
  location?: string;
}

export interface ToyComments {
  comment?: ToyComment[];
}

export interface Toy {
  uuid?: string;
  name?: string;
  color?: string;
  manufacturer?: ToyManufacturer;
  store?: ToyStore[];
  comments?: ToyComments;
  /** Document-level header (merged by server when present in XML). */
  date?: string;
  /** Document-level header (merged by server when present in XML). */
  author?: string;
}
