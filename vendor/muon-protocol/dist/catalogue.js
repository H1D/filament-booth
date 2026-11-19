// SPDX-License-Identifier: Apache-2.0
// The result of `settings.catalogue` (format 2): every option of the engine's OrcaSlicer (labels, tooltips,
// units, limits, enum values and labels, defaults, modes), laid out in the pages, groups and rows of Orca's
// settings tabs. Values use Orca's text encoding throughout: what a preset JSON holds (a string, or an
// array of strings for a vector option). It describes Orca only; what one app lets its users edit is that
// app's own policy, applied on top.
//
// Format 2 is format 1 without the fields that were one app's policy (readOnly, note) or compared against
// one app's older CLI (server, engineOnly, engineOnlyValues).
export {};
