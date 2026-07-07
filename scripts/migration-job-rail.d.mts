// FILE: migration-job-rail.d.mts
// PURPOSE: Type surface for the plain-JS migration-job-rail script so the
//          unit tier can import its pure helpers under the zero-error
//          TypeScript baseline. Keep in lock-step with the .mjs exports.
export declare const DEFAULT_SERVICE_ID: string;
export declare function jobCommandFor(scriptSource: string): string;
export declare function canaryCommand(): string;
export declare function canaryProvesRail(status: string): boolean;
export declare function isTerminal(status: string): boolean;
