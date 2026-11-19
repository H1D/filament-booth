// SPDX-License-Identifier: Apache-2.0
// The result of `config.definitions` (format 1): OrcaSlicer's option table (print_config_def, SLA options
// left out) and the key sets libslic3r defines, read from the very engine build that slices. Values are
// Orca's text encoding, as in presets: a scalar's default is serialize(), a vector's the array of
// vserialize(). Everything is sorted (options by key, every key list alphabetically), so the same engine
// always gives the same document. Option keys are data, not protocol: an Orca upgrade may add or remove
// options without a protocol change.
/** ConfigDefinitions.format of the shape below. */
export const CONFIG_DEFINITIONS_FORMAT = 1;
