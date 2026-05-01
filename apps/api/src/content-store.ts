// FILE: content-store.ts
// PURPOSE: Abstraction for fetching the encrypted payload of a
//          Memory Capsule. Section 3B (READ) needs to pull content
//          for FULL / SUMMARY responses; the Supabase Storage
//          adapter that does that for real lands in a later section.
//          Until then, MemoryContentStore lets tests round-trip
//          end-to-end without external dependencies.
// CONNECTS TO: ReadService.readContent, the buildApp factory in
//              server.ts, and any future SupabaseContentStore.

// WHAT: The contract every content-store implementation honors.
// INPUT: Used as a parameter type for ReadService and WriteService.
// OUTPUT: None -- this is a type, not a value.
// WHY: Keeping the abstraction narrow means we can swap Supabase
//      Storage in later without touching either service.
export interface ContentStore {
  read(storageLocation: string): Promise<string | null>;
  write(storageLocation: string, content: string): Promise<void>;
}

// WHAT: An in-memory ContentStore tests can preload with synthetic
//        capsule contents.
// INPUT: None at construction.
// OUTPUT: A ContentStore-shaped object plus a setForTest helper.
// WHY: 3B exercises the full READ pipeline (declaration check,
//      scope filter, audit, post-response increment). Real Supabase
//      Storage for real bytes lands later. This stand-in keeps the
//      pipeline testable today.
export class MemoryContentStore implements ContentStore {
  private readonly map = new Map<string, string>();

  async read(storageLocation: string): Promise<string | null> {
    return this.map.get(storageLocation) ?? null;
  }

  async write(storageLocation: string, content: string): Promise<void> {
    this.map.set(storageLocation, content);
  }

  // WHAT: Plant content at a storage_location for a test to read back.
  // INPUT: The location string and the synthetic content body.
  // OUTPUT: None.
  // WHY: Tests need to seed the store before driving readContent.
  //      Keeping this distinct from write() means tests cannot
  //      accidentally rely on it from production code paths.
  setForTest(storageLocation: string, content: string): void {
    this.map.set(storageLocation, content);
  }
}
