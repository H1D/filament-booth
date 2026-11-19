/*! @license AGPL-3.0-only
 * Muon3D Slicer Engine (based on OrcaSlicer): engine host.
 * Copyright (C) the OrcaSlicer authors; modifications Copyright (C) 2026 Muon 3D Technologies Limited.
 * Free software under the GNU Affero General Public License, version 3: see LICENSE and NOTICE next to
 * this file.
 * @source https://github.com/Muon-3D/muon3d-slicer-engine (commit 41c754ef12b18d4d24893898ef03d6b5b44a2919)
 */
import "./host-chunk.bd6a59f31a9394b2.js";

// data/settings-catalogue.json
var settings_catalogue_default = {
  format: 2,
  orca: {
    version: "2.5.0-dev",
    commit: "2d1163eb6f5228de605150e3b4800081947070eb"
  },
  sources: {
    "src/slic3r/GUI/Tab.cpp#TabPrint::build": "sha256:c660f774f5f53061c3b3550151007dd30e6b751e5112e2f697ca26e9b5105c93",
    "src/slic3r/GUI/Tab.cpp#TabFilament::build": "sha256:8ceb7e1deac2360715270419e37b776b53afb14bcbba55ad812e0c8d85e720d5",
    "src/slic3r/GUI/Tab.cpp#TabFilament::add_filament_overrides_page": "sha256:b6ddb90aff30cbb1901ea72f445458bd92af41ffcbcfc259fb93619aa57becd8",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::build_fff": "sha256:502298d83ce86d03eb8c53b51c086547fca48a0ea5b1f1eff82569cfc0d23b2c",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::build_unregular_pages": "sha256:8bfe9638a4ed14b071e7cda3c57a9c8df1c182555edad0f6ea07b419f420acd4",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::build_kinematics_page": "sha256:0767da0dc666af2795f7f5ec48d0698f47a4e0ea6a89f82aac010b9b1fe7fcf8",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::append_option_line": "sha256:f01fb6f85637aebf7a3e85853269effa5f97b8d542a0e9d439e17594126f45d1",
    "src/slic3r/GUI/Tab.cpp#TabPrintPlate::build": "sha256:acb51550cd62883f0dc733b10e3de76e094227359234b44d1989c796b47f2510",
    "src/libslic3r/PublishSettings.cpp#publishable_printer_retraction_options": "sha256:bc915ddf5db832007bf2abf9961762ac7377cb589ec275a15378377b5efb920e",
    "src/libslic3r/PublishSettings.cpp#publishable_printer_z_hop_options": "sha256:a5963347a9c28b2da93dbe43d543686eef71d57c13fe4596eae902fc1335624d"
  },
  ruleSources: {
    "src/libslic3r/GCode/AdaptivePAProcessor.cpp#AdaptivePAProcessor::validate_adaptive_pa_model": "sha256:d9a3ced64a3fbfd1adabb45724578141d20bd3f61c6fd6cc31069ea842490032",
    "src/libslic3r/MaterialType.cpp#MaterialType::all": "sha256:0f01ed46ed4ca60cd3a0763fbf8da5f26ab4c334a74dad0d3011ecff5e308497",
    "src/libslic3r/MaterialType.cpp#MaterialType::find": "sha256:c647806d98973d3d6ba60dffbd0959793a53e98e629fa6eff584c41e6931df84",
    "src/libslic3r/MaterialType.cpp#MaterialType::get_chamber_temperature_range": "sha256:a59464a3cd982edde2f67c80367efbb473a3abee892bf42d98712238007aaaae",
    "src/libslic3r/MaterialType.cpp#MaterialType::get_temperature_range": "sha256:e869ee5b9845cf2de397612871f353a64a5e51a9c26cb921ff1dcabec5c8ac6b",
    "src/libslic3r/Preset.hpp#Preset::convert_filament_diameter_to_pellet_flow": "sha256:c7afd982d498e70feb13cc855e08be1a2cca468c7faf05a1e2ba0e2796b599af",
    "src/libslic3r/Preset.hpp#Preset::convert_pellet_flow_to_filament_diameter": "sha256:836fea2b5931e974100e452e3a1b1833bd6b5c947362808070f6d38cdd705578",
    "src/libslic3r/PrintConfig.cpp#active_bed_exclude_volume_mode": "sha256:c59ef9312cd446da7249566ca917f4316ce15b3080cd9dea6924a8197dea11d0",
    "src/libslic3r/PrintConfig.cpp#collision_volumes_configured": "sha256:bab05049773a9950f9aebf03a98b8e1c619c85553b77358f083178674eb109ed",
    "src/libslic3r/PrintConfig.cpp#has_bed_exclude_volumes": "sha256:a6841b69c22e23f9ad31277afecf7a157be5dc74954a96af6a6fb84d4acfc0e0",
    "src/libslic3r/PrintConfig.cpp#has_nonempty_string": "sha256:e0d7327e8e7e9807657503dda07848917f83225630a6bdec567de0d1201c5254",
    "src/libslic3r/PrintConfig.hpp#get_bed_temp_1st_layer_key": "sha256:4b67f21db588b5a505f62a37806ee184c92c42edad3d1ec515e16a4e42a1efa8",
    "src/libslic3r/PrintConfig.hpp#is_auto": "sha256:91b9e7089709453b5a0efe5f2137f39ab46cf39c8f1c25ca108580e7dd8e7df0",
    "src/libslic3r/PrintConfig.hpp#is_separable_infill_pattern": "sha256:dcbcc5fc3ff1d7ba9a32e6cf1b444d80174c45be069c593fadc12a7c812b1530",
    "src/libslic3r/PrintConfig.hpp#is_smoothable_infill_pattern": "sha256:92f04a4f924e6c5306d4451bc0ed5486b6857da9f96eab39ae2725cfdecd312b",
    "src/libslic3r/PrintConfig.hpp#is_tree": "sha256:57e3ce1d187820646a2cf34cf7d4cde820b5cb3f953f75c6c9e5042ebdb4473a",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_adaptive_pressure_advance_model": "sha256:782266aadf67f61077b0108c73045820ea8112f8225dfda6573f314f510e6ecd",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_chamber_minimal_temperature": "sha256:ab26381640f7cf11202768b99ba9f431325f51e450efba61ba61aa46abca6f3f",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_chamber_temperature": "sha256:3ebb0a86d35c06b772053e4ab1f47aaea046392fe2f837255ae5b4eaa0127f36",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_filament_max_volumetric_speed": "sha256:1ca37b34d4db98d473089279ed6f3f41020b5ae0ddaf6aad5c80adc36b3acbad",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_layer_height": "sha256:4af10da1f309d29265049f8640e525adec2eadfeae3fc1791e4ca15a8b3c836e",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_nozzle_recommended_temperature_range": "sha256:804ef60e285458b75b1612fd09fed60f3202371d43656af1adc6419ba65a062a",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_nozzle_temperature_initial_layer_range": "sha256:66c94789e39d2e09f0729ee424802cdadc87dc23b35be45c77b35c40db38de7b",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::check_nozzle_temperature_range": "sha256:782cccbbf070f2d9912d5128bc425b7a91f9f94d5fc053b059a8f40d8ae45c9c",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::get_temperature_range": "sha256:4e5b3f97397b80e4742a699e1287808571eb38cfa55390c4777783658a6da8ae",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::layer_height_limits": "sha256:b5293a00fcbf89ed0d06ddda7a915b8d8d284c50dafb67b2c61f6ca40d03b2f7",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::layer_height_out_of_range_dialog": "sha256:f936a05840d71c64c2e7dc843e3e5666da8df850cc64b2cc458f6bcc34a98e9e",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::show_spiral_mode_settings_dialog": "sha256:8b8d6bf384868744d718410bfdb3171d6fe4ff8f6b6c6306d63f44f385dad55e",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::toggle_print_fff_options": "sha256:b68694e7165e0f5abc79ae01323821aed2266815a006931d656f0aaf53b5542e",
    "src/slic3r/GUI/ConfigManipulation.cpp#ConfigManipulation::update_print_fff_config": "sha256:9b420c795f73115b8e4e1dffe7c46ec2edc3d90e92ea0f99b64a40e09fd1f569",
    "src/slic3r/GUI/GUI_App.cpp#has_filaments": "sha256:9ffb90808f07d7bb32e5148f22b9703c7d7a25c5b8cf30be32a684690691829c",
    "src/slic3r/GUI/GUI_App.cpp#is_soluble_filament": "sha256:21e7f74d634f54dacc495badec2ad02a79404be10adc8750e4b052a8f65b5d71",
    "src/slic3r/GUI/GUI_App.cpp#is_support_filament": "sha256:c6975ef8b07b92c6e97248428dd76039ae33c34e864b8f82012fd0f1a0babbee",
    "src/slic3r/GUI/Tab.cpp#Tab::on_value_change": "sha256:4ac26dcd2c4eeb6a70e914b727fc851e1e4018e4f172c9034257a4cb2124e3ce",
    "src/slic3r/GUI/Tab.cpp#TabFilament::on_value_change": "sha256:b5b1396e27215d6e12c013898be9d499c3b30f215c35b80a13100d63dcc43ac1",
    "src/slic3r/GUI/Tab.cpp#TabFilament::toggle_options": "sha256:9357ebf2cbee456af90374097a9b338d57c0e1006af255453b381cd7925e9fd1",
    "src/slic3r/GUI/Tab.cpp#TabFilament::update": "sha256:8ff495f208b40807b4e2c243d6b7b28f559f9042fe5d649098ac74b3f907bfda",
    "src/slic3r/GUI/Tab.cpp#TabFilament::update_filament_overrides_page": "sha256:278069403669cde0b66c5f1d2a02fdfa03aeb89b111a35ebe43b932d3b555cf0",
    "src/slic3r/GUI/Tab.cpp#TabPrint::toggle_options": "sha256:89758bbe51eda27d49b89033b3604344edb96ac544658b6258d7833c3884cfe6",
    "src/slic3r/GUI/Tab.cpp#TabPrint::update": "sha256:bfff2ff76fbd72eb3963a659ed3cdeecaebb81580461d6169b5aa073ab7e2fb4",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::build_unregular_pages": "sha256:8bfe9638a4ed14b071e7cda3c57a9c8df1c182555edad0f6ea07b419f420acd4",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::on_gcode_flavor_changed": "sha256:ca1a0462e1b12ae575f06a9a6ebd87f819f2923defc58e63b6c77f56baab6e06",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::on_value_change": "sha256:e13fc0a7ca4a29314da80def512f474f12c1a1d25afb335aa4a9ff34f0cf6154",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::toggle_options": "sha256:86cb982aeed1192c557bfdaf0c077ceaca45d2f9e8474bce084b0cad580e9ae1",
    "src/slic3r/GUI/Tab.cpp#TabPrinter::update_input_shaper_menu": "sha256:0a316480bd401c703387a0547ce16e07b01bc951acb9d7b579d38145efe1feae",
    "src/slic3r/GUI/Tab.cpp#input_shaper_types_for_flavor": "sha256:8fe6107644a4b03ac6d7a01f3c5e5b586c28c05f53c63620ef9dd546bf0e6743"
  },
  tabs: [
    {
      id: "process",
      title: "Process",
      pages: [
        {
          id: "quality",
          title: "Quality",
          groups: [
            {
              id: "quality.layer-height",
              title: "Layer height",
              lines: [
                { options: [{ key: "layer_height" }] },
                { options: [{ key: "initial_layer_print_height" }] },
                { options: [{ key: "enable_mixed_color_sublayer" }] }
              ]
            },
            {
              id: "quality.line-width",
              title: "Line width",
              lines: [
                { options: [{ key: "line_width" }] },
                { options: [{ key: "initial_layer_line_width" }] },
                { options: [{ key: "outer_wall_line_width" }] },
                { options: [{ key: "inner_wall_line_width" }] },
                { options: [{ key: "top_surface_line_width" }] },
                { options: [{ key: "sparse_infill_line_width" }] },
                { options: [{ key: "internal_solid_infill_line_width" }] },
                { options: [{ key: "support_line_width" }] },
                { options: [{ key: "bridge_line_width" }] }
              ]
            },
            {
              id: "quality.seam",
              title: "Seam",
              lines: [
                { options: [{ key: "seam_position" }] },
                { options: [{ key: "staggered_inner_seams" }] },
                { options: [{ key: "seam_gap" }] },
                { options: [{ key: "seam_slope_type" }] },
                { options: [{ key: "seam_slope_conditional" }] },
                { options: [{ key: "scarf_angle_threshold" }] },
                { options: [{ key: "scarf_overhang_threshold" }] },
                { options: [{ key: "scarf_joint_speed" }] },
                { options: [{ key: "seam_slope_start_height" }] },
                { options: [{ key: "seam_slope_entire_loop" }] },
                { options: [{ key: "seam_slope_min_length" }] },
                { options: [{ key: "seam_slope_steps" }] },
                { options: [{ key: "scarf_joint_flow_ratio" }] },
                { options: [{ key: "seam_slope_inner_walls" }] },
                { options: [{ key: "role_based_wipe_speed" }] },
                { options: [{ key: "wipe_speed" }] },
                { options: [{ key: "wipe_on_loops" }] },
                { options: [{ key: "wipe_inward" }] },
                { options: [{ key: "wipe_inward_distance" }] },
                { options: [{ key: "wipe_before_external_loop" }] }
              ]
            },
            {
              id: "quality.precision",
              title: "Precision",
              lines: [
                { options: [{ key: "slice_closing_radius" }] },
                { options: [{ key: "resolution" }] },
                { options: [{ key: "enable_arc_fitting" }] },
                { options: [{ key: "xy_hole_compensation" }] },
                { options: [{ key: "xy_contour_compensation" }] },
                { options: [{ key: "elefant_foot_compensation" }] },
                { options: [{ key: "elefant_foot_layers_density" }] },
                { options: [{ key: "elefant_foot_compensation_layers" }] },
                { options: [{ key: "precise_outer_wall" }] },
                { options: [{ key: "precise_z_height" }] },
                { options: [{ key: "hole_to_polyhole" }] },
                { options: [{ key: "hole_to_polyhole_threshold" }] },
                { options: [{ key: "hole_to_polyhole_twisted" }] },
                { options: [{ key: "hole_to_polyhole_max_edges" }] }
              ]
            },
            {
              id: "quality.ironing",
              title: "Ironing",
              lines: [
                { options: [{ key: "ironing_type" }] },
                { options: [{ key: "ironing_pattern" }] },
                { options: [{ key: "ironing_flow" }] },
                { options: [{ key: "ironing_spacing" }] },
                { options: [{ key: "ironing_inset" }] },
                { options: [{ key: "ironing_angle" }] },
                { options: [{ key: "ironing_angle_fixed" }] }
              ]
            },
            {
              id: "quality.z-contouring",
              title: "Z contouring",
              lines: [
                { options: [{ key: "zaa_enabled" }] },
                { options: [{ key: "zaa_minimize_perimeter_height" }] },
                { options: [{ key: "zaa_min_z" }] },
                { options: [{ key: "zaa_dont_alternate_fill_direction" }] }
              ]
            },
            {
              id: "quality.wall-generator",
              title: "Wall generator",
              lines: [
                { options: [{ key: "wall_generator" }] },
                { options: [{ key: "wall_transition_angle" }] },
                { options: [{ key: "wall_transition_filter_deviation" }] },
                { options: [{ key: "wall_transition_length" }] },
                { options: [{ key: "wall_distribution_count" }] },
                { options: [{ key: "initial_layer_min_bead_width" }] },
                { options: [{ key: "min_bead_width" }] },
                { options: [{ key: "min_feature_size" }] },
                { options: [{ key: "min_length_factor" }] },
                { options: [{ key: "wall_maximum_resolution" }] },
                { options: [{ key: "wall_maximum_deviation" }] }
              ]
            },
            {
              id: "quality.walls-and-surfaces",
              title: "Walls and surfaces",
              lines: [
                { options: [{ key: "wall_sequence" }] },
                { options: [{ key: "is_infill_first" }] },
                { options: [{ key: "wall_direction" }] },
                { options: [{ key: "print_flow_ratio" }] },
                { options: [{ key: "top_solid_infill_flow_ratio" }] },
                { options: [{ key: "bottom_solid_infill_flow_ratio" }] },
                { options: [{ key: "set_other_flow_ratios" }] },
                { options: [{ key: "first_layer_flow_ratio" }] },
                { options: [{ key: "outer_wall_flow_ratio" }] },
                { options: [{ key: "inner_wall_flow_ratio" }] },
                { options: [{ key: "overhang_flow_ratio" }] },
                { options: [{ key: "sparse_infill_flow_ratio" }] },
                { options: [{ key: "internal_solid_infill_flow_ratio" }] },
                { options: [{ key: "gap_fill_flow_ratio" }] },
                { options: [{ key: "support_flow_ratio" }] },
                { options: [{ key: "support_interface_flow_ratio" }] },
                { options: [{ key: "only_one_wall_first_layer" }] },
                { options: [{ key: "only_one_wall_top" }] },
                { options: [{ key: "min_width_top_surface" }] },
                { options: [{ key: "reduce_crossing_wall" }] },
                { options: [{ key: "max_travel_detour_distance" }] },
                { options: [{ key: "small_area_infill_flow_compensation" }] },
                { options: [{ key: "small_area_infill_flow_compensation_model", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "quality.bridging",
              title: "Bridging",
              lines: [
                { options: [{ key: "bridge_flow" }] },
                { options: [{ key: "internal_bridge_flow" }] },
                { options: [{ key: "bridge_density" }] },
                { options: [{ key: "internal_bridge_density" }] },
                { options: [{ key: "thick_bridges" }] },
                { options: [{ key: "thick_internal_bridges" }] },
                { options: [{ key: "enable_extra_bridge_layer" }] },
                { options: [{ key: "dont_filter_internal_bridges" }] },
                { options: [{ key: "counterbore_hole_bridging" }] }
              ]
            },
            {
              id: "quality.overhangs",
              title: "Overhangs",
              lines: [
                { options: [{ key: "detect_overhang_wall" }] },
                { options: [{ key: "unsupported_wall_last" }] },
                { options: [{ key: "make_overhang_printable" }] },
                { options: [{ key: "make_overhang_printable_angle" }] },
                { options: [{ key: "make_overhang_printable_hole_size" }] },
                { options: [{ key: "extra_perimeters_on_overhangs" }] },
                { options: [{ key: "overhang_reverse" }] },
                { options: [{ key: "overhang_reverse_internal_only" }] },
                { options: [{ key: "overhang_reverse_threshold" }] }
              ]
            }
          ]
        },
        {
          id: "strength",
          title: "Strength",
          groups: [
            {
              id: "strength.walls",
              title: "Walls",
              lines: [
                { options: [{ key: "wall_loops" }] },
                { options: [{ key: "alternate_extra_wall" }] },
                { options: [{ key: "detect_thin_wall" }] }
              ]
            },
            {
              id: "strength.top-bottom-shells",
              title: "Top/bottom shells",
              lines: [
                { options: [{ key: "top_shell_layers" }] },
                { options: [{ key: "top_shell_thickness" }] },
                { options: [{ key: "top_surface_density" }] },
                { options: [{ key: "top_surface_pattern" }] },
                { options: [{ key: "top_surface_fill_order" }] },
                { options: [{ key: "top_layer_direction" }] },
                { options: [{ key: "top_surface_expansion" }] },
                { options: [{ key: "top_surface_expansion_margin" }] },
                { options: [{ key: "top_surface_expansion_direction" }] },
                { options: [{ key: "bottom_shell_layers" }] },
                { options: [{ key: "bottom_shell_thickness" }] },
                { options: [{ key: "bottom_surface_density" }] },
                { options: [{ key: "bottom_surface_pattern" }] },
                { options: [{ key: "bottom_surface_fill_order" }] },
                { options: [{ key: "bottom_layer_direction" }] },
                { options: [{ key: "center_of_surface_pattern" }] },
                { options: [{ key: "top_bottom_infill_wall_overlap" }] }
              ]
            },
            {
              id: "strength.infill",
              title: "Infill",
              lines: [
                { options: [{ key: "sparse_infill_density" }] },
                { options: [{ key: "fill_multiline" }] },
                { options: [{ key: "sparse_infill_pattern" }] },
                { options: [{ key: "gyroid_optimized" }] },
                { options: [{ key: "sparse_infill_smooth_factor" }] },
                { options: [{ key: "infill_direction" }] },
                { options: [{ key: "sparse_infill_rotate_template" }] },
                { options: [{ key: "skin_infill_density" }] },
                { options: [{ key: "skeleton_infill_density" }] },
                { options: [{ key: "infill_lock_depth" }] },
                { options: [{ key: "skin_infill_depth" }] },
                { options: [{ key: "skin_infill_line_width" }] },
                { options: [{ key: "skeleton_infill_line_width" }] },
                { options: [{ key: "symmetric_infill_y_axis" }] },
                { options: [{ key: "infill_shift_step" }] },
                { options: [{ key: "lateral_lattice_angle_1" }] },
                { options: [{ key: "lateral_lattice_angle_2" }] },
                { options: [{ key: "infill_overhang_angle" }] },
                { options: [{ key: "lightning_overhang_angle" }] },
                { options: [{ key: "lightning_prune_angle" }] },
                { options: [{ key: "lightning_straightening_angle" }] },
                { options: [{ key: "infill_anchor_max" }] },
                { options: [{ key: "infill_anchor" }] },
                { options: [{ key: "internal_solid_infill_pattern" }] },
                { options: [{ key: "solid_infill_direction" }] },
                { options: [{ key: "solid_infill_rotate_template" }] },
                { options: [{ key: "gap_fill_target" }] },
                { options: [{ key: "filter_out_gap_fill" }] },
                { options: [{ key: "separated_infills" }] },
                { options: [{ key: "infill_wall_overlap" }] }
              ]
            },
            {
              id: "strength.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "align_infill_direction_to_model" }] },
                { options: [{ key: "extra_solid_infills" }] },
                { options: [{ key: "bridge_angle" }] },
                { options: [{ key: "internal_bridge_angle" }] },
                { options: [{ key: "relative_bridge_angle" }] },
                { options: [{ key: "minimum_sparse_infill_area" }] },
                { options: [{ key: "infill_combination" }] },
                { options: [{ key: "infill_combination_max_layer_height" }] },
                { options: [{ key: "detect_narrow_internal_solid_infill" }] },
                { options: [{ key: "ensure_vertical_shell_thickness" }] }
              ]
            }
          ]
        },
        {
          id: "speed",
          title: "Speed",
          groups: [
            {
              id: "speed.first-layer-speed",
              title: "First layer speed",
              lines: [
                { options: [{ key: "initial_layer_speed", index: 0 }] },
                { options: [{ key: "initial_layer_infill_speed", index: 0 }] },
                { options: [{ key: "initial_layer_travel_speed", index: 0 }] },
                { options: [{ key: "slow_down_layers" }] }
              ]
            },
            {
              id: "speed.other-layers-speed",
              title: "Other layers speed",
              lines: [
                { options: [{ key: "outer_wall_speed", index: 0 }] },
                { options: [{ key: "inner_wall_speed", index: 0 }] },
                { options: [{ key: "small_perimeter_speed", index: 0 }] },
                { options: [{ key: "small_perimeter_threshold", index: 0 }] },
                { options: [{ key: "sparse_infill_speed", index: 0 }] },
                { options: [{ key: "internal_solid_infill_speed", index: 0 }] },
                { options: [{ key: "top_surface_speed", index: 0 }] },
                { options: [{ key: "gap_infill_speed", index: 0 }] },
                { options: [{ key: "ironing_speed" }] },
                { options: [{ key: "support_speed", index: 0 }] },
                { options: [{ key: "support_interface_speed", index: 0 }] },
                { options: [{ key: "small_support_perimeter_speed", index: 0 }] },
                { options: [{ key: "small_support_perimeter_threshold", index: 0 }] }
              ]
            },
            {
              id: "speed.overhang-speed",
              title: "Overhang speed",
              lines: [
                { options: [{ key: "enable_overhang_speed", index: 0 }] },
                { options: [{ key: "slowdown_for_curled_perimeters", index: 0 }] },
                { options: [{ key: "overhang_1_4_speed", index: 0 }, { key: "overhang_2_4_speed", index: 0 }, { key: "overhang_3_4_speed", index: 0 }, { key: "overhang_4_4_speed", index: 0 }], label: "Overhang speed", tooltip: "This is the speed for various overhang degrees. Overhang degrees are expressed as a percentage of line width. 0 speed means no slowing down for the overhang degree range and wall speed is used" },
                { options: [{ key: "bridge_speed", index: 0 }, { key: "internal_bridge_speed", index: 0 }], label: "Bridge", tooltip: "Set speed for external and internal bridges" }
              ]
            },
            {
              id: "speed.travel-speed",
              title: "Travel speed",
              lines: [
                { options: [{ key: "travel_speed", index: 0 }] }
              ]
            },
            {
              id: "speed.acceleration",
              title: "Acceleration",
              lines: [
                { options: [{ key: "default_acceleration", index: 0 }] },
                { options: [{ key: "outer_wall_acceleration", index: 0 }] },
                { options: [{ key: "inner_wall_acceleration", index: 0 }] },
                { options: [{ key: "bridge_acceleration", index: 0 }] },
                { options: [{ key: "sparse_infill_acceleration", index: 0 }] },
                { options: [{ key: "internal_solid_infill_acceleration", index: 0 }] },
                { options: [{ key: "initial_layer_acceleration", index: 0 }] },
                { options: [{ key: "initial_layer_travel_acceleration", index: 0 }] },
                { options: [{ key: "top_surface_acceleration", index: 0 }] },
                { options: [{ key: "travel_acceleration", index: 0 }] },
                { options: [{ key: "accel_to_decel_enable" }] },
                { options: [{ key: "accel_to_decel_factor" }] }
              ]
            },
            {
              id: "speed.junction-deviation",
              title: "Junction Deviation",
              lines: [
                { options: [{ key: "default_junction_deviation", index: 0 }] }
              ]
            },
            {
              id: "speed.jerk-xy",
              title: "Jerk(XY)",
              lines: [
                { options: [{ key: "default_jerk", index: 0 }] },
                { options: [{ key: "outer_wall_jerk", index: 0 }] },
                { options: [{ key: "inner_wall_jerk", index: 0 }] },
                { options: [{ key: "infill_jerk", index: 0 }] },
                { options: [{ key: "top_surface_jerk", index: 0 }] },
                { options: [{ key: "initial_layer_jerk", index: 0 }] },
                { options: [{ key: "initial_layer_travel_jerk", index: 0 }] },
                { options: [{ key: "travel_jerk", index: 0 }] }
              ]
            },
            {
              id: "speed.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "max_volumetric_extrusion_rate_slope" }] },
                { options: [{ key: "max_volumetric_extrusion_rate_slope_segment_length" }] },
                { options: [{ key: "extrusion_rate_smoothing_external_perimeter_only" }] }
              ]
            }
          ]
        },
        {
          id: "support",
          title: "Support",
          groups: [
            {
              id: "support.support",
              title: "Support",
              lines: [
                { options: [{ key: "enable_support" }] },
                { options: [{ key: "support_type" }] },
                { options: [{ key: "support_style" }] },
                { options: [{ key: "support_threshold_angle" }] },
                { options: [{ key: "support_threshold_overlap" }] },
                { options: [{ key: "raft_first_layer_density" }] },
                { options: [{ key: "raft_first_layer_expansion" }] },
                { options: [{ key: "support_on_build_plate_only" }] },
                { options: [{ key: "support_critical_regions_only" }] },
                { options: [{ key: "support_remove_small_overhang" }] }
              ]
            },
            {
              id: "support.raft",
              title: "Raft",
              lines: [
                { options: [{ key: "raft_layers" }] },
                { options: [{ key: "raft_contact_distance" }] }
              ]
            },
            {
              id: "support.filament-for-supports",
              title: "Filament for Supports",
              lines: [
                { options: [{ key: "support_filament" }] },
                { options: [{ key: "support_interface_filament" }] },
                { options: [{ key: "support_interface_not_for_body" }] }
              ]
            },
            {
              id: "support.support-ironing",
              title: "Support ironing",
              lines: [
                { options: [{ key: "support_ironing" }] },
                { options: [{ key: "support_ironing_pattern" }] },
                { options: [{ key: "support_ironing_flow" }] },
                { options: [{ key: "support_ironing_spacing" }] }
              ]
            },
            {
              id: "support.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "support_top_z_distance" }] },
                { options: [{ key: "support_bottom_z_distance" }] },
                { options: [{ key: "tree_support_wall_count" }] },
                { options: [{ key: "support_base_pattern" }] },
                { options: [{ key: "support_base_pattern_spacing" }] },
                { options: [{ key: "support_angle" }] },
                { options: [{ key: "support_interface_top_layers" }] },
                { options: [{ key: "support_interface_bottom_layers" }] },
                { options: [{ key: "support_interface_pattern" }] },
                { options: [{ key: "support_interface_spacing" }] },
                { options: [{ key: "support_bottom_interface_spacing" }] },
                { options: [{ key: "support_expansion" }] },
                { options: [{ key: "support_object_xy_distance" }] },
                { options: [{ key: "support_object_first_layer_gap" }] },
                { options: [{ key: "bridge_no_support" }] },
                { options: [{ key: "max_bridge_length" }] },
                { options: [{ key: "independent_support_layer_height" }] }
              ]
            },
            {
              id: "support.tree-supports",
              title: "Tree supports",
              lines: [
                { options: [{ key: "tree_support_tip_diameter" }] },
                { options: [{ key: "tree_support_branch_distance" }] },
                { options: [{ key: "tree_support_branch_distance_organic" }] },
                { options: [{ key: "tree_support_top_rate" }] },
                { options: [{ key: "tree_support_branch_diameter" }] },
                { options: [{ key: "tree_support_branch_diameter_organic" }] },
                { options: [{ key: "tree_support_branch_diameter_angle" }] },
                { options: [{ key: "tree_support_branch_angle" }] },
                { options: [{ key: "tree_support_branch_angle_organic" }] },
                { options: [{ key: "tree_support_angle_slow" }] },
                { options: [{ key: "tree_support_auto_brim" }] },
                { options: [{ key: "tree_support_brim_width" }] }
              ]
            }
          ]
        },
        {
          id: "multimaterial",
          title: "Multimaterial",
          groups: [
            {
              id: "multimaterial.prime-tower",
              title: "Prime tower",
              lines: [
                { options: [{ key: "enable_prime_tower" }] },
                { options: [{ key: "prime_tower_skip_points" }] },
                { options: [{ key: "enable_tower_interface_features" }] },
                { options: [{ key: "enable_tower_interface_cooldown_during_tower" }] },
                { options: [{ key: "prime_tower_enable_framework" }] },
                { options: [{ key: "prime_tower_width" }] },
                { options: [{ key: "prime_volume" }] },
                { options: [{ key: "prime_tower_brim_width" }] },
                { options: [{ key: "prime_tower_infill_gap" }] },
                { options: [{ key: "wipe_tower_rotation_angle" }] },
                { options: [{ key: "wipe_tower_bridging" }] },
                { options: [{ key: "wipe_tower_extra_spacing" }] },
                { options: [{ key: "wipe_tower_extra_flow" }] },
                { options: [{ key: "wipe_tower_max_purge_speed" }] },
                { options: [{ key: "wipe_tower_wall_type" }] },
                { options: [{ key: "wipe_tower_cone_angle" }] },
                { options: [{ key: "wipe_tower_extra_rib_length" }] },
                { options: [{ key: "wipe_tower_rib_width" }] },
                { options: [{ key: "wipe_tower_fillet_wall" }] },
                { options: [{ key: "wipe_tower_no_sparse_layers" }] },
                { options: [{ key: "single_extruder_multi_material_priming" }] }
              ]
            },
            {
              id: "multimaterial.filament-for-features",
              title: "Filament for Features",
              lines: [
                { options: [{ key: "outer_wall_filament_id" }] },
                { options: [{ key: "inner_wall_filament_id" }] },
                { options: [{ key: "sparse_infill_filament_id" }] },
                { options: [{ key: "internal_solid_filament_id" }] },
                { options: [{ key: "top_surface_filament_id" }] },
                { options: [{ key: "bottom_surface_filament_id" }] },
                { options: [{ key: "wipe_tower_filament" }] }
              ]
            },
            {
              id: "multimaterial.ooze-prevention",
              title: "Ooze prevention",
              lines: [
                { options: [{ key: "ooze_prevention" }] },
                { options: [{ key: "standby_temperature_delta" }] },
                { options: [{ key: "preheat_time" }] },
                { options: [{ key: "preheat_steps" }] }
              ]
            },
            {
              id: "multimaterial.flush-options",
              title: "Flush options",
              lines: [
                { options: [{ key: "flush_into_infill" }] },
                { options: [{ key: "flush_into_objects" }] },
                { options: [{ key: "flush_into_support" }] }
              ]
            },
            {
              id: "multimaterial.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "interlocking_beam" }] },
                { options: [{ key: "toolchange_ordering" }] },
                { options: [{ key: "toolchange_cyclic_order" }] },
                { options: [{ key: "toolchange_cyclic_first_layer" }] },
                { options: [{ key: "interface_shells" }] },
                { options: [{ key: "mmu_segmented_region_max_width" }] },
                { options: [{ key: "mmu_segmented_region_interlocking_depth" }] },
                { options: [{ key: "interlocking_beam_width" }] },
                { options: [{ key: "interlocking_orientation" }] },
                { options: [{ key: "interlocking_beam_layer_count" }] },
                { options: [{ key: "interlocking_depth" }] },
                { options: [{ key: "interlocking_boundary_avoidance" }] }
              ]
            }
          ]
        },
        {
          id: "others",
          title: "Others",
          groups: [
            {
              id: "others.skirt",
              title: "Skirt",
              lines: [
                { options: [{ key: "skirt_loops" }] },
                { options: [{ key: "skirt_type" }] },
                { options: [{ key: "min_skirt_length" }] },
                { options: [{ key: "skirt_distance" }] },
                { options: [{ key: "skirt_start_angle" }] },
                { options: [{ key: "skirt_speed" }] },
                { options: [{ key: "skirt_height" }] },
                { options: [{ key: "draft_shield" }] },
                { options: [{ key: "single_loop_draft_shield" }] }
              ]
            },
            {
              id: "others.brim",
              title: "Brim",
              lines: [
                { options: [{ key: "brim_type" }] },
                { options: [{ key: "brim_width" }] },
                { options: [{ key: "brim_object_gap" }] },
                { options: [{ key: "brim_flow_ratio" }] },
                { options: [{ key: "brim_use_efc_outline" }] },
                { options: [{ key: "combine_brims" }] },
                { options: [{ key: "brim_ears_max_angle" }] },
                { options: [{ key: "brim_ears_detection_length" }] },
                { options: [{ key: "brim_ears_outer_only" }] }
              ]
            },
            {
              id: "others.special-mode",
              title: "Special mode",
              lines: [
                { options: [{ key: "slicing_mode" }] },
                { options: [{ key: "print_sequence" }] },
                { options: [{ key: "print_order" }] },
                { options: [{ key: "spiral_mode" }] },
                { options: [{ key: "spiral_mode_smooth" }] },
                { options: [{ key: "spiral_mode_max_xy_smoothing" }] },
                { options: [{ key: "spiral_starting_flow_ratio" }] },
                { options: [{ key: "spiral_finishing_flow_ratio" }] },
                { options: [{ key: "timelapse_type" }] },
                { options: [{ key: "enable_wrapping_detection" }] }
              ]
            },
            {
              id: "others.fuzzy-skin",
              title: "Fuzzy skin",
              lines: [
                { options: [{ key: "fuzzy_skin" }] },
                { options: [{ key: "fuzzy_skin_mode" }] },
                { options: [{ key: "fuzzy_skin_noise_type" }] },
                { options: [{ key: "fuzzy_skin_point_distance" }] },
                { options: [{ key: "fuzzy_skin_thickness" }] },
                { options: [{ key: "fuzzy_skin_scale" }] },
                { options: [{ key: "fuzzy_skin_octaves" }] },
                { options: [{ key: "fuzzy_skin_persistence" }] },
                { options: [{ key: "fuzzy_skin_ripples_per_layer" }] },
                { options: [{ key: "fuzzy_skin_ripple_offset" }] },
                { options: [{ key: "fuzzy_skin_layers_between_ripple_offset" }] },
                { options: [{ key: "fuzzy_skin_first_layer" }] }
              ]
            },
            {
              id: "others.g-code-output",
              title: "G-code output",
              lines: [
                { options: [{ key: "reduce_infill_retraction" }] },
                { options: [{ key: "gcode_add_line_number" }] },
                { options: [{ key: "gcode_comments" }] },
                { options: [{ key: "gcode_label_objects" }] },
                { options: [{ key: "exclude_object" }] },
                { options: [{ key: "filename_format", code: true, multiline: true }] }
              ]
            },
            {
              id: "others.change-extrusion-role-g-code",
              title: "Change extrusion role G-code",
              lines: [
                { options: [{ key: "process_change_extrusion_role_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "others.post-processing-scripts",
              title: "Post-processing Scripts",
              lines: [
                { options: [{ key: "post_process", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "others.slicing-pipeline-plugin",
              title: "Slicing Pipeline Plugin",
              lines: [
                { options: [{ key: "slicing_pipeline_plugin", fullWidth: true }] }
              ]
            },
            {
              id: "others.plugin-configuration",
              title: "Plugin Configuration",
              lines: [
                { options: [{ key: "print_plugin_config_overrides" }] }
              ]
            },
            {
              id: "others.notes",
              title: "Notes",
              lines: [
                { options: [{ key: "notes", fullWidth: true, height: 25 }] }
              ]
            }
          ]
        },
        {
          id: "other",
          title: "Other",
          other: true,
          groups: [
            {
              id: "other.not-in-orca-tabs",
              title: "Other settings",
              lines: [
                { options: [{ key: "calib_flowrate_topinfill_special_order" }] },
                { options: [{ key: "enforce_support_layers" }] },
                { options: [{ key: "inherits" }] },
                { options: [{ key: "ironing_expansion" }] },
                { options: [{ key: "plugins" }] },
                { options: [{ key: "prime_tower_flat_ironing" }] },
                { options: [{ key: "print_extruder_id" }] },
                { options: [{ key: "print_extruder_variant" }] },
                { options: [{ key: "raft_expansion" }] },
                { options: [{ key: "support_interface_loop_pattern" }] },
                { options: [{ key: "travel_speed_z" }] },
                { options: [{ key: "wiping_volumes_extruders" }] }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "filament",
      title: "Filament",
      pages: [
        {
          id: "filament",
          title: "Filament",
          groups: [
            {
              id: "filament.basic-information",
              title: "Basic information",
              lines: [
                { options: [{ key: "filament_type" }] },
                { options: [{ key: "filament_vendor" }] },
                { options: [{ key: "filament_soluble" }] },
                { options: [{ key: "filament_is_support" }] },
                { options: [{ key: "filament_change_length" }] },
                { options: [{ key: "required_nozzle_HRC" }] },
                { options: [{ key: "default_filament_colour" }] },
                { options: [{ key: "filament_diameter" }] },
                { options: [{ key: "filament_adhesiveness_category" }] },
                { options: [{ key: "filament_density" }] },
                { options: [{ key: "filament_shrink" }] },
                { options: [{ key: "filament_shrinkage_compensation_z" }] },
                { options: [{ key: "filament_cost" }] },
                { options: [{ key: "temperature_vitrification" }] },
                { options: [{ key: "idle_temperature" }] },
                { options: [{ key: "nozzle_temperature_range_low" }, { key: "nozzle_temperature_range_high" }], label: "Recommended nozzle temperature", tooltip: "Recommended nozzle temperature range of this filament. 0 means not set" }
              ]
            },
            {
              id: "filament.flow-ratio-and-pressure-advance",
              title: "Flow ratio and Pressure Advance",
              lines: [
                { options: [{ key: "pellet_flow_coefficient" }] },
                { options: [{ key: "filament_flow_ratio", index: 0 }] },
                { options: [{ key: "enable_pressure_advance" }] },
                { options: [{ key: "pressure_advance" }] },
                { options: [{ key: "adaptive_pressure_advance" }] },
                { options: [{ key: "adaptive_pressure_advance_overhangs" }] },
                { options: [{ key: "adaptive_pressure_advance_bridges" }] },
                { options: [{ key: "adaptive_pressure_advance_model", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "filament.print-chamber-temperature",
              title: "Print chamber temperature",
              lines: [
                { options: [{ key: "activate_chamber_temp_control" }] },
                { options: [{ key: "chamber_temperature", label: "Target" }, { key: "chamber_minimal_temperature", label: "Minimal" }], label: "Chamber temperature", tooltip: "Target chamber temperature, and the minimal chamber temperature at which printing should start" }
              ]
            },
            {
              id: "filament.print-temperature",
              title: "Print temperature",
              lines: [
                { options: [{ key: "nozzle_temperature_initial_layer", index: 0 }, { key: "nozzle_temperature", index: 0 }], label: "Nozzle", tooltip: "Nozzle temperature when printing" }
              ]
            },
            {
              id: "filament.bed-temperature",
              title: "Bed temperature",
              lines: [
                { options: [{ key: "supertack_plate_temp_initial_layer" }, { key: "supertack_plate_temp" }], label: "Cool Plate (SuperTack)", tooltip: "Bed temperature when the Cool Plate SuperTack is installed. A value of 0 means the filament does not support printing on the Cool Plate SuperTack." },
                { options: [{ key: "cool_plate_temp_initial_layer" }, { key: "cool_plate_temp" }], label: "Cool Plate", tooltip: "This is the bed temperature when the Cool Plate is installed. A value of 0 means the filament does not support printing on the Cool Plate." },
                { options: [{ key: "textured_cool_plate_temp_initial_layer" }, { key: "textured_cool_plate_temp" }], label: "Textured Cool Plate", tooltip: "This is the bed temperature when the Textured Cool Plate is installed. A value of 0 means the filament does not support printing on the Textured Cool Plate." },
                { options: [{ key: "eng_plate_temp_initial_layer" }, { key: "eng_plate_temp" }], label: "Engineering Plate", tooltip: "This is the bed temperature when the engineering plate is installed. A value of 0 means the filament does not support printing on the Engineering Plate." },
                { options: [{ key: "hot_plate_temp_initial_layer" }, { key: "hot_plate_temp" }], label: "Smooth PEI Plate / High Temp Plate", tooltip: "This is the bed temperature when the Smooth PEI Plate/High Temperature Plate is installed. A value of 0 means the filament does not support printing on the Smooth PEI Plate/High Temp Plate." },
                { options: [{ key: "textured_plate_temp_initial_layer" }, { key: "textured_plate_temp" }], label: "Textured PEI Plate", tooltip: "This is the bed temperature when the Textured PEI Plate is installed. A value of 0 means the filament does not support printing on the Textured PEI Plate." }
              ]
            },
            {
              id: "filament.volumetric-speed-limitation",
              title: "Volumetric speed limitation",
              lines: [
                { options: [{ key: "filament_adaptive_volumetric_speed", index: 0 }] },
                { options: [{ key: "filament_max_volumetric_speed", index: 0 }] }
              ]
            }
          ]
        },
        {
          id: "cooling",
          title: "Cooling",
          groups: [
            {
              id: "cooling.cooling-for-specific-layer",
              title: "Cooling for specific layer",
              lines: [
                { options: [{ key: "close_fan_the_first_x_layers" }] },
                { options: [{ key: "initial_layer_fan_speed" }] },
                { options: [{ key: "full_fan_speed_layer" }] }
              ]
            },
            {
              id: "cooling.part-cooling-fan",
              title: "Part cooling fan",
              lines: [
                { options: [{ key: "fan_min_speed" }, { key: "fan_cooling_layer_time" }], label: "Min fan speed threshold", tooltip: "The part cooling fan will run at the minimum fan speed when the estimated layer time is longer than the threshold value. When the layer time is shorter than the threshold, the fan speed will be interpolated between the minimum and maximum fan speed according to layer printing time." },
                { options: [{ key: "fan_max_speed" }, { key: "slow_down_layer_time" }], label: "Max fan speed threshold", tooltip: "The part cooling fan will run at maximum speed when the estimated layer time is shorter than the threshold value." },
                { options: [{ key: "reduce_fan_stop_start_freq" }] },
                { options: [{ key: "slow_down_for_layer_cooling" }] },
                { options: [{ key: "dont_slow_down_outer_wall" }] },
                { options: [{ key: "slow_down_min_speed" }] },
                { options: [{ key: "enable_overhang_bridge_fan" }] },
                { options: [{ key: "overhang_fan_threshold" }] },
                { options: [{ key: "overhang_fan_speed" }] },
                { options: [{ key: "internal_bridge_fan_speed" }] },
                { options: [{ key: "support_material_interface_fan_speed" }] },
                { options: [{ key: "ironing_fan_speed" }] }
              ]
            },
            {
              id: "cooling.auxiliary-part-cooling-fan",
              title: "Auxiliary part cooling fan",
              lines: [
                { options: [{ key: "additional_cooling_fan_speed" }] }
              ]
            },
            {
              id: "cooling.exhaust-fan",
              title: "Exhaust fan",
              lines: [
                { options: [{ key: "activate_air_filtration" }] },
                { options: [{ key: "activate_air_filtration_during_print" }, { key: "during_print_exhaust_fan_speed" }], label: "During print" },
                { options: [{ key: "activate_air_filtration_on_completion" }, { key: "complete_print_exhaust_fan_speed" }], label: "Complete print" }
              ]
            }
          ]
        },
        {
          id: "setting-overrides",
          title: "Setting Overrides",
          groups: [
            {
              id: "setting-overrides.retraction",
              title: "Retraction",
              lines: [
                { options: [{ key: "filament_retraction_length", index: 0 }], overrideOf: { scope: "machine", key: "retraction_length" } },
                { options: [{ key: "filament_z_hop", index: 0 }], overrideOf: { scope: "machine", key: "z_hop" } },
                { options: [{ key: "filament_z_hop_types", index: 0 }], overrideOf: { scope: "machine", key: "z_hop_types" } },
                { options: [{ key: "filament_retract_lift_above", index: 0 }], overrideOf: { scope: "machine", key: "retract_lift_above" } },
                { options: [{ key: "filament_retract_lift_below", index: 0 }], overrideOf: { scope: "machine", key: "retract_lift_below" } },
                { options: [{ key: "filament_retract_lift_enforce", index: 0 }], overrideOf: { scope: "machine", key: "retract_lift_enforce" } },
                { options: [{ key: "filament_retraction_speed", index: 0 }], overrideOf: { scope: "machine", key: "retraction_speed" } },
                { options: [{ key: "filament_deretraction_speed", index: 0 }], overrideOf: { scope: "machine", key: "deretraction_speed" } },
                { options: [{ key: "filament_retract_restart_extra", index: 0 }], overrideOf: { scope: "machine", key: "retract_restart_extra" } },
                { options: [{ key: "filament_retraction_minimum_travel", index: 0 }], overrideOf: { scope: "machine", key: "retraction_minimum_travel" } },
                { options: [{ key: "filament_retract_when_changing_layer", index: 0 }], overrideOf: { scope: "machine", key: "retract_when_changing_layer" } },
                { options: [{ key: "filament_wipe", index: 0 }], overrideOf: { scope: "machine", key: "wipe" } },
                { options: [{ key: "filament_wipe_distance", index: 0 }], overrideOf: { scope: "machine", key: "wipe_distance" } },
                { options: [{ key: "filament_retract_before_wipe", index: 0 }], overrideOf: { scope: "machine", key: "retract_before_wipe" } },
                { options: [{ key: "filament_retract_after_wipe", index: 0 }], overrideOf: { scope: "machine", key: "retract_after_wipe" } },
                { options: [{ key: "filament_long_retractions_when_cut", index: 0 }], overrideOf: { scope: "machine", key: "long_retractions_when_cut" } },
                { options: [{ key: "filament_retraction_distances_when_cut", index: 0 }], overrideOf: { scope: "machine", key: "retraction_distances_when_cut" } }
              ]
            },
            {
              id: "setting-overrides.retraction-when-switching-material",
              title: "Retraction when switching material",
              lines: [
                { options: [{ key: "filament_retract_length_toolchange", index: 0 }], overrideOf: { scope: "machine", key: "retract_length_toolchange" } },
                { options: [{ key: "filament_retract_restart_extra_toolchange", index: 0 }], overrideOf: { scope: "machine", key: "retract_restart_extra_toolchange" } }
              ]
            },
            {
              id: "setting-overrides.ironing",
              title: "Ironing",
              lines: [
                { options: [{ key: "filament_ironing_flow", index: 0 }], overrideOf: { scope: "process", key: "ironing_flow" } },
                { options: [{ key: "filament_ironing_spacing", index: 0 }], overrideOf: { scope: "process", key: "ironing_spacing" } },
                { options: [{ key: "filament_ironing_inset", index: 0 }], overrideOf: { scope: "process", key: "ironing_inset" } },
                { options: [{ key: "filament_ironing_speed", index: 0 }], overrideOf: { scope: "process", key: "ironing_speed" } }
              ]
            }
          ]
        },
        {
          id: "advanced",
          title: "Advanced",
          groups: [
            {
              id: "advanced.filament-start-g-code",
              title: "Filament start G-code",
              lines: [
                { options: [{ key: "filament_start_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "advanced.change-extrusion-role-g-code",
              title: "Change extrusion role G-code",
              lines: [
                { options: [{ key: "filament_change_extrusion_role_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "advanced.filament-end-g-code",
              title: "Filament end G-code",
              lines: [
                { options: [{ key: "filament_end_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "advanced.plugin-configuration",
              title: "Plugin Configuration",
              lines: [
                { options: [{ key: "filament_plugin_config_overrides" }] }
              ]
            }
          ]
        },
        {
          id: "multimaterial",
          title: "Multimaterial",
          groups: [
            {
              id: "multimaterial.wipe-tower-parameters",
              title: "Wipe tower parameters",
              lines: [
                { options: [{ key: "filament_minimal_purge_on_wipe_tower" }] },
                { options: [{ key: "filament_tower_interface_pre_extrusion_dist" }] },
                { options: [{ key: "filament_tower_interface_pre_extrusion_length" }] },
                { options: [{ key: "filament_tower_ironing_area" }] },
                { options: [{ key: "filament_tower_interface_purge_volume" }] },
                { options: [{ key: "filament_tower_interface_print_temp" }] }
              ]
            },
            {
              id: "multimaterial.multi-filament",
              title: "Multi Filament",
              lines: [
                { options: [{ key: "long_retractions_when_ec", index: 0 }] },
                { options: [{ key: "retraction_distances_when_ec", index: 0 }] }
              ]
            },
            {
              id: "multimaterial.tool-change-parameters-with-single-extruder-mm-printers",
              title: "Tool change parameters with single extruder MM printers",
              lines: [
                { options: [{ key: "filament_loading_speed_start" }] },
                { options: [{ key: "filament_loading_speed" }] },
                { options: [{ key: "filament_unloading_speed_start" }] },
                { options: [{ key: "filament_unloading_speed" }] },
                { options: [{ key: "filament_toolchange_delay" }] },
                { options: [{ key: "filament_cooling_moves" }] },
                { options: [{ key: "filament_cooling_initial_speed" }] },
                { options: [{ key: "filament_cooling_final_speed" }] },
                { options: [{ key: "filament_stamping_loading_speed" }] },
                { options: [{ key: "filament_stamping_distance" }] },
                { options: [{ key: "filament_ramming_parameters" }], widget: "ramming" }
              ]
            },
            {
              id: "multimaterial.tool-change-parameters-with-multi-extruder-mm-printers",
              title: "Tool change parameters with multi extruder MM printers",
              lines: [
                { options: [{ key: "filament_multitool_ramming" }] },
                { options: [{ key: "filament_multitool_ramming_volume" }] },
                { options: [{ key: "filament_multitool_ramming_flow" }] }
              ]
            }
          ]
        },
        {
          id: "dependencies",
          title: "Dependencies",
          groups: [
            {
              id: "dependencies.compatible-printers",
              title: "Compatible printers",
              lines: [
                { options: [{ key: "compatible_printers" }], widget: "compatible" },
                { options: [{ key: "compatible_printers_condition", fullWidth: true }] }
              ]
            },
            {
              id: "dependencies.compatible-process-profiles",
              title: "Compatible process profiles",
              lines: [
                { options: [{ key: "compatible_prints" }], widget: "compatible" },
                { options: [{ key: "compatible_prints_condition", fullWidth: true }] }
              ]
            }
          ]
        },
        {
          id: "notes",
          title: "Notes",
          groups: [
            {
              id: "notes.notes",
              title: "Notes",
              lines: [
                { options: [{ key: "filament_notes", fullWidth: true, height: 25 }] }
              ]
            }
          ]
        },
        {
          id: "other",
          title: "Other",
          other: true,
          groups: [
            {
              id: "other.not-in-orca-tabs",
              title: "Other settings",
              lines: [
                { options: [{ key: "additional_fan_full_speed_layer" }] },
                { options: [{ key: "close_additional_fan_first_x_layers" }] },
                { options: [{ key: "filament_change_length_nc" }] },
                { options: [{ key: "filament_cooling_before_tower" }] },
                { options: [{ key: "filament_dev_ams_drying_ams_limitations" }] },
                { options: [{ key: "filament_dev_ams_drying_heat_distortion_temperature" }] },
                { options: [{ key: "filament_dev_ams_drying_temperature" }] },
                { options: [{ key: "filament_dev_ams_drying_time" }] },
                { options: [{ key: "filament_dev_chamber_drying_bed_temperature" }] },
                { options: [{ key: "filament_dev_chamber_drying_time" }] },
                { options: [{ key: "filament_dev_drying_cooling_temperature" }] },
                { options: [{ key: "filament_dev_drying_softening_temperature" }] },
                { options: [{ key: "filament_extruder_compatibility" }] },
                { options: [{ key: "filament_extruder_variant" }] },
                { options: [{ key: "filament_flush_temp" }] },
                { options: [{ key: "filament_flush_temp_fast" }] },
                { options: [{ key: "filament_flush_volumetric_speed" }] },
                { options: [{ key: "filament_pre_cooling_temperature" }] },
                { options: [{ key: "filament_pre_cooling_temperature_nc" }] },
                { options: [{ key: "filament_preheat_temperature_delta" }] },
                { options: [{ key: "filament_prime_volume" }] },
                { options: [{ key: "filament_prime_volume_nc" }] },
                { options: [{ key: "filament_printable" }] },
                { options: [{ key: "filament_ramming_travel_time" }] },
                { options: [{ key: "filament_ramming_travel_time_nc" }] },
                { options: [{ key: "filament_ramming_volumetric_speed" }] },
                { options: [{ key: "filament_ramming_volumetric_speed_nc" }] },
                { options: [{ key: "filament_retract_length_nc" }] },
                { options: [{ key: "first_x_layer_fan_speed" }] },
                { options: [{ key: "inherits" }] },
                { options: [{ key: "volumetric_speed_coefficients" }] }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "machine",
      title: "Printer",
      pages: [
        {
          id: "basic-information",
          title: "Basic information",
          groups: [
            {
              id: "basic-information.printable-space",
              title: "Printable space",
              lines: [
                { options: [{ key: "printable_area" }], widget: "bedShape" },
                { options: [{ key: "parallel_printheads_count" }] },
                { options: [{ key: "bed_exclude_area" }], widget: "excludeArea" },
                { options: [{ key: "bed_exclude_volumes", fullWidth: true }] },
                { options: [{ key: "bed_exclude_volume_mode" }] },
                { options: [{ key: "printable_height" }] },
                { options: [{ key: "support_multi_bed_types" }] },
                { options: [{ key: "best_object_pos" }] },
                { options: [{ key: "z_offset" }] },
                { options: [{ key: "preferred_orientation" }] }
              ]
            },
            {
              id: "basic-information.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "printer_structure" }] },
                { options: [{ key: "gcode_flavor" }] },
                { options: [{ key: "gcode_skip_config_block" }] },
                { options: [{ key: "pellet_modded_printer" }] },
                { options: [{ key: "bbl_use_printhost" }] },
                { options: [{ key: "use_3mf" }] },
                { options: [{ key: "scan_first_layer" }] },
                { options: [{ key: "enable_power_loss_recovery" }] },
                { options: [{ key: "disable_m73" }] },
                { options: [{ key: "thumbnails", fullWidth: true }] },
                { options: [{ key: "use_relative_e_distances" }] },
                { options: [{ key: "use_firmware_retraction" }] },
                { options: [{ key: "time_cost" }] }
              ]
            },
            {
              id: "basic-information.plugin-configuration",
              title: "Plugin Configuration",
              lines: [
                { options: [{ key: "printer_plugin_config_overrides" }] }
              ]
            },
            {
              id: "basic-information.cooling-fan",
              title: "Cooling Fan",
              lines: [
                { options: [{ key: "fan_speedup_time" }, { key: "fan_speedup_overhangs" }], label: "Fan speed-up time", tooltip: "Start the fan this number of seconds earlier than its target start time (you can use fractional seconds). It assumes infinite acceleration for this time estimation, and will only take into account G1 and G0 moves (arc fitting is unsupported).\nIt won't move fan commands from custom G-code (they act as a sort of 'barrier').\nIt won't move fan commands into the start G-code if the 'only custom start G-code' is activated.\nUse 0 to deactivate." },
                { options: [{ key: "fan_kickstart" }] },
                { options: [{ key: "part_cooling_fan_min_pwm" }] }
              ]
            },
            {
              id: "basic-information.extruder-clearance",
              title: "Extruder Clearance",
              lines: [
                { options: [{ key: "extruder_clearance_radius" }] },
                { options: [{ key: "extruder_clearance_dist_to_rod" }] },
                { options: [{ key: "extruder_clearance_height_to_rod" }] },
                { options: [{ key: "extruder_clearance_height_to_lid" }] }
              ]
            },
            {
              id: "basic-information.adaptive-bed-mesh",
              title: "Adaptive bed mesh",
              lines: [
                { options: [{ key: "bed_mesh_min" }] },
                { options: [{ key: "bed_mesh_max" }] },
                { options: [{ key: "bed_mesh_probe_distance" }] },
                { options: [{ key: "adaptive_bed_mesh_margin" }] }
              ]
            },
            {
              id: "basic-information.accessory",
              title: "Accessory",
              lines: [
                { options: [{ key: "nozzle_type", index: 0 }] },
                { options: [{ key: "nozzle_hrc" }] },
                { options: [{ key: "auxiliary_fan" }] },
                { options: [{ key: "fan_direction" }] },
                { options: [{ key: "support_chamber_temp_control" }] },
                { options: [{ key: "support_air_filtration" }] },
                { options: [{ key: "cooling_filter_enabled" }] }
              ]
            }
          ]
        },
        {
          id: "machine-g-code",
          title: "Machine G-code",
          groups: [
            {
              id: "machine-g-code.file-header-g-code",
              title: "File header G-code",
              lines: [
                { options: [{ key: "file_start_gcode", fullWidth: true, code: true, height: 8 }] }
              ]
            },
            {
              id: "machine-g-code.machine-start-g-code",
              title: "Machine start G-code",
              lines: [
                { options: [{ key: "machine_start_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.machine-end-g-code",
              title: "Machine end G-code",
              lines: [
                { options: [{ key: "machine_end_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.printing-by-object-g-code",
              title: "Printing by object G-code",
              lines: [
                { options: [{ key: "printing_by_object_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.before-layer-change-g-code",
              title: "Before layer change G-code",
              lines: [
                { options: [{ key: "before_layer_change_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.layer-change-g-code",
              title: "Layer change G-code",
              lines: [
                { options: [{ key: "layer_change_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.timelapse-g-code",
              title: "Timelapse G-code",
              lines: [
                { options: [{ key: "time_lapse_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.clumping-detection-g-code",
              title: "Clumping Detection G-code",
              lines: [
                { options: [{ key: "wrapping_detection_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.change-filament-g-code",
              title: "Change filament G-code",
              lines: [
                { options: [{ key: "change_filament_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.change-extrusion-role-g-code",
              title: "Change extrusion role G-code",
              lines: [
                { options: [{ key: "change_extrusion_role_gcode", fullWidth: true, code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.pause-g-code",
              title: "Pause G-code",
              lines: [
                { options: [{ key: "machine_pause_gcode", code: true, height: 15 }] }
              ]
            },
            {
              id: "machine-g-code.template-custom-g-code",
              title: "Template Custom G-code",
              lines: [
                { options: [{ key: "template_custom_gcode", code: true, height: 15 }] }
              ]
            }
          ]
        },
        {
          id: "multimaterial",
          title: "Multimaterial",
          groups: [
            {
              id: "multimaterial.single-extruder-multi-material-setup",
              title: "Single extruder multi-material setup",
              lines: [
                { options: [{ key: "single_extruder_multi_material" }] },
                { options: [{ key: "extruders_count" }] },
                { options: [{ key: "manual_filament_change" }] },
                { options: [{ key: "bed_temperature_formula" }] }
              ]
            },
            {
              id: "multimaterial.wipe-tower",
              title: "Wipe tower",
              lines: [
                { options: [{ key: "wipe_tower_type" }] },
                { options: [{ key: "purge_in_prime_tower" }] },
                { options: [{ key: "enable_filament_ramming" }] },
                { options: [{ key: "tool_change_on_wipe_tower" }] },
                { options: [{ key: "wait_for_temp_on_wipe_tower" }] }
              ]
            },
            {
              id: "multimaterial.single-extruder-multi-material-parameters",
              title: "Single extruder multi-material parameters",
              lines: [
                { options: [{ key: "cooling_tube_retraction" }] },
                { options: [{ key: "cooling_tube_length" }] },
                { options: [{ key: "parking_pos_retraction" }] },
                { options: [{ key: "extra_loading_move" }] },
                { options: [{ key: "high_current_on_filament_swap" }] }
              ]
            },
            {
              id: "multimaterial.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "machine_load_filament_time" }] },
                { options: [{ key: "machine_unload_filament_time" }] },
                { options: [{ key: "machine_tool_change_time" }] }
              ]
            }
          ]
        },
        {
          id: "extruder",
          title: "Extruder",
          groups: [
            {
              id: "extruder.basic-information",
              title: "Basic information",
              lines: [
                { options: [{ key: "nozzle_diameter", index: "extruder" }] },
                { options: [{ key: "nozzle_volume", index: "extruder" }] },
                { options: [{ key: "extruder_printable_height", index: "extruder" }] },
                { options: [{ key: "extruder_printable_area", index: "extruder", fullWidth: true }] },
                { options: [{ key: "extruder_bed_exclude_volumes", index: "extruder", fullWidth: true }] }
              ]
            },
            {
              id: "extruder.layer-height-limits",
              title: "Layer height limits",
              lines: [
                { options: [{ key: "min_layer_height", index: "extruder" }] },
                { options: [{ key: "max_layer_height", index: "extruder" }] }
              ]
            },
            {
              id: "extruder.position",
              title: "Position",
              lines: [
                { options: [{ key: "extruder_offset", index: "extruder" }] }
              ]
            },
            {
              id: "extruder.retraction",
              title: "Retraction",
              lines: [
                { options: [{ key: "retraction_length", index: "extruder" }] },
                { options: [{ key: "retract_restart_extra", index: "extruder" }] },
                { options: [{ key: "retraction_speed", index: "extruder" }] },
                { options: [{ key: "deretraction_speed", index: "extruder" }] },
                { options: [{ key: "retraction_minimum_travel", index: "extruder" }] },
                { options: [{ key: "retract_when_changing_layer", index: "extruder" }] },
                { options: [{ key: "wipe", index: "extruder" }] },
                { options: [{ key: "wipe_distance", index: "extruder" }] },
                { options: [{ key: "retract_before_wipe", index: "extruder" }] },
                { options: [{ key: "retract_after_wipe", index: "extruder" }] }
              ]
            },
            {
              id: "extruder.z-hop",
              title: "Z-Hop",
              lines: [
                { options: [{ key: "retract_lift_enforce", index: "extruder" }] },
                { options: [{ key: "z_hop_types", index: "extruder" }] },
                { options: [{ key: "z_hop", index: "extruder" }] },
                { options: [{ key: "travel_slope", index: "extruder" }] },
                { options: [{ key: "retract_lift_above", index: "extruder" }] },
                { options: [{ key: "retract_lift_below", index: "extruder" }] }
              ]
            },
            {
              id: "extruder.retraction-when-switching-material",
              title: "Retraction when switching material",
              lines: [
                { options: [{ key: "retract_length_toolchange", index: "extruder" }] },
                { options: [{ key: "retract_restart_extra_toolchange", index: "extruder" }] },
                { options: [{ key: "long_retractions_when_cut", index: "extruder" }] },
                { options: [{ key: "retraction_distances_when_cut", index: "extruder" }] }
              ]
            }
          ],
          repeat: "extruder"
        },
        {
          id: "motion-ability",
          title: "Motion ability",
          groups: [
            {
              id: "motion-ability.advanced",
              title: "Advanced",
              lines: [
                { options: [{ key: "emit_machine_limits_to_gcode" }] }
              ]
            },
            {
              id: "motion-ability.resonance-compensation",
              title: "Resonance Compensation",
              lines: [
                { options: [{ key: "resonance_avoidance" }] },
                { options: [{ key: "min_resonance_avoidance_speed" }, { key: "max_resonance_avoidance_speed" }], label: "Resonance Avoidance Speed" },
                { options: [{ key: "input_shaping_emit" }] },
                { options: [{ key: "input_shaping_type" }] },
                { options: [{ key: "input_shaping_freq_x" }, { key: "input_shaping_freq_y" }], label: "Frequency", tooltip: "The frequency of the anti-vibration signal will correspond to the natural frequency of the frame." },
                { options: [{ key: "input_shaping_damp_x" }, { key: "input_shaping_damp_y" }], label: "Damping", tooltip: "Damping ratio for the input shaping filter." }
              ]
            },
            {
              id: "motion-ability.speed-limitation",
              title: "Speed limitation",
              lines: [
                { options: [{ key: "machine_max_speed_x", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_speed_y", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_speed_z", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_speed_e", index: 0 }], modeColumns: true }
              ]
            },
            {
              id: "motion-ability.acceleration-limitation",
              title: "Acceleration limitation",
              lines: [
                { options: [{ key: "machine_max_acceleration_x", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_y", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_z", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_e", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_extruding", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_retracting", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_acceleration_travel", index: 0 }], modeColumns: true }
              ]
            },
            {
              id: "motion-ability.jerk-limitation",
              title: "Jerk limitation",
              lines: [
                { options: [{ key: "machine_max_junction_deviation", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_jerk_x", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_jerk_y", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_jerk_z", index: 0 }], modeColumns: true },
                { options: [{ key: "machine_max_jerk_e", index: 0 }], modeColumns: true }
              ]
            }
          ],
          when: {
            key: "gcode_flavor",
            oneOf: [
              "marlin",
              "marlin2",
              "klipper",
              "reprapfirmware",
              "repetier"
            ]
          }
        },
        {
          id: "notes",
          title: "Notes",
          groups: [
            {
              id: "notes.notes",
              title: "Notes",
              lines: [
                { options: [{ key: "printer_notes", fullWidth: true, height: 25 }] }
              ]
            }
          ]
        },
        {
          id: "other",
          title: "Other",
          other: true,
          groups: [
            {
              id: "other.not-in-orca-tabs",
              title: "Other settings",
              lines: [
                { options: [{ key: "bed_custom_model" }] },
                { options: [{ key: "bed_custom_texture" }] },
                { options: [{ key: "default_bed_type" }] },
                { options: [{ key: "default_filament_profile" }] },
                { options: [{ key: "default_nozzle_volume_type" }] },
                { options: [{ key: "default_print_profile" }] },
                { options: [{ key: "deretract_speed_extruder_change" }] },
                { options: [{ key: "enable_long_retraction_when_cut" }] },
                { options: [{ key: "enable_pre_heating" }] },
                { options: [{ key: "extruder_colour" }] },
                { options: [{ key: "extruder_max_nozzle_count" }] },
                { options: [{ key: "extruder_type" }] },
                { options: [{ key: "extruder_variant_list" }] },
                { options: [{ key: "farthest_point_timelapse" }] },
                { options: [{ key: "flashforge_serial_number" }] },
                { options: [{ key: "grab_length" }] },
                { options: [{ key: "group_algo_with_time" }] },
                { options: [{ key: "head_wrap_detect_zone" }] },
                { options: [{ key: "host_type" }] },
                { options: [{ key: "hotend_cooling_rate" }] },
                { options: [{ key: "hotend_heating_rate" }] },
                { options: [{ key: "inherits" }] },
                { options: [{ key: "machine_bed_mass_Y" }] },
                { options: [{ key: "machine_hotend_change_time" }] },
                { options: [{ key: "machine_max_force_Y" }] },
                { options: [{ key: "machine_max_printed_mass" }] },
                { options: [{ key: "machine_min_extruding_rate" }] },
                { options: [{ key: "machine_min_travel_rate" }] },
                { options: [{ key: "machine_prepare_compensation_time" }] },
                { options: [{ key: "master_extruder_id" }] },
                { options: [{ key: "nozzle_flush_dataset" }] },
                { options: [{ key: "nozzle_height" }] },
                { options: [{ key: "parallel_printheads_bed_exclude_areas" }] },
                { options: [{ key: "physical_extruder_map" }] },
                { options: [{ key: "print_host" }] },
                { options: [{ key: "print_host_webui" }] },
                { options: [{ key: "printer_extruder_id" }] },
                { options: [{ key: "printer_extruder_variant" }] },
                { options: [{ key: "printer_model" }] },
                { options: [{ key: "printer_technology" }] },
                { options: [{ key: "printer_variant" }] },
                { options: [{ key: "printhost_apikey" }] },
                { options: [{ key: "printhost_authorization_type" }] },
                { options: [{ key: "printhost_cafile" }] },
                { options: [{ key: "printhost_password" }] },
                { options: [{ key: "printhost_port" }] },
                { options: [{ key: "printhost_ssl_ignore_revoke" }] },
                { options: [{ key: "printhost_user" }] },
                { options: [{ key: "silent_mode" }] },
                { options: [{ key: "support_cooling_filter" }] },
                { options: [{ key: "support_fast_purge_mode" }] },
                { options: [{ key: "support_object_skip_flush" }] },
                { options: [{ key: "support_parallel_printheads" }] },
                { options: [{ key: "thumbnails_format" }] },
                { options: [{ key: "upward_compatible_machine" }] },
                { options: [{ key: "wrapping_detection_layers" }] },
                { options: [{ key: "wrapping_exclude_area" }] }
              ]
            }
          ]
        }
      ]
    }
  ],
  plate: [
    { options: [{ key: "curr_bed_type" }] },
    { options: [{ key: "skirt_start_angle" }] },
    { options: [{ key: "print_sequence" }] },
    { options: [{ key: "spiral_mode" }] },
    { options: [{ key: "first_layer_sequence_choice" }] },
    { options: [{ key: "other_layers_sequence_choice" }] }
  ],
  excluded: {
    printer_agent: "Only OrcaSlicer desktop shows it (network printer agents)."
  },
  options: {
    accel_to_decel_enable: { type: "bool", label: "Enable accel_to_decel", mode: "advanced", scopes: ["process"], tooltip: "Klipper's max_accel_to_decel will be adjusted automatically.", category: "Speed", default: "1" },
    accel_to_decel_factor: { type: "percent", label: "accel_to_decel", mode: "advanced", scopes: ["process"], tooltip: "Klipper's max_accel_to_decel will be adjusted to this %% of acceleration.", unit: "%", category: "Speed", default: "50%", min: 1, max: 100 },
    activate_air_filtration: { type: "bools", label: "Activate air filtration", mode: "simple", scopes: ["filament"], tooltip: "Activate for better air filtration. G-code command: M106 P3 S(0-255)", default: ["0"], slots: "variant" },
    activate_air_filtration_during_print: { type: "bools", label: "During print", mode: "simple", scopes: ["filament"], tooltip: "Enable this to override the fan speed set in custom G-code during print.", default: ["1"], slots: "variant" },
    activate_air_filtration_on_completion: { type: "bools", label: "On completion", mode: "simple", scopes: ["filament"], tooltip: "Enable this to override the fan speed set in custom G-code after print completion.", default: ["1"], slots: "variant" },
    activate_chamber_temp_control: { type: "bools", label: "Activate temperature control", mode: "simple", scopes: ["filament"], tooltip: 'Enable this option for automated chamber temperature control. This option activates the emitting of an M191 command before the "machine_start_gcode"\n which sets the chamber temperature and waits until it is reached. In addition, it emits an M141 command at the end of the print to turn off the chamber heater, if present.\n\nThis option relies on the firmware supporting the M191 and M141 commands either via macros or natively and is usually used when an active chamber heater is installed.', default: ["0"], slots: "filament" },
    adaptive_bed_mesh_margin: { type: "float", label: "Mesh margin", mode: "advanced", scopes: ["machine"], tooltip: "This option determines the additional distance by which the adaptive bed mesh area should be expanded in the XY directions.", unit: "mm", default: "0" },
    adaptive_pressure_advance: { type: "bools", label: "Enable adaptive pressure advance (beta)", mode: "advanced", scopes: ["filament"], tooltip: "With increasing print speeds (and hence increasing volumetric flow through the nozzle) and increasing accelerations, it has been observed that the effective PA value typically decreases. This means that a single PA value is not always 100% optimal for all features and a compromise value is usually used that does not cause too much bulging on features with lower flow speed and accelerations while also not causing gaps on faster features.\n\nThis feature aims to address this limitation by modeling the response of your printer's extrusion system depending on the volumetric flow speed and acceleration it is printing at. Internally, it generates a fitted model that can extrapolate the needed pressure advance for any given volumetric flow speed and acceleration, which is then emitted to the printer depending on the current print conditions.\n\nWhen enabled, the pressure advance value above is overridden. However, a reasonable default value above is strongly recommended to act as a fallback and for when tool changing.\n\n", default: ["0"], slots: "filament" },
    adaptive_pressure_advance_bridges: { type: "floats", label: "Static pressure advance for bridges", mode: "advanced", scopes: ["filament"], tooltip: "Static pressure advance value for bridges. Set to 0 to apply the same pressure advance as \nequivalent walls (using adaptive settings if enabled).\n\nA lower PA value when printing bridges helps reduce the appearance of slight under-extrusion immediately after bridges. This is caused by the pressure drop in the nozzle when printing in the air and a lower PA helps counteract this.", default: ["0"], max: 2, slots: "filament" },
    adaptive_pressure_advance_model: { type: "strings", label: "Adaptive pressure advance measurements (beta)", mode: "advanced", scopes: ["filament"], tooltip: "Add sets of pressure advance (PA) values, the volumetric flow speeds and accelerations they were measured at, separated by a comma. One set of values per line. For example\n0.04,3.96,3000\n0.033,3.96,10000\n0.029,7.91,3000\n0.026,7.91,10000\n\nHow to calibrate:\n1. Run the pressure advance test for at least 3 speeds per acceleration value. It is recommended that the test is run for at least the speed of the external perimeters, the speed of the internal perimeters and the fastest feature print speed in your profile (usually its the sparse or solid infill). Then run them for the same speeds for the slowest and fastest print accelerations, and no faster than the recommended maximum acceleration as given by the Klipper input shaper\n2. Take note of the optimal PA value for each volumetric flow speed and acceleration. You can find the flow number by selecting flow from the color scheme drop down and move the horizontal slider over the PA pattern lines. The number should be visible at the bottom of the page. The ideal PA value should be decreasing the higher the volumetric flow is. If it is not, confirm that your extruder is functioning correctly. The slower and with less acceleration you print, the larger the range of acceptable PA values. If no difference is visible, use the PA value from the faster test\n3. Enter the triplets of PA values, Flow and Accelerations in the text box here and save your filament profile.", default: ["0,0,0\n0,0,0"], multiline: true, fullWidth: true, height: 15, slots: "filament" },
    adaptive_pressure_advance_overhangs: { type: "bools", label: "Enable adaptive pressure advance within features (beta)", mode: "advanced", scopes: ["filament"], tooltip: "Enable adaptive PA whenever there are flow changes in a feature, such as line width changes in a corner or overhangs.\n\nNot compatible with Prusa printers as they pause to process PA changes, which causes delays and defects.\n\nThis is an experimental option, as if the PA profile is not set accurately, it will cause uniformity issues.", default: ["0"], slots: "filament" },
    additional_cooling_fan_speed: { type: "ints", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "Speed of auxiliary part cooling fan. Auxiliary fan will run at this speed during printing except the first several layers which is defined by no cooling layers.\nPlease enable auxiliary_fan in printer settings to use this feature. G-code command: M106 P2 S(0-255)", unit: "%", default: ["0"], min: 0, max: 100, slots: "filament" },
    additional_fan_full_speed_layer: { type: "ints", label: "Full fan speed at layer", mode: "simple", scopes: ["filament"], tooltip: 'Auxiliary fan speed will be ramped up linearly from layer "For the first" to maximum at layer "Full fan speed at layer".\n"Full fan speed at layer" will be ignored if lower than "For the first", in which case the fan will run at maximum allowed speed at layer "For the first" + 1.', default: ["0"], min: 0, max: 1e3, slots: "filament" },
    align_infill_direction_to_model: { type: "bool", label: "Align directions to model", mode: "advanced", scopes: ["process"], tooltip: "Aligns infill, bridge, ironing, and top/bottom surface directions to follow the model's orientation on the build plate.\nWhen enabled, these directions rotate together with the model so the printed features keep their intended orientation relative to the part, preserving optimal strength and surface characteristics regardless of how the model is placed.", category: "Strength", default: "0", perObject: "region" },
    alternate_extra_wall: { type: "bool", label: "Alternate extra wall", mode: "advanced", scopes: ["process"], tooltip: "This setting adds an extra wall to every other layer. This way the infill gets wedged vertically between the walls, resulting in stronger prints.\n\nWhen this option is enabled, the ensure vertical shell thickness option needs to be disabled.\n\nUsing lightning infill together with this option is not recommended as there is limited infill to anchor the extra perimeters to.", category: "Strength", default: "0", perObject: "region" },
    auxiliary_fan: { type: "bool", label: "Auxiliary part cooling fan", mode: "advanced", scopes: ["machine"], tooltip: "Enable this option if machine has auxiliary part cooling fan. G-code command: M106 P2 S(0-255).", default: "0" },
    bbl_calib_mark_logo: { type: "bool", label: "Show auto-calibration marks", mode: "advanced", default: "1" },
    bbl_use_printhost: { type: "bool", label: "Use 3rd-party print host", mode: "advanced", scopes: ["machine"], tooltip: "Allow controlling BambuLab's printer through 3rd party print hosts.", default: "0" },
    bed_custom_model: { type: "string", label: "Bed custom model", mode: "advanced", scopes: ["machine"], default: "", gui: "one_string" },
    bed_custom_texture: { type: "string", label: "Bed custom texture", mode: "advanced", scopes: ["machine"], default: "", gui: "one_string" },
    bed_exclude_area: { type: "points", label: "Excluded bed area (legacy)", mode: "advanced", scopes: ["machine"], tooltip: 'Unprintable area in XY plane. For example, X1 Series printers use the front left corner to cut filament during filament change. The area is expressed as a polygon in the format "XxY, XxY, ...". Legacy areas constrain model placement, but do not check or reroute machine travel. Configure exclusion volumes below for full collision checking.', default: ["0x0"], gui: "one_string", slots: "list" },
    bed_exclude_volume_mode: { type: "enum", label: "Exclusion volume behaviour", mode: "advanced", scopes: ["machine"], tooltip: "Choose whether all nozzles use the same exclusion volumes, derive toolhead-relative volumes from each nozzle's XY offset, or configure independent volumes for every extruder.", default: "shared", enumValues: ["shared", "toolhead_offset", "per_extruder"], enumLabels: ["Shared", "Toolhead-relative (nozzle offsets)", "Individual per extruder"] },
    bed_exclude_volumes: { type: "string", label: "Exclusion volumes", mode: "advanced", scopes: ["machine"], tooltip: 'Collision volumes used for model and generated-material exclusion, G-code checking, and travel avoidance. Use "XxY, XxY, ..." for a full-height polygon or "ZMIN..ZMAX;XxY, XxY, ..." for a Z-limited volume. Separate multiple volumes with "|". These volumes are additional to any legacy excluded bed area.', default: "", gui: "one_string" },
    bed_mesh_max: { type: "point", label: "Bed mesh max", mode: "advanced", scopes: ["machine"], tooltip: "This option sets the max point for the allowed bed mesh area. Due to the probe's XY offset, most printers are unable to probe the entire bed. To ensure the probe point does not go outside the bed area, the minimum and maximum points of the bed mesh should be set appropriately. OrcaSlicer ensures that adaptive_bed_mesh_min/adaptive_bed_mesh_max values do not exceed these min/max points. This information can usually be obtained from your printer manufacturer. The default setting is (99999, 99999), which means there are no limits, thus allowing probing across the entire bed.", unit: "mm", default: "99999,99999" },
    bed_mesh_min: { type: "point", label: "Bed mesh min", mode: "advanced", scopes: ["machine"], tooltip: "This option sets the min point for the allowed bed mesh area. Due to the probe's XY offset, most printers are unable to probe the entire bed. To ensure the probe point does not go outside the bed area, the minimum and maximum points of the bed mesh should be set appropriately. OrcaSlicer ensures that adaptive_bed_mesh_min/adaptive_bed_mesh_max values do not exceed these min/max points. This information can usually be obtained from your printer manufacturer. The default setting is (-99999, -99999), which means there are no limits, thus allowing probing across the entire bed.", unit: "mm", default: "-99999,-99999" },
    bed_mesh_probe_distance: { type: "point", label: "Probe point distance", mode: "advanced", scopes: ["machine"], tooltip: "This option sets the preferred distance between probe points (grid size) for the X and Y directions, with the default being 50mm for both X and Y.", unit: "mm", default: "50,50", min: 0 },
    bed_temperature_formula: { type: "enum", label: "Bed temperature type", mode: "advanced", scopes: ["machine"], tooltip: "This option determines how the bed temperature is set during slicing: based on the temperature of the first filament or the highest temperature of the printed filaments.", default: "by_highest_temp", enumValues: ["by_first_filament", "by_highest_temp"], enumLabels: ["By First filament", "By Highest Temp"] },
    before_layer_change_gcode: { type: "string", label: "Before layer change G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code is inserted at every layer change before the Z lift.", default: "", multiline: true, fullWidth: true, height: 5 },
    best_object_pos: { type: "point", label: "Best object position", mode: "advanced", scopes: ["machine"], tooltip: "Best auto arranging position in range [0,1] w.r.t. bed shape.", default: "0.5,0.5" },
    bottom_layer_direction: { type: "float", label: "Bottom layer direction", mode: "simple", scopes: ["process"], tooltip: "Fixed angle for the bottom solid infill lines.\nSet to -1 to follow the default solid infill direction.", unit: "°", category: "Strength", default: "-1", min: -1, max: 360, perObject: "region" },
    bottom_shell_layers: { type: "int", label: "Bottom shell layers", mode: "simple", scopes: ["process"], tooltip: "This is the number of solid layers of bottom shell, including the bottom surface layer. When the thickness calculated by this value is thinner than bottom shell thickness, the bottom shell layers will be increased.", unit: "layers", category: "Strength", default: "3", min: 0, perObject: "region" },
    bottom_shell_thickness: { type: "float", label: "Bottom shell thickness", mode: "simple", scopes: ["process"], tooltip: "The number of bottom solid layers is increased when slicing if the thickness calculated by bottom shell layers is thinner than this value. This can avoid having too thin a shell when layer height is small. 0 means that this setting is disabled and the thickness of the bottom shell is determined simply by the number of bottom shell layers.", unit: "mm", category: "Strength", default: "0", min: 0, perObject: "region" },
    bottom_solid_infill_flow_ratio: { type: "float", label: "Bottom surface flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for bottom solid infill.\n\nThe actual bottom solid infill flow used is calculated by multiplying this value with the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    bottom_surface_density: { type: "percent", label: "Bottom surface density", mode: "simple", scopes: ["process"], tooltip: "Density of the bottom surface layer. Intended for aesthetic or functional purposes, not to fix issues such as over-extrusion.\nWARNING: Lowering this value may negatively affect bed adhesion.", unit: "%", category: "Strength", default: "100%", min: 10, max: 100, perObject: "region" },
    bottom_surface_filament_id: { type: "int", label: "Bottom surface", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print bottom surface.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    bottom_surface_fill_order: { type: "enum", label: "Bottom surface fill order", mode: "advanced", scopes: ["process"], tooltip: "Direction in which bottom surfaces are filled when using a center-based pattern (Concentric, Spiral Inset, Archimedean Chords, Octagram Spiral).\nInward starts each surface with the wider outer curves, which improves first layer adhesion on build plates where the tight curves at the center may not stick. Outward starts at the center, pushing any excess material towards the edge.\nDefault uses shortest-path ordering, which may run in either direction.", category: "Strength", default: "default", enumValues: ["default", "outward", "inward"], enumLabels: ["Default", "Outward", "Inward"], perObject: "region" },
    bottom_surface_pattern: { type: "enum", label: "Bottom surface pattern", mode: "simple", scopes: ["process"], tooltip: "This is the line pattern of bottom surface infill, not including bridge infill.", category: "Strength", default: "monotonic", enumValues: ["monotonic", "monotonicline", "rectilinear", "alignedrectilinear", "concentric", "spiralinset", "hilbertcurve", "archimedeanchords", "octagramspiral"], enumLabels: ["Monotonic", "Monotonic line", "Rectilinear", "Aligned Rectilinear", "Concentric", "Spiral Inset", "Hilbert Curve", "Archimedean Chords", "Octagram Spiral"], perObject: "region" },
    bridge_acceleration: { type: "floatsOrPercents", label: "Bridge", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of bridges. If the value is expressed as a percentage (e.g. 50%), it will be calculated based on the outer wall acceleration.", unit: "mm/s² or %", category: "Speed", default: ["50%"], min: 0, ratioOver: "outer_wall_acceleration", nullable: true, slots: "variant", perObject: "object" },
    bridge_angle: { type: "float", label: "External bridge infill direction", mode: "advanced", scopes: ["process"], tooltip: "External Bridging angle override.\nIf left to zero, the bridging angle will be calculated automatically for each specific bridge.\nOtherwise the provided angle will be used according to:\n - The absolute coordinates\n - The absolute coordinates + Model rotation: If Align directions to model is enabled\n - The optimal automatic angle + this value: If 'Relative Bridge Angle' is enabled\n\nUse 180° for zero absolute angle.", unit: "°", category: "Strength", default: "0", min: 0, max: 180, perObject: "region" },
    bridge_density: { type: "percent", label: "External bridge density", mode: "advanced", scopes: ["process"], tooltip: "Controls the density (spacing) of external bridge lines.\nTheoretically, 100% means a solid bridge, but due to the tendency of bridge extrusions to sag, 100% may not be sufficient.\n\n- Higher than 100% density (Recommended Max 125%):\n  - Pros: Produces smoother bridge surfaces, as overlapping lines provide additional support during printing.\n  - Cons: Can cause overextrusion, which may reduce lower and upper surface quality and increase the risk of warping.\n\n- Lower than 100% density (Min 10%):\n  - Pros: Can create a string-like first layer. Faster and with better cooling because there is more space for air to circulate around the extruded bridge.\n  - Cons: May lead to sagging and poorer surface finish.", unit: "%", category: "Strength", default: "100%", min: 10, max: 125, perObject: "region" },
    bridge_flow: { type: "float", label: "Bridge flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This value governs the thickness of the external (visible) bridge layer.\nValues above 1.0: Increase the amount of material while maintaining line spacing. This can improve line contact and strength.\nValues below 1.0: Reduce the amount of material while adjusting line spacing to maintain contact. This can improve sagging.\n\nThe actual bridge flow used is calculated by multiplying this value with the filament flow ratio, and if set, the object's flow ratio.", category: "Quality", default: "1", min: 0, max: 2, perObject: "region" },
    bridge_line_width: { type: "floatOrPercent", label: "Bridge", mode: "advanced", scopes: ["process"], tooltip: "Line width of the Bridge. If expressed as a %, it will be computed over the nozzle diameter.\nRecommended to use with a higher Bridge density or Bridge flow ratio.\n\nThe maximum value is 100% or the nozzle diameter.\nIf set to 0, the line width will match the Internal solid infill width.", unit: "mm or %", category: "Quality", default: "100%", min: 0, max: 100, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    bridge_no_support: { type: "bool", label: "Don't support bridges", mode: "advanced", scopes: ["process"], tooltip: "This disables supporting bridges, which decreases the amount of support required. Bridges can usually be printed directly without support over a reasonable distance.", category: "Support", default: "0", perObject: "object" },
    bridge_speed: { type: "floats", label: "External", mode: "advanced", scopes: ["process"], tooltip: "Speed of the externally visible bridge extrusions.\n\nIn addition, if Slow down for curled perimeters is disabled or Classic overhang mode is enabled, it will be the print speed of overhang walls that are supported by less than 13%, whether they are part of a bridge or an overhang.", unit: "mm/s", category: "Speed", default: ["25"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    brim_ears: { type: "bool", label: "Brim ears", mode: "advanced", tooltip: "Only draw brim over the sharp edges of the model.", category: "Support", default: "0" },
    brim_ears_detection_length: { type: "float", label: "Brim ear detection radius", mode: "advanced", scopes: ["process"], tooltip: "The geometry will be decimated before detecting sharp angles. This parameter indicates the minimum length of the deviation for the decimation.\n0 to deactivate.", unit: "mm", category: "Support", default: "1", min: 0, perObject: "object" },
    brim_ears_max_angle: { type: "float", label: "Brim ear max angle", mode: "advanced", scopes: ["process"], tooltip: "Maximum angle to let a brim ear appear.\nIf set to 0, no brim will be created.\nIf set to ~180, brim will be created on everything but straight sections.", unit: "°", category: "Support", default: "125", min: 0, max: 180, perObject: "object" },
    brim_ears_outer_only: { type: "bool", label: "Brim ears outer only", mode: "advanced", scopes: ["process"], tooltip: "Generate mouse ears only on the outer contour of the model, excluding holes and enclosed sections.", category: "Support", default: "0", perObject: "object" },
    brim_flow_ratio: { type: "float", label: "Brim flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for brims.\n\nThe actual brim flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.\n\nNote: The resulting value will not be affected by the first-layer flow ratio.", category: "Support", default: "1", min: 0, max: 2, perObject: "object" },
    brim_object_gap: { type: "float", label: "Brim-object gap", mode: "advanced", scopes: ["process"], tooltip: "This creates a gap between the innermost brim line and the object and can make the brim easier to remove.", unit: "mm", category: "Support", default: "0", min: 0, max: 2, perObject: "object" },
    brim_type: { type: "enum", label: "Brim type", mode: "simple", scopes: ["process"], tooltip: "This controls the generation of the brim at outer and/or inner side of models. Auto means the brim width is analyzed and calculated automatically.", category: "Support", default: "auto_brim", enumValues: ["auto_brim", "brim_ears", "painted", "outer_only", "inner_only", "outer_and_inner", "no_brim"], enumLabels: ["Auto", "Mouse ear", "Painted", "Outer brim only", "Inner brim only", "Outer and inner brim", "No-brim"], perObject: "object" },
    brim_use_efc_outline: { type: "bool", label: "Brim follows compensated outline", mode: "advanced", scopes: ["process"], tooltip: "When enabled, the brim is aligned with the first-layer perimeter geometry after Elephant Foot Compensation is applied.\nThis option is intended for cases where Elephant Foot Compensation significantly alters the first-layer footprint.\n\nIf your current setup already works well, enabling it may be unnecessary and can cause the brim to fuse with upper layers.", category: "Support", default: "0", perObject: "object" },
    brim_width: { type: "float", label: "Brim width", mode: "simple", scopes: ["process"], tooltip: "This is the distance from the model to the outermost brim line.", unit: "mm", category: "Support", default: "0", min: 0, max: 100, perObject: "object" },
    calib_flowrate_topinfill_special_order: { type: "bool", label: "calib_flowrate_topinfill_special_order", mode: "develop", scopes: ["process"], default: "0", perObject: "object" },
    center_of_surface_pattern: { type: "enum", label: "Center surface pattern on", mode: "expert", scopes: ["process"], tooltip: "Chooses where the centering point of centered top/bottom surface patterns (Archimedean Chords, Octagram Spiral) is placed.\n - Each Surface: centers the pattern on every individual surface region, so each island is symmetric on its own.\n - Each Model: centers the pattern on each connected body. Parts that touch or overlap share one center; parts detached from the rest each get their own.\n - Each Assembly: uses a single shared center for the whole object or assembly.", category: "Strength", default: "each_surface", enumValues: ["each_surface", "each_model", "each_assembly"], enumLabels: ["Each Surface", "Each Model", "Each Assembly"], perObject: "region" },
    chamber_minimal_temperature: { type: "ints", label: "Minimal", mode: "simple", scopes: ["filament"], fullLabel: "Chamber minimal temperature", tooltip: 'This is the chamber temperature at which printing should start, while the chamber continues heating toward the "Target" chamber temperature. For example, set the Target to 60 and the Minimal to 50 to begin printing once the chamber reaches 50℃, without waiting for the full 60℃.\n\nIt sets a G-code variable named chamber_minimal_temperature, which can be passed to your print start macro or a heat soak macro, like this: PRINT_START (other variables) CHAMBER_MIN_TEMP=[chamber_minimal_temperature].\n\nUnlike the "Target" chamber temperature, this option does not emit any M141/M191 commands; it only exposes the value to your custom G-code. It should not exceed the "Target" chamber temperature.', unit: "℃", default: ["0"], min: 0, max: 1500, slots: "filament" },
    chamber_temperature: { type: "ints", label: "Chamber temperature", mode: "simple", scopes: ["filament"], tooltip: "For high-temperature materials like ABS, ASA, PC, and PA, a higher chamber temperature can help suppress or reduce warping and potentially lead to higher interlayer bonding strength. However, at the same time, a higher chamber temperature will reduce the efficiency of air filtration for ABS and ASA.\n\nFor PLA, PETG, TPU, PVA, and other low-temperature materials, this option should be disabled (set to 0) as the chamber temperature should be low to avoid extruder clogging caused by material softening at the heat break.\n\nIf enabled, this parameter also sets a G-code variable named chamber_temperature, which can be used to pass the desired chamber temperature to your print start macro, or a heat soak macro like this: PRINT_START (other variables) CHAMBER_TEMP=[chamber_temperature]. This may be useful if your printer does not support M141/M191 commands, or if you desire to handle heat soaking in the print start macro if no active chamber heater is installed.", unit: "℃", default: ["0"], min: 0, max: 1500, slots: "filament" },
    change_extrusion_role_gcode: { type: "string", label: "Change extrusion role G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code is inserted when the extrusion role is changed.", default: "", multiline: true, fullWidth: true, height: 5 },
    change_filament_gcode: { type: "string", label: "Change filament G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code is inserted when filament is changed, including T commands to trigger tool change.", default: "", multiline: true, fullWidth: true, height: 5 },
    close_additional_fan_first_x_layers: { type: "ints", label: "For the first", mode: "simple", scopes: ["filament"], tooltip: "Set special auxiliary cooling fan for the first certain layers.", unit: "layers", default: ["1"], min: 0, max: 1e3, slots: "filament" },
    close_fan_the_first_x_layers: { type: "ints", label: "No cooling for the first", mode: "simple", scopes: ["filament"], tooltip: "Turn off all cooling fans for the first few layers. This can be used to improve build plate adhesion.", unit: "layers", default: ["1"], min: 0, max: 1e3, slots: "filament" },
    combine_brims: { type: "bool", label: "Combine brims", mode: "advanced", scopes: ["process"], tooltip: "Combine multiple brims into one when they are close to each other. This can improve brim adhesion.", category: "Support", default: "0" },
    compatible_machine_expression_group: { type: "strings", label: "compatible_machine_expression_group", mode: "simple", default: [], slots: "list" },
    compatible_printers: { type: "strings", label: "Select printers", mode: "advanced", scopes: ["process", "filament"], default: [], slots: "list" },
    compatible_printers_condition: { type: "string", label: "Condition", mode: "advanced", scopes: ["process", "filament"], tooltip: "A Boolean expression using the configuration values of an active printer profile. If this expression evaluates to true, this profile is considered compatible with the active printer profile.", default: "" },
    compatible_prints: { type: "strings", label: "Select profiles", mode: "advanced", scopes: ["filament"], default: [], slots: "list" },
    compatible_prints_condition: { type: "string", label: "Condition", mode: "advanced", scopes: ["filament"], tooltip: "A Boolean expression using the configuration values of an active print profile. If this expression evaluates to true, this profile is considered compatible with the active print profile.", default: "" },
    compatible_process_expression_group: { type: "strings", label: "compatible_process_expression_group", mode: "simple", default: [], slots: "list" },
    complete_print_exhaust_fan_speed: { type: "ints", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "Speed of exhaust fan after printing completes.", unit: "%", default: ["80"], min: 0, max: 100, slots: "variant" },
    cool_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the Cool Plate.", unit: "℃", default: ["35"], min: 0, max: 300, slots: "filament" },
    cool_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the Cool Plate.", unit: "℃", default: ["35"], min: 0, max: 120, slots: "filament" },
    cooling_filter_enabled: { type: "bool", label: "Use cooling filter", mode: "advanced", scopes: ["machine"], tooltip: "Enable this if printer support cooling filter", default: "0" },
    cooling_tube_length: { type: "float", label: "Cooling tube length", mode: "advanced", scopes: ["machine"], tooltip: "Length of the cooling tube to limit space for cooling moves inside it.", unit: "mm", default: "5", min: 0 },
    cooling_tube_retraction: { type: "float", label: "Cooling tube position", mode: "advanced", scopes: ["machine"], tooltip: "Distance of the center-point of the cooling tube from the extruder tip.", unit: "mm", default: "91.5", min: 0 },
    counterbore_hole_bridging: { type: "enum", label: "Bridge counterbore holes", mode: "advanced", scopes: ["process"], tooltip: "This option creates bridges for counterbore holes, allowing them to be printed without support. Available modes include:\n1. None: No bridge is created\n2. Partially Bridged: Only a part of the unsupported area will be bridged\n3. Sacrificial Layer: A full sacrificial bridge layer is created", category: "Quality", default: "none", enumValues: ["none", "partiallybridge", "sacrificiallayer"], enumLabels: ["None", "Partially bridged", "Sacrificial layer"], perObject: "region" },
    curr_bed_type: { type: "enum", label: "Bed type", mode: "simple", tooltip: "Plate types supported by the printer", default: "Cool Plate", enumValues: ["Cool Plate", "Engineering Plate", "High Temp Plate", "Textured PEI Plate", "Textured Cool Plate", "Supertack Plate"], enumLabels: ["Smooth Cool Plate", "Engineering Plate", "Smooth High Temp Plate", "Textured PEI Plate", "Textured Cool Plate", "Cool Plate (SuperTack)"] },
    default_acceleration: { type: "floats", label: "Normal printing", mode: "advanced", scopes: ["process"], tooltip: "This is the default acceleration for both normal printing and travel after the first layer.", unit: "mm/s²", category: "Speed", default: ["500"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    default_bed_type: { type: "string", label: "Default bed type", mode: "advanced", scopes: ["machine"], tooltip: "Default bed type for the printer (supports both numeric and string format).", default: "" },
    default_filament_colour: { type: "strings", label: "Default color", mode: "advanced", scopes: ["filament"], tooltip: "Default filament color.\nRight click to reset value to system default.", default: [""], gui: "color", slots: "filament" },
    default_filament_profile: { type: "strings", label: "Default filament profile", mode: "simple", scopes: ["machine"], tooltip: "Default filament profile when switching to this machine profile.", default: [], slots: "extruder" },
    default_jerk: { type: "floats", label: "Default", mode: "advanced", scopes: ["process"], tooltip: "Default jerk.", unit: "mm/s", category: "Speed", default: ["0"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    default_junction_deviation: { type: "floats", label: "Junction Deviation", mode: "advanced", scopes: ["process"], tooltip: "Marlin Firmware Junction Deviation (replaces the traditional XY Jerk setting).", unit: "mm", category: "Speed", default: ["0"], min: 0, max: 0.3, nullable: true, slots: "variant", perObject: "object" },
    default_nozzle_volume_type: { type: "enums", label: "Default Nozzle Volume Type.", mode: "develop", scopes: ["machine"], tooltip: "Default Nozzle volume type for extruders in this printer.", default: ["Standard"], enumValues: ["Standard", "High Flow", "Hybrid", "TPU High Flow"], slots: "extruder" },
    default_print_profile: { type: "string", label: "Default process profile", mode: "simple", scopes: ["machine"], tooltip: "Default process profile when switching to this machine profile.", default: "" },
    deretract_speed_extruder_change: { type: "floats", label: "Deretraction speed (extruder change)", mode: "develop", scopes: ["machine"], tooltip: "Speed for reloading filament into the nozzle when switching extruder.", unit: "mm/s", default: ["0"], nullable: true, slots: "extruder" },
    deretraction_speed: { type: "floats", label: "Deretraction speed", mode: "advanced", scopes: ["machine"], tooltip: "Speed for reloading filament into the nozzle. Zero means same speed of retraction.", unit: "mm/s", default: ["0"], slots: "variant" },
    detect_narrow_internal_solid_infill: { type: "bool", label: "Detect narrow internal solid infills", mode: "advanced", scopes: ["process"], tooltip: "This option will auto-detect narrow internal solid infill areas. If enabled, the concentric pattern will be used for the area to speed up printing. Otherwise, the rectilinear pattern will be used by default.", category: "Strength", default: "1", perObject: "object" },
    detect_overhang_wall: { type: "bool", label: "Detect overhang walls", mode: "advanced", scopes: ["process"], tooltip: "This detects the overhang percentage relative to line width and uses a different speed to print. For 100%% overhang, bridging speed is used.", category: "Quality", default: "1", perObject: "region" },
    detect_thin_wall: { type: "bool", label: "Detect thin walls", mode: "advanced", scopes: ["process"], tooltip: "This detects thin walls which can’t contain two lines and uses a single line to print. It may not print as well because it’s not a closed loop.", category: "Strength", default: "0", perObject: "region" },
    different_settings_to_system: { type: "strings", label: "different_settings_to_system", mode: "simple", default: [], slots: "list" },
    disable_m73: { type: "bool", label: "Disable set remaining print time", mode: "advanced", scopes: ["machine"], tooltip: "Disable generating of the M73: Set remaining print time in the final G-code.", default: "0" },
    dont_filter_internal_bridges: { type: "enum", label: "Filter out small internal bridges", mode: "advanced", scopes: ["process"], tooltip: "This option can help reduce pillowing on top surfaces in heavily slanted or curved models.\nBy default, small internal bridges are filtered out and the internal solid infill is printed directly over the sparse infill. This works well in most cases, speeding up printing without too much compromise on top surface quality.\nHowever, in heavily slanted or curved models, especially where too low a sparse infill density is used, this may result in curling of the unsupported solid infill, causing pillowing.\nEnabling limited filtering or no filtering will print internal bridge layer over slightly unsupported internal solid infill. The options below control the sensitivity of the filtering, i.e. they control where internal bridges are created:\n1. Filter - enables this option. This is the default behavior and works well in most cases\n2. Limited filtering - creates internal bridges on heavily slanted surfaces while avoiding unnecessary bridges. This works well for most difficult models\n3. No filtering - creates internal bridges on every potential internal overhang. This option is useful for heavily slanted top surface models; however, in most cases, it creates too many unnecessary bridges.", category: "Quality", default: "disabled", enumValues: ["disabled", "limited", "nofilter"], enumLabels: ["Filter", "Limited filtering", "No filtering"], perObject: "object" },
    dont_slow_down_outer_wall: { type: "bools", label: "Don't slow down outer walls", mode: "simple", scopes: ["filament"], tooltip: "If enabled, this setting will ensure external perimeters are not slowed down to meet the minimum layer time. This is particularly helpful in the below scenarios:\n1. To avoid changes in shine when printing glossy filaments\n2. To avoid changes in external wall speed which may create slight wall artifacts that appear like Z banding\n3. To avoid printing at speeds which cause VFAs (fine artifacts) on the external walls", default: ["0"], slots: "filament" },
    draft_shield: { type: "enum", label: "Draft shield", mode: "advanced", scopes: ["process"], tooltip: "A draft shield is useful to protect an ABS or ASA print from warping and detaching from print bed due to wind draft. It is usually needed only with open frame printers, i.e. without an enclosure.\n\nEnabled = skirt is as tall as the highest printed object. Otherwise 'Skirt height' is used.\nNote: With the draft shield active, the skirt will be printed at skirt distance from the object. Therefore, if brims are active it may intersect with them. To avoid this, increase the skirt distance value.\n", default: "disabled", enumValues: ["disabled", "enabled"], enumLabels: ["Disabled", "Enabled"] },
    during_print_exhaust_fan_speed: { type: "ints", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "Speed of exhaust fan during printing. This speed will override the speed in filament custom G-code.", unit: "%", default: ["60"], min: 0, max: 100, slots: "variant" },
    elefant_foot_compensation: { type: "float", label: "Elephant foot compensation", mode: "advanced", scopes: ["process"], tooltip: "This shrinks the first layer on the build plate to compensate for elephant foot effect.", unit: "mm", category: "Quality", default: "0", min: 0, perObject: "object" },
    elefant_foot_compensation_layers: { type: "int", label: "Elephant foot compensation layers", mode: "advanced", scopes: ["process"], tooltip: "The number of layers on which the elephant foot compensation will be active. The first layer will be shrunk by the elephant foot compensation value, then the next layers will be linearly shrunk less, up to the layer indicated by this value.", unit: "layers", category: "Quality", default: "1", min: 1, perObject: "object" },
    elefant_foot_layers_density: { type: "percent", label: "Elephant foot layers density", mode: "expert", scopes: ["process"], tooltip: "Density of internal solid infill for Elephant foot layers compensation.\nThe initial value for the second layer is set.\nSubsequent layers become linearly denser by the height specified in elefant_foot_compensation_layers.", unit: "%", category: "Quality", default: "100%", min: 50, max: 100, perObject: "object" },
    emit_machine_limits_to_gcode: { type: "bool", label: "Emit limits to G-code", mode: "advanced", scopes: ["machine"], tooltip: "If enabled, the machine limits will be emitted to G-code file.\nThis option will be ignored if the G-code flavor is set to Klipper.", category: "Machine limits", default: "1" },
    enable_arc_fitting: { type: "bool", label: "Arc fitting", mode: "advanced", scopes: ["process"], tooltip: "Enable this to get a G-code file which has G2 and G3 moves. The fitting tolerance is same as the resolution.\n\nNote: For Klipper machines, this option is recommended to be disabled. Klipper does not benefit from arc commands as these are split again into line segments by the firmware. This results in a reduction in surface quality as line segments are converted to arcs by the slicer and then back to line segments by the firmware.", default: "0" },
    enable_extra_bridge_layer: { type: "enum", label: "Extra bridge layers (beta)", mode: "advanced", scopes: ["process"], tooltip: "This option enables the generation of an extra bridge layer over internal and/or external bridges.\n\nExtra bridge layers help improve bridge appearance and reliability, as the solid infill is better supported. This is especially useful in fast printers, where the bridge and solid infill speeds vary greatly. The extra bridge layer results in reduced pillowing on top surfaces, as well as reduced separation of the external bridge layer from its surrounding perimeters.\n\nIt is generally recommended to set this to at least 'External bridge only', unless specific issues with the sliced model are found.\n\nOptions:\n1. Disabled - does not generate second bridge layers. This is the default and is set for compatibility purposes\n2. External bridge only - generates second bridge layers for external-facing bridges only. Please note that small bridges that are shorter or narrower than the set number of perimeters will be skipped as they would not benefit from a second bridge layer. If generated, the second bridge layer will be extruded parallel to the first bridge layer to reinforce the bridge strength\n3. Internal bridge only - generates second bridge layers for internal bridges over sparse infill only. Please note that the internal bridges count towards the top shell layer count of your model. The second internal bridge layer will be extruded as close to perpendicular to the first as possible. If multiple regions in the same island, with varying bridge angles are present, the last region of that island will be selected as the angle reference\n4. Apply to all - generates second bridge layers for both internal and external-facing bridges\n", category: "Quality", default: "disabled", enumValues: ["disabled", "external_bridge_only", "internal_bridge_only", "apply_to_all"], enumLabels: ["Disabled", "External bridge only", "Internal bridge only", "Apply to all"], perObject: "object" },
    enable_filament_dynamic_map: { type: "bool", label: "Enable filament dynamic map", mode: "develop", tooltip: "Enable dynamic filament mapping during print.", default: "0" },
    enable_filament_ramming: { type: "bool", label: "Enable filament ramming", mode: "advanced", scopes: ["machine"], tooltip: "Enable filament ramming", default: "1" },
    enable_long_retraction_when_cut: { type: "int", label: "enable_long_retraction_when_cut", mode: "develop", scopes: ["machine"], default: "0" },
    enable_mixed_color_sublayer: { type: "bool", label: "Mixed color sublayer", mode: "simple", scopes: ["process"], tooltip: "Enable mixed color sublayer splitting. When enabled, layers containing mixed color filaments will be split into sub-layers to achieve color mixing effects.", category: "Quality", default: "0" },
    enable_overhang_bridge_fan: { type: "bools", label: "Force cooling for overhangs and bridges", mode: "simple", scopes: ["filament"], tooltip: "Enable this option to allow adjustment of the part cooling fan speed for specifically for overhangs, internal and external bridges. Setting the fan speed specifically for these features can improve overall print quality and reduce warping.", default: ["1"], slots: "filament" },
    enable_overhang_speed: { type: "bools", label: "Slow down for overhangs", mode: "advanced", scopes: ["process"], tooltip: "Enable this option to slow down when printing overhangs. The speeds for different overhang percentages are set below.", category: "Speed", default: ["1"], nullable: true, slots: "variant", perObject: "region" },
    enable_power_loss_recovery: { type: "enum", label: "Power Loss Recovery", mode: "advanced", scopes: ["machine"], tooltip: "Choose how to control power loss recovery. When set to Printer configuration, the slicer will not emit power loss recovery G-code and will leave the printer's configuration unchanged. Applicable to Bambu Lab or Marlin 2 firmware based printers.", default: "printer_configuration", enumValues: ["printer_configuration", "enable", "disable"], enumLabels: ["Printer configuration", "Enable", "Disable"] },
    enable_pre_heating: { type: "bool", label: "enable_pre_heating", mode: "simple", scopes: ["machine"], default: "0" },
    enable_pressure_advance: { type: "bools", label: "Enable pressure advance", mode: "simple", scopes: ["filament"], tooltip: "Enable pressure advance, auto calibration result will be overwritten once enabled.", default: ["0"], slots: "filament" },
    enable_prime_tower: { type: "bool", label: "Enable", mode: "simple", scopes: ["process"], tooltip: "The wiping tower can be used to clean up residue on the nozzle and stabilize the chamber pressure inside the nozzle in order to avoid appearance defects when printing objects.", default: "0" },
    enable_support: { type: "bool", label: "Enable support", mode: "simple", scopes: ["process"], tooltip: "This enables support generation.", category: "Support", default: "0", perObject: "object" },
    enable_tower_interface_cooldown_during_tower: { type: "bool", label: "Cool down from interface boost during prime tower", mode: "advanced", scopes: ["process"], tooltip: "When interface-layer temperature boost is active, set the nozzle back to print temperature at the start of the prime tower so it cools down during the tower.", default: "0" },
    enable_tower_interface_features: { type: "bool", label: "Enable tower interface features", mode: "advanced", scopes: ["process"], tooltip: "Enable optimized prime tower interface behavior when different materials meet.", default: "0" },
    enable_wrapping_detection: { type: "bool", label: "Enable clumping detection", mode: "advanced", scopes: ["process"], tooltip: "Enable clumping detection", default: "0" },
    enforce_support_layers: { type: "int", label: "enforce_support_layers", mode: "develop", scopes: ["process"], unit: "layers", category: "Support", default: "0", min: 0, max: 5e3, perObject: "object" },
    eng_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the Engineering Plate.", unit: "℃", default: ["45"], min: 0, max: 300, slots: "filament" },
    eng_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the Engineering Plate.", unit: "℃", default: ["45"], min: 0, max: 300, slots: "filament" },
    ensure_vertical_shell_thickness: { type: "enum", label: "Ensure vertical shell thickness", mode: "advanced", scopes: ["process"], tooltip: "Add solid infill near sloping surfaces to guarantee the vertical shell thickness (top+bottom solid layers)\nNone: No solid infill will be added anywhere. Caution: Use this option carefully if your model has sloped surfaces\nCritical Only: Avoid adding solid infill for walls\nModerate: Add solid infill for heavily sloping surfaces only\nAll: Add solid infill for all suitable sloping surfaces\nDefault value is All.", category: "Strength", default: "ensure_all", enumValues: ["none", "ensure_critical_only", "ensure_moderate", "ensure_all"], enumLabels: ["None", "Critical Only", "Moderate", "All"], perObject: "region" },
    exclude_object: { type: "bool", label: "Exclude objects", mode: "advanced", scopes: ["process"], tooltip: "Enable this option to add EXCLUDE OBJECT command in G-code.", default: "0" },
    extra_loading_move: { type: "float", label: "Extra loading distance", mode: "advanced", scopes: ["machine"], tooltip: "When set to zero, the distance the filament is moved from parking position during load is exactly the same as it was moved back during unload. When positive, it is loaded further, if negative, the loading move is shorter than unloading.", unit: "mm", default: "-2" },
    extra_perimeters_on_overhangs: { type: "bool", label: "Extra perimeters on overhangs", mode: "advanced", scopes: ["process"], tooltip: "Create additional perimeter paths over steep overhangs and areas where bridges cannot be anchored.", category: "Quality", default: "0", perObject: "region" },
    extra_solid_infills: { type: "string", label: "Insert solid layers", mode: "advanced", scopes: ["process"], tooltip: "Insert solid infill at specific layers. Use N to insert every Nth layer, N#K to insert K consecutive solid layers every N layers (K is optional, e.g. '5#' equals '5#1'), or a comma-separated list (e.g. 1,7,9) to insert at explicit layers. Layers are 1-based.", category: "Strength", default: "", perObject: "region" },
    extruder: { type: "int", label: "Extruder", mode: "advanced", category: "Extruders", min: 0, openEnum: true },
    extruder_ams_count: { type: "strings", label: "Extruder AMS count", mode: "simple", tooltip: "AMS counts per extruder.", default: [], slots: "extruder" },
    extruder_bed_exclude_volumes: { type: "strings", label: "Extruder exclusion volumes", mode: "advanced", scopes: ["machine"], tooltip: "Collision volumes used only by this extruder in individual mode. Use the same polygon and optional Z-range format as the shared exclusion volumes. Leave empty for no exclusion volumes on this extruder.", default: [""], gui: "one_string", slots: "extruder" },
    extruder_clearance_dist_to_rod: { type: "float", label: "Distance to rod", mode: "advanced", scopes: ["machine"], tooltip: "Horizontal distance of the nozzle tip to the rod's farther edge. Used for collision avoidance in by-object printing.", unit: "mm", default: "40", min: 0 },
    extruder_clearance_height_to_lid: { type: "float", label: "Height to lid", mode: "advanced", scopes: ["machine"], tooltip: "Distance from the nozzle tip to the lid. Used for collision avoidance in by-object printing.", unit: "mm", default: "120", min: 0 },
    extruder_clearance_height_to_rod: { type: "float", label: "Height to rod", mode: "advanced", scopes: ["machine"], tooltip: "Distance from the nozzle tip to the lower rod. Used for collision avoidance in by-object printing.", unit: "mm", default: "40", min: 0 },
    extruder_clearance_radius: { type: "float", label: "Radius", mode: "advanced", scopes: ["machine"], tooltip: "Clearance radius around extruder: used for collision avoidance in by-object printing.", unit: "mm", default: "40", min: 0 },
    extruder_colour: { type: "strings", label: "Extruder Color", mode: "advanced", scopes: ["machine"], tooltip: "Only used as a visual help on UI.", default: [""], gui: "color", slots: "extruder" },
    extruder_max_nozzle_count: { type: "ints", label: "extruder_max_nozzle_count", mode: "develop", scopes: ["machine"], default: ["1"], nullable: true, slots: "extruder" },
    extruder_nozzle_count: { type: "ints", label: "extruder nozzle count", mode: "develop", tooltip: "extruder nozzle count", default: ["1"], slots: "extruder" },
    extruder_nozzle_stats: { type: "strings", label: "Extruder nozzle stats", mode: "simple", tooltip: "Physical nozzle counts per extruder, keyed by nozzle volume type.", default: [], slots: "extruder" },
    extruder_nozzle_volume_type: { type: "enums", label: "Extruder nozzle volume type", mode: "develop", tooltip: "Nozzle volume type per physical nozzle of an extruder.", default: ["Standard"], enumValues: ["Standard", "High Flow", "TPU High Flow"], slots: "extruder" },
    extruder_offset: { type: "points", label: "Extruder offset", mode: "advanced", scopes: ["machine"], unit: "mm", default: ["0x0"], slots: "extruder" },
    extruder_printable_area: { type: "pointsGroups", label: "Extruder printable area", mode: "advanced", scopes: ["machine"], default: [], gui: "one_string", slots: "extruder" },
    extruder_printable_height: { type: "floats", label: "Extruder printable height", mode: "advanced", scopes: ["machine"], tooltip: "Maximum printable height of this extruder which is limited by mechanism of printer.", unit: "mm", default: ["0"], min: 0, max: 1e3, slots: "extruder" },
    extruder_type: { type: "enums", label: "Type", mode: "advanced", scopes: ["machine"], tooltip: "This setting is only used for initial value of manual calibration of pressure advance. Bowden extruder usually has larger PA value. This setting doesn't influence normal slicing.", default: ["Direct Drive"], enumValues: ["Direct Drive", "Bowden"], slots: "extruder" },
    extruder_variant_list: { type: "strings", label: "Extruder variant list", mode: "simple", scopes: ["machine"], tooltip: "Extruder variant list.", default: ["Direct Drive Standard"], slots: "extruder" },
    extrusion_rate_smoothing_external_perimeter_only: { type: "bool", label: "Apply only on external features", mode: "advanced", scopes: ["process"], tooltip: "Applies extrusion rate smoothing only on external perimeters and overhangs. This can help reduce artefacts due to sharp speed transitions on externally visible overhangs without impacting the print speed of features that will not be visible to the user.", default: "0" },
    fan_cooling_layer_time: { type: "floats", label: "Layer time", mode: "simple", scopes: ["filament"], tooltip: "The part cooling fan will be enabled for layers where the estimated time is shorter than this value. Fan speed is interpolated between the minimum and maximum fan speeds according to layer printing time.", unit: "s", default: ["60"], min: 0, max: 1e3, slots: "filament" },
    fan_direction: { type: "enum", label: "Fan direction", mode: "develop", scopes: ["machine"], tooltip: "Cooling fan direction of the printer", default: "undefine", enumValues: ["undefine", "left", "right", "both"], enumLabels: ["Undefined", "Left", "Right", "Both"] },
    fan_kickstart: { type: "float", label: "Fan kick-start time", mode: "advanced", scopes: ["machine"], tooltip: "Emit a max fan speed command for this amount of seconds before reducing to target speed to kick-start the cooling fan.\nThis is useful for fans where a low PWM/power may be insufficient to get the fan started spinning from a stop, or to get the fan up to speed faster.\nSet to 0 to deactivate.", unit: "s", default: "0", min: 0 },
    fan_max_speed: { type: "floats", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "The part cooling fan speed may be increased when auto cooling is enabled. This is the maximum speed for the part cooling fan.", unit: "%", default: ["100"], min: 0, max: 100, slots: "filament" },
    fan_min_speed: { type: "floats", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "Minimum speed for part cooling fan.", unit: "%", default: ["20"], min: 0, max: 100, slots: "filament" },
    fan_speedup_overhangs: { type: "bool", label: "Only overhangs", mode: "advanced", scopes: ["machine"], tooltip: "Will only take into account the delay for the cooling of overhangs.", default: "1" },
    fan_speedup_time: { type: "float", label: "fan_speedup_time", mode: "advanced", scopes: ["machine"], tooltip: "Start the fan this number of seconds earlier than its target start time (you can use fractional seconds). It assumes infinite acceleration for this time estimation, and will only take into account G1 and G0 moves (arc fitting is unsupported).\nIt won't move fan commands from custom G-code (they act as a sort of 'barrier').\nIt won't move fan commands into the start G-code if the 'only custom start G-code' is activated.\nUse 0 to deactivate.", unit: "s", default: "0" },
    farthest_point_timelapse: { type: "bool", label: "Farthest point timelapse", mode: "simple", scopes: ["machine"], tooltip: "When enabled, the timelapse snapshot is taken at the farthest point from camera instead of traveling to the wipe tower or excess chute. Only effective in traditional timelapse mode on non-I3 printers.", default: "0" },
    filament_adaptive_volumetric_speed: { type: "bools", label: "Adaptive volumetric speed", mode: "develop", scopes: ["filament"], tooltip: "When enabled, the extrusion flow is limited by the smaller of the fitted value (calculated from line width and layer height) and the user-defined maximum flow. When disabled, only the user-defined maximum flow is applied.\n\nNote: Experimental and incomplete feature imported from BBS. Functional for some profiles that already have the variable saved.", default: ["0"], nullable: true, slots: "variant" },
    filament_adhesiveness_category: { type: "ints", label: "Adhesiveness Category", mode: "develop", scopes: ["filament"], tooltip: "Filament category.", default: ["0"], min: 0, slots: "filament" },
    filament_change_extrusion_role_gcode: { type: "strings", label: "Change extrusion role G-code (filament)", mode: "advanced", scopes: ["filament"], tooltip: "This G-code is inserted when the extrusion role is changed for the active filament.", default: [""], multiline: true, fullWidth: true, height: 5, slots: "filament" },
    filament_change_length: { type: "floats", label: "Filament ramming length", mode: "advanced", scopes: ["filament"], tooltip: "When changing the extruder, it is recommended to extrude a certain length of filament from the original extruder. This helps minimize nozzle oozing.", unit: "mm", default: ["10"], min: 0, slots: "filament" },
    filament_change_length_nc: { type: "floats", label: "Hotend change", mode: "advanced", scopes: ["filament"], tooltip: "When changing the hotend, it is recommended to extrude a certain length of filament from the original nozzle. This helps minimize nozzle oozing.", unit: "mm", default: ["10"], min: 0, slots: "filament" },
    filament_colour: { type: "strings", label: "Color", mode: "advanced", tooltip: "Only used as a visual help on UI.", default: ["#F2754E"], gui: "color", slots: "filament" },
    filament_colour_type: { type: "strings", label: "filament_colour_type", mode: "simple", default: ["1"], slots: "filament" },
    filament_cooling_before_tower: { type: "floats", label: "Wipe tower cooling", mode: "develop", scopes: ["filament"], tooltip: "Temperature drop before entering filament tower", unit: "℃", default: ["10"], nullable: true, slots: "variant" },
    filament_cooling_final_speed: { type: "floats", label: "Speed of the last cooling move", mode: "advanced", scopes: ["filament"], tooltip: "Cooling moves are gradually accelerating towards this speed.", unit: "mm/s", default: ["3.4"], min: 0, slots: "filament" },
    filament_cooling_initial_speed: { type: "floats", label: "Speed of the first cooling move", mode: "advanced", scopes: ["filament"], tooltip: "Cooling moves are gradually accelerating beginning at this speed.", unit: "mm/s", default: ["2.2"], min: 0, slots: "filament" },
    filament_cooling_moves: { type: "ints", label: "Number of cooling moves", mode: "advanced", scopes: ["filament"], tooltip: "Filament is cooled by being moved back and forth in the cooling tubes. Specify desired number of these moves.", default: ["4"], min: 0, max: 20, slots: "filament" },
    filament_cost: { type: "floats", label: "Price", mode: "advanced", scopes: ["filament"], tooltip: "Filament price, for statistical purposes only.", unit: "money/kg", default: ["0"], min: 0, slots: "filament" },
    filament_density: { type: "floats", label: "Density", mode: "advanced", scopes: ["filament"], tooltip: "Filament density, for statistical purposes only.", unit: "g/cm³", default: ["0"], min: 0, slots: "filament" },
    filament_deretraction_speed: { type: "floats", label: "Deretraction speed", mode: "advanced", scopes: ["filament"], tooltip: "Speed for reloading filament into the nozzle. Zero means same speed of retraction.", unit: "mm/s", default: ["nil"], nullable: true, slots: "variant" },
    filament_dev_ams_drying_ams_limitations: { type: "strings", label: "filament_dev_ams_drying_ams_limitations", mode: "simple", scopes: ["filament"], default: [""], slots: "filament" },
    filament_dev_ams_drying_heat_distortion_temperature: { type: "floats", label: "filament_dev_ams_drying_heat_distortion_temperature", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_ams_drying_temperature: { type: "floats", label: "filament_dev_ams_drying_temperature", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_ams_drying_time: { type: "floats", label: "filament_dev_ams_drying_time", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_chamber_drying_bed_temperature: { type: "floats", label: "filament_dev_chamber_drying_bed_temperature", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_chamber_drying_time: { type: "floats", label: "filament_dev_chamber_drying_time", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_drying_cooling_temperature: { type: "floats", label: "filament_dev_drying_cooling_temperature", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_dev_drying_softening_temperature: { type: "floats", label: "filament_dev_drying_softening_temperature", mode: "simple", scopes: ["filament"], default: ["0"], slots: "filament" },
    filament_diameter: { type: "floats", label: "Diameter", mode: "simple", scopes: ["filament"], tooltip: "Filament diameter is used to calculate extrusion variables in G-code, so it is important that this is accurate and precise.", unit: "mm", default: ["1.75"], min: 0, slots: "filament" },
    filament_end_gcode: { type: "strings", label: "End G-code", mode: "advanced", scopes: ["filament"], tooltip: "Add end G-code when finishing the printing of this filament.", default: [" "], multiline: true, fullWidth: true, height: 120, slots: "filament" },
    filament_extruder_compatibility: { type: "ints", label: "Filament-extruder compatibility", mode: "develop", scopes: ["filament"], tooltip: "A single 32-bit int encoding the compatibility level of a filament across all extruders (up to 10). Every 3 bits represent one extruder (bits [3*i, 3*i+2] for extruder i). 0: printable, 1: error, 2: critical warning, 3: warning, 4-7: reserved.", default: ["0"], slots: "filament" },
    filament_extruder_variant: { type: "strings", label: "Filament's extruder variant", mode: "simple", scopes: ["filament"], tooltip: "Filament's extruder variant.", default: ["Direct Drive Standard"], slots: "variant" },
    filament_flow_ratio: { type: "floats", label: "Flow ratio", mode: "advanced", scopes: ["filament"], tooltip: "The material may have volumetric change after switching between molten and crystalline states. This setting changes all extrusion flow of this filament in G-code proportionally. The recommended value range is between 0.95 and 1.05. You may be able to tune this value to get a nice flat surface if there is slight overflow or underflow.", default: ["1"], min: 0, max: 2, nullable: true, slots: "variant" },
    filament_flush_temp: { type: "ints", label: "Flush temperature", mode: "advanced", scopes: ["filament"], tooltip: "Temperature when flushing filament. 0 indicates the upper bound of the recommended nozzle temperature range.", unit: "℃", default: ["0"], min: 0, max: 1500, nullable: true, slots: "variant" },
    filament_flush_temp_fast: { type: "ints", label: "Flush temperature", mode: "advanced", scopes: ["filament"], tooltip: "Flush temperature used in fast purge mode.", unit: "℃", default: ["0"], min: 0, max: 1500, nullable: true, slots: "filament" },
    filament_flush_volumetric_speed: { type: "floats", label: "Flush volumetric speed", mode: "advanced", scopes: ["filament"], tooltip: "Volumetric speed when flushing filament. 0 indicates the max volumetric speed.", unit: "mm³/s", default: ["0"], min: 0, max: 200, nullable: true, slots: "variant" },
    filament_ids: { type: "strings", label: "filament_ids", mode: "simple", default: [], slots: "filament" },
    filament_ironing_flow: { type: "percents", label: "Ironing flow", mode: "advanced", scopes: ["filament"], tooltip: "Filament-specific override for ironing flow. This allows you to customize the ironing flow for each filament type. Too high value results in overextrusion on the surface.", unit: "%", category: "Quality", default: ["nil"], min: 0, max: 100, nullable: true, slots: "variant", perObject: "region" },
    filament_ironing_inset: { type: "floats", label: "Ironing inset", mode: "advanced", scopes: ["filament"], tooltip: "Filament-specific override for ironing inset. This allows you to customize the distance to keep from the edges when ironing for each filament type.", unit: "mm", category: "Quality", default: ["nil"], min: 0, max: 100, nullable: true, slots: "variant", perObject: "region" },
    filament_ironing_spacing: { type: "floats", label: "Ironing line spacing", mode: "advanced", scopes: ["filament"], tooltip: "Filament-specific override for ironing line spacing. This allows you to customize the spacing between ironing lines for each filament type.", unit: "mm", category: "Quality", default: ["nil"], min: 0, max: 1, nullable: true, slots: "variant", perObject: "region" },
    filament_ironing_speed: { type: "floats", label: "Ironing speed", mode: "advanced", scopes: ["filament"], tooltip: "Filament-specific override for ironing speed. This allows you to customize the print speed of ironing lines for each filament type.", unit: "mm/s", category: "Speed", default: ["nil"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    filament_is_mixed: { type: "bools", label: "Is mixed filament", mode: "develop", tooltip: "Whether this filament slot is a mixed filament composed of multiple physical filaments", default: ["0"], slots: "filament" },
    filament_is_support: { type: "bools", label: "Support material", mode: "advanced", scopes: ["filament"], tooltip: "Support material is commonly used to print supports and support interfaces.", default: ["0"], slots: "filament" },
    filament_loading_speed: { type: "floats", label: "Loading speed", mode: "advanced", scopes: ["filament"], tooltip: "Speed used for loading the filament on the wipe tower.", unit: "mm/s", default: ["28"], min: 0, slots: "filament" },
    filament_loading_speed_start: { type: "floats", label: "Loading speed at the start", mode: "advanced", scopes: ["filament"], tooltip: "Speed used at the very beginning of loading phase.", unit: "mm/s", default: ["3"], min: 0, slots: "filament" },
    filament_long_retractions_when_cut: { type: "bools", label: "Long retraction when cut (beta)", mode: "simple", scopes: ["filament"], tooltip: "Experimental feature: Retracting and cutting off the filament at a longer distance during changes to minimize purge. While this reduces flush significantly, it may also raise the risk of nozzle clogs or other printing problems.", default: ["nil"], nullable: true, slots: "variant" },
    filament_map: { type: "ints", label: "Filament map to extruder", mode: "develop", tooltip: "Filament map to extruder.", default: ["1"], slots: "filament" },
    filament_map_2: { type: "ints", label: "Filament map plus for multi nozzle", mode: "develop", tooltip: "Filament map to the index identified by extruder and nozzle_volume_type", default: ["1"], slots: "filament" },
    filament_map_mode: { type: "enum", label: "filament mapping mode", mode: "advanced", tooltip: "Filament mapping mode used as plate param.", default: "Auto For Flush", enumValues: ["Auto For Flush", "Auto For Match", "Manual", "Nozzle Manual"] },
    filament_max_temperature_drop_when_ec: { type: "floats", label: "filament_max_temperature_drop_when_ec", mode: "develop", default: ["0"], slots: "filament" },
    filament_max_volumetric_speed: { type: "floats", label: "Max volumetric speed", mode: "advanced", scopes: ["filament"], tooltip: "This setting is the volume of filament that can be melted and extruded per second. Printing speed is limited by max volumetric speed, in case of too high and unreasonable speed setting. This value cannot be zero.", unit: "mm³/s", default: ["2"], min: 0, slots: "variant" },
    filament_minimal_purge_on_wipe_tower: { type: "floats", label: "Minimal purge on wipe tower", mode: "advanced", scopes: ["filament"], tooltip: "After a tool change, the exact position of the newly loaded filament inside the nozzle may not be known, and the filament pressure is likely not yet stable. Before purging the print head into an infill or a sacrificial object, Orca Slicer will always prime this amount of material into the wipe tower to produce successive infill or sacrificial object extrusions reliably.", unit: "mm³", default: ["15"], min: 0, slots: "filament" },
    filament_mixed_components: { type: "strings", label: "Mixed filament components", mode: "develop", tooltip: 'Comma-separated 1-based indices of component filaments, e.g. "1,3"', default: [""], slots: "filament" },
    filament_mixed_gradient: { type: "bools", label: "Mixed filament gradient", mode: "develop", tooltip: "Enable Z-direction gradient mode for mixed filament sub-layers. When enabled, the sub-layer ratios vary linearly across layers.", default: ["0"], slots: "filament" },
    filament_mixed_gradient_curve: { type: "strings", label: "Mixed filament gradient curve", mode: "develop", tooltip: 'Optional Photoshop-style custom curve mapping Z progress to the first component ratio. Encoded as pipe-separated control points, either "x,y" (legacy) or "x,y,m_in,m_out" when a tangent override is needed (empty token or "nan" means use PCHIP default). x in [0,1]; y is clamped to the configured ratio range, e.g. "0,0.15|0.5,0.50|1,0.85". When empty, the linear gradient_range is used instead.', default: [""], slots: "filament" },
    filament_mixed_gradient_per_part: { type: "bools", label: "Mixed filament per-part gradient", mode: "develop", tooltip: "When gradient mode is enabled, apply the gradient to each part of an assembly independently rather than treating the whole assembly as one Z range.", default: ["0"], slots: "filament" },
    filament_mixed_gradient_range: { type: "strings", label: "Mixed filament gradient range", mode: "develop", tooltip: 'Start and end ratios for the first component in gradient mode. Comma-separated pair, e.g. "0.10,0.90" means 10% to 90%.', default: [""], slots: "filament" },
    filament_mixed_sublayer_ratios: { type: "strings", label: "Mixed filament sublayer ratios", mode: "develop", tooltip: 'Comma-separated ratio values summing to 1.0, e.g. "0.7,0.3"', default: [""], slots: "filament" },
    filament_multi_colour: { type: "strings", label: "filament_multi_colour", mode: "simple", default: [""], slots: "filament" },
    filament_multitool_ramming: { type: "bools", label: "Enable ramming for multi-tool setups", mode: "advanced", scopes: ["filament"], tooltip: "Perform ramming when using multi-tool printer (i.e. when the 'Single Extruder Multimaterial' in Printer Settings is unchecked). When checked, a small amount of filament is rapidly extruded on the wipe tower just before the tool change. This option is only used when the wipe tower is enabled.", default: ["0"], slots: "filament" },
    filament_multitool_ramming_flow: { type: "floats", label: "Multi-tool ramming flow", mode: "advanced", scopes: ["filament"], tooltip: "Flow used for ramming the filament before the tool change.", unit: "mm³/s", default: ["10"], min: 0, slots: "filament" },
    filament_multitool_ramming_volume: { type: "floats", label: "Multi-tool ramming volume", mode: "advanced", scopes: ["filament"], tooltip: "The volume to be rammed before the tool change.", unit: "mm³", default: ["10"], min: 0, slots: "filament" },
    filament_notes: { type: "strings", label: "Filament notes", mode: "advanced", scopes: ["filament"], tooltip: "You can put your notes regarding the filament here.", default: [""], multiline: true, fullWidth: true, height: 13, slots: "filament" },
    filament_nozzle_map: { type: "ints", label: "filament_nozzle_map", mode: "develop", default: ["1"], slots: "filament" },
    filament_plugin_config_overrides: { type: "string", label: "Capabilities", mode: "advanced", scopes: ["filament"], tooltip: "Configuration for the plugin capabilities this preset uses, overriding the global Capabilities configuration. Stored as a raw JSON array and edited through the dialog behind the button, never typed in directly.", default: "", gui: "plugin_config" },
    filament_pre_cooling_temperature: { type: "ints", label: "Extruder change", mode: "advanced", scopes: ["filament"], tooltip: "To prevent oozing, the nozzle temperature will be cooled during ramming. Therefore, the ramming time must be greater than the cooldown time. 0 means disabled.", unit: "℃", default: ["0"], min: 0, nullable: true, slots: "variant" },
    filament_pre_cooling_temperature_nc: { type: "ints", label: "Hotend change", mode: "advanced", scopes: ["filament"], tooltip: "To prevent oozing, the nozzle temperature will be cooled during ramming. Note: only a cooldown command and fan activation are triggered, reaching the target temperature is not guaranteed. 0 means disabled.", unit: "℃", default: ["0"], min: 0, nullable: true, slots: "variant" },
    filament_preheat_temperature_delta: { type: "floats", label: "Preheat temperature delta", mode: "develop", scopes: ["filament"], tooltip: "Temperature delta applied during pre-heating before tool change.", unit: "℃", default: ["0"], nullable: true, slots: "variant" },
    filament_prime_volume: { type: "floats", label: "Filament change", mode: "simple", scopes: ["filament"], tooltip: "The volume of material required to prime the extruder on the tower, excluding a hotend change.", unit: "mm³", default: ["45"], min: 1, slots: "filament" },
    filament_prime_volume_nc: { type: "floats", label: "Hotend change", mode: "simple", scopes: ["filament"], tooltip: "The volume of material required to prime the extruder for a hotend change on the tower.", unit: "mm³", default: ["60"], min: 1, slots: "filament" },
    filament_printable: { type: "ints", label: "Filament printable", mode: "develop", scopes: ["filament"], tooltip: "The filament is printable in extruder.", default: ["3"], slots: "filament" },
    filament_ramming_parameters: { type: "strings", label: "Ramming parameters", mode: "advanced", scopes: ["filament"], tooltip: "This string is edited by RammingDialog and contains ramming specific parameters.", default: ["120 100 6.6 6.8 7.2 7.6 7.9 8.2 8.7 9.4 9.9 10.0| 0.05 6.6 0.45 6.8 0.95 7.8 1.45 8.3 1.95 9.7 2.45 10 2.95 7.6 3.45 7.6 3.95 7.6 4.45 7.6 4.95 7.6"], slots: "filament" },
    filament_ramming_travel_time: { type: "floats", label: "Extruder change", mode: "advanced", scopes: ["filament"], tooltip: "To prevent oozing, the nozzle will perform a reverse travel movement for a certain period after the ramming is complete. The setting define the travel time.", unit: "s", default: ["0"], min: 0, nullable: true, slots: "variant" },
    filament_ramming_travel_time_nc: { type: "floats", label: "Hotend change", mode: "advanced", scopes: ["filament"], tooltip: "To prevent oozing, the nozzle will perform a reverse travel movement for a certain period after the ramming is complete. The setting define the travel time.", unit: "s", default: ["0"], min: 0, nullable: true, slots: "variant" },
    filament_ramming_volumetric_speed: { type: "floats", label: "Extruder change", mode: "advanced", scopes: ["filament"], tooltip: "The maximum volumetric speed for ramming before extruder change, where -1 means using the maximum volumetric speed.", unit: "mm³/s", default: ["-1"], min: -1, max: 200, nullable: true, slots: "variant" },
    filament_ramming_volumetric_speed_nc: { type: "floats", label: "Hotend change", mode: "advanced", scopes: ["filament"], tooltip: "The maximum volumetric speed for ramming before a hotend change, where -1 means using the maximum volumetric speed.", unit: "mm³/s", default: ["-1"], min: -1, max: 200, nullable: true, slots: "variant" },
    filament_retract_after_wipe: { type: "percents", label: "Retract amount after wipe", mode: "advanced", scopes: ["filament"], tooltip: "This is the length of fast retraction after wipe, relative to retraction length.\nThe value will be clamped by 100% minus the retract amount before the wipe value.", unit: "%", default: ["nil"], nullable: true, slots: "variant" },
    filament_retract_before_wipe: { type: "percents", label: "Retract amount before wipe", mode: "advanced", scopes: ["filament"], tooltip: "This is the length of fast retraction before a wipe, relative to retraction length.", unit: "%", default: ["nil"], nullable: true, slots: "variant" },
    filament_retract_length_nc: { type: "floats", label: "length when change hotend", mode: "develop", scopes: ["filament"], tooltip: "When this retraction value is modified, it will be used as the amount of filament retracted inside the hotend before changing hotends.", unit: "mm", default: ["nil"], min: 0, max: 18, nullable: true, slots: "variant" },
    filament_retract_length_toolchange: { type: "floats", label: "Retraction Length (Toolchange)", mode: "advanced", scopes: ["filament"], tooltip: "When retraction is triggered before changing tool, filament is pulled back by the specified amount (the length is measured on raw filament, before it enters the extruder).", unit: "mm", default: ["nil"], nullable: true, slots: "variant" },
    filament_retract_lift_above: { type: "floats", label: "Only lift Z above", mode: "advanced", scopes: ["filament"], tooltip: "If you set this to a positive value, Z lift will only take place above the specified absolute Z.", unit: "mm", default: ["nil"], min: 0, nullable: true, slots: "variant" },
    filament_retract_lift_below: { type: "floats", label: "Only lift Z below", mode: "advanced", scopes: ["filament"], tooltip: "If you set this to a positive value, Z lift will only take place below the specified absolute Z.", unit: "mm", default: ["nil"], min: 0, nullable: true, slots: "variant" },
    filament_retract_lift_enforce: { type: "enums", label: "On surfaces", mode: "advanced", scopes: ["filament"], tooltip: "Enforce Z-Hop behavior. This setting is impacted by the above settings (Only lift Z above/below).", default: ["nil"], enumValues: ["All Surfaces", "Top Only", "Bottom Only", "Top and Bottom"], nullable: true, slots: "variant" },
    filament_retract_restart_extra: { type: "floats", label: "Extra length on restart", mode: "advanced", scopes: ["filament"], tooltip: "When the retraction is compensated after the travel move, the extruder will push this additional amount of filament. This setting is rarely needed.", unit: "mm", default: ["nil"], nullable: true, slots: "variant" },
    filament_retract_restart_extra_toolchange: { type: "floats", label: "Extra length on restart (Toolchange)", mode: "advanced", scopes: ["filament"], tooltip: "When the retraction is compensated after changing tool, the extruder will push this additional amount of filament.", unit: "mm", default: ["nil"], nullable: true, slots: "variant" },
    filament_retract_when_changing_layer: { type: "bools", label: "Retract on layer change", mode: "advanced", scopes: ["filament"], tooltip: "This forces a retraction on layer changes.", default: ["nil"], nullable: true, slots: "variant" },
    filament_retraction_distances_when_cut: { type: "floats", label: "Retraction distance when cut", mode: "simple", scopes: ["filament"], tooltip: "Experimental feature: Retraction length before cutting off during filament change.", default: ["nil"], min: 10, max: 18, nullable: true, slots: "variant" },
    filament_retraction_length: { type: "floats", label: "Length", mode: "simple", scopes: ["filament"], fullLabel: "Retraction Length", tooltip: "Some amount of material in extruder is pulled back to avoid ooze during long travel. Set zero to disable retraction.", unit: "mm", default: ["nil"], nullable: true, slots: "variant" },
    filament_retraction_minimum_travel: { type: "floats", label: "Travel distance threshold", mode: "advanced", scopes: ["filament"], tooltip: "Only trigger retraction when the travel distance is longer than this threshold.", unit: "mm", default: ["nil"], nullable: true, slots: "variant" },
    filament_retraction_speed: { type: "floats", label: "Retraction speed", mode: "advanced", scopes: ["filament"], tooltip: "Speed for retracting filament from the nozzle.", unit: "mm/s", default: ["nil"], nullable: true, slots: "variant" },
    filament_self_index: { type: "ints", label: "Filament self index", mode: "simple", tooltip: "Filament self index.", default: ["1"], slots: "filament" },
    filament_settings_id: { type: "strings", label: "filament_settings_id", mode: "simple", default: [""], slots: "filament" },
    filament_shrink: { type: "percents", label: "Shrinkage (XY)", mode: "advanced", scopes: ["filament"], tooltip: "Enter the shrinkage percentage that the filament will get after cooling (94% if you measure 94mm instead of 100mm). The part will be scaled in XY to compensate. For multi-material prints, ensure filament shrinkage matches across all used filaments\nBe sure to allow enough space between objects, as this compensation is done after the checks.", unit: "%", default: ["100%"], min: 50, max: 150, slots: "filament" },
    filament_shrinkage_compensation_z: { type: "percents", label: "Shrinkage (Z)", mode: "advanced", scopes: ["filament"], tooltip: "Enter the shrinkage percentage that the filament will get after cooling (94% if you measure 94mm instead of 100mm). The part will be scaled in Z to compensate.", unit: "%", default: ["100%"], min: 50, max: 150, slots: "filament" },
    filament_soluble: { type: "bools", label: "Soluble material", mode: "advanced", scopes: ["filament"], tooltip: "Soluble material is commonly used to print supports and support interfaces.", default: ["0"], slots: "filament" },
    filament_stamping_distance: { type: "floats", label: "Stamping distance measured from the center of the cooling tube", mode: "advanced", scopes: ["filament"], tooltip: 'If set to non-zero value, filament is moved toward the nozzle between the individual cooling moves ("stamping"). This option configures how long this movement should be before the filament is retracted again.', default: ["0"], min: 0, slots: "filament" },
    filament_stamping_loading_speed: { type: "floats", label: "Stamping loading speed", mode: "advanced", scopes: ["filament"], tooltip: "Speed used for stamping.", default: ["0"], min: 0, slots: "filament" },
    filament_start_gcode: { type: "strings", label: "Start G-code", mode: "advanced", scopes: ["filament"], tooltip: "G-code added when the printer starts using this filament", default: [" "], multiline: true, fullWidth: true, height: 12, slots: "filament" },
    filament_toolchange_delay: { type: "floats", label: "Delay after unloading", mode: "advanced", scopes: ["filament"], tooltip: "Time to wait after the filament is unloaded. May help to get reliable tool changes with flexible materials that may need more time to shrink to original dimensions.", unit: "s", default: ["0"], min: 0, slots: "filament" },
    filament_tower_interface_pre_extrusion_dist: { type: "floats", label: "Interface layer pre-extrusion distance", mode: "advanced", scopes: ["filament"], tooltip: "Pre-extrusion distance for prime tower interface layer (where different materials meet).", unit: "mm", default: ["10"], min: 0, slots: "filament" },
    filament_tower_interface_pre_extrusion_length: { type: "floats", label: "Interface layer pre-extrusion length", mode: "advanced", scopes: ["filament"], tooltip: "Pre-extrusion length for prime tower interface layer (where different materials meet).", unit: "mm", default: ["0"], min: 0, slots: "filament" },
    filament_tower_interface_print_temp: { type: "ints", label: "Interface layer print temperature", mode: "advanced", scopes: ["filament"], tooltip: "Print temperature for prime tower interface layer (where different materials meet). If set to -1, use max recommended nozzle temperature.", unit: "℃", default: ["-1"], min: -1, slots: "filament" },
    filament_tower_interface_purge_volume: { type: "floats", label: "Interface layer purge length", mode: "advanced", scopes: ["filament"], tooltip: "Purge length for prime tower interface layer (where different materials meet).", unit: "mm", default: ["20"], min: 0, slots: "filament" },
    filament_tower_ironing_area: { type: "floats", label: "Tower ironing area", mode: "advanced", scopes: ["filament"], tooltip: "Ironing area for prime tower interface layer (where different materials meet).", unit: "mm²", default: ["4"], min: 0, slots: "filament" },
    filament_type: { type: "strings", label: "Type", mode: "simple", scopes: ["filament"], tooltip: "Filament material type", default: ["PLA"], enumValues: ["ABS", "ABS-CF", "ABS-GF", "ASA", "ASA-CF", "ASA-GF", "ASA-AERO", "BVOH", "CoPE", "EVA", "FLEX", "HIPS", "PA", "PA-CF", "PA-GF", "PA6", "PA6-CF", "PA6-GF", "PA11", "PA11-CF", "PA11-GF", "PA12", "PA12-CF", "PA12-GF", "PAHT", "PAHT-CF", "PAHT-GF", "PC", "PC-ABS", "PC-CF", "PC-PBT", "PCL", "PCTG", "PE", "PE-CF", "PE-GF", "PEI-1010", "PEI-1010-CF", "PEI-1010-GF", "PEI-9085", "PEI-9085-CF", "PEI-9085-GF", "PEEK", "PEEK-CF", "PEEK-GF", "PEKK", "PEKK-CF", "PES", "PET", "PET-CF", "PET-GF", "PETG", "PETG-CF", "PETG-GF", "PHA", "PI", "PLA", "PLA-AERO", "PLA-CF", "POM", "PP", "PP-CF", "PP-GF", "PPA-CF", "PPA-GF", "PPS", "PPS-CF", "PPSU", "PSU", "PVA", "PVB", "PVDF", "SBS", "TPI", "TPU"], openEnum: true, slots: "filament" },
    filament_unloading_speed: { type: "floats", label: "Unloading speed", mode: "advanced", scopes: ["filament"], tooltip: "Speed used for unloading the filament on the wipe tower (does not affect initial part of unloading just after ramming).", unit: "mm/s", default: ["90"], min: 0, slots: "filament" },
    filament_unloading_speed_start: { type: "floats", label: "Unloading speed at the start", mode: "advanced", scopes: ["filament"], tooltip: "Speed used for unloading the tip of the filament immediately after ramming.", unit: "mm/s", default: ["100"], min: 0, slots: "filament" },
    filament_vendor: { type: "strings", label: "Vendor", mode: "advanced", scopes: ["filament"], tooltip: "Vendor of filament. For show only.", default: ["(Undefined)"], slots: "filament" },
    filament_volume_map: { type: "ints", label: "filament_volume_map", mode: "develop", default: ["0"], slots: "filament" },
    filament_wipe: { type: "bools", label: "Wipe while retracting", mode: "advanced", scopes: ["filament"], tooltip: "This moves the nozzle along the last extrusion path when retracting to clean any leaked material on the nozzle. This can minimize blobs when printing a new part after traveling.", default: ["nil"], nullable: true, slots: "variant" },
    filament_wipe_distance: { type: "floats", label: "Wipe distance", mode: "advanced", scopes: ["filament"], tooltip: "Describe how long the nozzle will move along the last path when retracting.\n\nDepending on how long the wipe operation lasts, how fast and long the extruder/filament retraction settings are, a retraction move may be needed to retract the remaining filament.\n\nSetting a value in the retract amount before wipe setting below will perform any excess retraction before the wipe, else it will be performed after.", unit: "mm", default: ["nil"], min: 0, nullable: true, slots: "variant" },
    filament_z_hop: { type: "floats", label: "Z-hop height", mode: "simple", scopes: ["filament"], tooltip: "Whenever there is a retraction, the nozzle is lifted a little to create clearance between the nozzle and the print. This prevents the nozzle from hitting the print when traveling more. Using spiral lines to lift Z can prevent stringing.", unit: "mm", default: ["nil"], min: 0, max: 5, nullable: true, slots: "variant" },
    filament_z_hop_types: { type: "enums", label: "Z-hop type", mode: "advanced", scopes: ["filament"], tooltip: "Type of Z-hop.", default: ["nil"], enumValues: ["Auto Lift", "Normal Lift", "Slope Lift", "Spiral Lift"], enumLabels: ["Auto", "Normal", "Slope", "Spiral"], nullable: true, slots: "variant" },
    file_start_gcode: { type: "string", label: "File header G-code", mode: "advanced", scopes: ["machine"], tooltip: "G-code written at the very top of the output file, before any other content. Useful for adding metadata that printer firmware reads from the first lines of the file (e.g. estimated print time, filament usage). Supports placeholders like {print_time_total_sec}, {print_time_day}, {print_time_hour}, {print_time_minute}, {print_time_sec} and {used_filament_length}.", default: "", multiline: true, fullWidth: true, height: 8 },
    filename_format: { type: "string", label: "Filename format", mode: "advanced", scopes: ["process"], tooltip: "Users can decide project file names when exporting.", default: "{input_filename_base}_{filament_type[initial_tool]}_{print_time}.gcode", fullWidth: true },
    fill_multiline: { type: "int", label: "Fill Multiline", mode: "simple", scopes: ["process"], tooltip: "Using multiple lines for the infill pattern, if supported by infill pattern.", category: "Strength", default: "1", min: 1, max: 10, perObject: "region" },
    filter_out_gap_fill: { type: "float", label: "Filter out tiny gaps", mode: "advanced", scopes: ["process"], tooltip: "Don't print gap fill with a length is smaller than the threshold specified (in mm). This setting applies to top, bottom and solid infill and, if using the classic perimeter generator, to wall gap fill.", unit: "mm", category: "Layers and Perimeters", default: "0", perObject: "region" },
    first_layer_flow_ratio: { type: "float", label: "First layer flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material on the first layer for the extrusion path roles listed in this section.\n\nFor the first layer, the actual flow ratio for each path role (does not affect brims and skirts) will be multiplied by this value.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    first_layer_print_sequence: { type: "ints", label: "First layer print sequence", mode: "simple", default: ["0"], min: 0, max: 16, slots: "list" },
    first_layer_sequence_choice: { type: "enum", label: "First layer filament sequence", mode: "simple", category: "Quality", default: "Auto", enumValues: ["Auto", "Customize"] },
    first_x_layer_fan_speed: { type: "floats", label: "Fan speed", mode: "simple", scopes: ["filament"], tooltip: "Special auxiliary cooling fan speed, effective only for the first x layers.", unit: "%", default: ["0"], min: 0, max: 100, slots: "filament" },
    flashforge_serial_number: { type: "string", label: "Serial Number", mode: "advanced", scopes: ["machine"], tooltip: "Flashforge local API requires the printer serial number.", default: "" },
    flush_into_infill: { type: "bool", label: "Flush into objects' infill", mode: "simple", scopes: ["process"], tooltip: "Purging after filament change will be done inside objects' infills. This may lower the amount of waste and decrease the print time. If the walls are printed with transparent filament, the mixed color infill will be visible. It will not take effect unless the prime tower is enabled.", category: "Flush options", default: "0", perObject: "object" },
    flush_into_objects: { type: "bool", label: "Flush into this object", mode: "simple", scopes: ["process"], tooltip: "This object will be used to purge the nozzle after a filament change to save filament and decrease the print time. Colors of the objects will be mixed as a result. It will not take effect unless the prime tower is enabled.", category: "Flush options", default: "0", perObject: "object" },
    flush_into_support: { type: "bool", label: "Flush into objects' support", mode: "simple", scopes: ["process"], tooltip: "Purging after filament change will be done inside objects' support. This may lower the amount of waste and decrease the print time. It will not take effect unless a prime tower is enabled.", category: "Flush options", default: "1", perObject: "object" },
    flush_multiplier: { type: "floats", label: "Flush multiplier", mode: "simple", tooltip: "The actual flushing volumes is equal to the flush multiplier value multiplied by the flushing volumes in the table.", default: ["0.3"], slots: "extruder" },
    flush_multiplier_fast: { type: "floats", label: "Flush multiplier (Fast mode)", mode: "simple", tooltip: "The flush multiplier used in fast purge mode.", default: ["1.2"], slots: "extruder" },
    flush_volumes_matrix: { type: "floats", label: "Purging volumes", mode: "simple", default: ["0", "280", "280", "280", "280", "0", "280", "280", "280", "280", "0", "280", "280", "280", "280", "0"], slots: "list" },
    flush_volumes_vector: { type: "floats", label: "Purging volumes - load/unload volumes", mode: "simple", default: ["140", "140", "140", "140", "140", "140", "140", "140"], slots: "list" },
    full_fan_speed_layer: { type: "ints", label: "Full fan speed at layer", mode: "advanced", scopes: ["filament"], tooltip: 'Fan speed will be ramped up linearly from zero at layer "close_fan_the_first_x_layers" to maximum at layer "full_fan_speed_layer". "full_fan_speed_layer" will be ignored if lower than "close_fan_the_first_x_layers", in which case the fan will be running at maximum allowed speed at layer "close_fan_the_first_x_layers" + 1.', unit: "layer", default: ["0"], min: 0, max: 1e3, slots: "filament" },
    fuzzy_skin: { type: "enum", label: "Fuzzy skin", mode: "simple", scopes: ["process"], tooltip: "This setting makes the toolhead randomly jitter while printing walls so that the surface has a rough textured look. This setting controls the fuzzy position.", category: "Others", default: "disabled_fuzzy", enumValues: ["none", "external", "hole", "all", "allwalls", "disabled_fuzzy"], enumLabels: ["Painted only", "Contour", "Hole", "Contour and hole", "All walls", "Disabled"], perObject: "region" },
    fuzzy_skin_first_layer: { type: "bool", label: "Apply fuzzy skin to first layer", mode: "simple", scopes: ["process"], tooltip: "Whether to apply fuzzy skin on the first layer.", category: "Others", default: "0", perObject: "region" },
    fuzzy_skin_layers_between_ripple_offset: { type: "int", label: "Layers between ripple offset", mode: "advanced", scopes: ["process"], tooltip: "Specifies how many consecutive layers share the same ripple phase before the offset is applied.\nFor example:\n- 1 = Layer 1 is printed with the base ripple pattern, then layer 2 is shifted by the configured offset, then layer 3 returns to the base pattern, and so on.\n- 3 = Layers 1 to 3 are printed with the base ripple pattern, then layers 4 to 6 are shifted by the configured offset, then layers 7 to 9 return to the base pattern, etc.", category: "Others", default: "1", min: 1, perObject: "region" },
    fuzzy_skin_mode: { type: "enum", label: "Fuzzy skin generator mode", mode: "simple", scopes: ["process"], tooltip: "Fuzzy skin generation mode. Works only with Arachne!\nDisplacement: Сlassic mode when the pattern is formed by shifting the nozzle sideways from the original path.\nExtrusion: The mode when the pattern formed by the amount of extruded plastic. This is the fast and straight algorithm without unnecessary nozzle shake that gives a smooth pattern. But it is more useful for forming loose walls in the entire they array.\nCombined: Joint mode [Displacement] + [Extrusion]. The appearance of the walls is similar to [Displacement] Mode, but it leaves no pores between the perimeters.\n\nAttention! The [Extrusion] and [Combined] modes works only the fuzzy_skin_thickness parameter not more than the thickness of printed loop. At the same time, the width of the extrusion for a particular layer should also not be below a certain level. It is usually equal 15-25%% of a layer height. Therefore, the maximum fuzzy skin thickness with a perimeter width of 0.4 mm and a layer height of 0.2 mm will be 0.4-(0.2*0.25)=±0.35mm! If you enter a higher parameter than this, the error Flow::spacing() will displayed, and the model will not be sliced. You can choose this number until this error is repeated.", category: "Others", default: "displacement", enumValues: ["displacement", "extrusion", "combined"], enumLabels: ["Displacement", "Extrusion", "Combined"], perObject: "region" },
    fuzzy_skin_noise_type: { type: "enum", label: "Fuzzy skin noise type", mode: "simple", scopes: ["process"], tooltip: "Noise type to use for fuzzy skin generation:\nClassic: Classic uniform random noise.\nPerlin: Perlin noise, which gives a more consistent texture.\nBillow: Similar to perlin noise, but clumpier.\nRidged Multifractal: Ridged noise with sharp, jagged features. Creates marble-like textures.\nVoronoi: Divides the surface into voronoi cells, and displaces each one by a random amount. Creates a patchwork texture.\nRipple: Uniform ripple pattern that ripples left and right of the original path. Repeating pattern, woven appearance.", category: "Others", default: "classic", enumValues: ["classic", "perlin", "billow", "ridgedmulti", "voronoi", "ripple"], enumLabels: ["Classic", "Perlin", "Billow", "Ridged Multifractal", "Voronoi", "Ripple"], perObject: "region" },
    fuzzy_skin_octaves: { type: "int", label: "Fuzzy Skin Noise Octaves", mode: "advanced", scopes: ["process"], tooltip: "The number of octaves of coherent noise to use. Higher values increase the detail of the noise, but also increase computation time.", category: "Others", default: "4", min: 1, max: 10, perObject: "region" },
    fuzzy_skin_persistence: { type: "float", label: "Fuzzy skin noise persistence", mode: "advanced", scopes: ["process"], tooltip: "The decay rate for higher octaves of the coherent noise. Lower values will result in smoother noise.", category: "Others", default: "0.5", min: 0.01, max: 1, perObject: "region" },
    fuzzy_skin_point_distance: { type: "float", label: "Fuzzy skin point distance", mode: "simple", scopes: ["process"], tooltip: "The average distance between the random points introduced on each line segment.", unit: "mm", category: "Others", default: "0.3", min: 0.01, max: 5, perObject: "region" },
    fuzzy_skin_ripple_offset: { type: "percent", label: "Ripple offset", mode: "advanced", scopes: ["process"], tooltip: "Shifts the ripple phase forward along the print path by the specified percentage of a wavelength each layer period.\n- 0% keeps every layer identical.\n- 50% shifts the pattern by half a wavelength, effectively inverting the phase.\n- 100% shifts the pattern by a full wavelength, returning to the original phase.\n\nThe shift is applied once every number of layers set by Layers between ripple offset, so layers within the same group are printed identically.", unit: "%", category: "Others", default: "50%", min: 0, max: 100, perObject: "region" },
    fuzzy_skin_ripples_per_layer: { type: "int", label: "Number of ripples per layer", mode: "advanced", scopes: ["process"], tooltip: "Controls how many full cycles of ripples will be added per layer.", category: "Others", default: "15", min: 1, perObject: "region" },
    fuzzy_skin_scale: { type: "float", label: "Fuzzy skin feature size", mode: "advanced", scopes: ["process"], tooltip: "The base size of the coherent noise features, in mm. Higher values will result in larger features.", unit: "mm", category: "Others", default: "1", min: 0.1, max: 500, perObject: "region" },
    fuzzy_skin_thickness: { type: "float", label: "Fuzzy skin thickness", mode: "simple", scopes: ["process"], tooltip: "The width of jittering: it’s recommended to keep this lower than the outer wall line width.", unit: "mm", category: "Others", default: "0.2", min: 0, max: 2, perObject: "region" },
    gap_fill_flow_ratio: { type: "float", label: "Gap fill flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for filling the gaps.\n\nThe actual gap filling flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    gap_fill_target: { type: "enum", label: "Apply gap fill", mode: "advanced", scopes: ["process"], tooltip: "Enables gap fill for the selected solid surfaces. The minimum gap length that will be filled can be controlled from the filter out tiny gaps option below.\n\nOptions:\n1. Everywhere: Applies gap fill to top, bottom and internal solid surfaces for maximum strength\n2. Top and Bottom surfaces: Applies gap fill to top and bottom surfaces only, balancing print speed, reducing potential over extrusion in the solid infill and making sure the top and bottom surfaces have no pinhole gaps\n3. Nowhere: Disables gap fill for all solid infill areas\n\nNote that if using the classic perimeter generator, gap fill may also be generated between perimeters, if a full width line cannot fit between them. That perimeter gap fill is not controlled by this setting.\n\nIf you would like all gap fill, including the classic perimeter generated one, removed, set the filter out tiny gaps value to a large number, like 999999.\n\nHowever this is not advised, as gap fill between perimeters is contributing to the model's strength. For models where excessive gap fill is generated between perimeters, a better option would be to switch to the arachne wall generator and use this option to control whether the cosmetic top and bottom surface gap fill is generated.", category: "Strength", default: "nowhere", enumValues: ["everywhere", "topbottom", "nowhere"], enumLabels: ["Everywhere", "Top and bottom surfaces", "Nowhere"], perObject: "object" },
    gap_infill_speed: { type: "floats", label: "Gap infill", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for gap infill. Gaps usually have irregular line width and should be printed more slowly.", unit: "mm/s", category: "Speed", default: ["30"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    gcode_add_line_number: { type: "bool", label: "Add line number", mode: "develop", scopes: ["process"], tooltip: "Enable this to add line number(Nx) at the beginning of each G-code line.", default: "0" },
    gcode_comments: { type: "bool", label: "Verbose G-code", mode: "advanced", scopes: ["process"], tooltip: "Enable this to get a commented G-code file, with each line explained by a descriptive text. If you print from SD card, the additional weight of the file could make your firmware slow down.", default: "0" },
    gcode_flavor: { type: "enum", label: "G-code flavor", mode: "advanced", scopes: ["machine"], tooltip: "What kind of G-code the printer is compatible with.", default: "marlin", enumValues: ["marlin", "klipper", "reprapfirmware", "repetier", "marlin2"], enumLabels: ["Marlin(legacy)", "Klipper", "RepRapFirmware", "Repetier", "Marlin 2"] },
    gcode_label_objects: { type: "bool", label: "Label objects", mode: "advanced", scopes: ["process"], tooltip: "Enable this to add comments into the G-code labeling print moves with what object they belong to, which is useful for the Octoprint CancelObject plug-in. This setting is NOT compatible with Single Extruder Multi Material setup and Wipe into Object / Wipe into Infill.", default: "1" },
    gcode_skip_config_block: { type: "bool", label: "Skip G-code config block", mode: "advanced", scopes: ["machine"], tooltip: "Do not write the CONFIG_BLOCK (slicer configuration key/value pairs) into the G-code file. This can help with printers whose firmware crashes when parsing these comment lines (e.g. Anycubic go-klipper). Note: the G-code file will no longer contain slicer settings, so importing it back into OrcaSlicer will not restore the configuration.", default: "0" },
    grab_length: { type: "floats", label: "Grab length", mode: "develop", scopes: ["machine"], unit: "mm", default: ["0"], min: 0, slots: "extruder" },
    group_algo_with_time: { type: "bool", label: "group_algo_with_time", mode: "develop", scopes: ["machine"], default: "0" },
    gyroid_optimized: { type: "bool", label: "Z-buckling bias optimization (experimental)", mode: "simple", scopes: ["process"], tooltip: "Tightens the gyroid wave along the Z (vertical) axis at low infill density to shorten the effective vertical column length and improve Z-axis compression buckling resistance. Filament use is preserved. No effect at ~30% sparse infill density and above. Only applies when Sparse infill pattern is set to Gyroid.", category: "Strength", default: "0", perObject: "region" },
    handle_hotend_as_extruder: { type: "bool", label: "handle_hotend_as_extruder", mode: "develop", default: "0" },
    has_filament_switcher: { type: "bool", label: "Has filament switcher", mode: "develop", tooltip: "Printer has a filament switcher hardware (e.g., AMS).", default: "0" },
    has_scarf_joint_seam: { type: "bool", label: "has_scarf_joint_seam", mode: "advanced", default: "0" },
    head_wrap_detect_zone: { type: "points", label: "Head wrap detect zone", mode: "develop", scopes: ["machine"], default: [], slots: "list" },
    high_current_on_filament_swap: { type: "bool", label: "High extruder current on filament swap", mode: "advanced", scopes: ["machine"], tooltip: "It may be beneficial to increase the extruder motor current during the filament exchange sequence to allow for rapid ramming feed rates and to overcome resistance when loading a filament with an ugly shaped tip.", default: "0" },
    hole_to_polyhole: { type: "bool", label: "Convert holes to polyholes", mode: "advanced", scopes: ["process"], tooltip: "Search for almost-circular holes that span more than one layer and convert the geometry to polyholes. Use the nozzle size and the (biggest) diameter to compute the polyhole.\nSee http://hydraraptor.blogspot.com/2011/02/polyholes.html", category: "Quality", default: "0", perObject: "region" },
    hole_to_polyhole_max_edges: { type: "int", label: "Maximum Polyhole edge count", mode: "expert", scopes: ["process"], tooltip: "Maximum number of polyhole edges\nThis setting limits the amount of edges a polyhole can have", category: "Quality", default: "50", min: 3, perObject: "region" },
    hole_to_polyhole_threshold: { type: "floatOrPercent", label: "Polyhole detection margin", mode: "advanced", scopes: ["process"], tooltip: "Maximum defection of a point to the estimated radius of the circle.\nAs cylinders are often exported as triangles of varying size, points may not be on the circle circumference. This setting allows you some leeway to broaden the detection.\nIn mm or in % of the radius.", unit: "mm or %", category: "Quality", default: "0.01", maxLiteral: 10, perObject: "region" },
    hole_to_polyhole_twisted: { type: "bool", label: "Polyhole twist", mode: "advanced", scopes: ["process"], tooltip: "Rotate the polyhole every layer.", category: "Quality", default: "1", perObject: "region" },
    host_type: { type: "enum", label: "Host Type", mode: "advanced", scopes: ["machine"], tooltip: "Orca Slicer can upload G-code files to a printer host. This field must contain the kind of the host.", default: "octoprint", enumValues: ["prusalink", "prusaconnect", "octoprint", "duet", "ultimaker", "flashair", "astrobox", "repetier", "mks", "esp3d", "crealityprint", "obico", "flashforge", "simplyprint", "elegoolink", "3dprinteros", "moonraker"], enumLabels: ["PrusaLink", "PrusaConnect", "Octo/Klipper", "Duet", "UltiMaker", "FlashAir", "AstroBox", "Repetier", "MKS", "ESP3D", "CrealityPrint", "Obico", "Flashforge", "SimplyPrint", "Elegoo Link", "3DPrinterOS", "Moonraker (Klipper)"] },
    hot_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the High Temp Plate.", unit: "℃", default: ["45"], min: 0, max: 300, slots: "filament" },
    hot_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the High Temp Plate.", unit: "℃", default: ["45"], max: 300, slots: "filament" },
    hotend_cooling_rate: { type: "floats", label: "hotend_cooling_rate", mode: "simple", scopes: ["machine"], default: ["2"], nullable: true, slots: "variant" },
    hotend_heating_rate: { type: "floats", label: "hotend_heating_rate", mode: "simple", scopes: ["machine"], default: ["2"], nullable: true, slots: "variant" },
    idle_temperature: { type: "ints", label: "Idle temperature", mode: "simple", scopes: ["filament"], tooltip: "Nozzle temperature when the tool is currently not used in multi-tool setups. This is only used when 'Ooze prevention' is active in Print Settings. Set to 0 to disable.", unit: "℃", default: ["0"], min: 0, max: 1500, slots: "filament" },
    independent_support_layer_height: { type: "bool", label: "Independent support layer height", mode: "advanced", scopes: ["process"], tooltip: "Support layer uses layer height independent with object layer. This is to support customizing Z-gap and save print time. This option will be invalid when the prime tower is enabled.", category: "Support", default: "1" },
    infill_anchor: { type: "floatOrPercent", label: "Sparse infill anchor length", mode: "advanced", scopes: ["process"], tooltip: "Connect an infill line to an internal perimeter with a short segment of an additional perimeter. If expressed as percentage (example: 15%) it is calculated over infill extrusion width. Orca Slicer tries to connect two close infill lines to a short perimeter segment. If no such perimeter segment shorter than infill_anchor_max is found, the infill line is connected to a perimeter segment at just one side and the length of the perimeter segment taken is limited to this parameter, but no longer than anchor_length_max.\nSet this parameter to zero to disable anchoring perimeters connected to a single infill line.", unit: "mm or %", category: "Strength", default: "400%", maxLiteral: 1e3, ratioOver: "sparse_infill_line_width", enumValues: ["0", "1", "2", "5", "10", "1000"], enumLabels: ["0 (no open anchors)", "1 mm", "2 mm", "5 mm", "10 mm", "1000 (unlimited)"], openEnum: true, perObject: "region" },
    infill_anchor_max: { type: "floatOrPercent", label: "Maximum length of the infill anchor", mode: "advanced", scopes: ["process"], tooltip: "Connect an infill line to an internal perimeter with a short segment of an additional perimeter. If expressed as percentage (example: 15%) it is calculated over infill extrusion width. Orca Slicer tries to connect two close infill lines to a short perimeter segment. If no such perimeter segment shorter than this parameter is found, the infill line is connected to a perimeter segment at just one side and the length of the perimeter segment taken is limited to infill_anchor, but no longer than this parameter.\nIf set to 0, the old algorithm for infill connection will be used, it should create the same result as with 1000 & 0.", unit: "mm or %", category: "Strength", default: "20", maxLiteral: 1e3, ratioOver: "sparse_infill_line_width", enumValues: ["0", "1", "2", "5", "10", "1000"], enumLabels: ["0 (Simple connect)", "1 mm", "2 mm", "5 mm", "10 mm", "1000 (unlimited)"], openEnum: true, perObject: "region" },
    infill_combination: { type: "bool", label: "Infill combination", mode: "advanced", scopes: ["process"], tooltip: "Automatically combine sparse infill of several layers to print together in order to reduce time. Walls are still printed with original layer height.", category: "Strength", default: "0", perObject: "region" },
    infill_combination_max_layer_height: { type: "floatOrPercent", label: "Infill combination - Max layer height", mode: "advanced", scopes: ["process"], tooltip: "Maximum layer height for the combined sparse infill.\n\nSet it to 0 or 100% to use the nozzle diameter (for maximum reduction in print time) or a value of ~80% to maximize sparse infill strength.\n\nThe number of layers over which infill is combined is derived by dividing this value with the layer height and rounded down to the nearest decimal.\n\nUse either absolute mm values (eg. 0.32mm for a 0.4mm nozzle) or % values (eg 80%). This value must not be larger than the nozzle diameter.", unit: "mm or %", category: "Strength", default: "100%", min: 0, perObject: "region" },
    infill_direction: { type: "float", label: "Sparse infill direction", mode: "advanced", scopes: ["process"], tooltip: "This is the angle for sparse infill pattern, which controls the start or main direction of lines.", unit: "°", category: "Strength", default: "45", min: 0, max: 360, perObject: "region" },
    infill_jerk: { type: "floats", label: "Infill", mode: "advanced", scopes: ["process"], tooltip: "Jerk for infill.", unit: "mm/s", category: "Speed", default: ["9"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    infill_lock_depth: { type: "float", label: "Infill lock depth", mode: "advanced", scopes: ["process"], tooltip: "The parameter sets the overlapping depth between the interior and skin.", unit: "mm", category: "Strength", default: "1", min: 0, max: 100, perObject: "region" },
    infill_overhang_angle: { type: "float", label: "Infill overhang angle", mode: "advanced", scopes: ["process"], tooltip: "The angle of the infill angled lines. 60° will result in a pure honeycomb.", unit: "°", category: "Strength", default: "60", min: 15, max: 75, perObject: "region" },
    infill_shift_step: { type: "float", label: "Infill shift step", mode: "advanced", scopes: ["process"], tooltip: "This parameter adds a slight displacement to each layer of infill to create a cross texture.", unit: "mm", category: "Strength", default: "0.4", min: 0, max: 10, perObject: "region" },
    infill_wall_overlap: { type: "percent", label: "Infill/wall overlap", mode: "advanced", scopes: ["process"], tooltip: "This allows the infill area to be enlarged slightly to overlap with walls for better bonding. The percentage value is relative to line width of sparse infill. Set this value to ~10-15% to minimize potential over extrusion and accumulation of material resulting in rough top surfaces.", unit: "%", category: "Strength", default: "15%", perObject: "region" },
    inherits: { type: "string", label: "Inherits profile", mode: "simple", scopes: ["process", "filament", "machine"], tooltip: "Name of parent profile.", default: "", fullWidth: true, height: 5 },
    inherits_group: { type: "strings", label: "inherits_group", mode: "simple", default: [], slots: "list" },
    initial_layer_acceleration: { type: "floats", label: "First layer", mode: "advanced", scopes: ["process"], tooltip: "This is the printing acceleration for the first layer. Using limited acceleration can improve build plate adhesion.", unit: "mm/s²", category: "Speed", default: ["300"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    initial_layer_fan_speed: { type: "ints", label: "First layer fan speed", mode: "advanced", scopes: ["filament"], tooltip: 'Sets an exact fan speed for the first layer, overriding all other cooling settings. Useful for protecting 3D-printed toolhead parts (e.g. Voron-style ABS/ASA ducts) from a hot bed. A small amount of airflow cools the ducts down, without using full cooling that may in certain conditions hurt first-layer adhesion.\nFrom the second layer onwards, normal cooling resumes.\nIf "Full fan speed at layer" is also set, the fan ramps smoothly from this value on the first layer up to your target by the chosen layer.\nOnly available when "No cooling for the first" is 0.\nSet to -1 to disable it.', unit: "%", default: ["-1"], min: -1, max: 100, slots: "filament" },
    initial_layer_infill_speed: { type: "floats", label: "First layer infill", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for solid infill parts of the first layer.", unit: "mm/s", default: ["60"], min: 1, nullable: true, slots: "variant" },
    initial_layer_jerk: { type: "floats", label: "First layer", mode: "advanced", scopes: ["process"], tooltip: "Jerk for the first layer.", unit: "mm/s", category: "Speed", default: ["9"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    initial_layer_line_width: { type: "floatOrPercent", label: "First layer", mode: "advanced", scopes: ["process"], tooltip: "Line width of the first layer. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter" },
    initial_layer_min_bead_width: { type: "percent", label: "First layer minimum wall width", mode: "advanced", scopes: ["process"], tooltip: "The minimum wall width that should be used for the first layer is recommended to be set to the same size as the nozzle. This adjustment is expected to enhance adhesion.", unit: "%", category: "Quality", default: "85%", min: 0, perObject: "object" },
    initial_layer_print_height: { type: "float", label: "First layer height", mode: "simple", scopes: ["process"], tooltip: "Height of the first layer. Making the first layer height thicker can improve build plate adhesion.", unit: "mm", category: "Quality", default: "0.2", min: 0 },
    initial_layer_speed: { type: "floats", label: "First layer", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for the first layer except for solid infill sections.", unit: "mm/s", default: ["30"], min: 1, nullable: true, slots: "variant" },
    initial_layer_travel_acceleration: { type: "floatsOrPercents", label: "First layer travel", mode: "advanced", scopes: ["process"], tooltip: "Travel acceleration of first layer.\nThe percentage value is relative to Travel Acceleration.", unit: "mm/s² or %", default: ["100%"], min: 0, ratioOver: "travel_acceleration", nullable: true, slots: "variant" },
    initial_layer_travel_jerk: { type: "floatsOrPercents", label: "First layer travel", mode: "advanced", scopes: ["process"], tooltip: "Travel jerk of first layer.\nThe percentage value is relative to Travel Jerk.", unit: "mm/s or %", default: ["100%"], min: 0, ratioOver: "travel_jerk", nullable: true, slots: "variant" },
    initial_layer_travel_speed: { type: "floatsOrPercents", label: "First layer travel speed", mode: "advanced", scopes: ["process"], tooltip: "Travel speed of the first layer.", unit: "mm/s or %", category: "Speed", default: ["100%"], min: 1, ratioOver: "travel_speed", nullable: true, slots: "variant" },
    inner_wall_acceleration: { type: "floats", label: "Inner wall", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of inner walls.", unit: "mm/s²", category: "Speed", default: ["10000"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    inner_wall_filament_id: { type: "int", label: "Inner walls", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print inner walls.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    inner_wall_flow_ratio: { type: "float", label: "Inner wall flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for inner walls.\n\nThe actual inner wall flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    inner_wall_jerk: { type: "floats", label: "Inner wall", mode: "advanced", scopes: ["process"], tooltip: "Jerk of inner walls.", unit: "mm/s", category: "Speed", default: ["9"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    inner_wall_line_width: { type: "floatOrPercent", label: "Inner wall", mode: "advanced", scopes: ["process"], tooltip: "Line width of inner wall. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    inner_wall_speed: { type: "floats", label: "Inner wall", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for inner walls.", unit: "mm/s", category: "Speed", default: ["60"], min: 1, nullable: true, slots: "variant", perObject: "region", aliases: ["perimeter_feed_rate"] },
    input_shaping_damp_x: { type: "float", label: "X", mode: "expert", scopes: ["machine"], tooltip: "Damping ratio for the X axis input shaper.\nZero will use the firmware damping ratio.\nTo disable input shaping, use the Disable type.\nRRF: X and Y values are equal.", default: "0.1", min: 0, max: 1 },
    input_shaping_damp_y: { type: "float", label: "Y", mode: "expert", scopes: ["machine"], tooltip: "Damping ratio for the Y axis input shaper.\nZero will use the firmware damping ratio.\nTo disable input shaping, use the Disable type.", default: "0.1", min: 0, max: 1 },
    input_shaping_emit: { type: "bool", label: "Emit input shaping", mode: "expert", scopes: ["machine"], tooltip: "Override firmware input shaping settings.\nIf disabled, firmware settings are used.", default: "0" },
    input_shaping_freq_x: { type: "float", label: "X", mode: "expert", scopes: ["machine"], tooltip: "Resonant frequency for the X axis input shaper.\nZero will use the firmware frequency.\nTo disable input shaping, use the Disable type.\nRRF: X and Y values are equal.", unit: "Hz", default: "0", min: 0, max: 1e3 },
    input_shaping_freq_y: { type: "float", label: "Y", mode: "expert", scopes: ["machine"], tooltip: "Resonant frequency for the Y axis input shaper.\nZero will use the firmware frequency.\nTo disable input shaping, use the Disable type.", unit: "Hz", default: "0", min: 0, max: 1e3 },
    input_shaping_type: { type: "enum", label: "Input shaper type", mode: "expert", scopes: ["machine"], tooltip: "Choose the input shaper algorithm.\nDefault uses the firmware default settings.\nDisable turns off input shaping in the firmware.", default: "Default", enumValues: ["Default", "MZV", "ZV", "ZVD", "ZVDD", "ZVDDD", "EI", "EI2", "2HUMP_EI", "EI3", "3HUMP_EI", "DAA", "Disable"] },
    interface_shells: { type: "bool", label: "Interface shells", mode: "advanced", scopes: ["process"], tooltip: "Force the generation of solid shells between adjacent materials/volumes. Useful for multi-extruder prints with translucent materials or manual soluble support material.", category: "Quality", default: "0", perObject: "object" },
    interlocking_beam: { type: "bool", label: "Use beam interlocking", mode: "advanced", scopes: ["process"], tooltip: "Generate interlocking beam structure at the locations where different filaments touch. This improves the adhesion between filaments, especially models printed in different materials.", category: "Advanced", default: "0", perObject: "object" },
    interlocking_beam_layer_count: { type: "int", label: "Interlocking beam layers", mode: "advanced", scopes: ["process"], tooltip: "The height of the beams of the interlocking structure, measured in number of layers. Less layers is stronger, but more prone to defects.", category: "Advanced", default: "2", min: 1, perObject: "object" },
    interlocking_beam_width: { type: "float", label: "Interlocking beam width", mode: "advanced", scopes: ["process"], tooltip: "The width of the interlocking structure beams.", unit: "mm", category: "Advanced", default: "0.8", min: 0.01, perObject: "object" },
    interlocking_boundary_avoidance: { type: "int", label: "Interlocking boundary avoidance", mode: "advanced", scopes: ["process"], tooltip: "The distance from the outside of a model where interlocking structures will not be generated, measured in cells.", category: "Advanced", default: "2", min: 0, perObject: "object" },
    interlocking_depth: { type: "int", label: "Interlocking depth", mode: "advanced", scopes: ["process"], tooltip: "The distance from the boundary between filaments to generate interlocking structure, measured in cells. Too few cells will result in poor adhesion.", category: "Advanced", default: "2", min: 1, perObject: "object" },
    interlocking_orientation: { type: "float", label: "Interlocking direction", mode: "advanced", scopes: ["process"], tooltip: "Orientation of interlock beams.", unit: "°", category: "Advanced", default: "22.5", min: 0, max: 360, perObject: "object" },
    internal_bridge_angle: { type: "float", label: "Internal bridge infill direction", mode: "advanced", scopes: ["process"], tooltip: "Internal Bridging angle override.\nIf left to zero, the bridging angle will be calculated automatically for each specific bridge.\nOtherwise the provided angle will be used according to:\n - The absolute coordinates\n - The absolute coordinates + Model rotation: If Align directions to model is enabled\n - The optimal automatic angle + this value: If 'Relative Bridge Angle' is enabled\n\nUse 180° for zero absolute angle.", unit: "°", category: "Strength", default: "0", min: 0, max: 180, perObject: "region" },
    internal_bridge_density: { type: "percent", label: "Internal bridge density", mode: "advanced", scopes: ["process"], tooltip: "Controls the density (spacing) of internal bridge lines.\nInternal bridges act as intermediate support between sparse infill and top solid infill and can strongly affect top surface quality.\n\n- Higher than 100% density (Recommended Max 125%):\n  - Pros: Improves internal bridge strength and support under top layers, reducing sagging and improving top-surface finish.\n  - Cons: Increases material use and print time; excessive density may cause overextrusion and internal stresses.\n\n- Lower than 100% density (Min 10%):\n  - Pros: Can reduce pillowing and improve cooling (more airflow through the bridge), and may speed up printing.\n  - Cons: May reduce internal support, increasing the risk of sagging and top surface defects.\n\nThis option works particularly well when combined with the second internal bridge over infill option to improve bridging further before solid infill is extruded.", unit: "%", category: "Strength", default: "100%", min: 10, max: 125, perObject: "object" },
    internal_bridge_fan_speed: { type: "ints", label: "Internal bridges fan speed", mode: "advanced", scopes: ["filament"], tooltip: "The part cooling fan speed used for all internal bridges. Set to -1 to use the overhang fan speed settings instead.\n\nReducing the internal bridges fan speed, compared to your regular fan speed, can help reduce part warping due to excessive cooling applied over a large surface for a prolonged period of time.", unit: "%", default: ["-1"], min: -1, max: 100, slots: "filament" },
    internal_bridge_flow: { type: "float", label: "Internal bridge flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This value governs the thickness of the internal bridge layer. This is the first layer over sparse infill so increasing it may increase strength and upper layer quality.\nValues above 1.0: Increase the amount of material while maintaining line spacing. This can improve line contact and strength.\nValues below 1.0: Reduce the amount of material while adjusting line spacing to maintain contact. This can improve sagging.\n\nThe actual bridge flow used is calculated by multiplying this value with the filament flow ratio, and if set, the object's flow ratio.", category: "Quality", default: "1", min: 0, max: 2, perObject: "region" },
    internal_bridge_speed: { type: "floatsOrPercents", label: "Internal", mode: "advanced", scopes: ["process"], tooltip: "Speed of internal bridges. If the value is expressed as a percentage, it will be calculated based on the bridge_speed. Default value is 150%.", unit: "mm/s or %", category: "Speed", default: ["150%"], min: 1, ratioOver: "bridge_speed", nullable: true, slots: "variant", perObject: "region" },
    internal_solid_filament_id: { type: "int", label: "Internal solid infill", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print internal solid infill.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    internal_solid_infill_acceleration: { type: "floatsOrPercents", label: "Internal solid infill", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of internal solid infill. If the value is expressed as a percentage (e.g. 100%), it will be calculated based on the default acceleration.", unit: "mm/s² or %", category: "Speed", default: ["100%"], min: 0, ratioOver: "default_acceleration", nullable: true, slots: "variant", perObject: "object" },
    internal_solid_infill_flow_ratio: { type: "float", label: "Internal solid infill flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for internal solid infill.\n\nThe actual internal solid infill flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    internal_solid_infill_line_width: { type: "floatOrPercent", label: "Internal solid infill", mode: "advanced", scopes: ["process"], tooltip: "Line width of internal solid infill. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    internal_solid_infill_pattern: { type: "enum", label: "Internal solid infill pattern", mode: "simple", scopes: ["process"], tooltip: "Line pattern of internal solid infill. if the detect narrow internal solid infill be enabled, the concentric pattern will be used for the small area.", category: "Strength", default: "monotonic", enumValues: ["monotonic", "monotonicline", "rectilinear", "alignedrectilinear", "concentric", "spiralinset", "hilbertcurve", "archimedeanchords", "octagramspiral"], enumLabels: ["Monotonic", "Monotonic line", "Rectilinear", "Aligned Rectilinear", "Concentric", "Spiral Inset", "Hilbert Curve", "Archimedean Chords", "Octagram Spiral"], perObject: "region" },
    internal_solid_infill_speed: { type: "floats", label: "Internal solid infill", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for internal solid infill, not including the top or bottom surface.", unit: "mm/s", category: "Speed", default: ["100"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    ironing_angle: { type: "float", label: "Ironing angle offset", mode: "advanced", scopes: ["process"], tooltip: "The angle of ironing lines offset from the top surface.", unit: "°", category: "Quality", default: "0", min: 0, max: 359, perObject: "region" },
    ironing_angle_fixed: { type: "bool", label: "Fixed ironing angle", mode: "advanced", scopes: ["process"], tooltip: "Use a fixed absolute angle for ironing.", category: "Quality", default: "0", perObject: "region" },
    ironing_expansion: { type: "float", label: "Ironing expansion", mode: "expert", scopes: ["process"], tooltip: "Expand or contract the ironing area.", unit: "mm", category: "Quality", default: "0", min: -100, max: 100 },
    ironing_fan_speed: { type: "ints", label: "Ironing fan speed", mode: "advanced", scopes: ["filament"], tooltip: "This part cooling fan speed is applied when ironing. Setting this parameter to a lower than regular speed reduces possible nozzle clogging due to the low volumetric flow rate, making the interface smoother.\nSet to -1 to disable it.", unit: "%", default: ["-1"], min: -1, max: 100, slots: "filament" },
    ironing_flow: { type: "percent", label: "Ironing flow", mode: "advanced", scopes: ["process"], tooltip: "This is the amount of material to be extruded during ironing. It is relative to the flow of normal layer height. Too high a value will result in overextrusion on the surface.", unit: "%", category: "Quality", default: "10%", min: 0, max: 100, perObject: "region" },
    ironing_inset: { type: "float", label: "Ironing inset", mode: "advanced", scopes: ["process"], tooltip: "The distance to keep from the edges. A value of 0 sets this to half of the nozzle diameter.", unit: "mm", category: "Quality", default: "0", min: 0, max: 100, perObject: "region" },
    ironing_pattern: { type: "enum", label: "Ironing Pattern", mode: "advanced", scopes: ["process"], tooltip: "The pattern that will be used when ironing.", category: "Quality", default: "rectilinear", enumValues: ["rectilinear", "concentric"], enumLabels: ["Rectilinear", "Concentric"], perObject: "region" },
    ironing_spacing: { type: "float", label: "Ironing line spacing", mode: "advanced", scopes: ["process"], tooltip: "This is the distance between the lines used for ironing.", unit: "mm", category: "Quality", default: "0.1", min: 0, max: 1, perObject: "region" },
    ironing_speed: { type: "float", label: "Ironing speed", mode: "advanced", scopes: ["process"], tooltip: "This is the print speed for ironing lines.", unit: "mm/s", category: "Quality", default: "20", min: 1, perObject: "region" },
    ironing_type: { type: "enum", label: "Ironing type", mode: "advanced", scopes: ["process"], tooltip: "Ironing uses a small flow to print at the same height of a surface to make flat surfaces smoother. This setting controls which layers are being ironed.", category: "Quality", default: "no ironing", enumValues: ["no ironing", "top", "topmost", "solid"], enumLabels: ["No ironing", "All top surfaces", "Topmost surface only", "All solid layers"], perObject: "region" },
    is_infill_first: { type: "bool", label: "Print infill first", mode: "advanced", scopes: ["process"], tooltip: "Order of wall/infill. When the tickbox is unchecked the walls are printed first, which works best in most cases.\n\nPrinting infill first may help with extreme overhangs as the walls have the neighbouring infill to adhere to. However, the infill will slightly push out the printed walls where it is attached to them, resulting in a worse external surface finish. It can also cause the infill to shine through the external surfaces of the part.", category: "Quality", default: "0", perObject: "region" },
    lateral_lattice_angle_1: { type: "float", label: "Lateral lattice angle 1", mode: "advanced", scopes: ["process"], tooltip: "The angle of the first set of Lateral lattice elements in the Z direction. Zero is vertical.", unit: "°", category: "Strength", default: "-45", min: -75, max: 75, perObject: "region" },
    lateral_lattice_angle_2: { type: "float", label: "Lateral lattice angle 2", mode: "advanced", scopes: ["process"], tooltip: "The angle of the second set of Lateral lattice elements in the Z direction. Zero is vertical.", unit: "°", category: "Strength", default: "45", min: -75, max: 75, perObject: "region" },
    layer_change_gcode: { type: "string", label: "Layer change G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code is inserted at every layer change after the Z lift.", default: "", multiline: true, fullWidth: true, height: 5 },
    layer_height: { type: "float", label: "Layer height", mode: "simple", scopes: ["process"], tooltip: "This is the height for each layer. Smaller layer heights give greater accuracy but longer printing time.", unit: "mm", category: "Quality", default: "0.2", min: 0, perObject: "object" },
    lightning_overhang_angle: { type: "float", label: "Lightning overhang angle", mode: "expert", scopes: ["process"], tooltip: "Maximum overhang angle for Lightning infill support propagation.", unit: "°", category: "Strength", default: "45", min: 5, max: 85, perObject: "region" },
    lightning_prune_angle: { type: "float", label: "Prune angle", mode: "expert", scopes: ["process"], tooltip: "Controls how aggressively short or unsupported Lightning branches are pruned.\nThis angle is converted internally to a per-layer distance.", unit: "°", category: "Strength", default: "45", min: 5, max: 85, perObject: "region" },
    lightning_straightening_angle: { type: "float", label: "Straightening angle", mode: "expert", scopes: ["process"], tooltip: "Maximum straightening angle used to simplify Lightning branches.", unit: "°", category: "Strength", default: "45", min: 5, max: 85, perObject: "region" },
    line_width: { type: "floatOrPercent", label: "Default", mode: "advanced", scopes: ["process"], tooltip: "Default line width if other line widths are set to 0. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "object" },
    long_retractions_when_cut: { type: "bools", label: "Long retraction when cut (beta)", mode: "develop", scopes: ["machine"], tooltip: "Experimental feature: Retracting and cutting off the filament at a longer distance during changes to minimize purge. While this reduces flush significantly, it may also raise the risk of nozzle clogs or other printing problems.", default: ["0"], slots: "variant" },
    long_retractions_when_ec: { type: "bools", label: "Long retraction when extruder change", mode: "advanced", scopes: ["filament"], default: ["0"], nullable: true, slots: "variant" },
    machine_bed_mass_Y: { type: "float", label: "Bed mass of the Y axis", mode: "develop", scopes: ["machine"], tooltip: "The machine bed mass load of Y axis", unit: "g", category: "Machine limits", default: "0", min: 0 },
    machine_end_gcode: { type: "string", label: "End G-code", mode: "advanced", scopes: ["machine"], tooltip: "Add end G-Code when finishing the entire print.", default: "M104 S0 ; turn off temperature\nG28 X0  ; home X axis\nM84     ; disable motors\n", multiline: true, fullWidth: true, height: 12 },
    machine_hotend_change_time: { type: "float", label: "Hotend change time", mode: "advanced", scopes: ["machine"], tooltip: "Time to change hotend.", unit: "s", default: "0", min: 0 },
    machine_load_filament_time: { type: "float", label: "Filament load time", mode: "advanced", scopes: ["machine"], tooltip: "Time to load new filament when switch filament. It's usually applicable for single-extruder multi-material machines. For tool changers or multi-tool machines, it's typically 0. For statistics only.", unit: "s", default: "0", min: 0 },
    machine_max_acceleration_e: { type: "floats", label: "Maximum acceleration E", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration of the E axis", unit: "mm/s²", category: "Machine limits", default: ["5000", "5000"], min: 0, slots: "variant" },
    machine_max_acceleration_extruding: { type: "floats", label: "Maximum acceleration for extruding", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration for extruding (M204 P)", unit: "mm/s²", category: "Machine limits", default: ["1500", "1250"], min: 0, slots: "variant" },
    machine_max_acceleration_retracting: { type: "floats", label: "Maximum acceleration for retracting", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration for retracting (M204 R)", unit: "mm/s²", category: "Machine limits", default: ["1500", "1250"], min: 0, slots: "variant" },
    machine_max_acceleration_travel: { type: "floats", label: "Maximum acceleration for travel", mode: "advanced", scopes: ["machine"], tooltip: "Maximum acceleration for travel (M204 T), it only applies to Marlin 2.", unit: "mm/s²", category: "Machine limits", default: ["0", "0"], min: 0, slots: "variant" },
    machine_max_acceleration_x: { type: "floats", label: "Maximum acceleration X", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration of the X axis", unit: "mm/s²", category: "Machine limits", default: ["1000", "1000"], min: 0, slots: "variant" },
    machine_max_acceleration_y: { type: "floats", label: "Maximum acceleration Y", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration of the Y axis", unit: "mm/s²", category: "Machine limits", default: ["1000", "1000"], min: 0, slots: "variant" },
    machine_max_acceleration_z: { type: "floats", label: "Maximum acceleration Z", mode: "simple", scopes: ["machine"], tooltip: "Maximum acceleration of the Z axis", unit: "mm/s²", category: "Machine limits", default: ["500", "200"], min: 0, slots: "variant" },
    machine_max_force_Y: { type: "float", label: "Maximum force of the Y axis", mode: "develop", scopes: ["machine"], tooltip: "The allowed maximum output force of Y axis", unit: "N", category: "Machine limits", default: "0", min: 0 },
    machine_max_jerk_e: { type: "floats", label: "Maximum jerk E", mode: "simple", scopes: ["machine"], tooltip: "Maximum jerk of the E axis", unit: "mm/s", category: "Machine limits", default: ["2.5", "2.5"], min: 0, slots: "variant" },
    machine_max_jerk_x: { type: "floats", label: "Maximum jerk X", mode: "simple", scopes: ["machine"], tooltip: "Maximum jerk of the X axis", unit: "mm/s", category: "Machine limits", default: ["10", "10"], min: 0, slots: "variant" },
    machine_max_jerk_y: { type: "floats", label: "Maximum jerk Y", mode: "simple", scopes: ["machine"], tooltip: "Maximum jerk of the Y axis", unit: "mm/s", category: "Machine limits", default: ["10", "10"], min: 0, slots: "variant" },
    machine_max_jerk_z: { type: "floats", label: "Maximum jerk Z", mode: "simple", scopes: ["machine"], tooltip: "Maximum jerk of the Z axis", unit: "mm/s", category: "Machine limits", default: ["0.2", "0.4"], min: 0, slots: "variant" },
    machine_max_junction_deviation: { type: "floats", label: "Maximum Junction Deviation", mode: "advanced", scopes: ["machine"], tooltip: "Maximum junction deviation (M205 J, only apply if JD > 0 for Marlin Firmware\nIf your Marlin 2 printer uses Classic Jerk set this value to 0.)", unit: "mm", category: "Machine limits", default: ["0.01"], min: 0, max: 0.3, slots: "variant" },
    machine_max_printed_mass: { type: "float", label: "The allowed max printed mass", mode: "develop", scopes: ["machine"], tooltip: "The allowed max printed mass on a plate", unit: "g", category: "Machine limits", default: "0", min: 0 },
    machine_max_speed_e: { type: "floats", label: "Maximum speed E", mode: "simple", scopes: ["machine"], tooltip: "Maximum speed of E axis", unit: "mm/s", category: "Machine limits", default: ["120", "120"], min: 0, slots: "variant" },
    machine_max_speed_x: { type: "floats", label: "Maximum speed X", mode: "simple", scopes: ["machine"], tooltip: "Maximum speed of X axis", unit: "mm/s", category: "Machine limits", default: ["500", "200"], min: 0, slots: "variant" },
    machine_max_speed_y: { type: "floats", label: "Maximum speed Y", mode: "simple", scopes: ["machine"], tooltip: "Maximum speed of Y axis", unit: "mm/s", category: "Machine limits", default: ["500", "200"], min: 0, slots: "variant" },
    machine_max_speed_z: { type: "floats", label: "Maximum speed Z", mode: "simple", scopes: ["machine"], tooltip: "Maximum speed of Z axis", unit: "mm/s", category: "Machine limits", default: ["12", "12"], min: 0, slots: "variant" },
    machine_min_extruding_rate: { type: "floats", label: "Minimum speed for extruding", mode: "develop", scopes: ["machine"], tooltip: "Minimum speed for extruding (M205 S)", unit: "mm/s", category: "Machine limits", default: ["0", "0"], min: 0, slots: "machineLimits" },
    machine_min_travel_rate: { type: "floats", label: "Minimum travel speed", mode: "develop", scopes: ["machine"], tooltip: "Minimum travel speed (M205 T)", unit: "mm/s", category: "Machine limits", default: ["0", "0"], min: 0, slots: "machineLimits" },
    machine_pause_gcode: { type: "string", label: "Pause G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code will be used as a code for the pause print. Users can insert pause G-code in the G-code viewer.", default: "", multiline: true, fullWidth: true, height: 12 },
    machine_prepare_compensation_time: { type: "float", label: "machine_prepare_compensation_time", mode: "develop", scopes: ["machine"], default: "260" },
    machine_start_gcode: { type: "string", label: "Start G-code", mode: "advanced", scopes: ["machine"], tooltip: "G-code added when starting a print.", default: "G28 ; home all axes\nG1 Z5 F5000 ; lift nozzle\n", multiline: true, fullWidth: true, height: 12 },
    machine_tool_change_time: { type: "float", label: "Tool change time", mode: "advanced", scopes: ["machine"], tooltip: "Time taken to switch tools. It's usually applicable for tool changers or multi-tool machines. For single-extruder multi-material machines, it's typically 0. For statistics only.", unit: "s", default: "0", min: 0 },
    machine_unload_filament_time: { type: "float", label: "Filament unload time", mode: "advanced", scopes: ["machine"], tooltip: "Time to unload old filament when switch filament. It's usually applicable for single-extruder multi-material machines. For tool changers or multi-tool machines, it's typically 0. For statistics only.", unit: "s", default: "0", min: 0 },
    make_overhang_printable: { type: "bool", label: "Make overhangs printable", mode: "advanced", scopes: ["process"], tooltip: "Modify the geometry to print overhangs without support material.", category: "Quality", default: "0", perObject: "region" },
    make_overhang_printable_angle: { type: "float", label: "Make overhangs printable - Maximum angle", mode: "advanced", scopes: ["process"], tooltip: "Maximum angle of overhangs to allow after making more steep overhangs printable.90° will not change the model at all and allow any overhang, while 0 will replace all overhangs with conical material.", unit: "°", category: "Quality", default: "55", min: 0, max: 90, perObject: "object" },
    make_overhang_printable_hole_size: { type: "float", label: "Make overhangs printable - Hole area", mode: "advanced", scopes: ["process"], tooltip: "Maximum area of a hole in the base of the model before it's filled by conical material. A value of 0 will fill all the holes in the model base.", unit: "mm²", category: "Quality", default: "0", min: 0, perObject: "object" },
    manual_filament_change: { type: "bool", label: "Manual Filament Change", mode: "advanced", scopes: ["machine"], tooltip: "Enable this option to omit the custom Change filament G-code only at the beginning of the print. The tool change command (e.g., T0) will be skipped throughout the entire print. This is useful for manual multi-material printing, where we use M600/PAUSE to trigger the manual filament change action.", default: "0" },
    master_extruder_id: { type: "int", label: "Master extruder id", mode: "simple", scopes: ["machine"], tooltip: "Default extruder id to place filament.", default: "1" },
    max_bridge_length: { type: "float", label: "Max bridge length", mode: "advanced", scopes: ["process"], tooltip: "This is the maximum length of bridges that don't need support. Set it to 0 if you want all bridges to be supported, and set it to a very large value if you don't want any bridges to be supported.", unit: "mm", category: "Support", default: "10", min: 0, perObject: "object" },
    max_layer_height: { type: "floats", label: "Max", mode: "advanced", scopes: ["machine"], tooltip: "The highest printable layer height for the extruder. Used to limit the maximum layer height when enable adaptive layer height.", unit: "mm", default: ["0"], min: 0, slots: "extruder" },
    max_resonance_avoidance_speed: { type: "float", label: "Max", mode: "advanced", scopes: ["machine"], tooltip: "Maximum speed of resonance avoidance.", unit: "mm/s", default: "120", min: 0 },
    max_travel_detour_distance: { type: "floatOrPercent", label: "Avoid crossing walls - Max detour length", mode: "advanced", scopes: ["process"], tooltip: "Maximum detour distance for avoiding crossing wall: The printer won't detour if the detour distance is larger than this value. Detour length could be specified either as an absolute value or as percentage (for example 50%) of a direct travel path. A value of 0 will disable this.", unit: "mm or %", category: "Quality", default: "0", min: 0, maxLiteral: 1e3 },
    max_volumetric_extrusion_rate_slope: { type: "float", label: "Extrusion rate smoothing", mode: "advanced", scopes: ["process"], tooltip: "This parameter smooths out sudden extrusion rate changes that happen when the printer transitions from printing a high flow (high speed/larger width) extrusion to a lower flow (lower speed/smaller width) extrusion and vice versa.\n\nIt defines the maximum rate by which the extruded volumetric flow in mm³/s can change over time. Higher values mean higher extrusion rate changes are allowed, resulting in faster speed transitions.\n\nA value of 0 disables the feature.\n\nFor a high speed, high flow direct drive printer (like the Bambu lab or Voron) this value is usually not needed. However it can provide some marginal benefit in certain cases where feature speeds vary greatly. For example, when there are aggressive slowdowns due to overhangs. In these cases a high value of around 300-350 mm³/s² is recommended as this allows for just enough smoothing to assist pressure advance achieve a smoother flow transition.\n\nFor slower printers without pressure advance, the value should be set much lower. A value of 10-15 mm³/s² is a good starting point for direct drive extruders and 5-10 mm³/s² for Bowden style.\n\nThis feature is known as Pressure Equalizer in Prusa slicer.\n\nNote: this parameter disables arc fitting.", unit: "mm³/s²", default: "0", min: 0 },
    max_volumetric_extrusion_rate_slope_segment_length: { type: "float", label: "Smoothing segment length", mode: "advanced", scopes: ["process"], tooltip: "A lower value results in smoother extrusion rate transitions. However, this results in a significantly larger G-code file and more instructions for the printer to process.\n\nDefault value of 3 works well for most cases. If your printer is stuttering, increase this value to reduce the number of adjustments made.\n\nAllowed values: 0.5-5", unit: "mm", default: "3", min: 0.5, max: 5 },
    min_bead_width: { type: "percent", label: "Minimum wall width", mode: "advanced", scopes: ["process"], tooltip: "Width of the wall that will replace thin features (according to the Minimum feature size) of the model. If the Minimum wall width is thinner than the thickness of the feature, the wall will become as thick as the feature itself. It's expressed as a percentage over nozzle diameter.", unit: "%", category: "Quality", default: "85%", min: 0, perObject: "object" },
    min_feature_size: { type: "percent", label: "Minimum feature size", mode: "advanced", scopes: ["process"], tooltip: "Minimum thickness of thin features. Model features that are thinner than this value will not be printed, while features thicker than than this value will be widened to the minimum wall width. It's expressed as a percentage over nozzle diameter.", unit: "%", category: "Quality", default: "25%", min: 0, perObject: "object" },
    min_layer_height: { type: "floats", label: "Min", mode: "advanced", scopes: ["machine"], tooltip: "The lowest printable layer height for the extruder. Used to limit the minimum layer height when enable adaptive layer height.", unit: "mm", default: ["0.07"], min: 0, slots: "extruder" },
    min_length_factor: { type: "float", label: "Minimum wall length", mode: "advanced", scopes: ["process"], tooltip: "Adjust this value to prevent short, unclosed walls from being printed, which could increase print time. Higher values remove more and longer walls.\n\nNOTE: Bottom and top surfaces will not be affected by this value to prevent visual gaps on the outside of the model. Adjust 'One wall threshold' in the Advanced settings below to adjust the sensitivity of what is considered a top-surface. 'One wall threshold' is only visible if this setting is set above the default value of 0.5, or if single-wall top surfaces is enabled.", unit: "mm", category: "Quality", default: "0.5", min: 0, max: 25, perObject: "object" },
    min_resonance_avoidance_speed: { type: "float", label: "Min", mode: "advanced", scopes: ["machine"], tooltip: "Minimum speed of resonance avoidance.", unit: "mm/s", default: "70", min: 0 },
    min_skirt_length: { type: "float", label: "Skirt minimum extrusion length", mode: "advanced", scopes: ["process"], tooltip: "Minimum filament extrusion length in mm when printing the skirt. Zero means this feature is disabled.\n\nUsing a non-zero value is useful if the printer is set up to print without a prime line.\nFinal number of loops is not taking into account while arranging or validating objects distance. Increase loop number in such case.", unit: "mm", default: "0", min: 0 },
    min_width_top_surface: { type: "floatOrPercent", label: "One wall threshold", mode: "advanced", scopes: ["process"], tooltip: "If a top surface has to be printed and it's partially covered by another layer, it won't be considered at a top layer where its width is below this value. This can be useful to not let the 'one perimeter on top' trigger on surface that should be covered only by perimeters. This value can be a mm or a % of the perimeter extrusion width.\nWarning: If enabled, artifacts can be created if you have some thin features on the next layer, like letters. Set this setting to 0 to remove these artifacts.", unit: "mm or %", category: "Quality", default: "300%", min: 0, maxLiteral: 15, ratioOver: "inner_wall_line_width", perObject: "region" },
    minimum_sparse_infill_area: { type: "float", label: "Minimum sparse infill threshold", mode: "advanced", scopes: ["process"], tooltip: "Sparse infill areas which are smaller than this threshold value are replaced by internal solid infill.", unit: "mm²", category: "Strength", default: "15", min: 0, perObject: "region" },
    mmu_segmented_region_interlocking_depth: { type: "float", label: "Interlocking depth of a segmented region", mode: "advanced", scopes: ["process"], tooltip: 'Interlocking depth of a segmented region. It will be ignored if "mmu_segmented_region_max_width" is zero or if "mmu_segmented_region_interlocking_depth" is bigger than "mmu_segmented_region_max_width". Zero disables this feature.', unit: "mm", category: "Advanced", default: "0", min: 0, perObject: "object" },
    mmu_segmented_region_max_width: { type: "float", label: "Maximum width of a segmented region", mode: "advanced", scopes: ["process"], tooltip: "Maximum width of a segmented region. A value of 0 disables this feature.", unit: "mm", category: "Advanced", default: "0", min: 0, perObject: "object" },
    notes: { type: "string", label: "Configuration notes", mode: "advanced", scopes: ["process"], tooltip: "You can put here your personal notes. This text will be added to the G-code header comments.", default: "", multiline: true, fullWidth: true, height: 13 },
    nozzle_diameter: { type: "floats", label: "Nozzle diameter", mode: "advanced", scopes: ["machine"], tooltip: "The diameter of nozzle.", unit: "mm", default: ["0.4"], max: 100, slots: "extruder" },
    nozzle_flush_dataset: { type: "ints", label: "nozzle_flush_dataset", mode: "simple", scopes: ["machine"], default: ["0"], nullable: true, slots: "variant" },
    nozzle_height: { type: "float", label: "Nozzle height", mode: "develop", scopes: ["machine"], tooltip: "The height of nozzle tip.", unit: "mm", default: "2.5", min: 0 },
    nozzle_hrc: { type: "int", label: "Nozzle HRC", mode: "develop", scopes: ["machine"], tooltip: "The nozzle's hardness. Zero means no checking for nozzle hardness during slicing.", unit: "HRC", default: "0", min: 0, max: 500 },
    nozzle_temperature: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Nozzle temperature", tooltip: "Nozzle temperature after the first layer", unit: "℃", default: ["200"], min: 0, max: 1500, slots: "variant" },
    nozzle_temperature_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer nozzle temperature", tooltip: "Nozzle temperature for printing the first layer with this filament", unit: "℃", default: ["200"], min: 0, max: 1500, slots: "variant" },
    nozzle_temperature_range_high: { type: "ints", label: "Max", mode: "simple", scopes: ["filament"], unit: "℃", default: ["240"], min: 0, max: 1500, slots: "filament" },
    nozzle_temperature_range_low: { type: "ints", label: "Min", mode: "simple", scopes: ["filament"], unit: "℃", default: ["190"], min: 0, max: 1500, slots: "filament" },
    nozzle_type: { type: "enums", label: "Nozzle type", mode: "advanced", scopes: ["machine"], tooltip: "The metallic material of the nozzle: This determines the abrasive resistance of the nozzle and what kind of filament can be printed.", default: ["undefine"], enumValues: ["undefine", "hardened_steel", "stainless_steel", "tungsten_carbide", "brass"], enumLabels: ["Undefined", "Hardened steel", "Stainless steel", "Tungsten carbide", "Brass"], nullable: true, slots: "variant" },
    nozzle_volume: { type: "floats", label: "Nozzle volume", mode: "advanced", scopes: ["machine"], tooltip: "Volume of nozzle between the filament cutter and the end of the nozzle", unit: "mm³", default: ["0"], nullable: true, slots: "variant" },
    nozzle_volume_type: { type: "enums", label: "Nozzle Volume Type", mode: "simple", tooltip: "Nozzle volume type for extruders.", default: ["Standard"], enumValues: ["Standard", "High Flow", "Hybrid", "TPU High Flow"], slots: "extruder" },
    only_one_wall_first_layer: { type: "bool", label: "Only one wall on first layer", mode: "simple", scopes: ["process"], tooltip: "Use only one wall on first layer, to give more space to the bottom infill pattern.", category: "Quality", default: "0", perObject: "region" },
    only_one_wall_top: { type: "bool", label: "Only one wall on top surfaces", mode: "simple", scopes: ["process"], tooltip: "Use only one wall on flat top surfaces, to give more space to the top infill pattern.", category: "Quality", default: "0", perObject: "region" },
    ooze_prevention: { type: "bool", label: "Enable", mode: "advanced", scopes: ["process"], tooltip: "This option will drop the temperature of the inactive extruders to prevent oozing.", default: "0" },
    other_layers_print_sequence: { type: "ints", label: "Other layers print sequence", mode: "simple", default: ["0"], min: 0, max: 16, slots: "list" },
    other_layers_print_sequence_nums: { type: "int", label: "The number of other layers print sequence", mode: "simple", default: "0" },
    other_layers_sequence_choice: { type: "enum", label: "Other layers filament sequence", mode: "simple", category: "Quality", default: "Auto", enumValues: ["Auto", "Customize"] },
    outer_wall_acceleration: { type: "floats", label: "Outer wall", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of outer wall: using a lower value can improve quality.", unit: "mm/s²", category: "Speed", default: ["500"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    outer_wall_filament_id: { type: "int", label: "Outer walls", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print outer walls.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    outer_wall_flow_ratio: { type: "float", label: "Outer wall flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for outer walls.\n\nThe actual outer wall flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    outer_wall_jerk: { type: "floats", label: "Outer wall", mode: "advanced", scopes: ["process"], tooltip: "Jerk of outer walls.", unit: "mm/s", category: "Speed", default: ["9"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    outer_wall_line_width: { type: "floatOrPercent", label: "Outer wall", mode: "advanced", scopes: ["process"], tooltip: "Line width of outer wall. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    outer_wall_speed: { type: "floats", label: "Outer wall", mode: "advanced", scopes: ["process"], tooltip: "This is the printing speed for the outer walls of parts. These are generally printed slower than inner walls for higher quality.", unit: "mm/s", category: "Speed", default: ["60"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    overhang_1_4_speed: { type: "floatsOrPercents", label: "10%", mode: "advanced", scopes: ["process"], unit: "mm/s or %", category: "Speed", default: ["0"], min: 0, ratioOver: "outer_wall_speed", nullable: true, slots: "variant", perObject: "region" },
    overhang_2_4_speed: { type: "floatsOrPercents", label: "25%", mode: "advanced", scopes: ["process"], unit: "mm/s or %", category: "Speed", default: ["0"], min: 0, ratioOver: "outer_wall_speed", nullable: true, slots: "variant", perObject: "region" },
    overhang_3_4_speed: { type: "floatsOrPercents", label: "50%", mode: "advanced", scopes: ["process"], unit: "mm/s or %", category: "Speed", default: ["0"], min: 0, ratioOver: "outer_wall_speed", nullable: true, slots: "variant", perObject: "region" },
    overhang_4_4_speed: { type: "floatsOrPercents", label: "75%", mode: "advanced", scopes: ["process"], unit: "mm/s or %", category: "Speed", default: ["0"], min: 0, ratioOver: "outer_wall_speed", nullable: true, slots: "variant", perObject: "region" },
    overhang_fan_speed: { type: "ints", label: "Overhangs and external bridges fan speed", mode: "advanced", scopes: ["filament"], tooltip: "Use this part cooling fan speed when printing bridges or overhang walls with an overhang threshold that exceeds the value set in the 'Overhangs cooling threshold' parameter above. Increasing the cooling specifically for overhangs and bridges can improve the overall print quality of these features.\n\nPlease note, this fan speed is clamped on the lower end by the minimum fan speed threshold set above. It is also adjusted upwards up to the maximum fan speed threshold when the minimum layer time threshold is not met.", unit: "%", default: ["100"], min: 0, max: 100, slots: "filament" },
    overhang_fan_threshold: { type: "enums", label: "Overhang cooling activation threshold", mode: "advanced", scopes: ["filament"], tooltip: "When the overhang exceeds this specified threshold, force the cooling fan to run at the 'Overhang Fan Speed' set below. This threshold is expressed as a percentage, indicating the portion of each line's width that is unsupported by the layer beneath it. Setting this value to 0% forces the cooling fan to run for all outer walls, regardless of the overhang degree.", default: ["95%"], enumValues: ["0%", "10%", "25%", "50%", "75%", "95%"], slots: "filament" },
    overhang_flow_ratio: { type: "float", label: "Overhang flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for overhangs.\n\nThe actual overhang flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    overhang_reverse: { type: "bool", label: "Reverse on even", mode: "advanced", scopes: ["process"], fullLabel: "Overhang reversal", tooltip: "Extrude perimeters that have a part over an overhang in the reverse direction on even layers. This alternating pattern can drastically improve steep overhangs.\n\nThis setting can also help reduce part warping due to the reduction of stresses in the part walls.", category: "Quality", default: "0", perObject: "region" },
    overhang_reverse_internal_only: { type: "bool", label: "Reverse only internal perimeters", mode: "advanced", scopes: ["process"], tooltip: "Apply the reverse perimeters logic only on internal perimeters.\n\nThis setting greatly reduces part stresses as they are now distributed in alternating directions. This should reduce part warping while also maintaining external wall quality. This feature can be very useful for warp prone material, like ABS/ASA, and also for elastic filaments, like TPU and Silk PLA. It can also help reduce warping on floating regions over supports.\n\nFor this setting to be the most effective, it is recommended to set the Reverse Threshold to 0 so that all internal walls print in alternating directions on even layers irrespective of their overhang degree.", category: "Quality", default: "0", perObject: "region" },
    overhang_reverse_threshold: { type: "floatOrPercent", label: "Reverse threshold", mode: "advanced", scopes: ["process"], fullLabel: "Overhang reversal threshold", tooltip: "Number of mm the overhang need to be for the reversal to be considered useful. Can be a % of the perimeter width.\nValue 0 enables reversal on every even layers regardless.\nWhen Detect overhang wall is not enabled, this option is ignored and reversal happens on every even layers regardless.", unit: "mm or %", category: "Quality", default: "50%", min: 0, maxLiteral: 20, ratioOver: "line_width", perObject: "region" },
    parallel_printheads_bed_exclude_areas: { type: "strings", label: "Parallel printheads bed exclude areas", mode: "advanced", scopes: ["machine"], tooltip: "Ordered list of bed exclude areas by parallel printhead count. Item 1 applies to one printhead, item 2 to two printheads, and so on. Leave an item empty for no excluded area.", default: [], slots: "list" },
    parallel_printheads_count: { type: "int", label: "Parallel printheads count", mode: "advanced", scopes: ["machine"], tooltip: "Set the number of parallel printheads for machines like OrangeStorm Giga printer.", default: "1", min: 1, max: 4 },
    parking_pos_retraction: { type: "float", label: "Filament parking position", mode: "advanced", scopes: ["machine"], tooltip: "Distance of the extruder tip from the position where the filament is parked when unloaded. This should match the value in printer firmware.", unit: "mm", default: "92", min: 0 },
    part_cooling_fan_min_pwm: { type: "int", label: "Minimum non-zero part cooling fan speed", mode: "advanced", scopes: ["machine"], tooltip: "Some part-cooling fans cannot start spinning when commanded below a certain PWM duty cycle. When set above 0, any non-zero part-cooling fan command will be raised to at least this percentage so the fan reliably starts. A fan command of 0 (fan off) is always honoured exactly. This clamp is applied after every other fan calculation (first-layer ramp, layer-time interpolation, overhang/bridge/support-interface/ironing overrides), so scaling still operates within the range [this value, 100%].\nIf your firmware already disables the fan below a threshold (for example Klipper's [fan] off_below: 0.10 shuts the fan off whenever the commanded duty cycle is below 10%), this option and the firmware threshold should ideally be set to the same value. Matching them (e.g. off_below: 0.10 in Klipper and 10% here) guarantees the slicer never emits a non-zero value that the firmware would silently drop, and the fan never receives a value below the one you know it can actually spool at.\nSet to 0 to deactivate.", unit: "%", default: "0", min: 0, max: 100 },
    pellet_flow_coefficient: { type: "floats", label: "Pellet flow coefficient", mode: "simple", scopes: ["filament"], tooltip: "Pellet flow coefficient is empirically derived and allows for volume calculation for pellet printers.\n\nInternally it is converted to filament_diameter. All other volume calculations remain the same.\n\nfilament_diameter = sqrt( (4 * pellet_flow_coefficient) / PI )", default: ["0.4157"], min: 0, slots: "filament" },
    pellet_modded_printer: { type: "bool", label: "Pellet Modded Printer", mode: "simple", scopes: ["machine"], tooltip: "Enable this option if your printer uses pellets instead of filaments.", default: "0" },
    physical_extruder_map: { type: "ints", label: "Map the logical extruder to physical extruder", mode: "develop", scopes: ["machine"], tooltip: "Map the logical extruder to physical extruder.", default: ["0"], slots: "extruder" },
    plugins: { type: "strings", label: "Plugins Used", mode: "develop", scopes: ["process"], tooltip: "Plugin capabilities referenced by this preset, stored as name;uuid;capability.", default: [], slots: "list" },
    post_process: { type: "strings", label: "Post-processing Scripts", mode: "advanced", scopes: ["process"], tooltip: "If you want to process the output G-code through custom scripts, just list their absolute paths here. Separate multiple scripts with a semicolon. Scripts will be passed the absolute path to the G-code file as the first argument, and they can access the Orca Slicer config settings by reading environment variables.", default: [], serialized: true, multiline: true, fullWidth: true, height: 6, slots: "list" },
    precise_outer_wall: { type: "bool", label: "Precise wall", mode: "simple", scopes: ["process"], tooltip: "Improve shell precision by adjusting outer wall spacing. This also improves layer consistency. NOTE: This option will be ignored for outer-inner or inner-outer-inner wall sequences.", category: "Quality", default: "1", perObject: "region" },
    precise_z_height: { type: "bool", label: "Precise Z height", mode: "advanced", scopes: ["process"], tooltip: "Enable this to get precise Z height of object after slicing. It will get the precise object height by fine-tuning the layer heights of the last few layers. Note that this is an experimental parameter.", category: "Quality", default: "0", perObject: "object" },
    preferred_orientation: { type: "float", label: "Preferred orientation", mode: "advanced", scopes: ["machine"], tooltip: "Automatically orient STL files on the Z axis upon initial import.", unit: "°", default: "0", min: -360, max: 360 },
    preheat_steps: { type: "int", label: "Preheat steps", mode: "develop", scopes: ["process"], tooltip: "Insert multiple preheat commands (e.g. M104.1). Only useful for Prusa XL. For other printers, please set it to 1.", default: "1", min: 1, max: 10 },
    preheat_time: { type: "float", label: "Preheat time", mode: "advanced", scopes: ["process"], tooltip: "To reduce the waiting time after tool change, Orca can preheat the next tool while the current tool is still in use. This setting specifies the time in seconds to preheat the next tool. Orca will insert a M104 command to preheat the tool in advance.", unit: "s", default: "30", min: 0, max: 120 },
    preset_name: { type: "string", label: "preset_name", mode: "simple", default: "" },
    preset_names: { type: "strings", label: "Printer preset names", mode: "advanced", tooltip: "Names of presets related to the physical printer.", default: [], slots: "list" },
    pressure_advance: { type: "floats", label: "Pressure advance", mode: "advanced", scopes: ["filament"], tooltip: "Pressure advance (Klipper) AKA Linear advance factor (Marlin).", default: ["0.02"], max: 2, slots: "filament" },
    prime_tower_brim_width: { type: "float", label: "Brim width", mode: "advanced", scopes: ["process"], tooltip: "Brim width of prime tower, negative number means auto calculated width based on the height of prime tower.", unit: "mm", default: "3", min: -1, enumValues: ["-1"], enumLabels: ["Auto"], openEnum: true },
    prime_tower_enable_framework: { type: "bool", label: "Internal ribs", mode: "advanced", scopes: ["process"], tooltip: "Enable internal ribs to increase the stability of the prime tower.", default: "0" },
    prime_tower_flat_ironing: { type: "bool", label: "prime_tower_flat_ironing", mode: "advanced", scopes: ["process"], default: "0" },
    prime_tower_infill_gap: { type: "percent", label: "Infill gap", mode: "advanced", scopes: ["process"], tooltip: "Infill gap.", unit: "%", default: "150%", min: 100 },
    prime_tower_skip_points: { type: "bool", label: "Skip points", mode: "advanced", scopes: ["process"], tooltip: "The wall of prime tower will skip the start points of wipe path.", default: "1" },
    prime_tower_width: { type: "float", label: "Width", mode: "simple", scopes: ["process"], tooltip: "This is the width of prime towers.", unit: "mm", default: "60", min: 2 },
    prime_volume: { type: "float", label: "Prime volume", mode: "simple", scopes: ["process"], tooltip: "This is the volume of material to prime the extruder with on the tower.", unit: "mm³", default: "45", min: 1 },
    prime_volume_mode: { type: "enum", label: "Prime volume mode", mode: "develop", tooltip: "Selects how the wipe-tower prime and flush volumes are computed on multi-extruder printers.", default: "Default", enumValues: ["Default", "Saving", "Fast"] },
    print_compatible_printers: { type: "strings", label: "print_compatible_printers", mode: "simple", default: [], slots: "list" },
    print_extruder_id: { type: "ints", label: "Print extruder id", mode: "simple", scopes: ["process"], tooltip: "Print extruder id.", default: ["1"], slots: "variant", perObject: "region" },
    print_extruder_variant: { type: "strings", label: "Print's extruder variant", mode: "simple", scopes: ["process"], tooltip: "Print's extruder variant.", default: ["Direct Drive Standard"], slots: "variant", perObject: "region" },
    print_flow_ratio: { type: "float", label: "Flow ratio", mode: "advanced", scopes: ["process"], tooltip: "The material may have volumetric change after switching between molten and crystalline states. This setting changes all extrusion flow of this filament in G-code proportionally. The recommended value range is between 0.95 and 1.05. You may be able to tune this value to get a nice flat surface if there is slight overflow or underflow.\n\nThe final object flow ratio is this value multiplied by the filament flow ratio.", category: "Quality", default: "1", min: 0.01, max: 2, perObject: "region" },
    print_host: { type: "string", label: "Hostname, IP or URL", mode: "advanced", scopes: ["machine"], tooltip: "Orca Slicer can upload G-code files to a printer host. This field should contain the hostname, IP address or URL of the printer host instance. Print host behind HAProxy with basic auth enabled can be accessed by putting the user name and password into the URL in the following format: https://username:password@your-octopi-address/", default: "" },
    print_host_webui: { type: "string", label: "Device UI", mode: "advanced", scopes: ["machine"], tooltip: "Specify the URL of your device user interface if it's not same as print_host.", default: "" },
    print_order: { type: "enum", label: "Intra-layer order", mode: "advanced", scopes: ["process"], tooltip: "Order in which object instances are visited within a single layer, which controls how much travel is spent moving between them.\n\nDefault: nearest-neighbor chaining, refined with 2-opt and crossing removal. A good general choice.\nAs object list: instances are printed in the same order as the object list, without any path optimization. Use it when you need a predictable, manually controlled order.\nBest of all (shortest path): every strategy is evaluated and the shortest one is used. The object instance order is decided once for the whole print, while the ordering of individual islands is decided per layer, so different layers may end up using different strategies. Slightly slower to slice.\nSnake: serpentine row-by-row traversal, refined with 2-opt. Well suited to regular grids of many small parts.\n\nWith multiple filaments or tools in the same layer, minimizing tool changes takes priority: objects are grouped by filament first and this setting only orders the instances within each filament group, so the overall sequence may not look like the shortest path across the plate.", default: "default", enumValues: ["default", "as_obj_list", "best_of", "snake"], enumLabels: ["Default", "As object list", "Best of all (shortest path)", "Snake"] },
    print_plugin_config_overrides: { type: "string", label: "Capabilities", mode: "advanced", scopes: ["process"], tooltip: "Configuration for the plugin capabilities this preset uses, overriding the global Capabilities configuration. Stored as a raw JSON array and edited through the dialog behind the button, never typed in directly.", default: "", gui: "plugin_config" },
    print_sequence: { type: "enum", label: "Print sequence", mode: "simple", scopes: ["process"], tooltip: "This determines the print sequence, allowing you to print layer-by-layer or object-by-object.", default: "by layer", enumValues: ["by layer", "by object"], enumLabels: ["By layer", "By object"] },
    print_settings_id: { type: "string", label: "print_settings_id", mode: "simple", default: "" },
    printable_area: { type: "points", label: "Printable area", mode: "advanced", scopes: ["machine"], default: ["0x0", "200x0", "200x200", "0x200"], slots: "list" },
    printable_height: { type: "float", label: "Printable height", mode: "simple", scopes: ["machine"], tooltip: "This is the maximum printable height which is limited by the height of the build area.", unit: "mm", default: "100", min: 0, max: 214700 },
    printer_agent: { type: "string", label: "Printer Agent", mode: "advanced", scopes: ["machine"], tooltip: "Select the network agent implementation for printer communication.", default: "" },
    printer_extruder_id: { type: "ints", label: "Printer extruder id", mode: "simple", scopes: ["machine"], tooltip: "Printer extruder id.", default: ["1"], slots: "variant" },
    printer_extruder_variant: { type: "strings", label: "Printer's extruder variant", mode: "simple", scopes: ["machine"], tooltip: "Printer's extruder variant.", default: ["Direct Drive Standard"], slots: "variant" },
    printer_model: { type: "string", label: "Printer type", mode: "simple", scopes: ["machine"], tooltip: "Type of the printer.", default: "" },
    printer_notes: { type: "string", label: "Printer notes", mode: "advanced", scopes: ["machine"], tooltip: "You can put your notes regarding the printer here.", default: "", multiline: true, fullWidth: true, height: 13 },
    printer_plugin_config_overrides: { type: "string", label: "Capabilities", mode: "advanced", scopes: ["machine"], tooltip: "Configuration for the plugin capabilities this preset uses, overriding the global Capabilities configuration. Stored as a raw JSON array and edited through the dialog behind the button, never typed in directly.", default: "", gui: "plugin_config" },
    printer_settings_id: { type: "string", label: "printer_settings_id", mode: "simple", default: "" },
    printer_structure: { type: "enum", label: "Printer structure", mode: "develop", scopes: ["machine"], tooltip: "The physical arrangement and components of a printing device.", default: "undefine", enumValues: ["undefine", "corexy", "i3", "hbot", "delta"], enumLabels: ["Undefined", "CoreXY", "I3", "Hbot", "Delta"] },
    printer_technology: { type: "enum", label: "Printer technology", mode: "simple", scopes: ["machine"], default: "FFF", enumValues: ["FFF", "SLA"] },
    printer_variant: { type: "string", label: "Printer variant", mode: "simple", scopes: ["machine"], default: "" },
    printhost_apikey: { type: "string", label: "API Key / Password", mode: "advanced", scopes: ["machine"], tooltip: "Orca Slicer can upload G-code files to a printer host. This field should contain the API Key or the password required for authentication.", default: "" },
    printhost_authorization_type: { type: "enum", label: "Authorization Type", mode: "advanced", scopes: ["machine"], default: "key", enumValues: ["key", "user"], enumLabels: ["API key", "HTTP digest"] },
    printhost_cafile: { type: "string", label: "HTTPS CA File", mode: "advanced", scopes: ["machine"], tooltip: "Custom CA certificate file can be specified for HTTPS OctoPrint connections, in crt/pem format. If left blank, the default OS CA certificate repository is used.", default: "" },
    printhost_password: { type: "string", label: "Password", mode: "advanced", scopes: ["machine"], default: "" },
    printhost_port: { type: "string", label: "Printer", mode: "advanced", scopes: ["machine"], tooltip: "Name of the printer.", default: "", openEnum: true },
    printhost_ssl_ignore_revoke: { type: "bool", label: "Ignore HTTPS certificate revocation checks", mode: "advanced", scopes: ["machine"], tooltip: "Ignore HTTPS certificate revocation checks in the case of missing or offline distribution points. One may want to enable this option for self signed certificates if connection fails.", default: "0" },
    printhost_user: { type: "string", label: "User", mode: "advanced", scopes: ["machine"], default: "" },
    printing_by_object_gcode: { type: "string", label: "Between Object G-code", mode: "advanced", scopes: ["machine"], tooltip: "Insert G-code between objects. This parameter will only come into effect when you print your models object by object.", default: "", multiline: true, fullWidth: true, height: 12 },
    process_change_extrusion_role_gcode: { type: "string", label: "Change extrusion role G-code (process)", mode: "advanced", scopes: ["process"], tooltip: "This G-code is inserted when the extrusion role is changed. It runs after the machine and filament extrusion role G-code.", default: "", multiline: true, fullWidth: true, height: 5 },
    purge_in_prime_tower: { type: "bool", label: "Purge in prime tower", mode: "advanced", scopes: ["machine"], tooltip: "Purge remaining filament into prime tower.", default: "1" },
    raft_contact_distance: { type: "float", label: "Raft contact Z distance", mode: "advanced", scopes: ["process"], tooltip: "Z gap between raft and object. If Support Top Z Distance is 0, this value is ignored and the object is printed in direct contact with the raft (no gap).", unit: "mm", category: "Support", default: "0.1", min: 0, perObject: "object" },
    raft_expansion: { type: "float", label: "Raft expansion", mode: "advanced", scopes: ["process"], tooltip: "This expands all raft layers in XY plane.", unit: "mm", category: "Support", default: "1.5", min: 0, perObject: "object" },
    raft_first_layer_density: { type: "percent", label: "First layer density", mode: "advanced", scopes: ["process"], tooltip: "This is the density of the first raft or support layer.", unit: "%", category: "Support", default: "90%", min: 10, max: 100, perObject: "object" },
    raft_first_layer_expansion: { type: "float", label: "First layer expansion", mode: "advanced", scopes: ["process"], tooltip: "This expands the first raft or support layer to improve bed adhesion.", unit: "mm", category: "Support", default: "2", min: 0, perObject: "object" },
    raft_layers: { type: "int", label: "Raft layers", mode: "advanced", scopes: ["process"], tooltip: "Object will be raised by this number of support layers. Use this function to avoid warping when printing ABS.", unit: "layers", category: "Support", default: "0", min: 0, max: 100, perObject: "object" },
    reduce_crossing_wall: { type: "bool", label: "Avoid crossing walls", mode: "advanced", scopes: ["process"], tooltip: "This detours to avoid traveling across walls, which may cause blobs on the surface.", category: "Quality", default: "0" },
    reduce_fan_stop_start_freq: { type: "bools", label: "Keep fan always on", mode: "simple", scopes: ["filament"], tooltip: "Enabling this setting means that part cooling fan will never stop entirely and will instead run at least at minimum speed to reduce the frequency of starting and stopping.", default: ["0"], slots: "filament" },
    reduce_infill_retraction: { type: "bool", label: "Reduce infill retraction", mode: "advanced", scopes: ["process"], tooltip: "Don't retract when the travel is entirely within an infill area. That means the oozing can't been seen. This can reduce times of retraction for complex model and save printing time, but make slicing and G-code generating slower. Note that Z-hop is also not performed in areas where retraction is skipped.", default: "0" },
    relative_bridge_angle: { type: "bool", label: "Relative bridge angle", mode: "advanced", scopes: ["process"], tooltip: "When enabled, the bridge angle values are added to the automatically calculated bridge direction instead of overriding it.", category: "Strength", default: "0", perObject: "region" },
    required_nozzle_HRC: { type: "ints", label: "Required nozzle HRC", mode: "develop", scopes: ["filament"], tooltip: "Minimum HRC of nozzle required to print the filament. A value of 0 means no checking of the nozzle's HRC.", default: ["0"], min: 0, max: 500, slots: "filament" },
    resolution: { type: "float", label: "Resolution", mode: "advanced", scopes: ["process"], tooltip: "The G-code path is generated after simplifying the contour of models to avoid too many points and G-code lines. Smaller values mean higher resolution and more time required to slice.", unit: "mm", default: "0.01", min: 0 },
    resonance_avoidance: { type: "bool", label: "Resonance avoidance", mode: "advanced", scopes: ["machine"], tooltip: "By reducing the speed of the outer wall to avoid the resonance zone of the printer, ringing on the surface of the model are avoided.\nPlease turn this option off when testing ringing.", default: "0" },
    retract_after_wipe: { type: "percents", label: "Retract amount after wipe", mode: "expert", scopes: ["machine"], tooltip: "This is the length of fast retraction after wipe, relative to retraction length.\nThe value will be clamped by 100% minus the retract amount before the wipe value.", unit: "%", default: ["0%"], slots: "variant" },
    retract_before_wipe: { type: "percents", label: "Retract amount before wipe", mode: "advanced", scopes: ["machine"], tooltip: "This is the length of fast retraction before a wipe, relative to retraction length.", unit: "%", default: ["100%"], slots: "variant" },
    retract_length_toolchange: { type: "floats", label: "Retraction Length (Toolchange)", mode: "advanced", scopes: ["machine"], tooltip: "When retraction is triggered before changing tool, filament is pulled back by the specified amount (the length is measured on raw filament, before it enters the extruder).", unit: "mm", default: ["10"], slots: "variant" },
    retract_lift_above: { type: "floats", label: "Only lift Z above", mode: "advanced", scopes: ["machine"], tooltip: "If you set this to a positive value, Z lift will only take place above the specified absolute Z.", unit: "mm", default: ["0"], min: 0, slots: "variant" },
    retract_lift_below: { type: "floats", label: "Only lift Z below", mode: "advanced", scopes: ["machine"], tooltip: "If you set this to a positive value, Z lift will only take place below the specified absolute Z.", unit: "mm", default: ["0"], min: 0, slots: "variant" },
    retract_lift_enforce: { type: "enums", label: "On surfaces", mode: "advanced", scopes: ["machine"], tooltip: "Enforce Z-Hop behavior. This setting is impacted by the above settings (Only lift Z above/below).", default: ["All Surfaces"], enumValues: ["All Surfaces", "Top Only", "Bottom Only", "Top and Bottom"], slots: "variant" },
    retract_restart_extra: { type: "floats", label: "Extra length on restart", mode: "advanced", scopes: ["machine"], tooltip: "When the retraction is compensated after the travel move, the extruder will push this additional amount of filament. This setting is rarely needed.", unit: "mm", default: ["0"], slots: "variant" },
    retract_restart_extra_toolchange: { type: "floats", label: "Extra length on restart (Toolchange)", mode: "advanced", scopes: ["machine"], tooltip: "When the retraction is compensated after changing tool, the extruder will push this additional amount of filament.", unit: "mm", default: ["0"], slots: "variant" },
    retract_when_changing_layer: { type: "bools", label: "Retract on layer change", mode: "advanced", scopes: ["machine"], tooltip: "This forces a retraction on layer changes.", default: ["0"], slots: "variant" },
    retraction_distances_when_cut: { type: "floats", label: "Retraction distance when cut", mode: "develop", scopes: ["machine"], tooltip: "Experimental feature: Retraction length before cutting off during filament change.", default: ["18"], min: 10, max: 18, slots: "variant" },
    retraction_distances_when_ec: { type: "floats", label: "Retraction distance when extruder change", mode: "advanced", scopes: ["filament"], unit: "mm", default: ["10"], min: 0, max: 10, nullable: true, slots: "variant" },
    retraction_length: { type: "floats", label: "Length", mode: "simple", scopes: ["machine"], fullLabel: "Retraction Length", tooltip: "Some amount of material in extruder is pulled back to avoid ooze during long travel. Set zero to disable retraction.", unit: "mm", default: ["0.8"], slots: "variant" },
    retraction_minimum_travel: { type: "floats", label: "Travel distance threshold", mode: "advanced", scopes: ["machine"], tooltip: "Only trigger retraction when the travel distance is longer than this threshold.", unit: "mm", default: ["2"], slots: "variant" },
    retraction_speed: { type: "floats", label: "Retraction speed", mode: "advanced", scopes: ["machine"], tooltip: "Speed for retracting filament from the nozzle.", unit: "mm/s", default: ["30"], slots: "variant" },
    role_based_wipe_speed: { type: "bool", label: "Role base wipe speed", mode: "advanced", scopes: ["process"], tooltip: "The wipe speed is determined by the speed of the current extrusion role. e.g. if a wipe action is executed immediately following an outer wall extrusion, the speed of the outer wall extrusion will be utilized for the wipe action.", category: "Speed", default: "1", perObject: "region" },
    scan_first_layer: { type: "bool", label: "Scan first layer", mode: "advanced", scopes: ["machine"], tooltip: "Enable this to allow the camera on the printer to check the quality of the first layer.", default: "0" },
    scarf_angle_threshold: { type: "int", label: "Conditional angle threshold", mode: "advanced", scopes: ["process"], tooltip: "This option sets the threshold angle for applying a conditional scarf joint seam.\nIf the maximum angle within the perimeter loop exceeds this value (indicating the absence of sharp corners), a scarf joint seam will be used. The default value is 155°.", unit: "°", category: "Quality", default: "155", min: 0, max: 180, perObject: "region" },
    scarf_joint_flow_ratio: { type: "float", label: "Scarf joint flow ratio", mode: "expert", scopes: ["process"], tooltip: "This factor affects the amount of material for scarf joints.", category: "Quality", default: "1", min: 0, max: 2, perObject: "region" },
    scarf_joint_speed: { type: "floatOrPercent", label: "Scarf joint speed", mode: "advanced", scopes: ["process"], tooltip: "This option sets the printing speed for scarf joints. It is recommended to print scarf joints at a slow speed (less than 100 mm/s). It's also advisable to enable 'Extrusion rate smoothing' if the set speed varies significantly from the speed of the outer or inner walls. If the speed specified here is higher than the speed of the outer or inner walls, the printer will default to the slower of the two speeds. When specified as a percentage (e.g., 80%), the speed is calculated based on the respective outer or inner wall speed. The default value is set to 100%.", unit: "mm/s or %", category: "Quality", default: "100%", min: 1, perObject: "region" },
    scarf_overhang_threshold: { type: "percent", label: "Conditional overhang threshold", mode: "advanced", scopes: ["process"], tooltip: "This option determines the overhang threshold for the application of scarf joint seams. If the unsupported portion of the perimeter is less than this threshold, scarf joint seams will be applied. The default threshold is set at 40% of the external wall's width. Due to performance considerations, the degree of overhang is estimated.", unit: "%", category: "Quality", default: "40%", min: 0, perObject: "region" },
    seam_gap: { type: "floatOrPercent", label: "Seam gap", mode: "advanced", scopes: ["process"], tooltip: "In order to reduce the visibility of the seam in a closed loop extrusion, the loop is interrupted and shortened by a specified amount.\nThis amount can be specified in millimeters or as a percentage of the current extruder diameter. The default value for this parameter is 10%.", unit: "mm or %", category: "Quality", default: "10%", min: 0, perObject: "region" },
    seam_position: { type: "enum", label: "Seam position", mode: "simple", scopes: ["process"], tooltip: "This is the starting position for each part of the outer wall.", category: "Quality", default: "aligned", enumValues: ["nearest", "aligned", "aligned_back", "back", "random"], enumLabels: ["Nearest", "Aligned", "Aligned back", "Back", "Random"], perObject: "object" },
    seam_slope_conditional: { type: "bool", label: "Conditional scarf joint", mode: "advanced", scopes: ["process"], tooltip: "Apply scarf joints only to smooth perimeters where traditional seams do not conceal the seams at sharp corners effectively.", category: "Quality", default: "0", perObject: "region" },
    seam_slope_entire_loop: { type: "bool", label: "Scarf around entire wall", mode: "advanced", scopes: ["process"], tooltip: "The scarf extends to the entire length of the wall.", category: "Quality", default: "0", perObject: "region" },
    seam_slope_inner_walls: { type: "bool", label: "Scarf joint for inner walls", mode: "advanced", scopes: ["process"], tooltip: "Use scarf joint for inner walls as well.", category: "Quality", default: "0", perObject: "region" },
    seam_slope_min_length: { type: "float", label: "Scarf length", mode: "advanced", scopes: ["process"], tooltip: "Length of the scarf. Setting this parameter to zero effectively disables the scarf.", unit: "mm", category: "Quality", default: "20", min: 0, perObject: "region" },
    seam_slope_start_height: { type: "floatOrPercent", label: "Scarf start height", mode: "advanced", scopes: ["process"], tooltip: "Start height of the scarf.\nThis amount can be specified in millimeters or as a percentage of the current layer height. The default value for this parameter is 0.", unit: "mm or %", category: "Quality", default: "0", min: 0, ratioOver: "layer_height", perObject: "region" },
    seam_slope_steps: { type: "int", label: "Scarf steps", mode: "advanced", scopes: ["process"], tooltip: "Minimum number of segments of each scarf.", category: "Quality", default: "10", min: 1, perObject: "region" },
    seam_slope_type: { type: "enum", label: "Scarf joint seam (beta)", mode: "advanced", scopes: ["process"], tooltip: "Use scarf joint to minimize seam visibility and increase seam strength.", category: "Quality", default: "none", enumValues: ["none", "external", "all"], enumLabels: ["None", "Contour", "Contour and hole"], perObject: "region" },
    separated_infills: { type: "bool", label: "Separated infills", mode: "expert", scopes: ["process"], tooltip: "Centers the internal infill of each part on itself, as if it were sliced on its own, instead of on the whole assembly. Parts that touch or overlap are treated as one body and share a center; separate parts (or distinct 3D objects) each get their own.\nUseful when an assembly groups several objects that should each keep a consistent, self-centered infill.\nAffects line and grid patterns and rotation-template infills.\nPatterns locked to global coordinates (Gyroid, Honeycomb, TPMS, ...) are unaffected.", category: "Strength", default: "0", perObject: "region" },
    set_other_flow_ratios: { type: "bool", label: "Set other flow ratios", mode: "advanced", scopes: ["process"], tooltip: "Change flow ratios for other extrusion path types.", category: "Advanced", default: "0", perObject: "object" },
    silent_mode: { type: "bool", label: "Silent Mode", mode: "develop", scopes: ["machine"], tooltip: "Whether the machine supports silent mode in which machine uses lower acceleration to print more quietly", default: "0" },
    single_extruder_multi_material: { type: "bool", label: "Single Extruder Multi Material", mode: "advanced", scopes: ["machine"], tooltip: "Use single nozzle to print multi filament.", default: "1" },
    single_extruder_multi_material_priming: { type: "bool", label: "Prime all printing extruders", mode: "advanced", scopes: ["process"], tooltip: "If enabled, all printing extruders will be primed at the front edge of the print bed at the start of the print.", default: "0" },
    single_loop_draft_shield: { type: "bool", label: "Single loop after first layer", mode: "advanced", scopes: ["process"], tooltip: "Limits the skirt/draft shield loops to one wall after the first layer. This is useful, on occasion, to conserve filament but may cause the draft shield/skirt to warp / crack.", default: "0" },
    skeleton_infill_density: { type: "percent", label: "Skeleton infill density", mode: "advanced", scopes: ["process"], tooltip: "The remaining part of the model contour after removing a certain depth from the surface is called the skeleton. This parameter is used to adjust the density of this section. When two regions have the same sparse infill settings but different skeleton densities, their skeleton areas will develop overlapping sections. Default is as same as infill density.", unit: "%", category: "Strength", default: "25%", min: 0, max: 100, perObject: "region" },
    skeleton_infill_line_width: { type: "floatOrPercent", label: "Skeleton line width", mode: "advanced", scopes: ["process"], tooltip: "Adjust the line width of the selected skeleton paths.", unit: "mm", category: "Strength", default: "100%", min: 0, ratioOver: "nozzle_diameter", perObject: "region" },
    skin_infill_density: { type: "percent", label: "Skin infill density", mode: "advanced", scopes: ["process"], tooltip: "The portion of the model's outer surface within a certain depth range is called the skin. This parameter is used to adjust the density of this section. When two regions have the same sparse infill settings but different skin densities, this area will not be split into two separate regions. Default is as same as infill density.", unit: "%", category: "Strength", default: "25%", min: 0, max: 100, perObject: "region" },
    skin_infill_depth: { type: "float", label: "Skin infill depth", mode: "advanced", scopes: ["process"], tooltip: "The parameter sets the depth of skin.", unit: "mm", category: "Strength", default: "2", min: 0, max: 100, perObject: "region" },
    skin_infill_line_width: { type: "floatOrPercent", label: "Skin line width", mode: "advanced", scopes: ["process"], tooltip: "Adjust the line width of the selected skin paths.", unit: "mm", category: "Strength", default: "100%", min: 0, ratioOver: "nozzle_diameter", perObject: "region" },
    skirt_distance: { type: "float", label: "Skirt distance", mode: "advanced", scopes: ["process"], tooltip: "This is the distance from the skirt to the brim or the object.", unit: "mm", default: "2", min: 0, max: 60 },
    skirt_height: { type: "int", label: "Skirt height", mode: "simple", scopes: ["process"], tooltip: "Number of skirt layers: usually only one", unit: "layers", default: "1", max: 1e4 },
    skirt_loops: { type: "int", label: "Skirt loops", mode: "simple", scopes: ["process"], tooltip: "This is the number of loops for the skirt. 0 means the skirt is disabled.", default: "1", min: 0, max: 10 },
    skirt_speed: { type: "float", label: "Skirt speed", mode: "advanced", scopes: ["process"], tooltip: "Speed of skirt, in mm/s. Zero means use default layer extrusion speed.", unit: "mm/s", default: "50", min: 0 },
    skirt_start_angle: { type: "float", label: "Skirt start point", mode: "advanced", scopes: ["process"], tooltip: "Angle from the object center to skirt start point. Zero is the most right position, counter clockwise is positive angle.", unit: "°", category: "Support", default: "-135", min: -180, max: 180, perObject: "object" },
    skirt_type: { type: "enum", label: "Skirt type", mode: "advanced", scopes: ["process"], tooltip: "Combined - single skirt for all objects, Per object - individual object skirt.", default: "combined", enumValues: ["combined", "perobject"], enumLabels: ["Combined", "Per object"] },
    slice_closing_radius: { type: "float", label: "Slice gap closing radius", mode: "advanced", scopes: ["process"], tooltip: "Cracks smaller than 2x gap closing radius are being filled during the triangle mesh slicing. The gap closing operation may reduce the final print resolution, therefore it is advisable to keep the value reasonably low.", unit: "mm", category: "Quality", default: "0.049", min: 0, perObject: "object" },
    slicing_mode: { type: "enum", label: "Slicing Mode", mode: "advanced", scopes: ["process"], tooltip: 'Use "Even-odd" for 3DLabPrint airplane models. Use "Close holes" to close all holes in the model.', category: "Others", default: "regular", enumValues: ["regular", "even_odd", "close_holes"], enumLabels: ["Regular", "Even-odd", "Close holes"], perObject: "object" },
    slicing_pipeline_plugin: { type: "strings", label: "Slicing Pipeline Plugin", mode: "advanced", scopes: ["process"], tooltip: "Python plugin(s) invoked at each slicing pipeline step to read and modify intermediate slicing data, including a final G-code post-processing step. Research/experimental.", default: [], gui: "plugin_picker", fullWidth: true, slots: "list" },
    slow_down_for_layer_cooling: { type: "bools", label: "Slow printing down for better layer cooling", mode: "simple", scopes: ["filament"], tooltip: 'Enable this option to slow printing speed down to ensure that the final layer time is not shorter than the layer time threshold in "Max fan speed threshold", so that the layer can be cooled for a longer time. This can improve the quality for small details.', default: ["1"], slots: "filament" },
    slow_down_layer_time: { type: "floats", label: "Layer time", mode: "simple", scopes: ["filament"], tooltip: "The printing speed in exported G-code will be slowed down when the estimated layer time is shorter than this value in order to get better cooling for these layers.", unit: "s", default: ["5"], min: 0, max: 1e3, slots: "filament" },
    slow_down_layers: { type: "int", label: "Number of slow layers", mode: "advanced", scopes: ["process"], tooltip: "The first few layers are printed slower than normal. The speed is gradually increased in a linear fashion over the specified number of layers.", unit: "layers", category: "Speed", default: "0", min: 0 },
    slow_down_min_speed: { type: "floats", label: "Min print speed", mode: "advanced", scopes: ["filament"], tooltip: "The minimum print speed to which the printer slows down to maintain the minimum layer time defined above when the slowdown for better layer cooling is enabled.", unit: "mm/s", default: ["10"], min: 0, slots: "filament" },
    slowdown_for_curled_perimeters: { type: "bools", label: "Slow down for curled perimeters", mode: "advanced", scopes: ["process"], tooltip: "Enable this option to slow down printing in areas where perimeters may have curled upwards.\nFor example, additional slowdown will be applied when printing overhangs on sharp corners like the front of the Benchy hull, reducing curling which compounds over multiple layers.\n\nIt is generally recommended to have this option switched on unless your printer cooling is powerful enough or the print speed is slow enough that perimeter curling does not happen. \nIf printing with a high external perimeter speed, this parameter may introduce wall artifacts when slowing down, due to the potentially large variance in print speeds causing the extruder to be unable to keep up with the requested flow change.\nRoot cause of these artifacts is most likely PA tuning being slightly off, especially when combined with a high PA smooth time.\n\nRecommendations when enabling this option:\n1. Reduce Pressure Advance smooth time to 0.015 - 0.02 so the extruder reacts quickly to the speed changes.\n2. Increase the minimum print speeds to limit the magnitude of the slowdown and reduce the variance between fast and slow segments.\n3. If artifacts still appear, enable Extrusion Rate Smoothing (ERS) to further smooth the flow transitions.\n\nNote: When this option is enabled, overhang perimeters are treated like overhangs, meaning the overhang speed is applied even if the overhanging perimeter is part of a bridge.\nFor example, when the perimeters are 100% overhanging, with no wall supporting them from underneath, the 100% overhang speed will be applied.", category: "Speed", default: ["0"], nullable: true, slots: "variant", perObject: "region" },
    small_area_infill_flow_compensation: { type: "bool", label: "Small area flow compensation (beta)", mode: "advanced", scopes: ["process"], tooltip: "Enable flow compensation for small infill areas.", category: "Quality", default: "0", perObject: "region" },
    small_area_infill_flow_compensation_model: { type: "strings", label: "Flow Compensation Model", mode: "advanced", scopes: ["process"], tooltip: 'Flow Compensation Model, used to adjust the flow for small infill areas. The model is expressed as a comma separated pair of values for extrusion length and flow correction factor. Each pair is on a separate line, followed by a semicolon, in the following format: "1.234, 5.678;"', default: ["0,0", "\n0.2,0.4444", "\n0.4,0.6145", "\n0.6,0.7059", "\n0.8,0.7619", "\n1.5,0.8571", "\n2,0.8889", "\n3,0.9231", "\n5,0.9520", "\n10,1"], serialized: true, multiline: true, fullWidth: true, height: 15, slots: "list" },
    small_perimeter_speed: { type: "floatsOrPercents", label: "Small perimeters", mode: "advanced", scopes: ["process"], tooltip: "This separate setting will affect the speed of perimeters having radius <= small_perimeter_threshold (usually holes). If expressed as percentage (for example: 80%) it will be calculated on the outer wall speed setting above. Set to zero for auto.", unit: "mm/s or %", category: "Speed", default: ["50%"], min: 1, ratioOver: "outer_wall_speed", nullable: true, slots: "variant", perObject: "region" },
    small_perimeter_threshold: { type: "floats", label: "Small perimeters threshold", mode: "advanced", scopes: ["process"], tooltip: "This sets the threshold for small perimeter length. Default threshold is 0mm.", unit: "mm", category: "Speed", default: ["0"], min: 0, nullable: true, slots: "variant", perObject: "region" },
    small_support_perimeter_speed: { type: "floatsOrPercents", label: "Small support perimeters", mode: "advanced", scopes: ["process"], tooltip: 'Same as "Small perimeters", but for supports. This separate setting will affect the speed of support for areas <= `small_support_perimeter_threshold`. If expressed as a percentage (for example: 80%), it will be calculated on the support or support interface speed setting above. Set to zero for auto.', unit: "mm/s or %", category: "Speed", default: ["50%"], min: 1, ratioOver: "outer_wall_speed", slots: "variant", perObject: "region" },
    small_support_perimeter_threshold: { type: "floats", label: "Small support perimeters threshold", mode: "advanced", scopes: ["process"], tooltip: "This sets the threshold for small support perimeter length. The default threshold is 0mm.", unit: "mm", category: "Speed", default: ["0"], min: 0, slots: "variant", perObject: "region" },
    solid_infill_direction: { type: "float", label: "Solid infill direction", mode: "advanced", scopes: ["process"], tooltip: "Angle for solid infill pattern, which controls the start or main direction of line.", unit: "°", category: "Strength", default: "45", min: 0, max: 360, perObject: "region" },
    solid_infill_rotate_template: { type: "string", label: "Solid infill rotation template", mode: "advanced", scopes: ["process"], tooltip: "This parameter adds a rotation of solid infill direction to each layer according to the specified template. The template is a comma-separated list of angles in degrees, e.g. '0,90'. The first angle is applied to the first layer, the second angle to the second layer, and so on. If there are more layers than angles, the angles will be repeated. Note that not all solid infill patterns support rotation.", unit: "°", category: "Strength", default: "", perObject: "region" },
    sparse_infill_acceleration: { type: "floatsOrPercents", label: "Sparse infill", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of sparse infill. If the value is expressed as a percentage (e.g. 100%), it will be calculated based on the default acceleration.", unit: "mm/s² or %", category: "Speed", default: ["100%"], min: 0, ratioOver: "default_acceleration", nullable: true, slots: "variant", perObject: "object" },
    sparse_infill_density: { type: "percent", label: "Sparse infill density", mode: "simple", scopes: ["process"], tooltip: "Density of internal sparse infill, 100% turns all sparse infill into solid infill and internal solid infill pattern will be used.", unit: "%", category: "Strength", default: "20%", min: 0, max: 100, perObject: "region" },
    sparse_infill_filament_id: { type: "int", label: "Infill", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print internal sparse infill.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    sparse_infill_flow_ratio: { type: "float", label: "Sparse infill flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for sparse infill.\n\nThe actual sparse infill flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    sparse_infill_line_width: { type: "floatOrPercent", label: "Sparse infill", mode: "advanced", scopes: ["process"], tooltip: "Line width of internal sparse infill. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    sparse_infill_pattern: { type: "enum", label: "Sparse infill pattern", mode: "simple", scopes: ["process"], tooltip: "This is the line pattern for internal sparse infill.", category: "Strength", default: "crosshatch", enumValues: ["rectilinear", "alignedrectilinear", "zigzag", "crosszag", "lockedzag", "line", "grid", "triangles", "tri-hexagon", "cubic", "adaptivecubic", "quartercubic", "supportcubic", "lightning", "honeycomb", "3dhoneycomb", "lateral-honeycomb", "lateral-lattice", "crosshatch", "tpmsd", "tpmsfk", "gyroid", "concentric", "hilbertcurve", "archimedeanchords", "octagramspiral"], enumLabels: ["Rectilinear", "Aligned Rectilinear", "Zig Zag", "Cross Zag", "Locked Zag", "Line", "Grid", "Triangles", "Tri-hexagon", "Cubic", "Adaptive Cubic", "Quarter Cubic", "Support Cubic", "Lightning", "Honeycomb", "3D Honeycomb", "Lateral Honeycomb", "Lateral Lattice", "Cross Hatch", "TPMS-D", "TPMS-FK", "Gyroid", "Concentric", "Hilbert Curve", "Archimedean Chords", "Octagram Spiral"], perObject: "region" },
    sparse_infill_rotate_template: { type: "string", label: "Sparse infill rotation template", mode: "advanced", scopes: ["process"], tooltip: "Rotate the sparse infill direction per layer using a template of angles. Enter comma-separated degrees (e.g., '0,30,60,90'). Angles are applied in order by layer and repeat when the list ends. Advanced syntax is supported: '+5' rotates +5° every layer; '+5#5' rotates +5° every 5 layers. See the Wiki for details. When a template is set, the standard infill direction setting is ignored. Note: some infill patterns (e.g., Gyroid) control rotation themselves; use with care.", unit: "°", category: "Strength", default: "", perObject: "region" },
    sparse_infill_smooth_factor: { type: "percent", label: "Sparse infill smooth factor", mode: "advanced", scopes: ["process"], tooltip: "Controls how strongly sparse infill corners are rounded. 0% keeps the original sharp path, while 100% produces the largest possible curves between adjacent infill lines.", unit: "%", category: "Strength", default: "0%", min: 0, max: 100, perObject: "region" },
    sparse_infill_speed: { type: "floats", label: "Sparse infill", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for internal sparse infill.", unit: "mm/s", category: "Speed", default: ["100"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    spiral_finishing_flow_ratio: { type: "float", label: "Spiral finishing flow ratio", mode: "advanced", scopes: ["process"], tooltip: "Sets the finishing flow ratio while ending the spiral. Normally the spiral transition scales the flow ratio from 100% to 0% during the last loop which can in some cases lead to under extrusion at the end of the spiral.", default: "0", min: 0, max: 1 },
    spiral_mode: { type: "bool", label: "Spiral vase", mode: "simple", scopes: ["process"], tooltip: "This enables spiraling, which smooths out the Z moves of the outer contour and turns a solid model into a single walled print with solid bottom layers. The final generated model has no seam.", default: "0" },
    spiral_mode_max_xy_smoothing: { type: "floatOrPercent", label: "Max XY Smoothing", mode: "advanced", scopes: ["process"], tooltip: "Maximum distance to move points in XY to try to achieve a smooth spiral. If expressed as a %, it will be computed over nozzle diameter.", unit: "mm or %", default: "200%", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter" },
    spiral_mode_smooth: { type: "bool", label: "Smooth Spiral", mode: "simple", scopes: ["process"], tooltip: "Smooth Spiral smooths out X and Y moves as well, resulting in no visible seam at all, even in the XY directions on walls that are not vertical.", default: "0" },
    spiral_starting_flow_ratio: { type: "float", label: "Spiral starting flow ratio", mode: "advanced", scopes: ["process"], tooltip: "Sets the starting flow ratio while transitioning from the last bottom layer to the spiral. Normally the spiral transition scales the flow ratio from 0% to 100% during the first loop which can in some cases lead to under extrusion at the start of the spiral.", default: "0", min: 0, max: 1 },
    staggered_inner_seams: { type: "bool", label: "Staggered inner seams", mode: "advanced", scopes: ["process"], tooltip: "This option causes the inner seams to be shifted backwards based on their depth, forming a zigzag pattern.", category: "Quality", default: "0", perObject: "object" },
    standby_temperature_delta: { type: "int", label: "Temperature variation", mode: "advanced", scopes: ["process"], tooltip: "Temperature difference to be applied when an extruder is not active. The value is not used when 'idle_temperature' in filament settings is set to non-zero value.", unit: "∆℃", default: "-5", min: -1500, max: 1500 },
    start_end_points: { type: "points", label: "Start end points", mode: "develop", tooltip: "The start and end points which are from the cutter area to the excess chute.", default: ["30x-3", "54x245"], orcaReadOnly: true, slots: "list" },
    supertack_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the Cool Plate SuperTack.", unit: "℃", default: ["35"], min: 0, max: 120, slots: "filament" },
    supertack_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the Cool Plate SuperTack.", unit: "℃", default: ["35"], min: 0, max: 120, slots: "filament" },
    support_air_filtration: { type: "bool", label: "Support air filtration", mode: "develop", scopes: ["machine"], tooltip: "Enable this if printer support air filtration\nG-code command: M106 P3 S(0-255)", default: "1" },
    support_angle: { type: "float", label: "Pattern angle", mode: "advanced", scopes: ["process"], tooltip: "Use this setting to rotate the support pattern on the horizontal plane.", unit: "°", category: "Support", default: "0", min: 0, max: 359, perObject: "object" },
    support_base_pattern: { type: "enum", label: "Base pattern", mode: "advanced", scopes: ["process"], tooltip: "Line pattern of support.\n\nThe Default option for Tree supports is Hollow, which means no base pattern. For other support types, the Default option is the Rectilinear pattern.\n\nNOTE: For Organic supports, the two walls are supported only with the Hollow/Default base pattern. The Lightning base pattern is supported only by Tree Slim/Strong/Hybrid supports. For the other support types, the Rectilinear will be used instead of Lightning.", category: "Support", default: "default", enumValues: ["default", "rectilinear", "rectilinear-grid", "honeycomb", "lightning", "hollow"], enumLabels: ["Default", "Rectilinear", "Rectilinear grid", "Honeycomb", "Lightning", "Hollow"], perObject: "object" },
    support_base_pattern_spacing: { type: "float", label: "Base pattern spacing", mode: "advanced", scopes: ["process"], tooltip: "This determines the spacing between support lines.", unit: "mm", category: "Support", default: "2.5", min: 0, perObject: "object" },
    support_bottom_interface_spacing: { type: "float", label: "Bottom interface spacing", mode: "advanced", scopes: ["process"], tooltip: "This is the spacing of bottom interface lines. 0 means solid interface.", unit: "mm", category: "Support", default: "0.5", min: 0, perObject: "object" },
    support_bottom_z_distance: { type: "float", label: "Bottom Z distance", mode: "advanced", scopes: ["process"], tooltip: "Z gap between the object and the support bottom. If Support Top Z Distance is 0 and the bottom has interface layers, this value is ignored and the support is printed in direct contact with the object (no gap).", unit: "mm", category: "Support", default: "0.2", min: 0, perObject: "object" },
    support_chamber_temp_control: { type: "bool", label: "Support controlling chamber temperature", mode: "advanced", scopes: ["machine"], tooltip: "This option is enabled if machine support controlling chamber temperature\nG-code command: M141 S(0-255)", default: "1" },
    support_cooling_filter: { type: "bool", label: "support_cooling_filter", mode: "advanced", scopes: ["machine"], default: "0" },
    support_critical_regions_only: { type: "bool", label: "Support critical regions only", mode: "advanced", scopes: ["process"], tooltip: "Only create support for critical regions including sharp tail, cantilever, etc.", category: "Support", default: "0", perObject: "object" },
    support_expansion: { type: "float", label: "Normal support expansion", mode: "advanced", scopes: ["process"], tooltip: "Expand (+) or shrink (-) the horizontal span of normal support.", unit: "mm", category: "Support", default: "0", perObject: "object" },
    support_fast_purge_mode: { type: "bool", label: "Support fast purge mode", mode: "develop", scopes: ["machine"], tooltip: "Whether this printer supports fast purge mode with optimized temperature and multiplier.", default: "0" },
    support_filament: { type: "int", label: "Support/raft base", mode: "simple", scopes: ["process"], tooltip: 'Filament to print support base and raft.\n"Default" means no specific filament for support and current filament is used.', category: "Support", default: "0", min: 0, openEnum: true, perObject: "object" },
    support_flow_ratio: { type: "float", label: "Support flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for support.\n\nThe actual support flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "object" },
    support_interface_bottom_layers: { type: "int", label: "Bottom interface layers", mode: "advanced", scopes: ["process"], tooltip: "Number of bottom interface layers.", unit: "layers", category: "Support", default: "0", min: -1, enumValues: ["-1", "0", "1", "2", "3"], enumLabels: ["Same as top", "0", "1", "2", "3"], openEnum: true, perObject: "object" },
    support_interface_filament: { type: "int", label: "Support/raft interface", mode: "simple", scopes: ["process"], tooltip: 'Filament to print support interface.\n"Default" means no specific filament for support interface and current filament is used.', category: "Support", default: "0", min: 0, openEnum: true, perObject: "object" },
    support_interface_flow_ratio: { type: "float", label: "Support interface flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for the support interface.\n\nThe actual support interface flow used is calculated by multiplying this value by the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "object" },
    support_interface_loop_pattern: { type: "bool", label: "Loop pattern interface", mode: "advanced", scopes: ["process"], tooltip: "This covers the top contact layer of the supports with loops. It is disabled by default.", category: "Support", default: "0", perObject: "object" },
    support_interface_not_for_body: { type: "bool", label: "Avoid interface filament for base", mode: "simple", scopes: ["process"], tooltip: "Avoid using support interface filament to print support base if possible.", category: "Support", default: "1", perObject: "object" },
    support_interface_pattern: { type: "enum", label: "Interface pattern", mode: "advanced", scopes: ["process"], tooltip: "This is the line pattern for support interfaces. The default pattern for non-soluble support interfaces is Rectilinear while the default pattern for soluble support interfaces is Concentric.", category: "Support", default: "auto", enumValues: ["auto", "rectilinear", "concentric", "spiralinset", "rectilinear_interlaced", "grid"], enumLabels: ["Default", "Rectilinear", "Concentric", "Spiral Inset", "Rectilinear Interlaced", "Grid"], perObject: "object" },
    support_interface_spacing: { type: "float", label: "Top interface spacing", mode: "advanced", scopes: ["process"], tooltip: "Spacing of interface lines. Zero means solid interface.\nForce using solid interface when support ironing is enabled.", unit: "mm", category: "Support", default: "0.5", min: 0, perObject: "object" },
    support_interface_speed: { type: "floats", label: "Support interface", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for support interfaces.", unit: "mm/s", category: "Speed", default: ["80"], min: 1, nullable: true, slots: "variant", perObject: "object" },
    support_interface_top_layers: { type: "int", label: "Top interface layers", mode: "advanced", scopes: ["process"], tooltip: "This is the number of top interface layers.", unit: "layers", category: "Support", default: "3", min: 0, enumValues: ["0", "1", "2", "3"], openEnum: true, perObject: "object" },
    support_ironing: { type: "bool", label: "Ironing Support Interface", mode: "advanced", scopes: ["process"], tooltip: "Ironing is using small flow to print on same height of support interface again to make it more smooth. This setting controls whether support interface being ironed. When enabled, support interface will be extruded as solid too.", category: "Support", default: "0", perObject: "object" },
    support_ironing_flow: { type: "percent", label: "Support Ironing flow", mode: "advanced", scopes: ["process"], tooltip: "The amount of material to extrude during ironing. Relative to flow of normal support interface layer height. Too high value results in overextrusion on the surface.", unit: "%", category: "Support", default: "10%", min: 0, max: 100, perObject: "object" },
    support_ironing_pattern: { type: "enum", label: "Support Ironing Pattern", mode: "advanced", scopes: ["process"], tooltip: "The pattern that will be used when ironing.", category: "Support", default: "rectilinear", enumValues: ["rectilinear", "concentric"], enumLabels: ["Rectilinear", "Concentric"], perObject: "object" },
    support_ironing_spacing: { type: "float", label: "Support Ironing line spacing", mode: "advanced", scopes: ["process"], tooltip: "This is the distance between the lines used for ironing.", unit: "mm", category: "Support", default: "0.1", min: 0, max: 1, perObject: "object" },
    support_line_width: { type: "floatOrPercent", label: "Support", mode: "advanced", scopes: ["process"], tooltip: "Line width of support. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "object" },
    support_material_interface_fan_speed: { type: "ints", label: "Support interface fan speed", mode: "advanced", scopes: ["filament"], tooltip: "This part cooling fan speed is applied when printing support interfaces. Setting this parameter to a higher than regular speed reduces the layer binding strength between supports and the supported part, making them easier to separate.\nSet to -1 to disable it.\nThis setting is overridden by disable_fan_first_layers.", unit: "%", default: ["-1"], min: -1, max: 100, slots: "filament" },
    support_multi_bed_types: { type: "bool", label: "Support multi bed types", mode: "simple", scopes: ["machine"], tooltip: "Enable this option if you want to use multiple bed types.", default: "0" },
    support_object_first_layer_gap: { type: "float", label: "Support/object first layer gap", mode: "advanced", scopes: ["process"], tooltip: "XY separation between an object and its support at the first layer.", unit: "mm", category: "Support", default: "0.2", min: 0, max: 10, perObject: "object" },
    support_object_skip_flush: { type: "bool", label: "support_object_skip_flush", mode: "simple", scopes: ["machine"], default: "0" },
    support_object_xy_distance: { type: "float", label: "Support/object XY distance", mode: "advanced", scopes: ["process"], tooltip: "This controls the XY separation between an object and its support.", unit: "mm", category: "Support", default: "0.35", min: 0, max: 10, perObject: "object" },
    support_on_build_plate_only: { type: "bool", label: "On build plate only", mode: "simple", scopes: ["process"], tooltip: "This setting only generates supports that begin on the build plate.", category: "Support", default: "0", perObject: "object" },
    support_parallel_printheads: { type: "bool", label: "Support parallel printheads", mode: "advanced", scopes: ["machine"], tooltip: "Enable printer settings for machines that can use multiple printheads in parallel.", default: "0" },
    support_remove_small_overhang: { type: "bool", label: "Ignore small overhangs", mode: "advanced", scopes: ["process"], tooltip: "Ignore small overhangs that possibly don't require support.", category: "Support", default: "1", perObject: "object" },
    support_speed: { type: "floats", label: "Support", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for support.", unit: "mm/s", category: "Speed", default: ["80"], min: 1, nullable: true, slots: "variant", perObject: "object" },
    support_style: { type: "enum", label: "Style", mode: "advanced", scopes: ["process"], tooltip: "Style and shape of the support. For normal support, projecting the supports into a regular grid will create more stable supports (default), while snug support towers will save material and reduce object scarring.\nFor tree support, slim and organic style will merge branches more aggressively and save a lot of material (default organic), while hybrid style will create similar structure to normal support under large flat overhangs.", category: "Support", default: "default", enumValues: ["default", "grid", "snug", "organic", "tree_slim", "tree_strong", "tree_hybrid"], enumLabels: ["Default (Grid/Organic)", "Grid", "Snug", "Organic", "Tree Slim", "Tree Strong", "Tree Hybrid"], perObject: "object" },
    support_threshold_angle: { type: "int", label: "Threshold angle", mode: "simple", scopes: ["process"], tooltip: "Support will be generated for overhangs whose slope angle is below the threshold. The smaller this value is, the steeper the overhang that can be printed without support.\nNote: If set to 0, normal supports use the Threshold overlap instead, while tree supports fall back to a default value of 30.", unit: "°", category: "Support", default: "30", min: 0, max: 90, perObject: "object" },
    support_threshold_overlap: { type: "floatOrPercent", label: "Threshold overlap", mode: "simple", scopes: ["process"], tooltip: "If threshold angle is zero, support will be generated for overhangs whose overlap is below the threshold. The smaller this value is, the steeper the overhang that can be printed without support.", unit: "mm or %", category: "Support", default: "50%", min: 0, max: 100, maxLiteral: 0.5, perObject: "object" },
    support_top_z_distance: { type: "float", label: "Top Z distance", mode: "advanced", scopes: ["process"], tooltip: "Z gap between the support's top and object.", unit: "mm", category: "Support", default: "0.2", min: 0, perObject: "object" },
    support_type: { type: "enum", label: "Type", mode: "simple", scopes: ["process"], tooltip: "Normal (auto) and Tree (auto) are used to generate support automatically. If Normal (manual) or Tree (manual) is selected, only support enforcers are generated.", category: "Support", default: "normal(auto)", enumValues: ["normal(auto)", "tree(auto)", "normal(manual)", "tree(manual)"], enumLabels: ["Normal (auto)", "Tree (auto)", "Normal (manual)", "Tree (manual)"], perObject: "object" },
    symmetric_infill_y_axis: { type: "bool", label: "Symmetric infill Y axis", mode: "advanced", scopes: ["process"], tooltip: "If the model has two parts that are symmetric about the Y axis, and you want these parts to have symmetric textures, please click this option on one of the parts.", category: "Strength", default: "0", perObject: "region" },
    temperature_vitrification: { type: "ints", label: "Softening temperature", mode: "simple", scopes: ["filament"], tooltip: "The material softens at this temperature, so when the bed temperature is equal to or greater than this, it's highly recommended to open the front door and/or remove the upper glass to avoid clogs.", unit: "℃", default: ["100"], slots: "filament" },
    template_custom_gcode: { type: "string", label: "Custom G-code", mode: "advanced", scopes: ["machine"], tooltip: "This G-code will be used as a custom code.", default: "", multiline: true, fullWidth: true, height: 12 },
    textured_cool_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the Textured Cool Plate.", unit: "℃", default: ["40"], min: 0, max: 300, slots: "filament" },
    textured_cool_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the Textured Cool Plate.", unit: "℃", default: ["40"], min: 0, max: 120, slots: "filament" },
    textured_plate_temp: { type: "ints", label: "Other layers", mode: "simple", scopes: ["filament"], fullLabel: "Bed temperature", tooltip: "This is the bed temperature for layers except for the first one. A value of 0 means the filament does not support printing on the Textured PEI Plate.", unit: "℃", default: ["45"], min: 0, max: 300, slots: "filament" },
    textured_plate_temp_initial_layer: { type: "ints", label: "First layer", mode: "simple", scopes: ["filament"], fullLabel: "First layer bed temperature", tooltip: "This is the bed temperature of the first layer. A value of 0 means the filament does not support printing on the Textured PEI Plate.", unit: "℃", default: ["45"], min: 0, max: 300, slots: "filament" },
    thick_bridges: { type: "bool", label: "Thick external bridges", mode: "advanced", scopes: ["process"], tooltip: "If enabled, bridge extrusion uses a line height equal to the nozzle diameter.\nThis increases bridge strength and reliability, allowing longer spans, but may worsen appearance.\nIf disabled, bridges may look better but are generally reliable only for shorter spans.", category: "Quality", default: "0", perObject: "object" },
    thick_internal_bridges: { type: "bool", label: "Thick internal bridges", mode: "advanced", scopes: ["process"], tooltip: "If enabled, internal bridge extrusion uses a line height equal to the nozzle diameter.\nThis increases internal bridge strength and reliability when printed over sparse infill, but may worsen appearance.\nIf disabled, internal bridges may look better but can be less reliable over sparse infill.", category: "Quality", default: "1", perObject: "object" },
    thumbnails: { type: "string", label: "G-code thumbnails", mode: "advanced", scopes: ["machine"], tooltip: 'Picture sizes to be stored into a .gcode and .sl1 / .sl1s files, in the following format: "XxY, XxY, ..."', default: "48x48/PNG,300x300/PNG", gui: "one_string" },
    thumbnails_format: { type: "enum", label: "Format of G-code thumbnails", mode: "advanced", scopes: ["machine"], tooltip: "Format of G-code thumbnails: PNG for best quality, JPG for smallest size, QOI for low memory firmware.", default: "PNG", enumValues: ["PNG", "JPG", "QOI", "BTT_TFT", "COLPIC"], enumLabels: ["PNG", "JPG", "QOI", "BTT TT", "ColPic"] },
    time_cost: { type: "float", label: "Time cost", mode: "advanced", scopes: ["machine"], tooltip: "The printer cost per hour.", unit: "money/h", default: "0", min: 0 },
    time_lapse_gcode: { type: "string", label: "Timelapse G-code", mode: "advanced", scopes: ["machine"], default: "", multiline: true, fullWidth: true, height: 5 },
    timelapse_type: { type: "enum", label: "Timelapse", mode: "simple", scopes: ["process"], tooltip: "If smooth or traditional mode is selected, a timelapse video will be generated for each print. After each layer is printed, a snapshot is taken with the chamber camera. All of these snapshots are composed into a timelapse video when printing completes. If smooth mode is selected, the toolhead will move to the excess chute after each layer is printed and then take a snapshot. Since the melt filament may leak from the nozzle during the process of taking a snapshot, a prime tower is required for smooth mode to wipe the nozzle.", default: "0", enumValues: ["0", "1"], enumLabels: ["Traditional", "Smooth"] },
    tool_change_on_wipe_tower: { type: "bool", label: "Tool change on wipe tower", mode: "advanced", scopes: ["machine"], tooltip: "Force the toolhead to travel to the wipe tower before issuing the tool change command (Tx). Only relevant for multi-extruder (multi-toolhead) printers using a Type 2 wipe tower. By default Orca skips the travel on multi-toolhead machines because the firmware handles the head swap, which can result in the Tx command being issued above the printed part. Enable this option if you want the tool change to always be issued above the wipe tower instead.", default: "0" },
    toolchange_cyclic_first_layer: { type: "bool", label: "Apply cyclic order to first layer", mode: "expert", scopes: ["process"], tooltip: "Applies the cyclic toolchange order to the first layer as well.\nBy default this is disabled, because the first layer is instead ordered for the best bed adhesion: filaments that print small, fragile first-layer features are printed last, so the following tool changes and travel moves are less likely to knock those weakly anchored parts loose. This first-layer order also honors a custom first layer filament sequence when one is set. The cyclic order's benefit (extra tool changes give each layer more time to cool) does not apply to the first layer, which is printed slowly and hot for adhesion.\nEnable this only if you need the exact same tool sequence on every layer, including the first, at the cost of that adhesion optimization.", category: "Advanced", default: "0" },
    toolchange_cyclic_order: { type: "string", label: "Cyclic order", mode: "expert", scopes: ["process"], tooltip: 'Custom filament sequence used by the cyclic toolchange ordering, as filament numbers separated by commas (e.g. "3,2,1,4").\nEach layer prints its filaments following this sequence; filaments not listed are printed last, in ascending order.\nLeave empty to cycle through the filaments in ascending order.', category: "Advanced", default: "" },
    toolchange_ordering: { type: "enum", label: "Toolchange ordering", mode: "advanced", scopes: ["process"], tooltip: "Determines the order of tool changes on each layer.\n- Default: Starts with the last used extruder to minimize tool changes.\n- Cyclic: Uses a fixed tool sequence each layer. This sacrifices speed for better surface quality, as the extra toolchanges allow layers more time to cool.", category: "Advanced", default: "default", enumValues: ["default", "cyclic"], enumLabels: ["Default", "Cyclic"] },
    top_bottom_infill_wall_overlap: { type: "percent", label: "Top/Bottom solid infill/wall overlap", mode: "advanced", scopes: ["process"], tooltip: "Top solid infill area is enlarged slightly to overlap with wall for better bonding and to minimize the appearance of pinholes where the top infill meets the walls. A value of 25-30% is a good starting point, minimizing the appearance of pinholes. The percentage value is relative to line width of sparse infill.", unit: "%", category: "Strength", default: "25%", perObject: "region" },
    top_layer_direction: { type: "float", label: "Top layer direction", mode: "simple", scopes: ["process"], tooltip: "Fixed angle for the top solid infill and ironing lines.\nSet to -1 to follow the default solid infill direction.", unit: "°", category: "Strength", default: "-1", min: -1, max: 360, perObject: "region" },
    top_shell_layers: { type: "int", label: "Top shell layers", mode: "simple", scopes: ["process"], fullLabel: "Top solid layers", tooltip: "This is the number of solid layers of top shell, including the top surface layer. When the thickness calculated by this value is thinner than the top shell thickness, the top shell layers will be increased", unit: "layers", category: "Strength", default: "4", min: 0, perObject: "region" },
    top_shell_thickness: { type: "float", label: "Top shell thickness", mode: "simple", scopes: ["process"], tooltip: "The number of top solid layers is increased when slicing if the thickness calculated by top shell layers is thinner than this value. This can avoid having too thin a shell when layer height is small. 0 means that this setting is disabled and thickness of top shell is determined simply by the number of top shell layers.", unit: "mm", category: "Strength", default: "0.6", min: 0, perObject: "region" },
    top_solid_infill_flow_ratio: { type: "float", label: "Top surface flow ratio", mode: "advanced", scopes: ["process"], tooltip: "This factor affects the amount of material for top solid infill. You can decrease it slightly to have smooth surface finish.\n\nThe actual top surface flow used is calculated by multiplying this value with the filament flow ratio, and if set, the object's flow ratio.", category: "Advanced", default: "1", min: 0, max: 2, perObject: "region" },
    top_surface_acceleration: { type: "floats", label: "Top surface", mode: "advanced", scopes: ["process"], tooltip: "This is the acceleration of top surface infill. Using a lower value may improve top surface quality.", unit: "mm/s²", category: "Speed", default: ["500"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    top_surface_density: { type: "percent", label: "Top surface density", mode: "simple", scopes: ["process"], tooltip: "Density of top surface layer. A value of 100% creates a fully solid, smooth top layer. Reducing this value results in a textured top surface, according to the chosen top surface pattern. A value of 0% will result in only the walls on the top layer being created. Intended for aesthetic or functional purposes, not to fix issues such as over-extrusion.", unit: "%", category: "Strength", default: "100%", min: 0, max: 100, perObject: "region" },
    top_surface_expansion: { type: "float", label: "Top surface expansion", mode: "advanced", scopes: ["process"], tooltip: "Expands the top surfaces by this distance to connect distinct top surfaces and fill gaps.\nUseful for cases where the top surface is interrupted by a raised feature, such as text on a plane. Expanding it removes the holes beneath these features and creates a continuous path with a better finish for printing on top. The expansion is applied to the original top surface, before any other processing such as bridging or overhang detection.", unit: "mm", category: "Strength", default: "0", min: 0, perObject: "region" },
    top_surface_expansion_direction: { type: "enum", label: "Top expansion direction", mode: "advanced", scopes: ["process"], tooltip: "Direction in which the top surface expansion grows.\n - Inward grows into the holes and gaps left by features rising from the middle of a top surface.\n - Outward grows the outer edge of the surface, connecting surfaces separated by features that can divide a surface, such as a lattice pattern.\n - Inward and Outward does both.", category: "Strength", default: "inward_and_outward", enumValues: ["inward_and_outward", "inward", "outward"], enumLabels: ["Inward and Outward", "Inward", "Outward"], perObject: "region" },
    top_surface_expansion_margin: { type: "float", label: "Top expansion wall margin", mode: "advanced", scopes: ["process"], tooltip: "Using “Top surface expansion” may cause a surface that did not previously touch the model's outer walls to now do so.\nThis can cause contraction marks (such as the hull line) on the outer walls.\nBy adding a small margin, this contraction will not occur directly on the walls, thereby preventing a visible mark.", unit: "mm", category: "Strength", default: "0", min: 0, max: 10, perObject: "region" },
    top_surface_filament_id: { type: "int", label: "Top surface", mode: "advanced", scopes: ["process"], tooltip: 'Filament to print top surface.\n"Default" uses the active object/part filament.', category: "Extruders", default: "0", min: 0, openEnum: true, perObject: "region" },
    top_surface_fill_order: { type: "enum", label: "Top surface fill order", mode: "advanced", scopes: ["process"], tooltip: "Direction in which top surfaces are filled when using a center-based pattern (Concentric, Spiral Inset, Archimedean Chords, Octagram Spiral).\nOutward starts at the center of the surface, so any excess material is pushed towards the edge where it is least visible. Inward starts at the edge and ends with the tight curves at the center.\nDefault uses shortest-path ordering, which may run in either direction.", category: "Strength", default: "default", enumValues: ["default", "outward", "inward"], enumLabels: ["Default", "Outward", "Inward"], perObject: "region" },
    top_surface_jerk: { type: "floats", label: "Top surface", mode: "advanced", scopes: ["process"], tooltip: "Jerk for top surface.", unit: "mm/s", category: "Speed", default: ["9"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    top_surface_line_width: { type: "floatOrPercent", label: "Top surface", mode: "advanced", scopes: ["process"], tooltip: "Line width for top surfaces. If expressed as a %, it will be computed over the nozzle diameter.", unit: "mm or %", category: "Quality", default: "0", min: 0, max: 1e3, maxLiteral: 10, ratioOver: "nozzle_diameter", perObject: "region" },
    top_surface_pattern: { type: "enum", label: "Top surface pattern", mode: "simple", scopes: ["process"], tooltip: "This is the line pattern for top surface infill.", category: "Strength", default: "monotonicline", enumValues: ["monotonic", "monotonicline", "rectilinear", "alignedrectilinear", "concentric", "spiralinset", "hilbertcurve", "archimedeanchords", "octagramspiral"], enumLabels: ["Monotonic", "Monotonic line", "Rectilinear", "Aligned Rectilinear", "Concentric", "Spiral Inset", "Hilbert Curve", "Archimedean Chords", "Octagram Spiral"], perObject: "region" },
    top_surface_speed: { type: "floats", label: "Top surface", mode: "advanced", scopes: ["process"], tooltip: "This is the speed for solid top surface infill.", unit: "mm/s", category: "Speed", default: ["100"], min: 1, nullable: true, slots: "variant", perObject: "region" },
    travel_acceleration: { type: "floats", label: "Travel", mode: "advanced", scopes: ["process"], tooltip: "Acceleration of travel moves.", unit: "mm/s²", category: "Speed", default: ["10000"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    travel_jerk: { type: "floats", label: "Travel", mode: "advanced", scopes: ["process"], tooltip: "Jerk for travel.", unit: "mm/s", category: "Speed", default: ["12"], min: 0, nullable: true, slots: "variant", perObject: "object" },
    travel_slope: { type: "floats", label: "Traveling angle", mode: "advanced", scopes: ["machine"], tooltip: "Traveling angle for Slope and Spiral Z-hop type. Setting it to 90° results in Normal Lift.", unit: "°", default: ["3"], min: 1, max: 90, slots: "variant" },
    travel_speed: { type: "floats", label: "Travel", mode: "advanced", scopes: ["process"], tooltip: "This is the speed at which traveling is done.", unit: "mm/s", default: ["120"], min: 1, nullable: true, slots: "variant" },
    travel_speed_z: { type: "floats", label: "travel_speed_z", mode: "develop", scopes: ["process"], unit: "mm/s", default: ["0"], min: 0, nullable: true, slots: "variant" },
    tree_support_angle_slow: { type: "float", label: "Preferred Branch Angle", mode: "advanced", scopes: ["process"], tooltip: "The preferred angle of the branches, when they do not have to avoid the model. Use a lower angle to make them more vertical and more stable. Use a higher angle for branches to merge faster.", unit: "°", category: "Support", default: "25", min: 10, max: 85, perObject: "object" },
    tree_support_auto_brim: { type: "bool", label: "Auto brim width", mode: "simple", scopes: ["process"], tooltip: "Enabling this option means the width of the brim for tree support will be automatically calculated.", category: "Quality", default: "1", perObject: "object" },
    tree_support_branch_angle: { type: "float", label: "Tree support branch angle", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the maximum overhang angle that the branches of tree support are allowed to make. If the angle is increased, the branches can be printed more horizontally, allowing them to reach farther.", unit: "°", category: "Support", default: "40", min: 0, max: 60, perObject: "object" },
    tree_support_branch_angle_organic: { type: "float", label: "Tree support branch angle", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the maximum overhang angle that the branches of tree support are allowed to make. If the angle is increased, the branches can be printed more horizontally, allowing them to reach farther.", unit: "°", category: "Support", default: "40", min: 0, max: 60, perObject: "object" },
    tree_support_branch_diameter: { type: "float", label: "Tree support branch diameter", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the initial diameter of support nodes.", unit: "mm", category: "Support", default: "5", min: 1, max: 10, perObject: "object" },
    tree_support_branch_diameter_angle: { type: "float", label: "Branch Diameter Angle", mode: "advanced", scopes: ["process"], tooltip: "The angle of the branches' diameter as they gradually become thicker towards the bottom. An angle of 0 will cause the branches to have uniform thickness over their length. A bit of an angle can increase stability of the organic support.", unit: "°", category: "Support", default: "5", min: 0, max: 15, perObject: "object" },
    tree_support_branch_diameter_organic: { type: "float", label: "Tree support branch diameter", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the initial diameter of support nodes.", unit: "mm", category: "Support", default: "2", min: 1, max: 10, perObject: "object" },
    tree_support_branch_distance: { type: "float", label: "Tree support branch distance", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the distance between neighboring tree support nodes.", unit: "mm", category: "Support", default: "5", min: 1, max: 10, perObject: "object" },
    tree_support_branch_distance_organic: { type: "float", label: "Tree support branch distance", mode: "advanced", scopes: ["process"], tooltip: "This setting determines the distance between neighboring tree support nodes.", unit: "mm", category: "Support", default: "1", min: 1, max: 10, perObject: "object" },
    tree_support_brim_width: { type: "float", label: "Tree support brim width", mode: "simple", scopes: ["process"], tooltip: "Distance from tree branch to the outermost brim line.", category: "Quality", default: "3", min: 0, perObject: "object" },
    tree_support_tip_diameter: { type: "float", label: "Tip Diameter", mode: "advanced", scopes: ["process"], tooltip: "Branch tip diameter for organic supports.", unit: "mm", category: "Support", default: "0.8", min: 0.1, max: 100, perObject: "object" },
    tree_support_top_rate: { type: "percent", label: "Branch Density", mode: "advanced", scopes: ["process"], tooltip: "Adjusts the density of the support structure used to generate the tips of the branches. A higher value results in better overhangs but the supports are harder to remove, thus it is recommended to enable top support interfaces instead of a high branch density value if dense interfaces are needed.", unit: "%", category: "Support", default: "30%", min: 5, perObject: "object" },
    tree_support_wall_count: { type: "int", label: "Support wall loops", mode: "advanced", scopes: ["process"], tooltip: "This setting specifies the count of support walls in the range of [0,2]. 0 means auto.", category: "Support", default: "0", min: 0, max: 2, perObject: "object" },
    tree_support_with_infill: { type: "bool", label: "Tree support with infill", mode: "advanced", tooltip: "This setting specifies whether to add infill inside large hollows of tree support.", category: "Support", default: "0" },
    unsupported_wall_last: { type: "bool", label: "Print unsupported walls last", mode: "advanced", scopes: ["process"], tooltip: "Wall loops that lie entirely in mid air are printed once something can hold them:\nthey are extruded after the other walls of their island, innermost first, whatever the wall order is.\nA loop that only the bridges of this layer can anchor waits until those bridges are printed, while a loop running alongside a supported wall keeps its place before the infill, which needs it as an anchor.", category: "Quality", default: "0", perObject: "region" },
    upward_compatible_machine: { type: "strings", label: "upward compatible machine", mode: "advanced", scopes: ["machine"], default: [], slots: "list" },
    use_3mf: { type: "bool", label: "Use 3MF instead of G-code", mode: "advanced", scopes: ["machine"], tooltip: "Enable this if the printer accepts a 3MF file as the print job. When enabled, Orca Slicer sends the sliced file as a .gcode.3mf, instead of a plain .gcode file.", default: "0" },
    use_firmware_retraction: { type: "bool", label: "Use firmware retraction", mode: "advanced", scopes: ["machine"], tooltip: "This experimental setting uses G10 and G11 commands to have the firmware handle the retraction. This is only supported in recent Marlin.", default: "0" },
    use_relative_e_distances: { type: "bool", label: "Use relative E distances", mode: "advanced", scopes: ["machine"], tooltip: 'Relative extrusion is recommended when using "label_objects" option. Some extruders work better with this option unchecked (absolute extrusion mode). Wipe tower is only compatible with relative mode. It is recommended on most printers. Default is checked.', default: "1" },
    volumetric_speed_coefficients: { type: "strings", label: "Max volumetric speed multinomial coefficients", mode: "simple", scopes: ["filament"], default: [""], slots: "variant" },
    wait_for_temp_on_wipe_tower: { type: "bool", label: "Wait for temperature on wipe tower", mode: "advanced", scopes: ["machine"], tooltip: "Pick up the new tool without waiting for it to reach printing temperature, travel to the wipe tower, and wait for the temperature there, right before purging. Ooze from the heat-up lands on the tower instead of the model, and the travel overlaps with the heating. Only relevant for multi-extruder (multi-toolhead) printers using a Type 2 wipe tower. The firmware or tool change macro must not wait for the temperature itself. When disabled, the temperature wait is issued right after the tool change command.", default: "0" },
    wall_direction: { type: "enum", label: "Wall loop direction", mode: "advanced", scopes: ["process"], tooltip: "The direction which the contour wall loops are extruded when looking down from the top.\nHoles are printed in the opposite direction to the contour to maintain alignment with layers whose contour polygons are incomplete and change direction, also partially forming the contour of a hole.\n\nThis option will be disabled if spiral vase mode is enabled.", category: "Quality", default: "ccw", enumValues: ["ccw", "cw"], enumLabels: ["Counter clockwise", "Clockwise"], perObject: "region" },
    wall_distribution_count: { type: "int", label: "Wall distribution count", mode: "advanced", scopes: ["process"], tooltip: "The number of walls, counted from the center, over which the variation needs to be spread. Lower values mean that the outer walls don't change in width.", category: "Quality", default: "1", min: 1, perObject: "object" },
    wall_generator: { type: "enum", label: "Wall generator", mode: "advanced", scopes: ["process"], tooltip: "The classic wall generator produces walls with constant extrusion width and for very thin areas, gap-fill is used. The Arachne engine produces walls with variable extrusion width.", category: "Quality", default: "arachne", enumValues: ["classic", "arachne"], enumLabels: ["Classic", "Arachne"], perObject: "object" },
    wall_loops: { type: "int", label: "Wall loops", mode: "simple", scopes: ["process"], tooltip: "This is the number of walls per layer.", category: "Strength", default: "2", min: 0, max: 1e3, perObject: "region" },
    wall_maximum_deviation: { type: "float", label: "Maximum wall deviation", mode: "expert", scopes: ["process"], tooltip: "The maximum deviation allowed when reducing the resolution for the 'Maximum wall resolution' setting. If you increase this, the print will be less accurate, but the G-Code will be smaller. 'Maximum wall deviation' limits 'Maximum wall resolution', so if the two conflict, 'Maximum wall deviation' takes precedence.", unit: "mm", category: "Quality", default: "0.025", min: 5e-3, max: 0.05, perObject: "object" },
    wall_maximum_resolution: { type: "float", label: "Maximum wall resolution", mode: "expert", scopes: ["process"], tooltip: "This value determines the smallest wall line segment length in mm. The smaller you set this value, the more accurate and precise the walls will be.", unit: "mm", category: "Quality", default: "0.5", min: 5e-3, max: 0.5, perObject: "object" },
    wall_sequence: { type: "enum", label: "Walls printing order", mode: "advanced", scopes: ["process"], tooltip: "Print sequence of the internal (inner) and external (outer) walls.\n\nUse Inner/Outer for best overhangs. This is because the overhanging walls can adhere to a neighbouring perimeter while printing. However, this option results in slightly reduced surface quality as the external perimeter is deformed by being squashed to the internal perimeter.\n\nUse Inner/Outer/Inner for the best external surface finish and dimensional accuracy as the external wall is printed undisturbed from an internal perimeter. However, overhang performance will reduce as there is no internal perimeter to print the external wall against. This option requires a minimum of 3 walls to be effective as it prints the internal walls from the 3rd perimeter onwards first, then the external perimeter and, finally, the first internal perimeter. This option is recommended against the Outer/Inner option in most cases.\n\nUse Outer/Inner for the same external wall quality and dimensional accuracy benefits of Inner/Outer/Inner option. However, the Z seams will appear less consistent as the first extrusion of a new layer starts on a visible surface.", category: "Quality", default: "inner wall/outer wall", enumValues: ["inner wall/outer wall", "outer wall/inner wall", "inner-outer-inner wall"], enumLabels: ["Inner/Outer", "Outer/Inner", "Inner/Outer/Inner"], perObject: "region" },
    wall_transition_angle: { type: "float", label: "Wall transitioning threshold angle", mode: "advanced", scopes: ["process"], tooltip: "When to create transitions between even and odd numbers of walls. A wedge shape with an angle greater than this setting will not have transitions and no walls will be printed in the center to fill the remaining space. Reducing this setting reduces the number and length of these center walls, but may leave gaps or overextrude.", unit: "°", category: "Quality", default: "10", min: 1, max: 59, perObject: "object" },
    wall_transition_filter_deviation: { type: "percent", label: "Wall transitioning filter margin", mode: "advanced", scopes: ["process"], tooltip: "Prevent transitioning back and forth between one extra wall and one less. This margin extends the range of extrusion widths which follow to [Minimum wall width - margin, 2 * Minimum wall width + margin]. Increasing this margin reduces the number of transitions, which reduces the number of extrusion starts/stops and travel time. However, large extrusion width variation can lead to under- or overextrusion problems. It's expressed as a percentage over nozzle diameter.", unit: "%", category: "Quality", default: "25%", min: 0, perObject: "object" },
    wall_transition_length: { type: "percent", label: "Wall transition length", mode: "advanced", scopes: ["process"], tooltip: "When transitioning between different numbers of walls as the part becomes thinner, a certain amount of space is allotted to split or join the wall segments. It's expressed as a percentage over nozzle diameter.", unit: "%", category: "Quality", default: "100%", min: 0, perObject: "object" },
    wipe: { type: "bools", label: "Wipe while retracting", mode: "advanced", scopes: ["machine"], tooltip: "This moves the nozzle along the last extrusion path when retracting to clean any leaked material on the nozzle. This can minimize blobs when printing a new part after traveling.", default: ["0"], slots: "variant" },
    wipe_before_external_loop: { type: "bool", label: "Wipe before external loop", mode: "advanced", scopes: ["process"], tooltip: "To minimize visibility of potential overextrusion at the start of an external perimeter when printing with Outer/Inner or Inner/Outer/Inner wall print order, the de-retraction is performed slightly on the inside from the start of the external perimeter. That way any potential over extrusion is hidden from the outside surface.\n\nThis is useful when printing with Outer/Inner or Inner/Outer/Inner wall print order as in these modes it is more likely an external perimeter is printed immediately after a de-retraction move.", category: "Quality", default: "0", perObject: "region" },
    wipe_distance: { type: "floats", label: "Wipe distance", mode: "advanced", scopes: ["machine"], tooltip: "Describe how long the nozzle will move along the last path when retracting.\n\nDepending on how long the wipe operation lasts, how fast and long the extruder/filament retraction settings are, a retraction move may be needed to retract the remaining filament.\n\nSetting a value in the retract amount before wipe setting below will perform any excess retraction before the wipe, else it will be performed after.", unit: "mm", default: ["1"], min: 0, slots: "variant" },
    wipe_inward: { type: "bool", label: "Wipe inward", mode: "expert", scopes: ["process"], tooltip: "Applies only to external walls, including hole boundaries. Moves the hot nozzle toward printed inner walls during wiping to reduce reheating of freshly printed plastic and seam marks.\n\nEspecially useful at layer heights below 0.1 mm, where wipe marks are more visible.\n\nUses the regular wipe if no adjacent inner wall is already printed (single-wall areas or Outer/Inner wall order), or if no supported inward path can be found, for example at tight corners or seam gaps.", category: "Quality", default: "0", perObject: "region" },
    wipe_inward_distance: { type: "floatOrPercent", label: "Wipe inward distance", mode: "expert", scopes: ["process"], tooltip: "The distance the wipe path is shifted away from the external perimeter, specified in millimeters or as a percentage of the actual outer-wall extrusion width.\n\nFor example, 50% shifts the path by half of the outer-wall width. The effective offset is limited by both the actual outer-wall width and the available spacing to the adjacent wall, so values above 100% or an equivalent absolute distance have no additional effect. Set to 0 to disable the offset.", unit: "mm or %", category: "Quality", default: "50%", min: 0, max: 100, maxLiteral: 2, ratioOver: "outer_wall_line_width", perObject: "region" },
    wipe_on_loops: { type: "bool", label: "Wipe on loops", mode: "advanced", scopes: ["process"], tooltip: "To minimize the visibility of the seam in a closed loop extrusion, a small inward movement is executed before the extruder leaves the loop.", category: "Quality", default: "0", perObject: "region" },
    wipe_speed: { type: "floatOrPercent", label: "Wipe speed", mode: "advanced", scopes: ["process"], tooltip: "The wipe speed is determined by the speed setting specified in this configuration. If the value is expressed as a percentage (e.g. 80%), it will be calculated based on the travel speed setting above. The default value for this parameter is 80%.", unit: "mm/s or %", category: "Speed", default: "80%", min: 0, ratioOver: "travel_speed", perObject: "region" },
    wipe_tower_bridging: { type: "float", label: "Maximal bridging distance", mode: "advanced", scopes: ["process"], tooltip: "Maximal distance between supports on sparse infill sections.", unit: "mm", default: "10" },
    wipe_tower_cone_angle: { type: "float", label: "Stabilization cone apex angle", mode: "advanced", scopes: ["process"], tooltip: "Angle at the apex of the cone that is used to stabilize the wipe tower. Larger angle means wider base.", unit: "°", default: "30", min: 0, max: 90 },
    wipe_tower_extra_flow: { type: "percent", label: "Extra flow for purging", mode: "advanced", scopes: ["process"], tooltip: "Extra flow used for the purging lines on the wipe tower. This makes the purging lines thicker or narrower than they normally would be. The spacing is adjusted automatically.", unit: "%", default: "100%", min: 100, max: 300 },
    wipe_tower_extra_rib_length: { type: "float", label: "Extra rib length", mode: "advanced", scopes: ["process"], tooltip: "Positive values can increase the size of the rib wall, while negative values can reduce the size. However, the size of the rib wall can not be smaller than that determined by the cleaning volume.", unit: "mm", default: "0", max: 300 },
    wipe_tower_extra_spacing: { type: "percent", label: "Wipe tower purge lines spacing", mode: "advanced", scopes: ["process"], tooltip: "Spacing of purge lines on the wipe tower.", unit: "%", default: "100%", min: 100, max: 300 },
    wipe_tower_filament: { type: "int", label: "Wipe tower", mode: "advanced", scopes: ["process"], tooltip: "The extruder to use when printing perimeter of the wipe tower. Set to 0 to use the one that is available (non-soluble would be preferred).", category: "Extruders", default: "0", min: 0, openEnum: true },
    wipe_tower_fillet_wall: { type: "bool", label: "Fillet wall", mode: "advanced", scopes: ["process"], tooltip: "The wall of prime tower will fillet.", default: "1" },
    wipe_tower_max_purge_speed: { type: "float", label: "Maximum wipe tower print speed", mode: "advanced", scopes: ["process"], tooltip: "The maximum print speed when purging in the wipe tower and printing the wipe tower sparse layers. When purging, if the sparse infill speed or calculated speed from the filament max volumetric speed is lower, the lowest will be used instead.\n\nWhen printing the sparse layers, if the internal perimeter speed or calculated speed from the filament max volumetric speed is lower, the lowest will be used instead.\n\nIncreasing this speed may affect the tower's stability as well as increase the force with which the nozzle collides with any blobs that may have formed on the wipe tower.\n\nBefore increasing this parameter beyond the default of 90 mm/s, make sure your printer can reliably bridge at the increased speeds and that ooze when tool changing is well controlled.\n\nFor the wipe tower external perimeters the internal perimeter speed is used regardless of this setting.", unit: "mm/s", default: "90", min: 10 },
    wipe_tower_no_sparse_layers: { type: "bool", label: "No sparse layers (beta)", mode: "advanced", scopes: ["process"], tooltip: "If enabled, the wipe tower will not be printed on layers with no tool changes. On layers with a tool change, extruder will travel downward to print the wipe tower, so the tower ends up below the model and the toolhead has to reach down to it. Layouts where that would collide with an already printed object are rejected. Has no effect with smooth timelapse or clumping detection, which need a tower on every layer.", default: "0" },
    wipe_tower_rib_width: { type: "float", label: "Rib width", mode: "advanced", scopes: ["process"], tooltip: "Rib width is always less than half the prime tower side length.", unit: "mm", default: "8", min: 0, max: 300 },
    wipe_tower_rotation_angle: { type: "float", label: "Wipe tower rotation angle", mode: "advanced", scopes: ["process"], tooltip: "Wipe tower rotation angle with respect to X axis.", unit: "°", default: "0" },
    wipe_tower_type: { type: "enum", label: "Wipe tower type", mode: "advanced", scopes: ["machine"], tooltip: "Choose the wipe tower implementation for multi-material prints. Type 1 is recommended for Bambu and Qidi printers with a filament cutter. Type 2 offers better compatibility with multi-tool and MMU printers and provide overall better compatibility.", default: "type2", enumValues: ["type1", "type2"], enumLabels: ["Type 1", "Type 2"] },
    wipe_tower_wall_type: { type: "enum", label: "Wall type", mode: "advanced", scopes: ["process"], tooltip: "Wipe tower outer wall type.\n1. Rectangle: The default wall type, a rectangle with fixed width and height.\n2. Cone: A cone with a fillet at the bottom to help stabilize the wipe tower.\n3. Rib: Adds four ribs to the tower wall for enhanced stability.", default: "rib", enumValues: ["rectangle", "cone", "rib"], enumLabels: ["Rectangle", "Cone", "Rib"] },
    wipe_tower_x: { type: "floats", label: "wipe_tower_x", mode: "develop", default: ["15"], slots: "list" },
    wipe_tower_y: { type: "floats", label: "wipe_tower_y", mode: "develop", default: ["220"], slots: "list" },
    wiping_volumes_extruders: { type: "floats", label: "Purging volumes - load/unload volumes", mode: "simple", scopes: ["process"], tooltip: "This vector saves required volumes to change from/to each tool used on the wipe tower. These values are used to simplify creation of the full purging volumes below.", default: ["70", "70", "70", "70", "70", "70", "70", "70", "70", "70"], slots: "list" },
    wrapping_detection_gcode: { type: "string", label: "Clumping detection G-code", mode: "advanced", scopes: ["machine"], default: "", multiline: true, fullWidth: true, height: 5 },
    wrapping_detection_layers: { type: "int", label: "Clumping detection layers", mode: "develop", scopes: ["machine"], tooltip: "Clumping detection layers.", default: "20", min: 0 },
    wrapping_exclude_area: { type: "points", label: "Probing exclude area of clumping", mode: "advanced", scopes: ["machine"], tooltip: "Probing exclude area of clumping.", default: [], gui: "one_string", slots: "list" },
    xy_contour_compensation: { type: "float", label: "X-Y contour compensation", mode: "advanced", scopes: ["process"], tooltip: "Contours of objects will expand or contract in the XY plane by the set value. Positive values make contours bigger and negative values make contours smaller. This function is used to adjust sizes slightly when objects have assembly issues.", unit: "mm", category: "Quality", default: "0", perObject: "object" },
    xy_hole_compensation: { type: "float", label: "X-Y hole compensation", mode: "advanced", scopes: ["process"], tooltip: "Holes in objects will expand or contract in the XY plane by the set value. Positive values make holes bigger and negative values make holes smaller. This function is used to adjust sizes slightly when objects have assembly issues.", unit: "mm", category: "Quality", default: "0", perObject: "object" },
    z_hop: { type: "floats", label: "Z-hop height", mode: "simple", scopes: ["machine"], tooltip: "Whenever there is a retraction, the nozzle is lifted a little to create clearance between the nozzle and the print. This prevents the nozzle from hitting the print when traveling more. Using spiral lines to lift Z can prevent stringing.", unit: "mm", default: ["0.4"], min: 0, max: 5, slots: "variant" },
    z_hop_types: { type: "enums", label: "Z-hop type", mode: "advanced", scopes: ["machine"], tooltip: "Type of Z-hop.", default: ["Slope Lift"], enumValues: ["Auto Lift", "Normal Lift", "Slope Lift", "Spiral Lift"], enumLabels: ["Auto", "Normal", "Slope", "Spiral"], slots: "variant" },
    z_offset: { type: "float", label: "Z offset", mode: "advanced", scopes: ["machine"], tooltip: "This value will be added (or subtracted) from all the Z coordinates in the output G-code. It is used to compensate for bad Z endstop position: for example, if your endstop zero actually leaves the nozzle 0.3mm far from the print bed, set this to -0.3 (or fix your endstop).", unit: "mm", default: "0" },
    zaa_dont_alternate_fill_direction: { type: "bool", label: "Don't alternate fill direction", mode: "expert", scopes: ["process"], tooltip: "Disable alternating fill direction when using Z contouring.", category: "Quality", default: "0", perObject: "region" },
    zaa_enabled: { type: "bool", label: "Z contouring enabled", mode: "expert", scopes: ["process"], tooltip: "Enable Z-layer contouring (aka Z-layer anti-aliasing).", category: "Quality", default: "0", perObject: "region" },
    zaa_min_z: { type: "float", label: "Minimum Z height", mode: "expert", scopes: ["process"], tooltip: "Minimum Z-layer height.\nAlso controls the slicing plane.", unit: "mm", category: "Quality", default: "0.05", min: 0, max: 100, perObject: "region" },
    zaa_minimize_perimeter_height: { type: "float", label: "Minimize wall height angle", mode: "expert", scopes: ["process"], tooltip: "Reduce the height of top-surface perimeters to match the model edge height.\nAffects perimeters with a slope less than this angle (degrees).\nA reasonable value is 35. Set to 0 to disable.", unit: "°", category: "Quality", default: "35", min: 0, max: 90, perObject: "region" },
    extruders_count: { type: "int", label: "Extruders", mode: "advanced", synthetic: true, tooltip: "Number of extruders of the printer.", min: 1, max: 64 }
  }
};

// host/src/settings/catalogue.ts
var CATALOGUE = settings_catalogue_default;
function settingDef(catalogue, key) {
  return Object.hasOwn(catalogue.options, key) ? catalogue.options[key] : void 0;
}
var MODE_RANK = { simple: 0, advanced: 1, expert: 2, develop: 3 };
function shownInMode(mode, selected) {
  return MODE_RANK[mode] <= MODE_RANK[selected];
}
function lineMode(catalogue, line) {
  return settingDef(catalogue, line.options[0].key)?.mode ?? "develop";
}
function lineLabel(catalogue, line) {
  if (line.label !== void 0) return line.label;
  const option = line.options[0];
  const def = settingDef(catalogue, option.key);
  return option.label ?? (line.modeColumns ? def?.fullLabel : void 0) ?? def?.label ?? option.key;
}

// host/src/settings/variants.ts
var VARIANT_KEYS = {
  process: { id: "print_extruder_id", variant: "print_extruder_variant" },
  filament: { id: null, variant: "filament_extruder_variant" },
  machine: { id: "printer_extruder_id", variant: "printer_extruder_variant" }
};
function extruderVariantString(extruderType, nozzleVolumeType) {
  return `${extruderType} ${nozzleVolumeType === "Hybrid" ? "Standard" : nozzleVolumeType}`;
}
function indexForExtruder(table, extruder, variant, stride = 1) {
  const { variants, ids } = table;
  const complete = ids !== null && ids.length >= variants.length;
  const generatedId = (target) => {
    const list = table.extruderVariantList;
    if (!list) return 0;
    let n = 0;
    for (let e = 0; e < list.length; e++) {
      for (const v2 of list[e].split(",").map((s) => s.trim())) {
        if (v2 === "") continue;
        if (n === target) return e + 1;
        n++;
      }
    }
    return 0;
  };
  for (let i = 0; i < variants.length; i++) {
    if (variants[i].trim() !== variant) continue;
    if (ids === null) return i * stride;
    const id = complete ? Number.parseInt(ids[i], 10) : generatedId(i);
    if (id === extruder) return i * stride;
  }
  return -1;
}

// host/src/settings/rules.ts
var READ = {
  // @generated-read-table (every key passed to a Config accessor or listed in readKeys)
  accel_to_decel_enable: ["bool", "1"],
  activate_air_filtration: ["bools", "0"],
  activate_air_filtration_during_print: ["bools", "1"],
  activate_air_filtration_on_completion: ["bools", "1"],
  adaptive_pressure_advance: ["bools", "0"],
  adaptive_pressure_advance_model: ["strings", "0,0,0\n0,0,0"],
  alternate_extra_wall: ["bool", "0"],
  auxiliary_fan: ["bool", "0"],
  bed_exclude_volume_mode: ["enum", "shared"],
  bed_exclude_volumes: ["string", ""],
  bottom_shell_layers: ["int", "3"],
  bottom_surface_filament_id: ["int", "0"],
  bottom_surface_pattern: ["enum", "monotonic"],
  brim_type: ["enum", "auto_brim"],
  brim_width: ["float", "0"],
  chamber_minimal_temperature: ["ints", "0"],
  chamber_temperature: ["ints", "0"],
  close_fan_the_first_x_layers: ["ints", "1"],
  curr_bed_type: ["enum", "Cool Plate"],
  default_acceleration: ["floats", "500"],
  default_jerk: ["floats", "0"],
  detect_overhang_wall: ["bool", "1"],
  detect_thin_wall: ["bool", "0"],
  draft_shield: ["enum", "disabled"],
  elefant_foot_compensation: ["float", "0"],
  elefant_foot_layers_density: ["percent", "100%"],
  emit_machine_limits_to_gcode: ["bool", "1"],
  enable_arc_fitting: ["bool", "0"],
  enable_long_retraction_when_cut: ["int", "0"],
  enable_overhang_bridge_fan: ["bools", "1"],
  enable_overhang_speed: ["bools", "1"],
  enable_pressure_advance: ["bools", "0"],
  enable_prime_tower: ["bool", "0"],
  enable_support: ["bool", "0"],
  enable_tower_interface_features: ["bool", "0"],
  enable_wrapping_detection: ["bool", "0"],
  enforce_support_layers: ["int", "0"],
  ensure_vertical_shell_thickness: ["enum", "ensure_all"],
  extruder_bed_exclude_volumes: ["strings", ""],
  extruder_max_nozzle_count: ["ints", "1"],
  extruder_type: ["enums", "Direct Drive"],
  extruder_variant_list: ["strings", "Direct Drive Standard"],
  filament_deretraction_speed: ["floats", "nil"],
  filament_diameter: ["floats", "1.75"],
  filament_ironing_flow: ["percents", "nil"],
  filament_ironing_inset: ["floats", "nil"],
  filament_ironing_spacing: ["floats", "nil"],
  filament_ironing_speed: ["floats", "nil"],
  filament_is_support: ["bools", "0"],
  filament_long_retractions_when_cut: ["bools", "nil"],
  filament_max_volumetric_speed: ["floats", "2"],
  filament_multitool_ramming: ["bools", "0"],
  filament_retract_after_wipe: ["percents", "nil"],
  filament_retract_before_wipe: ["percents", "nil"],
  filament_retract_length_toolchange: ["floats", "nil"],
  filament_retract_lift_above: ["floats", "nil"],
  filament_retract_lift_below: ["floats", "nil"],
  filament_retract_lift_enforce: ["enums", "nil"],
  filament_retract_restart_extra: ["floats", "nil"],
  filament_retract_restart_extra_toolchange: ["floats", "nil"],
  filament_retract_when_changing_layer: ["bools", "nil"],
  filament_retraction_distances_when_cut: ["floats", "nil"],
  filament_retraction_length: ["floats", "nil"],
  filament_retraction_minimum_travel: ["floats", "nil"],
  filament_retraction_speed: ["floats", "nil"],
  filament_soluble: ["bools", "0"],
  filament_type: ["strings", "PLA"],
  filament_wipe: ["bools", "nil"],
  filament_wipe_distance: ["floats", "nil"],
  filament_z_hop: ["floats", "nil"],
  filament_z_hop_types: ["enums", "nil"],
  fill_multiline: ["int", "1"],
  fuzzy_skin: ["enum", "disabled_fuzzy"],
  fuzzy_skin_mode: ["enum", "displacement"],
  fuzzy_skin_noise_type: ["enum", "classic"],
  gcode_flavor: ["enum", "marlin"],
  hole_to_polyhole: ["bool", "0"],
  infill_anchor_max: ["floatOrPercent", "20"],
  infill_combination: ["bool", "0"],
  infill_lock_depth: ["float", "1"],
  initial_layer_fan_speed: ["ints", "-1"],
  initial_layer_print_height: ["float", "0.2"],
  inner_wall_filament_id: ["int", "0"],
  input_shaping_emit: ["bool", "0"],
  input_shaping_type: ["enum", "Default"],
  interlocking_beam: ["bool", "0"],
  internal_solid_filament_id: ["int", "0"],
  ironing_pattern: ["enum", "rectilinear"],
  ironing_spacing: ["float", "0.1"],
  ironing_type: ["enum", "no ironing"],
  layer_height: ["float", "0.2"],
  long_retractions_when_cut: ["bools", "0"],
  long_retractions_when_ec: ["bools", "0"],
  machine_max_junction_deviation: ["floats", "0.01"],
  make_overhang_printable: ["bool", "0"],
  manual_filament_change: ["bool", "0"],
  max_layer_height: ["floats", "0"],
  max_volumetric_extrusion_rate_slope: ["float", "0"],
  max_volumetric_extrusion_rate_slope_segment_length: ["float", "3"],
  min_layer_height: ["floats", "0.07"],
  min_length_factor: ["float", "0.5"],
  nozzle_diameter: ["floats", "0.4"],
  nozzle_temperature: ["ints", "200"],
  nozzle_temperature_initial_layer: ["ints", "200"],
  nozzle_temperature_range_high: ["ints", "240"],
  nozzle_temperature_range_low: ["ints", "190"],
  only_one_wall_top: ["bool", "0"],
  ooze_prevention: ["bool", "0"],
  outer_wall_filament_id: ["int", "0"],
  overhang_reverse: ["bool", "0"],
  overhang_reverse_internal_only: ["bool", "0"],
  overhang_reverse_threshold: ["floatOrPercent", "50%"],
  parallel_printheads_bed_exclude_areas: ["strings", ""],
  parallel_printheads_count: ["int", "1"],
  pellet_flow_coefficient: ["floats", "0.4157"],
  pellet_modded_printer: ["bool", "0"],
  precise_z_height: ["bool", "0"],
  preheat_steps: ["int", "1"],
  print_sequence: ["enum", "by layer"],
  printer_extruder_id: ["ints", "1"],
  printer_extruder_variant: ["strings", "Direct Drive Standard"],
  printer_structure: ["enum", "undefine"],
  purge_in_prime_tower: ["bool", "1"],
  raft_layers: ["int", "0"],
  reduce_crossing_wall: ["bool", "0"],
  resonance_avoidance: ["bool", "0"],
  retract_after_wipe: ["percents", "0%"],
  retract_before_wipe: ["percents", "100%"],
  retract_length_toolchange: ["floats", "10"],
  retraction_length: ["floats", "0.8"],
  role_based_wipe_speed: ["bool", "1"],
  seam_slope_conditional: ["bool", "0"],
  seam_slope_entire_loop: ["bool", "0"],
  seam_slope_start_height: ["floatOrPercent", "0"],
  seam_slope_type: ["enum", "none"],
  set_other_flow_ratios: ["bool", "0"],
  silent_mode: ["bool", "0"],
  single_extruder_multi_material: ["bool", "1"],
  skin_infill_depth: ["float", "2"],
  skirt_loops: ["int", "1"],
  slow_down_for_layer_cooling: ["bools", "1"],
  small_area_infill_flow_compensation: ["bool", "0"],
  solid_infill_rotate_template: ["string", ""],
  sparse_infill_density: ["percent", "20%"],
  sparse_infill_filament_id: ["int", "0"],
  sparse_infill_pattern: ["enum", "crosshatch"],
  sparse_infill_rotate_template: ["string", ""],
  spiral_mode: ["bool", "0"],
  spiral_mode_smooth: ["bool", "0"],
  support_air_filtration: ["bool", "1"],
  support_chamber_temp_control: ["bool", "1"],
  support_cooling_filter: ["bool", "0"],
  support_filament: ["int", "0"],
  support_interface_bottom_layers: ["int", "0"],
  support_interface_filament: ["int", "0"],
  support_interface_pattern: ["enum", "auto"],
  support_interface_spacing: ["float", "0.5"],
  support_interface_top_layers: ["int", "3"],
  support_ironing: ["bool", "0"],
  support_ironing_spacing: ["float", "0.1"],
  support_multi_bed_types: ["bool", "0"],
  support_parallel_printheads: ["bool", "0"],
  support_style: ["enum", "default"],
  support_threshold_angle: ["int", "30"],
  support_top_z_distance: ["float", "0.2"],
  support_type: ["enum", "normal(auto)"],
  timelapse_type: ["enum", "0"],
  toolchange_ordering: ["enum", "default"],
  top_shell_layers: ["int", "4"],
  top_surface_density: ["percent", "100%"],
  top_surface_expansion: ["float", "0"],
  top_surface_filament_id: ["int", "0"],
  top_surface_pattern: ["enum", "monotonicline"],
  tree_support_auto_brim: ["bool", "1"],
  use_firmware_retraction: ["bool", "0"],
  volumetric_speed_coefficients: ["strings", ""],
  wall_generator: ["enum", "arachne"],
  wall_loops: ["int", "2"],
  wipe: ["bools", "0"],
  wipe_inward: ["bool", "0"],
  wipe_tower_filament: ["int", "0"],
  wipe_tower_no_sparse_layers: ["bool", "0"],
  wipe_tower_type: ["enum", "type2"],
  wipe_tower_wall_type: ["enum", "rib"],
  xy_contour_compensation: ["float", "0"],
  xy_hole_compensation: ["float", "0"],
  z_hop: ["floats", "0.4"],
  z_hop_types: ["enums", "Slope Lift"],
  zaa_enabled: ["bool", "0"]
};
var EPSILON = 1e-4;
var isApprox = (a, b) => Math.abs(a - b) < EPSILON;
var isVector = (kind) => kind.endsWith("s") && kind !== "floatOrPercent";
function orcaNumber(value) {
  return String(Number(value.toPrecision(6)));
}
function parseQuotedStrings(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '"') return [text];
    let value = "";
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < text.length) {
        const next = text[++i];
        value += next === "n" ? "\n" : next === "t" ? "	" : next === "r" ? "\r" : next;
      } else value += text[i];
      i++;
    }
    out.push(value);
    i++;
    while (i < text.length && /[\s;]/.test(text[i])) i++;
  }
  return out;
}
var Config = class {
  view;
  constructor(view) {
    this.view = view;
  }
  spec(key) {
    const spec = READ[key];
    if (!spec) throw new Error(`rules.ts reads "${key}", which is missing from READ`);
    return spec;
  }
  /** Every slot of the value (one for a scalar). */
  slots(key) {
    const [kind, fallback] = this.spec(key);
    const value = this.view.get(key);
    if (value === void 0) return [fallback];
    if (Array.isArray(value)) return value.length ? value.map(String) : [fallback];
    if (!isVector(kind)) return [value];
    if (kind === "strings") return value.startsWith('"') ? parseQuotedStrings(value) : [value];
    return value.split(",").map((v2) => v2.trim());
  }
  /** Slot `index` (Orca's get_at: past the end reads slot 0). */
  text(key, index = 0) {
    const slots = this.slots(key);
    return (slots[index] ?? slots[0]).trim();
  }
  isNil(key, index = 0) {
    return this.text(key, index) === "nil";
  }
  /** opt_float / opt_int / ->value of a percent: "15%" reads 15, nil reads NaN. */
  num(key, index = 0) {
    const text = this.text(key, index);
    return text === "nil" ? NaN : Number.parseFloat(text);
  }
  /** opt_bool. A nil slot is Orca's nil_value (255), which reads true. */
  bool(key, index = 0) {
    const text = this.text(key, index).toLowerCase();
    return text === "1" || text === "true" || text === "nil";
  }
  /** opt_enum == value. rules.test.ts checks `value` is one of the key's enum values. */
  is(key, value, index = 0) {
    return this.text(key, index) === value;
  }
  oneOf(key, values, index = 0) {
    return values.has(this.text(key, index));
  }
  /** The serialized vector with slot `index` replaced, or `value` alone when the vector has one slot. */
  withSlot(key, index, value) {
    const slots = this.slots(key);
    if (slots.length <= 1) return value;
    return slots.map((v2, i) => i === index ? value : v2).join(",");
  }
};
function enumValues(key, values) {
  void key;
  return new Set(values);
}
function enumList(key, values) {
  void key;
  return values;
}
function v(key, value) {
  void key;
  return value;
}
function readKeys(keys) {
  return keys;
}
var slotId = (key, index) => index === void 0 ? key : `${key}#${index}`;
var Toggles = class {
  fields = /* @__PURE__ */ new Map();
  lines = /* @__PURE__ */ new Map();
  overrideCheckboxes = /* @__PURE__ */ new Map();
  labels = /* @__PURE__ */ new Map();
  enumFilters = /* @__PURE__ */ new Map();
  /** toggle_field / toggle_option: enabled or greyed out. */
  field(key, enabled, index) {
    this.fields.set(slotId(key, index), enabled);
  }
  /** toggle_line: the row is shown or hidden. */
  line(key, visible, index) {
    this.lines.set(slotId(key, index), visible);
  }
  /** m_overrides_options[key]->Enable(): the filament override checkbox. */
  overrideEnabled(key, enabled) {
    this.overrideCheckboxes.set(key, enabled);
  }
  label(key, text) {
    this.labels.set(key, text);
  }
  enumOnly(key, values) {
    this.enumFilters.set(key, values);
  }
  result() {
    const off = (map) => new Set([...map].filter(([, on]) => !on).map(([id]) => id));
    return {
      hidden: off(this.lines),
      disabled: off(this.fields),
      labels: new Map(this.labels),
      enumFilters: new Map(this.enumFilters),
      lockedOverrides: off(this.overrideCheckboxes)
    };
  }
};
function isHidden(tab, key, index) {
  return tab.hidden.has(key) || index !== void 0 && tab.hidden.has(slotId(key, index));
}
function isDisabled(tab, key, index) {
  return tab.disabled.has(key) || index !== void 0 && tab.disabled.has(slotId(key, index));
}
function context(env) {
  const c = new Config(env.config);
  const isGlobal = (env.context ?? "global") === "global";
  const edited = env.edited;
  return {
    c,
    isBbl: env.isBbl ?? false,
    isGlobal,
    isPlate: env.context === "plate",
    extruderCount: Math.max(1, env.extruderCount ?? c.slots("nozzle_diameter").length),
    filamentCount: Math.max(1, env.filamentCount ?? 1),
    mode: env.mode ?? "advanced",
    supportsWrappingDetection: env.supportsWrappingDetection ?? false,
    plater: !isGlobal && env.globalConfig ? new Config(env.globalConfig) : null,
    hasObjects: env.hasObjects ?? true,
    checksOn: (keys) => edited !== void 0 && keys.some((k) => edited.has(k))
  };
}
var SEPARABLE_INFILL_PATTERNS = enumValues("sparse_infill_pattern", [
  "rectilinear",
  "alignedrectilinear",
  "zigzag",
  "crosszag",
  "lockedzag",
  "grid",
  "triangles",
  "tri-hexagon",
  "cubic",
  "quartercubic",
  "lateral-honeycomb",
  "lateral-lattice",
  "hilbertcurve",
  "archimedeanchords",
  "octagramspiral"
]);
var SMOOTHABLE_INFILL_PATTERNS = enumValues("sparse_infill_pattern", [
  "hilbertcurve",
  "octagramspiral",
  "lightning",
  "honeycomb",
  "3dhoneycomb",
  "concentric",
  "crosshatch"
]);
var SMOOTHABLE_MULTILINE_INFILL_PATTERNS = enumValues("sparse_infill_pattern", ["grid", "triangles", "tri-hexagon"]);
function isSmoothableInfillPattern(c, multiline) {
  if (c.oneOf("sparse_infill_pattern", SMOOTHABLE_INFILL_PATTERNS)) return true;
  if (c.oneOf("sparse_infill_pattern", SMOOTHABLE_MULTILINE_INFILL_PATTERNS)) return multiline > 1;
  return false;
}
var TREE_SUPPORT_TYPES = enumValues("support_type", ["tree(auto)", "tree(manual)"]);
var AUTO_SUPPORT_TYPES = enumValues("support_type", ["normal(auto)", "tree(auto)"]);
function getBedTemp1stLayerKey(type) {
  if (type === v("curr_bed_type", "Supertack Plate"))
    return "supertack_plate_temp_initial_layer";
  if (type === v("curr_bed_type", "Cool Plate"))
    return "cool_plate_temp_initial_layer";
  if (type === v("curr_bed_type", "Textured Cool Plate"))
    return "textured_cool_plate_temp_initial_layer";
  if (type === v("curr_bed_type", "Engineering Plate"))
    return "eng_plate_temp_initial_layer";
  if (type === v("curr_bed_type", "High Temp Plate"))
    return "hot_plate_temp_initial_layer";
  if (type === v("curr_bed_type", "Textured PEI Plate"))
    return "textured_plate_temp_initial_layer";
  return "";
}
var hasNonemptyString = (value) => /\S/.test(value);
function hasBedExcludeVolumes(c) {
  if (c.is("bed_exclude_volume_mode", "per_extruder"))
    return c.slots("extruder_bed_exclude_volumes").some(hasNonemptyString);
  return hasNonemptyString(c.text("bed_exclude_volumes"));
}
function printerVariantIndex(c, extruder) {
  const index = indexForExtruder(
    { variants: c.slots("printer_extruder_variant"), ids: c.slots("printer_extruder_id"), extruderVariantList: c.slots("extruder_variant_list") },
    extruder + 1,
    extruderVariantString(c.text("extruder_type", extruder), "Standard")
  );
  return index >= 0 ? index : extruder;
}
function activeBedExcludeVolumeMode(c) {
  if (!hasBedExcludeVolumes(c))
    return v("bed_exclude_volume_mode", "shared");
  return c.text("bed_exclude_volume_mode");
}
var MATERIAL_TYPES = [
  ["ABS", 190, 300, 50, 65],
  ["ABS-CF", 220, 300, 50, 65],
  ["ABS-GF", 240, 280, 50, 65],
  ["ASA", 220, 300, 50, 65],
  ["ASA-CF", 230, 300, 50, 65],
  ["ASA-GF", 240, 300, 50, 65],
  ["ASA-AERO", 240, 280, 50, 65],
  ["BVOH", 190, 240, 0, 70],
  ["CoPE", 190, 240, 0, 45],
  ["EVA", 175, 220, 0, 50],
  ["FLEX", 210, 230, 0, 50],
  ["HIPS", 220, 270, 50, 60],
  ["PA", 235, 280, 50, 60],
  ["PA-CF", 240, 315, 50, 60],
  ["PA-GF", 240, 290, 50, 60],
  ["PA6", 260, 300, 50, 60],
  ["PA6-CF", 230, 300, 50, 60],
  ["PA6-GF", 260, 300, 50, 60],
  ["PA11", 275, 295, 50, 60],
  ["PA11-CF", 275, 295, 50, 60],
  ["PA11-GF", 275, 295, 50, 60],
  ["PA12", 250, 270, 50, 60],
  ["PA12-CF", 250, 300, 50, 60],
  ["PA12-GF", 255, 270, 50, 60],
  ["PAHT", 260, 310, 55, 65],
  ["PAHT-CF", 270, 310, 55, 65],
  ["PAHT-GF", 270, 310, 55, 65],
  ["PC", 240, 300, 60, 70],
  ["PC-ABS", 230, 270, 60, 70],
  ["PC-CF", 270, 295, 60, 70],
  ["PC-PBT", 260, 300, 60, 70],
  ["PCL", 130, 170, 0, 45],
  ["PCTG", 220, 300, 0, 55],
  ["PE", 175, 260, 45, 60],
  ["PE-CF", 175, 260, 45, 60],
  ["PE-GF", 230, 270, 45, 60],
  ["PEI-1010", 370, 430, 80, 100],
  ["PEI-1010-CF", 380, 430, 80, 100],
  ["PEI-1010-GF", 380, 430, 80, 100],
  ["PEI-9085", 350, 390, 80, 100],
  ["PEI-9085-CF", 365, 390, 80, 100],
  ["PEI-9085-GF", 370, 390, 80, 100],
  ["PEEK", 350, 460, 80, 100],
  ["PEEK-CF", 380, 410, 80, 100],
  ["PEEK-GF", 375, 410, 80, 100],
  ["PEKK", 325, 400, 80, 100],
  ["PEKK-CF", 360, 400, 80, 100],
  ["PES", 340, 390, 80, 100],
  ["PET", 200, 290, 0, 55],
  ["PET-CF", 240, 320, 0, 55],
  ["PET-GF", 280, 320, 0, 55],
  ["PETG", 190, 260, 0, 55],
  ["PETG-CF", 230, 290, 0, 55],
  ["PETG-GF", 210, 270, 0, 55],
  ["PHA", 190, 250, 0, 55],
  ["PI", 390, 410, 90, 100],
  ["PLA", 180, 240, 0, 45],
  ["PLA-AERO", 220, 270, 0, 55],
  ["PLA-CF", 190, 250, 0, 50],
  ["POM", 210, 250, 50, 65],
  ["PP", 200, 240, 45, 60],
  ["PP-CF", 210, 250, 45, 60],
  ["PP-GF", 220, 260, 45, 60],
  ["PPA-CF", 260, 300, 55, 70],
  ["PPA-GF", 260, 290, 55, 70],
  ["PPS", 300, 345, 90, 100],
  ["PPS-CF", 295, 350, 90, 100],
  ["PPSU", 360, 420, 90, 100],
  ["PSU", 350, 380, 90, 100],
  ["PVA", 185, 250, 0, 60],
  ["PVB", 190, 250, 0, 55],
  ["PVDF", 245, 265, 40, 60],
  ["SBS", 195, 250, 0, 55],
  ["TPI", 420, 445, 90, 100],
  ["TPU", 175, 260, 0, 50]
];
var materialType = (name) => MATERIAL_TYPES.find((m) => m[0] === name);
function validateAdaptivePaModel(model) {
  if (!model) return "";
  const lines = model.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
    if (!line) continue;
    const at = `Line ${n + 1}`;
    if (!/^[0-9,.]*$/.test(line)) return `${at}: only numbers, commas and dots are allowed`;
    if (line.split(",").length !== 3) return `${at}: must contain exactly 3 comma-separated values (PA, flow, acceleration)`;
    const [pa_text, flow_text, accel_text] = line.split(",");
    const stod = (text) => {
      const value = /^\d*\.?\d+|^\d+\.?/.test(text) ? Number.parseFloat(text) : NaN;
      return Number.isFinite(value) && !(value === 0 && /[1-9]/.test(text)) ? value : NaN;
    };
    const pa = stod(pa_text);
    if (Number.isNaN(pa)) return `${at}: invalid numeric value`;
    const flow = stod(flow_text);
    if (Number.isNaN(flow)) return `${at}: invalid numeric value`;
    if (accel_text === "") return `${at}: missing acceleration value`;
    const accel = stod(accel_text);
    if (Number.isNaN(accel)) return `${at}: invalid numeric value`;
    if (pa >= 2) return `${at}: PA value must be less than 2`;
    if (flow <= pa) return `${at}: flow value must be greater than PA value`;
    if (accel <= flow) return `${at}: acceleration value must be greater than flow value`;
  }
  return "";
}
var MULTILINE_INFILL_PATTERNS = enumValues("sparse_infill_pattern", [
  "gyroid",
  "grid",
  "rectilinear",
  "tpmsd",
  "tpmsfk",
  "crosshatch",
  "honeycomb",
  "lateral-lattice",
  "lateral-honeycomb",
  "concentric",
  "cubic",
  "tri-hexagon",
  "alignedrectilinear",
  "lightning",
  "3dhoneycomb",
  "adaptivecubic",
  "supportcubic",
  "triangles",
  "quartercubic",
  "archimedeanchords",
  "hilbertcurve",
  "octagramspiral"
]);
var CENTERED_SURFACE_PATTERNS = enumValues("top_surface_pattern", ["archimedeanchords", "octagramspiral"]);
var CENTERED_FILL_PATTERNS = enumValues("top_surface_pattern", ["concentric", "spiralinset", "archimedeanchords", "octagramspiral"]);
function togglePrintFffOptions(x, t) {
  const { c } = x;
  const gcf_is_marlin_firmware = c.is("gcode_flavor", "marlin2");
  const gcf_is_klipper = c.is("gcode_flavor", "klipper");
  const have_volumetric_extrusion_rate_slope = c.num("max_volumetric_extrusion_rate_slope") > 0;
  t.field("enable_arc_fitting", !have_volumetric_extrusion_rate_slope);
  t.line("max_volumetric_extrusion_rate_slope_segment_length", have_volumetric_extrusion_rate_slope);
  t.line("extrusion_rate_smoothing_external_perimeter_only", have_volumetric_extrusion_rate_slope);
  const have_perimeters = c.num("wall_loops") > 0;
  for (const el of [
    "extra_perimeters_on_overhangs",
    "ensure_vertical_shell_thickness",
    "detect_thin_wall",
    "detect_overhang_wall",
    "seam_position",
    "staggered_inner_seams",
    "wall_sequence",
    "outer_wall_line_width"
  ])
    t.field(el, have_perimeters);
  for (const el of ["inner_wall_speed", "outer_wall_speed", "small_perimeter_speed", "small_perimeter_threshold"])
    t.field(el, have_perimeters);
  const have_infill = c.num("sparse_infill_density") > 0;
  for (const el of [
    "sparse_infill_pattern",
    "infill_combination",
    "fill_multiline",
    "infill_direction",
    "minimum_sparse_infill_area",
    "sparse_infill_filament_id",
    "infill_shift_step",
    "sparse_infill_rotate_template",
    "symmetric_infill_y_axis"
  ])
    t.line(el, have_infill);
  const have_infill_anchor = have_infill && !c.is("sparse_infill_pattern", "concentric") && !c.is("sparse_infill_pattern", "spiralinset");
  t.line("infill_anchor", have_infill_anchor);
  t.line("infill_anchor_max", have_infill_anchor);
  const have_combined_infill = c.bool("infill_combination") && have_infill;
  t.line("infill_combination_max_layer_height", have_combined_infill);
  const have_multiline_infill_pattern = c.oneOf("sparse_infill_pattern", MULTILINE_INFILL_PATTERNS);
  t.line("gyroid_optimized", have_infill && c.is("sparse_infill_pattern", "gyroid"));
  if (have_infill) {
    t.field("fill_multiline", have_multiline_infill_pattern);
    const infill_anchor = !c.is("sparse_infill_pattern", "line");
    t.field("infill_anchor_max", infill_anchor);
    const has_infill_anchors = infill_anchor && c.num("infill_anchor_max") > 0;
    t.field("infill_anchor", has_infill_anchors);
  }
  const is_cross_zag = c.is("sparse_infill_pattern", "crosszag");
  const is_locked_zig = c.is("sparse_infill_pattern", "lockedzag");
  t.line("infill_shift_step", is_cross_zag || is_locked_zig);
  for (const el of ["skeleton_infill_density", "skin_infill_density", "infill_lock_depth", "skin_infill_depth", "skin_infill_line_width", "skeleton_infill_line_width"])
    t.line(el, is_locked_zig);
  const is_zig_zag = c.is("sparse_infill_pattern", "zigzag");
  t.line("symmetric_infill_y_axis", is_zig_zag || is_cross_zag || is_locked_zig);
  const has_spiral_vase = c.bool("spiral_mode");
  t.line("spiral_mode_smooth", has_spiral_vase);
  t.line("spiral_mode_max_xy_smoothing", has_spiral_vase && c.bool("spiral_mode_smooth"));
  t.line("spiral_starting_flow_ratio", has_spiral_vase);
  t.line("spiral_finishing_flow_ratio", has_spiral_vase);
  const has_top_shell_layers = c.num("top_shell_layers") > 0 || has_spiral_vase && c.num("bottom_shell_layers") > 1;
  const has_top_shell = has_top_shell_layers && c.num("top_surface_density") > 0;
  const has_bottom_shell = c.num("bottom_shell_layers") > 0;
  const has_solid_infill = has_top_shell_layers || has_bottom_shell;
  t.line("sparse_infill_smooth_factor", isSmoothableInfillPattern(c, c.num("fill_multiline")));
  t.field("top_surface_pattern", has_top_shell);
  t.field("bottom_surface_pattern", has_bottom_shell);
  t.field("top_surface_density", has_top_shell_layers);
  t.field("bottom_surface_density", has_bottom_shell);
  t.field("top_layer_direction", has_top_shell);
  t.field("bottom_layer_direction", has_bottom_shell);
  t.line("top_surface_expansion", has_top_shell);
  t.line("top_surface_expansion_margin", has_top_shell);
  const has_top_surface_expansion = c.num("top_surface_expansion") > 0;
  t.field("top_surface_expansion_margin", has_top_surface_expansion);
  t.line("top_surface_expansion_direction", has_top_shell);
  t.field("top_surface_expansion_direction", has_top_surface_expansion);
  const is_top_centered = c.oneOf("top_surface_pattern", CENTERED_SURFACE_PATTERNS);
  const is_bottom_centered = c.oneOf("bottom_surface_pattern", CENTERED_SURFACE_PATTERNS);
  const has_centered_surface = has_top_shell && is_top_centered || has_bottom_shell && is_bottom_centered;
  t.line("center_of_surface_pattern", has_centered_surface);
  const is_internal_infill_separable = c.oneOf("sparse_infill_pattern", SEPARABLE_INFILL_PATTERNS) || c.text("sparse_infill_rotate_template") !== "" || c.text("solid_infill_rotate_template") !== "";
  t.line("separated_infills", is_internal_infill_separable);
  t.line("top_surface_fill_order", has_top_shell && c.oneOf("top_surface_pattern", CENTERED_FILL_PATTERNS));
  t.line("bottom_surface_fill_order", has_bottom_shell && c.oneOf("bottom_surface_pattern", CENTERED_FILL_PATTERNS));
  for (const el of [
    "infill_direction",
    "sparse_infill_line_width",
    "gap_fill_target",
    "filter_out_gap_fill",
    "infill_wall_overlap",
    "bridge_angle",
    "internal_bridge_angle",
    "relative_bridge_angle",
    "solid_infill_direction",
    "solid_infill_rotate_template",
    "internal_solid_infill_pattern",
    "internal_solid_filament_id",
    "top_surface_filament_id",
    "bottom_surface_filament_id"
  ])
    t.field(el, have_infill || has_solid_infill);
  for (const el of ["sparse_infill_speed", "bridge_speed", "internal_bridge_speed"])
    t.field(el, have_infill || has_solid_infill);
  t.field("top_shell_thickness", !has_spiral_vase && has_top_shell_layers);
  t.field("bottom_shell_thickness", !has_spiral_vase && has_bottom_shell);
  t.field("gap_infill_speed", have_perimeters);
  t.field("top_surface_line_width", has_top_shell);
  t.field("top_surface_speed", has_top_shell);
  const have_default_acceleration = c.num("default_acceleration") > 0;
  for (const el of [
    "outer_wall_acceleration",
    "inner_wall_acceleration",
    "initial_layer_acceleration",
    "initial_layer_travel_acceleration",
    "top_surface_acceleration",
    "travel_acceleration",
    "bridge_acceleration",
    "sparse_infill_acceleration",
    "internal_solid_infill_acceleration"
  ])
    t.field(el, have_default_acceleration);
  let machine_supports_junction_deviation = false;
  if (gcf_is_marlin_firmware) machine_supports_junction_deviation = c.num("machine_max_junction_deviation", 0) > 0;
  t.line("default_junction_deviation", gcf_is_marlin_firmware);
  if (machine_supports_junction_deviation) {
    t.field("default_junction_deviation", true);
    t.field("default_jerk", false);
    for (const el of ["outer_wall_jerk", "inner_wall_jerk", "initial_layer_jerk", "initial_layer_travel_jerk", "top_surface_jerk", "travel_jerk", "infill_jerk"])
      t.line(el, false);
  } else {
    t.field("default_junction_deviation", false);
    t.field("default_jerk", true);
    const have_default_jerk = c.num("default_jerk") > 0;
    for (const el of ["outer_wall_jerk", "inner_wall_jerk", "initial_layer_jerk", "initial_layer_travel_jerk", "top_surface_jerk", "travel_jerk", "infill_jerk"]) {
      t.line(el, true);
      t.field(el, have_default_jerk);
    }
  }
  const have_skirt = c.num("skirt_loops") > 0;
  t.field("skirt_height", have_skirt && !c.is("draft_shield", "enabled"));
  t.line("single_loop_draft_shield", have_skirt);
  for (const el of ["skirt_type", "min_skirt_length", "skirt_distance", "skirt_start_angle", "skirt_speed", "draft_shield"])
    t.field(el, have_skirt);
  const have_brim = !c.is("brim_type", "no_brim");
  t.field("brim_object_gap", have_brim);
  t.field("brim_use_efc_outline", have_brim);
  t.field("combine_brims", have_brim);
  const have_brim_width = !c.is("brim_type", "no_brim") && !c.is("brim_type", "auto_brim") && !c.is("brim_type", "painted");
  t.field("brim_width", have_brim_width);
  t.field("brim_flow_ratio", have_brim);
  t.field("outer_wall_filament_id", have_perimeters || have_brim);
  t.field("inner_wall_filament_id", have_perimeters || have_brim);
  const have_auto_brim_ear = c.is("brim_type", "brim_ears");
  const have_painted_brim_ear = c.is("brim_type", "painted");
  t.label("brim_width", have_auto_brim_ear ? "Brim ear radius" : "Brim width");
  const brim_width = c.num("brim_width");
  t.field("brim_ears_max_angle", brim_width > 0);
  t.field("brim_ears_detection_length", brim_width > 0);
  t.field("brim_ears_outer_only", have_painted_brim_ear || brim_width > 0);
  t.line("brim_ears_max_angle", have_auto_brim_ear);
  t.line("brim_ears_detection_length", have_auto_brim_ear);
  t.line("brim_ears_outer_only", have_auto_brim_ear || have_painted_brim_ear);
  t.line("elefant_foot_compensation_layers", c.num("elefant_foot_compensation") > 0 || c.num("elefant_foot_layers_density") / 100 < 1);
  const have_raft = c.num("raft_layers") > 0;
  const have_support_material = c.bool("enable_support") || have_raft;
  const support_is_auto = c.oneOf("support_type", AUTO_SUPPORT_TYPES);
  const have_support_interface = c.num("support_interface_top_layers") > 0 || c.num("support_interface_bottom_layers") > 0;
  const have_support_soluble = have_support_material && c.num("support_top_z_distance") === 0;
  for (const el of [
    "support_style",
    "support_base_pattern",
    "support_base_pattern_spacing",
    "support_expansion",
    "support_angle",
    "support_interface_pattern",
    "support_interface_top_layers",
    "support_interface_bottom_layers",
    "bridge_no_support",
    "max_bridge_length",
    "support_top_z_distance",
    "support_bottom_z_distance",
    "support_type",
    "support_on_build_plate_only",
    "support_critical_regions_only",
    "support_interface_not_for_body",
    "support_object_xy_distance",
    "support_object_first_layer_gap",
    "independent_support_layer_height"
  ])
    t.field(el, have_support_material);
  t.field("support_threshold_angle", have_support_material && support_is_auto);
  t.field("support_threshold_overlap", c.num("support_threshold_angle") === 0 && have_support_material && support_is_auto);
  const support_is_tree = c.bool("enable_support") && c.oneOf("support_type", TREE_SUPPORT_TYPES);
  const support_is_organic = support_is_tree && (c.is("support_style", "organic") || c.is("support_style", "default"));
  const support_is_normal_tree = support_is_tree && !support_is_organic;
  t.line("support_threshold_overlap", !support_is_tree);
  for (const el of ["tree_support_branch_angle", "tree_support_branch_distance", "tree_support_branch_diameter", "tree_support_auto_brim", "tree_support_brim_width"])
    t.line(el, support_is_normal_tree);
  for (const el of ["tree_support_branch_angle_organic", "tree_support_branch_distance_organic", "tree_support_branch_diameter_organic", "tree_support_angle_slow", "tree_support_tip_diameter", "tree_support_top_rate", "tree_support_branch_diameter_angle"])
    t.line(el, support_is_organic);
  t.line("independent_support_layer_height", have_support_material && !support_is_organic);
  t.field("tree_support_brim_width", support_is_tree && !c.bool("tree_support_auto_brim"));
  t.line("max_bridge_length", support_is_tree);
  t.line("bridge_no_support", !support_is_tree);
  t.line("support_critical_regions_only", support_is_auto && support_is_tree);
  for (const el of [
    "support_interface_filament",
    "support_interface_loop_pattern",
    "support_bottom_interface_spacing"
  ])
    t.field(el, have_support_material && have_support_interface);
  const can_ironing_support = have_raft || have_support_material && c.num("support_interface_top_layers") > 0;
  t.field("support_ironing", can_ironing_support);
  const has_support_ironing = can_ironing_support && c.bool("support_ironing");
  for (const el of ["support_ironing_pattern", "support_ironing_flow", "support_ironing_spacing"])
    t.line(el, has_support_ironing);
  t.field("support_interface_spacing", have_support_material && have_support_interface && !has_support_ironing);
  for (const el of ["small_support_perimeter_speed", "small_support_perimeter_threshold"])
    t.field(el, c.bool("enable_support"));
  t.field("inner_wall_line_width", have_perimeters || have_skirt || have_brim);
  t.field("support_filament", have_support_material || have_skirt);
  t.line("raft_contact_distance", have_raft && !have_support_soluble);
  t.field("raft_first_layer_density", have_support_material);
  t.field(
    "raft_first_layer_expansion",
    have_support_material && (!support_is_normal_tree || c.is("support_style", "tree_hybrid") || have_raft)
  );
  const has_ironing = !c.is("ironing_type", "no ironing");
  for (const el of ["ironing_pattern", "ironing_flow", "ironing_spacing", "ironing_angle", "ironing_inset", "ironing_angle_fixed"])
    t.line(el, has_ironing);
  const has_rectilinear_ironing = c.is("ironing_pattern", "rectilinear");
  for (const el of ["ironing_angle", "ironing_angle_fixed"])
    t.field(el, has_ironing && has_rectilinear_ironing);
  t.line("ironing_speed", has_ironing || has_support_ironing);
  const has_zaa = c.bool("zaa_enabled");
  for (const el of ["zaa_minimize_perimeter_height", "zaa_min_z", "zaa_dont_alternate_fill_direction", "ironing_expansion"])
    t.line(el, has_zaa);
  const have_sequential_printing = c.is("print_sequence", "by object");
  t.field("print_order", !have_sequential_printing);
  t.field("single_extruder_multi_material", !x.isBbl);
  const bSEMM = c.bool("single_extruder_multi_material");
  const supports_wipe_tower_2 = !x.isBbl && c.is("wipe_tower_type", "type2");
  t.field("ooze_prevention", !bSEMM);
  const have_ooze_prevention = c.bool("ooze_prevention");
  t.line("standby_temperature_delta", have_ooze_prevention);
  t.line("preheat_time", have_ooze_prevention);
  const preheat_steps = c.num("preheat_steps");
  t.line("preheat_steps", have_ooze_prevention && preheat_steps > 0);
  const have_prime_tower = c.bool("enable_prime_tower");
  for (const el of ["prime_tower_width", "prime_tower_brim_width", "prime_tower_skip_points", "wipe_tower_wall_type", "prime_tower_infill_gap", "prime_tower_enable_framework", "enable_tower_interface_features"])
    t.line(el, have_prime_tower);
  t.line(
    "enable_tower_interface_cooldown_during_tower",
    have_prime_tower && c.bool("enable_tower_interface_features")
  );
  const purge_in_primetower = c.bool("purge_in_prime_tower");
  for (const el of [
    "wipe_tower_rotation_angle",
    "wipe_tower_cone_angle",
    "wipe_tower_extra_spacing",
    "wipe_tower_max_purge_speed",
    "wipe_tower_bridging",
    "wipe_tower_extra_flow"
  ])
    t.line(el, have_prime_tower && supports_wipe_tower_2);
  t.line("wipe_tower_no_sparse_layers", have_prime_tower);
  const have_rib_wall = c.is("wipe_tower_wall_type", "rib") && have_prime_tower;
  t.line("wipe_tower_cone_angle", have_prime_tower && supports_wipe_tower_2 && c.is("wipe_tower_wall_type", "cone"));
  t.line("wipe_tower_extra_rib_length", have_rib_wall);
  t.line("wipe_tower_rib_width", have_rib_wall);
  t.line("wipe_tower_fillet_wall", have_rib_wall);
  t.field("prime_tower_width", have_prime_tower && !have_rib_wall);
  t.line("single_extruder_multi_material_priming", !bSEMM && have_prime_tower && supports_wipe_tower_2);
  const use_cyclic_ordering = c.is("toolchange_ordering", "cyclic");
  t.line("toolchange_cyclic_order", use_cyclic_ordering);
  t.line("toolchange_cyclic_first_layer", use_cyclic_ordering);
  t.line("prime_volume", have_prime_tower && (!purge_in_primetower || !bSEMM));
  for (const el of ["flush_into_infill", "flush_into_support", "flush_into_objects"])
    t.field(el, have_prime_tower);
  const have_avoid_crossing_perimeters = c.bool("reduce_crossing_wall");
  t.line("max_travel_detour_distance", have_avoid_crossing_perimeters);
  const has_set_other_flow_ratios = c.bool("set_other_flow_ratios");
  for (const el of ["first_layer_flow_ratio", "outer_wall_flow_ratio", "inner_wall_flow_ratio", "overhang_flow_ratio", "sparse_infill_flow_ratio", "internal_solid_infill_flow_ratio", "gap_fill_flow_ratio", "support_flow_ratio", "support_interface_flow_ratio"])
    t.line(el, has_set_other_flow_ratios);
  const has_overhang_speed = c.bool("enable_overhang_speed");
  for (const el of ["overhang_1_4_speed", "overhang_2_4_speed", "overhang_3_4_speed", "overhang_4_4_speed"])
    t.line(el, has_overhang_speed);
  t.line("slowdown_for_curled_perimeters", has_overhang_speed);
  t.line("flush_into_objects", !x.isGlobal);
  t.line("support_interface_not_for_body", c.num("support_interface_filament") !== 0 && c.num("support_filament") === 0);
  const has_fuzzy_skin = !c.is("fuzzy_skin", "disabled_fuzzy");
  for (const el of ["fuzzy_skin_mode", "fuzzy_skin_noise_type", "fuzzy_skin_point_distance", "fuzzy_skin_thickness", "fuzzy_skin_first_layer"])
    t.line(el, has_fuzzy_skin);
  const is_ripple = c.is("fuzzy_skin_noise_type", "ripple");
  t.line("fuzzy_skin_scale", !c.is("fuzzy_skin_noise_type", "classic") && has_fuzzy_skin && !is_ripple);
  t.line("fuzzy_skin_octaves", !c.is("fuzzy_skin_noise_type", "classic") && !c.is("fuzzy_skin_noise_type", "voronoi") && has_fuzzy_skin && !is_ripple);
  t.line("fuzzy_skin_persistence", (c.is("fuzzy_skin_noise_type", "perlin") || c.is("fuzzy_skin_noise_type", "billow")) && has_fuzzy_skin && !is_ripple);
  t.line("fuzzy_skin_ripples_per_layer", is_ripple && has_fuzzy_skin);
  t.line("fuzzy_skin_ripple_offset", is_ripple && has_fuzzy_skin);
  t.line("fuzzy_skin_layers_between_ripple_offset", is_ripple && has_fuzzy_skin);
  const have_arachne = c.is("wall_generator", "arachne");
  for (const el of [
    "wall_transition_length",
    "wall_transition_filter_deviation",
    "wall_transition_angle",
    "min_feature_size",
    "min_length_factor",
    "min_bead_width",
    "wall_distribution_count",
    "initial_layer_min_bead_width",
    "wall_maximum_resolution",
    "wall_maximum_deviation"
  ])
    t.line(el, have_arachne);
  t.field("detect_thin_wall", !have_arachne);
  const is_role_based_wipe_speed = c.bool("role_based_wipe_speed");
  t.field("wipe_speed", !is_role_based_wipe_speed);
  const have_wipe_inward = c.bool("wipe_inward");
  t.line("wipe_inward_distance", have_wipe_inward);
  for (const el of ["accel_to_decel_enable", "accel_to_decel_factor"])
    t.line(el, gcf_is_klipper);
  if (gcf_is_klipper)
    t.field("accel_to_decel_factor", c.bool("accel_to_decel_enable"));
  const have_make_overhang_printable = c.bool("make_overhang_printable");
  t.line("make_overhang_printable_angle", have_make_overhang_printable);
  t.line("make_overhang_printable_hole_size", have_make_overhang_printable);
  t.line("only_one_wall_first_layer", has_bottom_shell);
  t.line("only_one_wall_top", has_top_shell_layers);
  t.line("min_width_top_surface", has_top_shell_layers && c.bool("only_one_wall_top") || c.num("min_length_factor") > 0.5 && have_arachne);
  for (const el of ["hole_to_polyhole_threshold", "hole_to_polyhole_twisted", "hole_to_polyhole_max_edges"])
    t.line(el, c.bool("hole_to_polyhole"));
  const has_detect_overhang_wall = c.bool("detect_overhang_wall");
  const has_overhang_reverse = c.bool("overhang_reverse");
  const allow_overhang_reverse = !has_spiral_vase;
  t.line("unsupported_wall_last", has_detect_overhang_wall);
  t.line("overhang_reverse", allow_overhang_reverse);
  t.line("overhang_reverse_internal_only", allow_overhang_reverse && has_overhang_reverse);
  const has_overhang_reverse_internal_only = c.bool("overhang_reverse_internal_only");
  t.line("overhang_reverse_threshold", has_detect_overhang_wall && allow_overhang_reverse && has_overhang_reverse && !has_overhang_reverse_internal_only);
  t.line("timelapse_type", x.isBbl);
  const have_small_area_infill_flow_compensation = c.bool("small_area_infill_flow_compensation");
  t.line("small_area_infill_flow_compensation_model", have_small_area_infill_flow_compensation);
  t.field("seam_slope_type", !has_spiral_vase);
  const has_seam_slope = !has_spiral_vase && !c.is("seam_slope_type", "none");
  t.line("seam_slope_conditional", has_seam_slope);
  t.line("seam_slope_start_height", has_seam_slope);
  t.line("seam_slope_entire_loop", has_seam_slope);
  t.line("seam_slope_min_length", has_seam_slope);
  t.line("seam_slope_steps", has_seam_slope);
  t.line("seam_slope_inner_walls", has_seam_slope);
  t.line("scarf_joint_speed", has_seam_slope);
  t.line("scarf_joint_flow_ratio", has_seam_slope);
  t.field("seam_slope_min_length", !c.bool("seam_slope_entire_loop"));
  t.line("scarf_angle_threshold", has_seam_slope && c.bool("seam_slope_conditional"));
  t.line("scarf_overhang_threshold", has_seam_slope && c.bool("seam_slope_conditional"));
  const use_beam_interlocking = c.bool("interlocking_beam");
  t.line("mmu_segmented_region_interlocking_depth", !use_beam_interlocking);
  t.line("interlocking_beam_width", use_beam_interlocking);
  t.line("interlocking_orientation", use_beam_interlocking);
  t.line("interlocking_beam_layer_count", use_beam_interlocking);
  t.line("interlocking_depth", use_beam_interlocking);
  t.line("interlocking_boundary_avoidance", use_beam_interlocking);
  const lattice_options = c.is("sparse_infill_pattern", "lateral-lattice");
  for (const el of ["lateral_lattice_angle_1", "lateral_lattice_angle_2"])
    t.line(el, lattice_options);
  const lightning_options = c.is("sparse_infill_pattern", "lightning");
  for (const el of ["lightning_overhang_angle", "lightning_prune_angle", "lightning_straightening_angle"])
    t.line(el, lightning_options);
  const FillAdaptive = c.is("sparse_infill_pattern", "adaptivecubic") || c.is("sparse_infill_pattern", "supportcubic");
  t.field("sparse_infill_rotate_template", !FillAdaptive);
  t.field("infill_direction", c.text("sparse_infill_rotate_template") === "" && !FillAdaptive);
  t.field("solid_infill_direction", c.text("solid_infill_rotate_template") === "");
  t.line("infill_overhang_angle", c.is("sparse_infill_pattern", "lateral-honeycomb"));
  t.line("enable_wrapping_detection", x.supportsWrappingDetection);
}
var SUPPORT_STYLES_NORMAL = enumList("support_style", ["default", "grid", "snug"]);
var SUPPORT_STYLES_TREE = enumList("support_style", ["default", "tree_slim", "tree_strong", "tree_hybrid", "organic"]);
function tabPrintToggleOptions(x, t) {
  togglePrintFffOptions(x, t);
  const { c } = x;
  t.enumOnly("support_style", c.oneOf("support_type", TREE_SUPPORT_TYPES) ? SUPPORT_STYLES_TREE : SUPPORT_STYLES_NORMAL);
  const enum_set_bbl = enumList("wipe_tower_wall_type", ["rectangle", "rib"]);
  const enum_set_none_bbl = enumList("wipe_tower_wall_type", ["rectangle", "cone", "rib"]);
  t.enumOnly("wipe_tower_wall_type", x.isBbl ? enum_set_bbl : enum_set_none_bbl);
}
var PROCESS = "process";
var FILAMENT = "filament";
var MACHINE = "machine";
var SPIRAL_VASE_REQUIREMENTS = {
  wall_loops: "1",
  top_shell_layers: "0",
  sparse_infill_density: "0%",
  enable_support: "0",
  enforce_support_layers: "0",
  detect_thin_wall: "0",
  overhang_reverse: "0",
  timelapse_type: "0",
  enable_wrapping_detection: "0"
};
var FILAMENT_ID_KEYS = readKeys([
  "support_filament",
  "support_interface_filament",
  "wipe_tower_filament",
  "outer_wall_filament_id",
  "inner_wall_filament_id",
  "sparse_infill_filament_id",
  "internal_solid_filament_id",
  "top_surface_filament_id",
  "bottom_surface_filament_id"
]);
var PLATER_FILAMENT_ID_KEYS = /* @__PURE__ */ new Set([
  "outer_wall_filament_id",
  "inner_wall_filament_id",
  "sparse_infill_filament_id",
  "support_filament",
  "support_interface_filament",
  "wipe_tower_filament"
]);
function checkLayerHeight(x, issues) {
  const checkedOn = ["layer_height"];
  if (!x.checksOn(checkedOn)) return false;
  const { c } = x;
  const min_layer_height = Math.min(...c.slots("min_layer_height").map(Number.parseFloat));
  const max_layer_height = Math.max(...c.slots("max_layer_height").map(Number.parseFloat));
  const layer_height = c.num("layer_height");
  const outOfRange = (clamp_to) => ({
    id: "layer-height-limits",
    scope: PROCESS,
    key: "layer_height",
    keys: ["layer_height", "min_layer_height", "max_layer_height"],
    severity: "warning",
    message: "Layer height is outside the limits set in Printer Settings -> Extruder -> Layer height limits, this may cause printing quality issues.",
    fix: { layer_height: orcaNumber(clamp_to) },
    fixLabel: `Adjust to ${orcaNumber(clamp_to)} mm`,
    checkedOn
  });
  if (min_layer_height > EPSILON && layer_height < EPSILON) {
    issues.push({
      id: "layer-height-limits",
      scope: PROCESS,
      key: "layer_height",
      keys: ["layer_height", "min_layer_height"],
      severity: "error",
      message: `Layer height is too small. It will be set to the minimum (${orcaNumber(min_layer_height)} mm).`,
      fix: { layer_height: orcaNumber(min_layer_height) },
      fixLabel: "Set to the minimum",
      checkedOn
    });
    return true;
  }
  if (max_layer_height > EPSILON && layer_height > max_layer_height + EPSILON) {
    issues.push(outOfRange(max_layer_height));
    return true;
  }
  if (min_layer_height > EPSILON && layer_height < min_layer_height - EPSILON) {
    issues.push(outOfRange(min_layer_height));
    return true;
  }
  return false;
}
function updatePrintFffConfig(x, issues) {
  const { c } = x;
  const is_object_config = !x.isGlobal && !x.isPlate;
  const reset = (id, key, message, value) => ({
    id,
    scope: PROCESS,
    key,
    keys: [key],
    severity: "error",
    message,
    fix: { [key]: value },
    fixLabel: `Reset to ${value}`
  });
  const layer_height = c.num("layer_height");
  const layerHeightChecked = checkLayerHeight(x, issues);
  if (layer_height < EPSILON && !layerHeightChecked)
    issues.push(reset("layer-height-zero", "layer_height", "Layer height too small. It has to be reset to 0.2.", "0.2"));
  if (c.num("ironing_spacing") < 0.05)
    issues.push(reset("ironing-spacing-small", "ironing_spacing", "Ironing spacing too small. It has to be reset to 0.1.", "0.1"));
  if (c.num("support_ironing_spacing") < 0.05)
    issues.push(reset("support-ironing-spacing-small", "support_ironing_spacing", "Ironing spacing too small. It has to be reset to 0.1.", "0.1"));
  if (c.num("initial_layer_print_height") < EPSILON)
    issues.push(reset("initial-layer-height-zero", "initial_layer_print_height", "Zero initial layer height is invalid. The first layer height has to be reset to 0.2.", "0.2"));
  const compensationMessage = "This setting is only used for tuning model size by small amounts. For example, when the model size has small errors or when tolerances are incorrect. For large adjustments, please use the model scale function.";
  if (Math.abs(c.num("xy_hole_compensation")) > 2)
    issues.push(reset("xy-hole-compensation-large", "xy_hole_compensation", compensationMessage, "0"));
  if (Math.abs(c.num("xy_contour_compensation")) > 2)
    issues.push(reset("xy-contour-compensation-large", "xy_contour_compensation", compensationMessage, "0"));
  if (c.num("elefant_foot_compensation") > 1)
    issues.push(reset(
      "elephant-foot-compensation-large",
      "elefant_foot_compensation",
      "The elephant foot compensation value is too large. If there are significant elephant foot issues, please check other settings. The bed temperature may be too high, for example.",
      "0"
    ));
  if (c.bool("enable_wrapping_detection") && !x.supportsWrappingDetection) {
    issues.push({
      id: "wrapping-detection-unsupported",
      scope: PROCESS,
      key: "enable_wrapping_detection",
      keys: ["enable_wrapping_detection"],
      severity: "info",
      message: "This printer has no clumping detection, so Orca turns it off.",
      fix: { enable_wrapping_detection: "0" },
      fixLabel: "Turn off",
      triggers: ["enable_wrapping_detection"]
    });
  }
  if (!x.isPlate && c.bool("spiral_mode") && !(c.num("wall_loops") === 1 && c.num("top_shell_layers") === 0 && c.num("sparse_infill_density") === 0 && !c.bool("enable_support") && c.num("enforce_support_layers") === 0 && !c.bool("detect_thin_wall") && !c.bool("overhang_reverse") && c.is("timelapse_type", "0") && !c.bool("enable_wrapping_detection"))) {
    let message = "Spiral mode only works when wall loops is 1, support is disabled, clumping detection by probing is disabled, top shell layers is 0, sparse infill density is 0 and timelapse type is traditional.";
    if (c.is("printer_structure", "i3")) message += " But machines with I3 structure will not generate timelapse videos.";
    issues.push({
      id: "spiral-vase",
      scope: PROCESS,
      key: "spiral_mode",
      keys: ["spiral_mode", ...Object.keys(SPIRAL_VASE_REQUIREMENTS)],
      severity: "warning",
      message,
      fix: { ...SPIRAL_VASE_REQUIREMENTS },
      fixLabel: "Change these settings",
      alternative: is_object_config ? void 0 : { label: "Turn off spiral mode", values: { spiral_mode: "0" } }
    });
  }
  if (c.bool("alternate_extra_wall") && c.is("ensure_vertical_shell_thickness", "ensure_all")) {
    issues.push({
      id: "alternate-extra-wall",
      scope: PROCESS,
      key: "alternate_extra_wall",
      keys: ["alternate_extra_wall", "ensure_vertical_shell_thickness"],
      severity: "warning",
      message: "Alternate extra wall doesn't work well when ensure vertical shell thickness is set to All.",
      fix: { ensure_vertical_shell_thickness: "ensure_moderate", alternate_extra_wall: "1" },
      fixLabel: "Change ensure vertical shell thickness to Moderate",
      alternative: x.isGlobal ? { label: "Don't use alternate extra wall", values: { ensure_vertical_shell_thickness: "ensure_all", alternate_extra_wall: "0" } } : void 0
    });
  }
  if (c.bool("enable_prime_tower") && x.isBbl && c.is("wipe_tower_wall_type", "cone")) {
    issues.push({
      id: "wipe-tower-cone-bbl",
      scope: PROCESS,
      key: "wipe_tower_wall_type",
      keys: ["wipe_tower_wall_type", "enable_prime_tower"],
      severity: "info",
      message: "Bambu Lab printers do not support a cone wipe tower, so Orca uses a rectangle.",
      fix: { wipe_tower_wall_type: "rectangle" },
      fixLabel: "Use a rectangle",
      triggers: ["enable_prime_tower", "wipe_tower_wall_type"]
    });
  }
  if (c.bool("enable_support")) {
    const set = c.oneOf("support_type", TREE_SUPPORT_TYPES) ? SUPPORT_STYLES_TREE : SUPPORT_STYLES_NORMAL;
    if (!set.includes(c.text("support_style"))) {
      issues.push({
        id: "support-style-type",
        scope: PROCESS,
        key: "support_style",
        keys: ["support_style", "support_type", "enable_support"],
        severity: "info",
        message: "This support style does not go with the support type, so Orca uses the default style.",
        fix: { support_style: "default" },
        fixLabel: "Use the default style",
        triggers: ["enable_support", "support_type"]
      });
    }
  }
  for (const key of FILAMENT_ID_KEYS) {
    if (c.num(key) > x.filamentCount) {
      let new_value = 0;
      if (x.plater && PLATER_FILAMENT_ID_KEYS.has(key)) {
        const global_value = x.plater.num(key);
        if (global_value >= 0 && global_value <= x.filamentCount) new_value = global_value;
      }
      issues.push({
        id: "filament-id-range",
        scope: PROCESS,
        key,
        keys: [key],
        severity: "info",
        message: new_value === 0 ? `Filament ${c.text(key)} does not exist in this project, so Orca uses the default filament.` : `Filament ${c.text(key)} does not exist in this project, so Orca uses filament ${new_value}, as the global settings do.`,
        fix: { [key]: String(new_value) },
        fixLabel: new_value === 0 ? "Use the default filament" : `Use filament ${new_value}`,
        triggers: [key]
      });
    }
  }
  const seam_slope_start_height = c.text("seam_slope_start_height").endsWith("%") ? c.num("seam_slope_start_height") / 100 * layer_height : c.num("seam_slope_start_height");
  if (!c.is("seam_slope_type", "none") && seam_slope_start_height >= layer_height)
    issues.push(reset("seam-slope-start-height", "seam_slope_start_height", "seam_slope_start_height needs to be smaller than layer_height.", "0"));
  const skin_depth = c.num("skin_infill_depth");
  if (c.num("infill_lock_depth") > skin_depth) {
    issues.push({
      ...reset("infill-lock-depth", "infill_lock_depth", "Lock depth should be smaller than skin depth.", orcaNumber(skin_depth / 2)),
      keys: ["infill_lock_depth", "skin_infill_depth"],
      fixLabel: "Reset to 50% of skin depth"
    });
  }
  const have_arachne = c.is("wall_generator", "arachne");
  if (!c.is("fuzzy_skin_mode", "displacement") && !have_arachne) {
    issues.push({
      id: "fuzzy-skin-arachne",
      scope: PROCESS,
      key: "fuzzy_skin_mode",
      keys: ["fuzzy_skin_mode", "wall_generator"],
      severity: "warning",
      message: "Both [Extrusion] and [Combined] modes of Fuzzy Skin require the Arachne Wall Generator to be enabled.",
      fix: { wall_generator: "arachne" },
      fixLabel: "Enable Arachne Wall Generator",
      alternative: { label: "Use [Displacement] mode of the Fuzzy Skin", values: { fuzzy_skin_mode: "displacement" } }
    });
  }
}
function printFffRewrites(x, issues) {
  const { c } = x;
  if (c.num("max_volumetric_extrusion_rate_slope") > 0 && c.bool("enable_arc_fitting")) {
    issues.push({
      id: "arc-fitting-with-smoothing",
      scope: PROCESS,
      key: "enable_arc_fitting",
      keys: ["enable_arc_fitting", "max_volumetric_extrusion_rate_slope"],
      severity: "info",
      message: "Arc fitting does not work with extrusion rate smoothing, so Orca turns it off.",
      fix: { enable_arc_fitting: "0" },
      fixLabel: "Turn off arc fitting",
      triggers: ["max_volumetric_extrusion_rate_slope"]
    });
  }
  if (c.num("max_volumetric_extrusion_rate_slope_segment_length") < 0.5) {
    issues.push({
      id: "smoothing-segment-length",
      scope: PROCESS,
      key: "max_volumetric_extrusion_rate_slope_segment_length",
      keys: ["max_volumetric_extrusion_rate_slope_segment_length"],
      severity: "info",
      message: "The smoothing segment length must be at least 0.5 mm, so Orca sets it to 1.",
      fix: { max_volumetric_extrusion_rate_slope_segment_length: "1" },
      fixLabel: "Set to 1",
      triggers: ["max_volumetric_extrusion_rate_slope_segment_length", "max_volumetric_extrusion_rate_slope"]
    });
  }
  if (c.num("sparse_infill_density") > 0 && !c.oneOf("sparse_infill_pattern", MULTILINE_INFILL_PATTERNS) && c.num("fill_multiline") !== 1) {
    issues.push({
      id: "fill-multiline-pattern",
      scope: PROCESS,
      key: "fill_multiline",
      keys: ["fill_multiline", "sparse_infill_pattern"],
      severity: "info",
      message: "This infill pattern does not support multiline infill, so Orca sets it to 1.",
      fix: { fill_multiline: "1" },
      fixLabel: "Set to 1",
      triggers: ["sparse_infill_pattern", "sparse_infill_density", "fill_multiline"]
    });
  }
  if (c.bool("overhang_reverse_internal_only") && c.num("overhang_reverse_threshold") !== 0) {
    issues.push({
      id: "overhang-reverse-internal-only",
      scope: PROCESS,
      key: "overhang_reverse_threshold",
      keys: ["overhang_reverse_threshold", "overhang_reverse_internal_only"],
      severity: "info",
      message: 'With "Reverse only internal perimeters" Orca sets the reversal threshold to 0%.',
      fix: { overhang_reverse_threshold: "0%" },
      fixLabel: "Set to 0%",
      triggers: ["overhang_reverse_internal_only"]
    });
  }
}
var LONG_RETRACTION_ENABLE_FILAMENT = 2;
function tabFilamentToggleOptions(x, t, issues) {
  const { c } = x;
  const is_BBL_printer = x.isBbl;
  const has_enable_overhang_bridge_fan = c.bool("enable_overhang_bridge_fan", 0);
  for (const el of ["overhang_fan_speed", "overhang_fan_threshold", "internal_bridge_fan_speed"])
    t.field(el, has_enable_overhang_bridge_fan);
  const has_slow_down_for_layer_cooling = c.bool("slow_down_for_layer_cooling", 0);
  t.field("dont_slow_down_outer_wall", has_slow_down_for_layer_cooling);
  const close_fan_first_n = c.num("close_fan_the_first_x_layers", 0);
  const initial_layer_fan_speed_enabled = close_fan_first_n <= 0;
  t.line("initial_layer_fan_speed", initial_layer_fan_speed_enabled);
  if (!initial_layer_fan_speed_enabled && c.slots("initial_layer_fan_speed").some((v2) => Number.parseFloat(v2) !== -1)) {
    issues.push({
      id: "initial-layer-fan-speed",
      scope: FILAMENT,
      key: "initial_layer_fan_speed",
      keys: ["initial_layer_fan_speed", "close_fan_the_first_x_layers"],
      severity: "info",
      message: "The first layer fan speed is not used while the fan is off for the first layers, so Orca sets it to -1.",
      fix: { initial_layer_fan_speed: "-1" },
      fixLabel: "Set to -1",
      triggers: ["close_fan_the_first_x_layers"]
    });
  }
  t.line("additional_cooling_fan_speed", c.bool("auxiliary_fan"));
  const support_air_filtration = c.bool("support_air_filtration");
  for (const el of ["activate_air_filtration", "during_print_exhaust_fan_speed", "complete_print_exhaust_fan_speed"])
    t.line(el, support_air_filtration);
  if (support_air_filtration) {
    const activate_air_filtration = c.bool("activate_air_filtration", 0);
    t.field("activate_air_filtration_during_print", activate_air_filtration);
    t.field("during_print_exhaust_fan_speed", activate_air_filtration && c.bool("activate_air_filtration_during_print", 0));
    t.field("activate_air_filtration_on_completion", activate_air_filtration);
    t.field("complete_print_exhaust_fan_speed", activate_air_filtration && c.bool("activate_air_filtration_on_completion", 0));
  }
  {
    const pa = c.bool("enable_pressure_advance", 0);
    t.field("pressure_advance", pa);
    const bed_temp_1st_layer_key = getBedTemp1stLayerKey(c.text("curr_bed_type"));
    const bed_temp_keys = [
      "supertack_plate_temp_initial_layer",
      "cool_plate_temp_initial_layer",
      "textured_cool_plate_temp_initial_layer",
      "eng_plate_temp_initial_layer",
      "textured_plate_temp_initial_layer",
      "hot_plate_temp_initial_layer"
    ];
    const support_multi_bed_types = !bed_temp_keys.includes(bed_temp_1st_layer_key) || is_BBL_printer || c.bool("support_multi_bed_types");
    for (const key of bed_temp_keys)
      t.line(key, support_multi_bed_types || bed_temp_1st_layer_key === key);
    t.field("adaptive_pressure_advance", pa);
    t.field("adaptive_pressure_advance_overhangs", pa);
    const has_adaptive_pa = c.bool("adaptive_pressure_advance", 0);
    t.line("adaptive_pressure_advance_overhangs", has_adaptive_pa && pa);
    t.line("adaptive_pressure_advance_model", has_adaptive_pa && pa);
    t.line("adaptive_pressure_advance_bridges", has_adaptive_pa && pa);
    const is_pellet_printer = c.bool("pellet_modded_printer");
    t.line("pellet_flow_coefficient", is_pellet_printer);
    t.line("filament_diameter", !is_pellet_printer);
    t.line("activate_chamber_temp_control", c.bool("support_chamber_temp_control"));
    const variant_idx = 0;
    const volumetric_speed_cos = c.text("volumetric_speed_coefficients", variant_idx);
    const enable_fit = volumetric_speed_cos !== "0 0 0 0 0 0";
    t.field("filament_adaptive_volumetric_speed", enable_fit);
  }
  updateFilamentOverridesPage(x, t);
  {
    for (const el of [
      "filament_minimal_purge_on_wipe_tower",
      "filament_loading_speed_start",
      "filament_loading_speed",
      "filament_unloading_speed_start",
      "filament_unloading_speed",
      "filament_toolchange_delay",
      "filament_cooling_moves",
      "filament_cooling_initial_speed",
      "filament_cooling_final_speed"
    ])
      t.field(el, !is_BBL_printer);
    const multitool_ramming = c.bool("filament_multitool_ramming", 0);
    t.field("filament_multitool_ramming_volume", multitool_ramming);
    t.field("filament_multitool_ramming_flow", multitool_ramming);
    const is_BBL_multi_extruder = is_BBL_printer && c.slots("nozzle_diameter").length > 1;
    const extruder_idx = 0;
    t.line("long_retractions_when_ec", is_BBL_multi_extruder);
    t.line("retraction_distances_when_ec", is_BBL_multi_extruder && c.bool("long_retractions_when_ec", extruder_idx));
  }
}
function updateFilamentOverridesPage(x, t) {
  const { c } = x;
  const opt_keys = readKeys([
    "filament_retraction_length",
    "filament_z_hop",
    "filament_z_hop_types",
    "filament_retract_lift_above",
    "filament_retract_lift_below",
    "filament_retract_lift_enforce",
    "filament_retraction_speed",
    "filament_deretraction_speed",
    "filament_retract_restart_extra",
    "filament_retract_length_toolchange",
    "filament_retract_restart_extra_toolchange",
    "filament_retraction_minimum_travel",
    "filament_retract_when_changing_layer",
    "filament_wipe",
    // BBS
    "filament_wipe_distance",
    "filament_retract_before_wipe",
    // Orca
    "filament_retract_after_wipe",
    // BBS
    "filament_long_retractions_when_cut",
    "filament_retraction_distances_when_cut"
    //SoftFever
    // "filament_seam_gap"
  ]);
  const extruder_idx = 0;
  const have_retract_length = c.isNil("filament_retraction_length", extruder_idx) || c.num("filament_retraction_length", extruder_idx) > 0;
  for (const opt_key of opt_keys) {
    let is_checked = opt_key === "filament_retraction_length" ? true : have_retract_length;
    t.overrideEnabled(opt_key, is_checked);
    is_checked &&= !c.isNil(opt_key, extruder_idx);
    if (opt_key === "filament_long_retractions_when_cut") {
      const machine_enabled = c.num("enable_long_retraction_when_cut") === LONG_RETRACTION_ENABLE_FILAMENT;
      t.line(opt_key, machine_enabled);
      t.field(opt_key, is_checked && machine_enabled);
    } else if (opt_key === "filament_retraction_distances_when_cut") {
      const machine_enabled = c.num("enable_long_retraction_when_cut") === LONG_RETRACTION_ENABLE_FILAMENT;
      const filament_enabled = !c.isNil("filament_long_retractions_when_cut", extruder_idx) && c.bool("filament_long_retractions_when_cut", extruder_idx);
      t.line(opt_key, filament_enabled && machine_enabled);
      t.field(opt_key, is_checked && filament_enabled && machine_enabled);
    } else {
      t.field(opt_key, is_checked);
    }
  }
  const ironing_opt_keys = readKeys([
    "filament_ironing_flow",
    "filament_ironing_spacing",
    "filament_ironing_inset",
    "filament_ironing_speed"
  ]);
  for (const opt_key of ironing_opt_keys) {
    const is_checked = !c.isNil(opt_key, extruder_idx);
    t.overrideEnabled(opt_key, true);
    t.field(opt_key, is_checked);
  }
}
function filamentChecks(x, t, issues) {
  const { c } = x;
  if (c.num("filament_max_volumetric_speed") < 0.5) {
    issues.push({
      id: "max-volumetric-speed-small",
      scope: FILAMENT,
      key: "filament_max_volumetric_speed",
      keys: ["filament_max_volumetric_speed"],
      severity: "error",
      message: "Too small max volumetric speed. It has to be reset to 0.5.",
      fix: { filament_max_volumetric_speed: "0.5" },
      fixLabel: "Reset to 0.5"
    });
  }
  const temperature_range_low = c.num("nozzle_temperature_range_low", 0);
  const temperature_range_high = c.num("nozzle_temperature_range_high", 0);
  const recommendedOn = ["nozzle_temperature_range_low", "nozzle_temperature_range_high"];
  if (x.checksOn(recommendedOn)) {
    let filament_type = c.text("filament_type", 0);
    const material = materialType(filament_type);
    const min_recommended_temp = material ? material[1] : 190;
    const max_recommended_temp = material ? material[2] : 300;
    if (!material) filament_type = "Unknown";
    const msg = [];
    if (temperature_range_low < min_recommended_temp)
      msg.push(`A minimum temperature above ${min_recommended_temp}℃ is recommended for ${filament_type}.`);
    if (temperature_range_high > max_recommended_temp)
      msg.push(`A maximum temperature below ${max_recommended_temp}℃ is recommended for ${filament_type}.`);
    if (temperature_range_low > temperature_range_high)
      msg.push("The recommended minimum temperature cannot be higher than the recommended maximum temperature.");
    if (msg.length) {
      issues.push({
        id: "recommended-temperature-range",
        scope: FILAMENT,
        key: "nozzle_temperature_range_low",
        keys: ["nozzle_temperature_range_low", "nozzle_temperature_range_high", "filament_type"],
        severity: "warning",
        message: `${msg.join(" ")} Please check.`,
        checkedOn: recommendedOn
      });
    }
  }
  for (const key of readKeys(["nozzle_temperature", "nozzle_temperature_initial_layer"])) {
    if (!x.checksOn([key])) continue;
    const temperature = c.num(key, 0);
    if (temperature < temperature_range_low || temperature > temperature_range_high) {
      issues.push({
        id: key === "nozzle_temperature" ? "nozzle-temperature-range" : "nozzle-temperature-initial-layer-range",
        scope: FILAMENT,
        key,
        keys: [key, "nozzle_temperature_range_low", "nozzle_temperature_range_high"],
        severity: "warning",
        message: `The nozzle may become clogged when the temperature is out of the recommended range. Please make sure whether to use this temperature to print. The recommended nozzle temperature for this filament type is [${temperature_range_low}, ${temperature_range_high}] degrees Celsius.`,
        checkedOn: [key]
      });
    }
  }
  const modelOn = ["adaptive_pressure_advance_model"];
  if (x.checksOn(modelOn) && !isHidden(t, "adaptive_pressure_advance_model")) {
    const error = validateAdaptivePaModel(c.slots("adaptive_pressure_advance_model").join(""));
    if (error) {
      issues.push({
        id: "adaptive-pa-model",
        scope: FILAMENT,
        key: "adaptive_pressure_advance_model",
        keys: ["adaptive_pressure_advance_model"],
        severity: "warning",
        message: `Adaptive Pressure Advance model validation failed: ${error}`,
        checkedOn: modelOn
      });
    }
  }
  const chamberOn = ["chamber_temperature"];
  if (x.checksOn(chamberOn) && c.bool("support_chamber_temp_control")) {
    const material = materialType(c.text("filament_type", 0));
    if (material && material[4] < c.num("chamber_temperature", 0)) {
      issues.push({
        id: "chamber-temperature-safe",
        scope: FILAMENT,
        key: "chamber_temperature",
        keys: ["chamber_temperature", "filament_type"],
        severity: "warning",
        message: `Current chamber temperature is higher than the material's safe temperature; this may result in material softening and nozzle clogs. The maximum safe temperature for the material is ${material[4]}`,
        checkedOn: chamberOn
      });
    }
  }
  const chamberMinimalOn = ["chamber_temperature", "chamber_minimal_temperature"];
  const chamber_min_temp = c.num("chamber_minimal_temperature", 0);
  const chamber_target_temp = c.num("chamber_temperature", 0);
  if (x.checksOn(chamberMinimalOn) && chamber_min_temp > chamber_target_temp) {
    issues.push({
      id: "chamber-minimal-temperature",
      scope: FILAMENT,
      key: "chamber_minimal_temperature",
      keys: ["chamber_minimal_temperature", "chamber_temperature"],
      severity: "error",
      message: `The minimal chamber temperature (${chamber_min_temp}℃) is higher than the target chamber temperature (${chamber_target_temp}℃). The minimal value is the threshold at which printing starts while the chamber keeps heating toward the target, so it should not exceed it.`,
      fix: { chamber_minimal_temperature: String(chamber_target_temp) },
      fixLabel: "Clamp to the target",
      checkedOn: chamberMinimalOn
    });
  }
}
var MARLIN_LIKE_FLAVORS = enumValues("gcode_flavor", ["marlin", "marlin2", "klipper", "reprapfirmware", "repetier"]);
function isMarlinFlavor(c) {
  return c.oneOf("gcode_flavor", MARLIN_LIKE_FLAVORS);
}
function inputShaperTypesForFlavor(c) {
  if (c.is("gcode_flavor", "klipper"))
    return enumList("input_shaping_type", ["Default", "ZV", "MZV", "ZVD", "EI", "2HUMP_EI", "3HUMP_EI", "Disable"]);
  if (c.is("gcode_flavor", "reprapfirmware"))
    return enumList("input_shaping_type", ["Default", "MZV", "ZVD", "ZVDD", "ZVDDD", "EI2", "EI3", "DAA", "Disable"]);
  if (c.is("gcode_flavor", "marlin2"))
    return enumList("input_shaping_type", ["ZV", "Disable"]);
  return enumList("input_shaping_type", ["Default", "Disable"]);
}
function updateInputShaperMenu(x, t, issues) {
  const allowed = inputShaperTypesForFlavor(x.c);
  t.enumOnly("input_shaping_type", allowed);
  const current = x.c.text("input_shaping_type");
  const needs_reset = !allowed.includes(current);
  if (needs_reset) {
    issues.push({
      id: "input-shaper-type",
      scope: MACHINE,
      key: "input_shaping_type",
      keys: ["input_shaping_type", "gcode_flavor"],
      severity: "info",
      message: `This firmware does not support the ${current} input shaper, so Orca uses ${allowed[0]}.`,
      fix: { input_shaping_type: allowed[0] },
      fixLabel: `Use ${allowed[0]}`,
      triggers: ["gcode_flavor"]
    });
  }
}
function tabPrinterToggleOptions(x, t, issues) {
  const { c } = x;
  const is_BBL_printer = x.isBbl;
  const have_multiple_extruders = true;
  {
    for (const el of ["scan_first_layer", "bbl_calib_mark_logo", "bbl_use_printhost"])
      t.line(el, is_BBL_printer);
    for (const el of ["use_firmware_retraction", "use_relative_e_distances", "support_multi_bed_types", "pellet_modded_printer", "bed_mesh_max", "bed_mesh_min", "bed_mesh_probe_distance", "adaptive_bed_mesh_margin", "thumbnails"])
      t.line(el, !is_BBL_printer);
    const gcf_is_marlin_firmware = c.is("gcode_flavor", "marlin2");
    t.line("enable_power_loss_recovery", is_BBL_printer || gcf_is_marlin_firmware);
    const support_parallel_printheads = c.bool("support_parallel_printheads");
    t.line("parallel_printheads_count", support_parallel_printheads);
    const exclusion_extruder_count = x.extruderCount;
    const collision_volumes_enabled = hasBedExcludeVolumes(c);
    const exclusion_mode = activeBedExcludeVolumeMode(c);
    t.field("bed_exclude_area", true);
    t.line("bed_exclude_volume_mode", collision_volumes_enabled && exclusion_extruder_count > 1);
    t.line("bed_exclude_volumes", exclusion_extruder_count <= 1 || exclusion_mode !== v("bed_exclude_volume_mode", "per_extruder"));
    t.line("fan_direction", c.bool("auxiliary_fan"));
    t.line("support_air_filtration", !c.bool("support_cooling_filter"));
    t.line("cooling_filter_enabled", c.bool("support_cooling_filter"));
  }
  t.line("wrapping_detection_gcode", x.supportsWrappingDetection);
  {
    const supports_wipe_tower_2 = !is_BBL_printer && c.is("wipe_tower_type", "type2");
    t.line("wipe_tower_type", !is_BBL_printer);
    for (const el of [
      "enable_filament_ramming",
      "cooling_tube_retraction",
      "cooling_tube_length",
      "parking_pos_retraction",
      "extra_loading_move",
      "high_current_on_filament_swap"
    ])
      t.field(el, supports_wipe_tower_2);
    const bSEMM = c.bool("single_extruder_multi_material");
    if (!bSEMM && c.bool("manual_filament_change")) {
      issues.push({
        id: "manual-filament-change-semm",
        scope: MACHINE,
        key: "manual_filament_change",
        keys: ["manual_filament_change", "single_extruder_multi_material"],
        severity: "info",
        message: "Manual filament change needs single extruder multi-material, so Orca turns it off.",
        fix: { manual_filament_change: "0" },
        fixLabel: "Turn off",
        triggers: ["single_extruder_multi_material"]
      });
    }
    t.field("extruders_count", !bSEMM);
    t.field("manual_filament_change", bSEMM);
    t.field("purge_in_prime_tower", bSEMM && supports_wipe_tower_2);
    const extruders_count = c.slots("nozzle_diameter").length;
    t.field("tool_change_on_wipe_tower", !bSEMM && supports_wipe_tower_2 && extruders_count > 1);
    t.field("wait_for_temp_on_wipe_tower", !bSEMM && supports_wipe_tower_2 && extruders_count > 1);
  }
  let firmwareRetractionAsked = false;
  for (let i = 0; i < x.extruderCount; i++) {
    const variant_index = printerVariantIndex(c, i);
    const have_retract_length = c.num("retraction_length", variant_index) > 0;
    t.field("extruder_printable_area", false, i);
    t.line("extruder_printable_area", x.extruderCount === 2, i);
    const per_extruder_exclusions = hasBedExcludeVolumes(c) && activeBedExcludeVolumeMode(c) === v("bed_exclude_volume_mode", "per_extruder");
    t.line("extruder_bed_exclude_volumes", x.extruderCount > 1 && per_extruder_exclusions, i);
    t.field("extruder_printable_height", false, i);
    t.line("extruder_printable_height", x.extruderCount === 2, i);
    const use_firmware_retraction = c.bool("use_firmware_retraction");
    t.field("retraction_minimum_travel", have_retract_length || use_firmware_retraction, i);
    const retraction = have_retract_length || use_firmware_retraction;
    for (const el of ["z_hop", "retract_when_changing_layer"])
      t.field(el, retraction, i);
    for (const el of ["retract_lift_above", "retract_lift_below", "retract_lift_enforce"])
      t.field(el, retraction && c.num("z_hop", i) > 0, i);
    for (const el of [
      "retraction_speed",
      "deretraction_speed",
      "retract_before_wipe",
      "retract_after_wipe",
      "retract_restart_extra",
      "wipe_distance"
    ])
      t.field(el, retraction && !use_firmware_retraction, i);
    const wipe = retraction && c.bool("wipe", variant_index);
    const retract_before_wipe = c.num("retract_before_wipe", variant_index);
    const retract_after_wipe = c.num("retract_after_wipe", variant_index);
    t.field("retract_before_wipe", wipe && !isApprox(retract_after_wipe, 100), i);
    t.field("retract_after_wipe", wipe && !isApprox(retract_before_wipe, 100), i);
    if (use_firmware_retraction && wipe && retract_before_wipe < 100 && !firmwareRetractionAsked) {
      firmwareRetractionAsked = true;
      issues.push({
        id: "firmware-retraction-wipe",
        scope: MACHINE,
        key: "use_firmware_retraction",
        keys: ["use_firmware_retraction", "wipe", "retract_before_wipe"],
        severity: "warning",
        message: "The Retract before wipe option could be only 100% when using the Firmware Retraction mode. Set it to 100% in order to enable Firmware Retraction?",
        fix: { wipe: "0", retract_before_wipe: "100%" },
        fixLabel: "Turn off wipe and retract 100% before wipe",
        alternative: { label: "Turn off firmware retraction", values: { use_firmware_retraction: "0" } }
      });
    }
    t.field("wipe_distance", wipe, i);
    t.field("retract_length_toolchange", have_multiple_extruders, i);
    const toolchange_retraction = c.num("retract_length_toolchange", variant_index) > 0;
    t.field("retract_restart_extra_toolchange", have_multiple_extruders && toolchange_retraction, i);
    t.field("long_retractions_when_cut", !use_firmware_retraction && c.num("enable_long_retraction_when_cut") !== 0, i);
    t.line("retraction_distances_when_cut", c.bool("long_retractions_when_cut", variant_index), i);
    t.field("travel_slope", !c.is("z_hop_types", "Normal Lift", i), i);
  }
  updateInputShaperMenu(x, t, issues);
  if (isMarlinFlavor(c)) {
    const gcf_is_marlin_legacy = c.is("gcode_flavor", "marlin");
    const gcf_is_marlin_firmware = c.is("gcode_flavor", "marlin2");
    const gcf_is_klipper = c.is("gcode_flavor", "klipper");
    const gcf_is_reprap_firmware = c.is("gcode_flavor", "reprapfirmware");
    const silent_mode = c.bool("silent_mode");
    const max_field = silent_mode ? 2 : 1;
    for (let i = 0; i < max_field; ++i)
      t.field("machine_max_acceleration_travel", !gcf_is_marlin_legacy && !gcf_is_klipper, i);
    t.line("machine_max_acceleration_travel", !gcf_is_marlin_legacy && !gcf_is_klipper);
    for (let i = 0; i < max_field; ++i)
      t.field("machine_max_junction_deviation", gcf_is_marlin_firmware, i);
    t.line("machine_max_junction_deviation", gcf_is_marlin_firmware);
    let enable_jerk = !gcf_is_marlin_firmware;
    if (gcf_is_marlin_firmware)
      enable_jerk = c.slots("machine_max_junction_deviation").every((val) => Number.parseFloat(val) === 0);
    for (let i = 0; i < max_field; ++i) {
      t.field("machine_max_jerk_x", enable_jerk, i);
      t.field("machine_max_jerk_y", enable_jerk, i);
      t.field("machine_max_jerk_z", enable_jerk, i);
      t.field("machine_max_jerk_e", enable_jerk, i);
    }
    const emittable_limits = gcf_is_marlin_legacy || gcf_is_marlin_firmware || gcf_is_reprap_firmware;
    t.field("emit_machine_limits_to_gcode", emittable_limits);
    const resonance_avoidance = c.bool("resonance_avoidance");
    t.field("min_resonance_avoidance_speed", resonance_avoidance);
    t.field("max_resonance_avoidance_speed", resonance_avoidance);
    const input_shaping_compatible = gcf_is_marlin_firmware || gcf_is_reprap_firmware;
    for (const is of [
      "input_shaping_emit",
      "input_shaping_type",
      "input_shaping_freq_x",
      "input_shaping_freq_y",
      "input_shaping_damp_x",
      "input_shaping_damp_y"
    ])
      t.line(is, input_shaping_compatible);
    if (input_shaping_compatible) {
      const emit_machine_limits_to_gcode = c.bool("emit_machine_limits_to_gcode");
      t.field("input_shaping_emit", emit_machine_limits_to_gcode);
      const input_shaping_emit = emit_machine_limits_to_gcode && c.bool("input_shaping_emit");
      t.field("input_shaping_type", input_shaping_emit);
      t.field("input_shaping_freq_x", input_shaping_emit);
      t.field("input_shaping_freq_y", input_shaping_emit && !gcf_is_reprap_firmware);
      t.field("input_shaping_damp_x", input_shaping_emit);
      t.field("input_shaping_damp_y", input_shaping_emit && !gcf_is_reprap_firmware);
    }
  }
}
function evaluateRules(env) {
  const x = context(env);
  const issues = [];
  updatePrintFffConfig(x, issues);
  const process = new Toggles();
  tabPrintToggleOptions(x, process);
  printFffRewrites(x, issues);
  const filament = new Toggles();
  tabFilamentToggleOptions(x, filament, issues);
  const filamentRules = filament.result();
  filamentChecks(x, filamentRules, issues);
  const machine = new Toggles();
  tabPrinterToggleOptions(x, machine, issues);
  return {
    process: process.result(),
    filament: filamentRules,
    machine: machine.result(),
    when: { marlinLikeFlavor: isMarlinFlavor(x.c) },
    issues
  };
}
function withValues(view, patch2) {
  return { get: (k) => Object.hasOwn(patch2, k) ? patch2[k] : view.get(k) };
}
var keep = (label) => ({ label, values: {} });
var WIPE_PERCENT_KEYS = {
  filament: readKeys(["filament_retract_before_wipe", "filament_retract_after_wipe"]),
  machine: readKeys(["retract_before_wipe", "retract_after_wipe"])
};
var FILAMENT_FLAGS = readKeys(["filament_is_support", "filament_soluble"]);
function editEffects(scope, key, value, env, index = 0) {
  const before = context(env);
  const x = context({ ...env, config: withValues(env.config, { [key]: value }) });
  const patch2 = {};
  const prompts = [];
  const prompt = (id, message, choices) => prompts.push({ id, scope, key, message, choices });
  const { c } = x;
  if (scope === "filament" || scope === "machine") {
    const [before_key, after_key] = WIPE_PERCENT_KEYS[scope];
    if (key === before_key || key === after_key) {
      const percent_value_clamp = (percent_value) => Math.min(100, Math.max(0, percent_value));
      const dvalue = c.num(key, index);
      const get_value_by_opt_key = (opt_key) => {
        if (opt_key === key && !Number.isNaN(dvalue)) return percent_value_clamp(dvalue);
        if (!c.isNil(opt_key, index)) return percent_value_clamp(c.num(opt_key, index));
        return percent_value_clamp(c.num(opt_key.replace(/^filament_/, ""), index));
      };
      const retract_before_wipe = get_value_by_opt_key(before_key);
      const retract_after_wipe = get_value_by_opt_key(after_key);
      if (!Number.isNaN(dvalue) && percent_value_clamp(dvalue) !== dvalue)
        patch2[key] = c.withSlot(key, index, `${orcaNumber(percent_value_clamp(dvalue))}%`);
      if (retract_after_wipe > 100 - retract_before_wipe)
        patch2[after_key] = c.withSlot(after_key, index, `${orcaNumber(100 - retract_before_wipe)}%`);
    }
  }
  const finite = (n) => Number.isFinite(n) ? orcaNumber(n) : void 0;
  if (key === "pellet_flow_coefficient") {
    const filament_diameter = finite(Math.sqrt(4 / (Math.PI * c.num("pellet_flow_coefficient"))));
    if (filament_diameter !== void 0) patch2.filament_diameter = filament_diameter;
  }
  if (key === "filament_diameter") {
    const pellet_flow_coefficient = finite(4 / (c.num("filament_diameter") ** 2 * Math.PI));
    if (pellet_flow_coefficient !== void 0) patch2.pellet_flow_coefficient = pellet_flow_coefficient;
  }
  if (key === "enable_prime_tower") {
    const timelapse_enabled = c.is("timelapse_type", v("timelapse_type", "1"));
    const enabled = c.bool("enable_prime_tower");
    if (!enabled) {
      const has_multiple_nozzle = c.slots("extruder_max_nozzle_count").some((n) => n !== "nil" && Number.parseFloat(n) > 1);
      if (has_multiple_nozzle) {
        prompt(
          "prime-tower-nozzle-change",
          "Prime tower is required for nozzle changing. There may be flaws on the model without prime tower. Are you sure you want to disable prime tower?",
          [keep("Disable"), { label: "Keep the prime tower", values: { enable_prime_tower: "1" } }]
        );
      }
    }
    if (!enabled && timelapse_enabled) {
      prompt(
        "prime-tower-smooth-timelapse",
        "A prime tower is required for smooth timelapse mode. There may be flaws on the model without a prime tower. Are you sure you want to disable the prime tower?",
        [keep("Disable"), { label: "Keep the prime tower", values: { enable_prime_tower: "1" } }]
      );
      if (c.bool("enable_wrapping_detection")) {
        prompt(
          "prime-tower-wrapping-detection",
          "A prime tower is required for clumping detection. There may be flaws on the model without prime tower. Are you sure you want to disable prime tower?",
          [keep("Disable"), { label: "Keep the prime tower", values: { enable_prime_tower: "1" } }]
        );
      }
    }
    if (enabled && c.bool("precise_z_height")) {
      prompt(
        "prime-tower-precise-z",
        "Enabling both precise Z height and the prime tower may cause slicing errors. Do you still want to enable?",
        [keep("Enable"), { label: "Cancel", values: { enable_prime_tower: "0" } }]
      );
    }
  }
  if (key === "enable_wrapping_detection") {
    const wipe_tower_enabled = c.bool("enable_prime_tower");
    if (c.bool("enable_wrapping_detection") && !wipe_tower_enabled) {
      prompt(
        "wrapping-detection-prime-tower",
        "A prime tower is required for clumping detection. There may be flaws on the model without prime tower. Do you still want to enable clumping detection?",
        [keep("Enable"), { label: "Cancel", values: { enable_wrapping_detection: "0" } }]
      );
    }
  }
  if (key === "precise_z_height") {
    const wipe_tower_enabled = c.bool("enable_prime_tower");
    if (c.bool("precise_z_height") && wipe_tower_enabled) {
      prompt(
        "precise-z-prime-tower",
        "Enabling both precise Z height and the prime tower may cause slicing errors. Do you still want to enable precise Z height?",
        [keep("Enable"), { label: "Cancel", values: { precise_z_height: "0" } }]
      );
    }
  }
  if (key === "timelapse_type") {
    const smooth = c.is("timelapse_type", v("timelapse_type", "1"));
    if (smooth && c.bool("wipe_tower_no_sparse_layers")) {
      patch2.wipe_tower_no_sparse_layers = "0";
      prompt(
        "smooth-timelapse-sparse-layers",
        'Smooth timelapse needs a prime tower on every layer, which is not compatible with "No sparse layers". "No sparse layers" has been turned off.',
        [keep("OK")]
      );
    }
    const wipe_tower_enabled = c.bool("enable_prime_tower");
    if (!wipe_tower_enabled && smooth) {
      prompt(
        "smooth-timelapse-prime-tower",
        "A prime tower is required for smooth timelapse mode. There may be flaws on the model without prime tower. Do you want to enable the prime tower?",
        [{ label: "Enable the prime tower", values: { enable_prime_tower: "1" } }, keep("No")]
      );
    }
  }
  if (key === "wipe_tower_no_sparse_layers" && c.bool("wipe_tower_no_sparse_layers")) {
    if (c.is("timelapse_type", v("timelapse_type", "1"))) {
      patch2.timelapse_type = v("timelapse_type", "0");
      prompt(
        "sparse-layers-smooth-timelapse",
        '"No sparse layers" is not compatible with smooth timelapse, which needs a prime tower on every layer. Timelapse has been switched to traditional mode.',
        [keep("OK")]
      );
    }
  }
  if (key === "print_sequence" && c.is("print_sequence", "by object")) {
    if (c.is("printer_structure", "i3")) {
      prompt(
        "by-object-i3",
        "The current printer does not support timelapse in Traditional Mode when printing By-Object. Still print by object?",
        [keep("Yes"), { label: "No", values: { print_sequence: v("print_sequence", "by layer") } }]
      );
    }
  }
  if (key === "support_type" && x.mode === "simple") patch2.support_style = v("support_style", "default");
  const [filament_is_support, filament_soluble] = FILAMENT_FLAGS;
  const has_filaments = (types) => x.hasObjects && types.includes(c.text("filament_type", 0));
  const is_soluble_filament = (id) => id >= 0 && id < x.filamentCount && c.bool(filament_soluble, id);
  const is_support_filament = (id) => {
    if (id < 0 || id >= x.filamentCount) return false;
    const filament_type = c.text("filament_type", id);
    if (filament_type === "PETG" && has_filaments(["PLA"])) return true;
    if (filament_type === "PLA" && has_filaments(["PETG", "TPU", "TPU-AMS"])) return true;
    return c.bool(filament_is_support, id);
  };
  if (key === "support_filament") {
    const filament_id = c.num("support_filament") - 1;
    if (is_support_filament(filament_id) && !is_soluble_filament(filament_id) && !has_filaments(["TPU", "TPU-AMS"])) {
      prompt(
        "support-filament-not-soluble",
        "Non-soluble support materials are not recommended for support base. Are you sure to use them for support base?",
        [keep("Yes"), { label: "No", values: { support_filament: "0" } }]
      );
    }
  }
  if (key === "support_interface_filament") {
    const filament_id = c.num("support_filament") - 1;
    const interface_filament_id = c.num("support_interface_filament") - 1;
    if (is_support_filament(interface_filament_id) && !(c.num("support_top_z_distance") === 0 && c.num("support_interface_spacing") === 0 && c.is("support_interface_pattern", "rectilinear_interlaced")) || is_soluble_filament(interface_filament_id) && !is_soluble_filament(filament_id)) {
      const values = {
        support_top_z_distance: "0",
        support_interface_spacing: "0",
        support_interface_pattern: v("support_interface_pattern", "rectilinear_interlaced"),
        independent_support_layer_height: "0"
      };
      const filament_type = c.text("filament_type", Math.max(0, interface_filament_id));
      if (filament_type === "PLA" && has_filaments(["TPU", "TPU-AMS"]) || is_soluble_filament(interface_filament_id) && !is_soluble_filament(filament_id))
        values.support_filament = String(interface_filament_id + 1);
      prompt(
        "support-interface-filament",
        !is_soluble_filament(interface_filament_id) ? "When using support material for the support interface, we recommend the following settings: 0 top Z distance, 0 interface spacing, interlaced rectilinear pattern and disable independent support layer height." : "When using soluble material for the support interface, we recommend the following settings: 0 top Z distance, 0 interface spacing, interlaced rectilinear pattern, disable independent support layer height and use soluble materials for both support interface and support base.",
        [{ label: "Change these settings", values }, keep("Do not change them")]
      );
    }
  }
  if (key === "make_overhang_printable" && c.bool("make_overhang_printable")) {
    prompt(
      "make-overhang-printable",
      "Enabling this option will modify the model's shape. If your print requires precise dimensions or is part of an assembly, it's important to double-check whether this change in geometry impacts the functionality of your print. Are you sure you want to enable this option?",
      [keep("Enable"), { label: "Cancel", values: { make_overhang_printable: "0" } }]
    );
  }
  if (key === "sparse_infill_rotate_template") {
    let is_safe_to_rotate = c.is("sparse_infill_pattern", "rectilinear") || c.is("sparse_infill_pattern", "line") || c.is("sparse_infill_pattern", "zigzag") || c.is("sparse_infill_pattern", "crosszag") || c.is("sparse_infill_pattern", "lockedzag");
    is_safe_to_rotate ||= value.trim() === "";
    const had_previous_value = before.c.text("sparse_infill_rotate_template") !== "";
    if (!is_safe_to_rotate && !had_previous_value) {
      prompt(
        "sparse-infill-rotate-template",
        "Infill patterns are typically designed to handle rotation automatically to ensure proper printing and achieve their intended effects (e.g., Gyroid, Cubic). Rotating the current sparse infill pattern may lead to insufficient support. Please proceed with caution and thoroughly check for any potential printing issues. Are you sure you want to enable this option?",
        [keep("Enable"), { label: "Cancel", values: { sparse_infill_rotate_template: "" } }]
      );
    }
  }
  if (key === "long_retractions_when_cut" && c.bool("long_retractions_when_cut", index)) {
    prompt(
      "long-retractions-when-cut",
      "Experimental feature: Retracting and cutting off the filament at a greater distance during filament changes to minimize flush. Although it can notably reduce flush, it may also elevate the risk of nozzle clogs or other printing complications.",
      [keep("OK")]
    );
  }
  if (key === "filament_long_retractions_when_cut" && !c.isNil("filament_long_retractions_when_cut", index) && c.bool("filament_long_retractions_when_cut", index)) {
    prompt(
      "filament-long-retractions-when-cut",
      "Experimental feature: Retracting and cutting off the filament at a greater distance during filament changes to minimize flush. Although it can notably reduce flush, it may also elevate the risk of nozzle clogs or other printing complications. Please use with the latest printer firmware.",
      [keep("OK")]
    );
  }
  if (key === "single_extruder_multi_material" && !c.bool("single_extruder_multi_material")) patch2.purge_in_prime_tower = "0";
  if (x.extruderCount > 1 && x.isBbl && (key === "min_layer_height" || key === "max_layer_height"))
    patch2[key] = c.slots(key).map(() => c.text(key, index)).join(",");
  if ((key === "parallel_printheads_count" || key === "parallel_printheads_bed_exclude_areas") && c.bool("support_parallel_printheads")) {
    const count = c.num("parallel_printheads_count");
    const areas = c.slots("parallel_printheads_bed_exclude_areas");
    patch2.bed_exclude_area = count > 0 ? areas[count - 1] ?? "" : "";
  }
  if (key === "enable_support" && x.isGlobal && c.bool("enable_support") && !before.c.bool("enable_support") && !c.bool("detect_overhang_wall"))
    patch2.detect_overhang_wall = "1";
  for (let pass = 0; pass < 4; pass++) {
    const edited = withValues(env.config, { [key]: value, ...patch2 });
    let changed = false;
    for (const issue of evaluateRules({ ...env, config: edited }).issues) {
      if (issue.scope !== scope || !issue.fix || !issue.triggers?.includes(key)) continue;
      for (const [k, fixed] of Object.entries(issue.fix)) {
        if ((k === key ? patch2[k] ?? value : patch2[k]) === fixed) continue;
        patch2[k] = fixed;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { patch: patch2, prompts };
}
function layeredConfig(...layers) {
  return {
    get(key) {
      for (const layer of layers) if (layer && Object.hasOwn(layer, key)) return layer[key];
      return void 0;
    }
  };
}

// host/src/settings/text.ts
var REAL_OPTIONS = Object.entries(CATALOGUE.options).filter(([, def]) => !def.synthetic);
var OPTION_TYPES = Object.fromEntries(REAL_OPTIONS.map(([key, def]) => [key, def.type]));
var NULLABLE_OPTIONS = new Set(REAL_OPTIONS.filter(([, def]) => def.nullable).map(([key]) => key));
var SERIALIZED_OPTIONS = new Set(REAL_OPTIONS.filter(([, def]) => def.serialized).map(([key]) => key));
var LIST_OPTIONS = new Set(REAL_OPTIONS.filter(([, def]) => def.slots === "list").map(([key]) => key));
var OverrideError = class extends Error {
};
function optionType(key) {
  return Object.hasOwn(OPTION_TYPES, key) ? OPTION_TYPES[key] : void 0;
}
var COMMA_VECTORS = /* @__PURE__ */ new Set(["floats", "ints", "percents", "floatsOrPercents", "bools", "enums", "points"]);
var GROUP_VECTORS = /* @__PURE__ */ new Set(["pointsGroups", "intsGroups"]);
var isList = (key) => LIST_OPTIONS.has(key);
var NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
var POINT = new RegExp(`^${NUMBER}\\s*x\\s*${NUMBER}$`);
var POINT_SCALAR = new RegExp(`^${NUMBER}\\s*[,x]\\s*${NUMBER}$`);
function escapeCString(text) {
  return text.replace(/[\\"\r\n]/g, (c) => ({ "\\": "\\\\", '"': '\\"', "\r": "\\r", "\n": "\\n" })[c]);
}
function escapeStrings(entries) {
  return entries.map((s) => /[ \t;\\"\r\n]/.test(s) || entries.length === 1 && s === "" ? `"${escapeCString(s)}"` : s).join(";");
}
function unescapeStrings(text) {
  const out = [];
  if (text === "") return out;
  let i = 0;
  const skipBlanks = () => {
    while (i < text.length && (text[i] === " " || text[i] === "	")) i++;
  };
  for (; ; ) {
    skipBlanks();
    if (i === text.length) return out;
    let entry = "";
    if (text[i] === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\") {
          if (++i === text.length) return null;
          entry += text[i] === "r" ? "\r" : text[i] === "n" ? "\n" : text[i];
        } else {
          entry += text[i];
        }
      }
      if (i === text.length) return null;
      i++;
    } else {
      for (; i < text.length && text[i] !== ";"; i++) entry += text[i];
    }
    out.push(entry);
    if (i === text.length) return out;
    skipBlanks();
    if (i === text.length) return out;
    if (text[i] !== ";") return null;
    if (++i === text.length) {
      out.push("");
      return out;
    }
  }
}
var normaliseBool = (slot) => /^true$/i.test(slot) ? "1" : /^false$/i.test(slot) ? "0" : slot;
function overrideSlots(key, text) {
  const type = optionType(key);
  let slots;
  if (type === "strings") {
    if (SERIALIZED_OPTIONS.has(key) || isList(key)) {
      const list = unescapeStrings(text);
      if (!list) throw new OverrideError(`The value for "${key}" is not a valid list of texts (Orca's a;"b c" form).`);
      slots = list;
    } else {
      slots = (text.startsWith('"') ? unescapeStrings(text) : null) ?? [text];
    }
  } else if (type && COMMA_VECTORS.has(type)) {
    slots = text === "" ? type === "points" ? [] : [""] : text.split(",").map((s) => s.trim());
  } else if (type && GROUP_VECTORS.has(type)) {
    slots = text === "" ? [] : text.split("#").map((s) => s.trim());
  } else {
    slots = [text];
  }
  if (type === "bool" || type === "bools") slots = slots.map(normaliseBool);
  if (type === "points" && slots.some((p) => !POINT.test(p))) {
    throw new OverrideError(`The value for "${key}" must be points written like 0x0,200x0 (found "${text.slice(0, 60)}").`);
  }
  if (type === "point" && !POINT_SCALAR.test(text)) {
    throw new OverrideError(`The value for "${key}" must be a point written like 10,20 (found "${text.slice(0, 60)}").`);
  }
  if (type && type !== "strings" && type !== "string" && !NULLABLE_OPTIONS.has(key) && slots.includes("nil")) {
    throw new OverrideError(`The setting "${key}" cannot be left unset ("nil").`);
  }
  return slots;
}
function overrideText(key, slots) {
  const type = optionType(key);
  if (type === "strings") {
    if (SERIALIZED_OPTIONS.has(key) || isList(key)) return escapeStrings(slots);
    if (slots.length === 1 && !slots[0].startsWith('"')) return slots[0];
    return slots.map((s) => `"${escapeCString(s)}"`).join(";");
  }
  if (type && COMMA_VECTORS.has(type)) return slots.join(",");
  if (type && GROUP_VECTORS.has(type)) return slots.join("#");
  if (slots.length !== 1) throw new OverrideError(`"${key}" holds one value, not ${slots.length}.`);
  return slots[0];
}
function presetValueText(key, value) {
  if (Array.isArray(value)) return overrideText(key, value);
  return optionType(key) === "strings" ? overrideText(key, unescapeStrings(value) ?? [value]) : value;
}
function slotsOf(key, text) {
  try {
    return overrideSlots(key, text);
  } catch {
    return [text];
  }
}
function slotValue(slots, index = 0) {
  return slots[index] ?? slots[0] ?? "";
}
function valueText(key, value) {
  try {
    return presetValueText(key, value);
  } catch {
    return Array.isArray(value) ? value.join(",") : value;
  }
}
function baseText(key, def, preset) {
  if (preset !== void 0) return valueText(key, preset);
  if (def?.default !== void 0) return valueText(key, def.default);
  return "";
}
var VECTOR_TYPES = /* @__PURE__ */ new Set([
  "floats",
  "ints",
  "percents",
  "floatsOrPercents",
  "bools",
  "enums",
  "points",
  "strings",
  "pointsGroups",
  "intsGroups"
]);
function isVectorType(type) {
  return type !== void 0 && VECTOR_TYPES.has(type);
}
function withSlot(key, text, index, value, count = 1) {
  if (LIST_OPTIONS.has(key) || !isVectorType(optionType(key))) return value;
  const slots = slotsOf(key, text);
  const size = Math.max(slots.length, count, index + 1);
  const next = Array.from({ length: size }, (_, i) => slotValue(slots, i));
  next[index] = value;
  const collapsed = next.every((s) => s === next[0]) ? [next[0]] : next;
  return overrideText(key, collapsed);
}
var NUMBER_TYPES = /* @__PURE__ */ new Set(["float", "floats", "int", "ints", "percent", "percents", "floatOrPercent", "floatsOrPercents"]);
function readNumber(text) {
  const trimmed = text.trim();
  const percent = trimmed.endsWith("%");
  const body = (percent ? trimmed.slice(0, -1) : trimmed).trim();
  if (body === "" || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(body)) return null;
  const n = Number(body);
  return Number.isFinite(n) ? { n, percent } : null;
}
var boolValue = (text) => /^(1|true)$/i.test(text.trim()) ? "1" : /^(0|false)$/i.test(text.trim()) ? "0" : text.trim();
var isOn = (text) => boolValue(text) === "1";
function sameSlot(type, a, b) {
  if (a === b) return true;
  if (type === "bool" || type === "bools") return boolValue(a) === boolValue(b);
  if (type && NUMBER_TYPES.has(type)) {
    const x = readNumber(a);
    const y = readNumber(b);
    return x !== null && y !== null && x.percent === y.percent && Math.abs(x.n - y.n) < 1e-9;
  }
  if (type === "string" || type === "strings") return false;
  return a.trim() === b.trim();
}
function sameText(key, a, b) {
  if (a === b) return true;
  const type = optionType(key);
  const x = slotsOf(key, a);
  const y = slotsOf(key, b);
  if (x.length !== y.length && (LIST_OPTIONS.has(key) || x.length !== 1 && y.length !== 1)) return false;
  const size = Math.max(x.length, y.length);
  for (let i = 0; i < size; i++) if (!sameSlot(type, slotValue(x, i), slotValue(y, i))) return false;
  return true;
}
function overrideFor(key, text, base) {
  return sameText(key, text, base) ? null : text;
}
function controlKind(def) {
  switch (def.type) {
    case "bool":
    case "bools":
      return "bool";
    case "enum":
    case "enums":
      return def.openEnum ? "suggest" : "enum";
    case "float":
    case "floats":
    case "int":
    case "ints":
    case "percent":
    case "percents":
      return def.openEnum && def.enumValues?.length ? "suggest" : "number";
    case "floatOrPercent":
    case "floatsOrPercents":
      return def.openEnum && def.enumValues?.length ? "suggest" : "floatOrPercent";
    case "point":
      return "point";
    case "points":
      return def.slots === "list" ? "text" : "point";
    case "string":
    case "strings":
      if (def.gui === "color") return "color";
      if (def.multiline) return "code";
      if (def.openEnum && def.enumValues?.length) return "suggest";
      return "text";
    default:
      return "text";
  }
}

// host/src/settings/model.ts
var SCOPES = ["process", "filament", "machine"];
function baseOf(s, scope, key) {
  const config2 = s.configs[scope];
  const value = config2 && Object.hasOwn(config2, key) ? config2[key] : void 0;
  return baseText(key, settingDef(s.catalogue, key), value);
}
function overrideOf(s, scope, key) {
  const map = s.overrides[scope];
  return Object.hasOwn(map, key) ? map[key] : void 0;
}
function currentOf(s, scope, key) {
  return overrideOf(s, scope, key) ?? baseOf(s, scope, key);
}
function slotOf(key, text, index) {
  return LIST_OPTIONS.has(key) ? text : slotValue(slotsOf(key, text), index ?? 0);
}
function currentSlot(s, scope, key, index) {
  return slotOf(key, currentOf(s, scope, key), index);
}
function baseSlot(s, scope, key, index) {
  return slotOf(key, baseOf(s, scope, key), index);
}
function extruderCount(s) {
  return Math.max(1, slotsOf("nozzle_diameter", currentOf(s, "machine", "nozzle_diameter")).length);
}
function slotCount(s, scope, key) {
  return slotsOf(key, baseOf(s, scope, key)).length;
}
function nozzleVariant(s, extruder) {
  const types = slotsOf("extruder_type", currentOf(s, "machine", "extruder_type"));
  return extruderVariantString(slotValue(types, extruder) || "Direct Drive", "Standard");
}
function variantCount(s, scope) {
  const key = VARIANT_KEYS[scope].variant;
  return slotsOf(key, currentOf(s, scope, key)).length;
}
function variantSlot(s, scope, key, extruder, stride = 1) {
  if (settingDef(s.catalogue, key)?.slots !== "variant") return void 0;
  const keys = VARIANT_KEYS[scope];
  const index = indexForExtruder(
    {
      variants: slotsOf(keys.variant, currentOf(s, scope, keys.variant)),
      ids: keys.id ? slotsOf(keys.id, currentOf(s, scope, keys.id)) : null,
      extruderVariantList: slotsOf("extruder_variant_list", currentOf(s, "machine", "extruder_variant_list"))
    },
    extruder + 1,
    nozzleVariant(s, extruder),
    stride
  );
  return index >= 0 ? index : void 0;
}
function slotResolver(s, scope) {
  return (key, def, layoutIndex, extruder, line) => {
    const ruleIndex = layoutIndex === "extruder" ? extruder : layoutIndex;
    if (def.slots !== "variant") return { index: ruleIndex, ruleIndex };
    const variant = variantSlot(s, scope, key, extruder, line.modeColumns ? 2 : 1);
    return { index: variant ?? ruleIndex, ruleIndex };
  };
}
function configView(s) {
  const bed = s.bedType && !s.bedType.selectable ? s.bedType.defaultType : s.plateSettings?.curr_bed_type;
  return layeredConfig(
    bed !== void 0 ? { curr_bed_type: bed } : null,
    s.overrides.process,
    s.overrides.filament,
    s.overrides.machine,
    s.configs.process,
    s.configs.filament,
    s.configs.machine,
    s.bedType ? { curr_bed_type: s.bedType.defaultType } : null
  );
}
function editedKeys(s) {
  const keys = /* @__PURE__ */ new Set();
  for (const scope of SCOPES) for (const key of Object.keys(s.overrides[scope])) keys.add(key);
  return keys;
}
function envOptions(s) {
  return {
    isBbl: s.vendor === "BBL",
    ...s.filamentCount !== void 0 ? { filamentCount: s.filamentCount } : {},
    ...s.supportsWrappingDetection !== void 0 ? { supportsWrappingDetection: s.supportsWrappingDetection } : {}
  };
}
function rulesEnv(s) {
  return {
    config: configView(s),
    context: "global",
    ...envOptions(s),
    extruderCount: extruderCount(s),
    mode: s.mode ?? "advanced",
    edited: editedKeys(s)
  };
}
function evaluate(s) {
  const env = rulesEnv(s);
  return { env, result: evaluateRules(env) };
}
var EPSILON2 = 1e-4;
var formNumber = (n) => String(Number(n.toPrecision(12)));
function zeroLayerHeight(s, scope, key, text) {
  if (scope !== "process" || key !== "layer_height") return null;
  const n = Number.parseFloat(text);
  if (!(Math.abs(n) < EPSILON2)) return null;
  const min = Math.min(...slotsOf("min_layer_height", currentOf(s, "machine", "min_layer_height")).map(Number.parseFloat));
  if (!(min > EPSILON2)) return null;
  return { text: formNumber(min), notice: `Layer height is too small. It will be set to the minimum (${formNumber(min)} mm).` };
}
function writeFor(s, scope, key, text) {
  return overrideFor(key, text, baseOf(s, scope, key));
}
function valueWithSlot(s, scope, key, index, slot) {
  const current = currentOf(s, scope, key);
  const variants = settingDef(s.catalogue, key)?.slots === "variant" ? variantCount(s, scope) : 0;
  return withSlot(key, current, index ?? 0, slot, Math.max(slotCount(s, scope, key), slotsOf(key, current).length, variants));
}
function planEdit(s, scope, key, index, slot, env) {
  const zero = zeroLayerHeight(s, scope, key, slot);
  const text = valueWithSlot(s, scope, key, index, zero?.text ?? slot);
  const writes = {};
  const effects = editEffects(scope, key, text, env, index ?? 0);
  for (const [k, value] of Object.entries(effects.patch)) if (k !== key) writes[k] = writeFor(s, scope, k, value);
  writes[key] = writeFor(s, scope, key, Object.hasOwn(effects.patch, key) ? effects.patch[key] : text);
  return zero ? { scope, writes, prompts: effects.prompts, notice: zero.notice } : { scope, writes, prompts: effects.prompts };
}
function planValues(s, scope, values) {
  const writes = {};
  for (const [key, text] of Object.entries(values)) writes[key] = writeFor(s, scope, key, text);
  return writes;
}
function planReset(s, scope, key, index) {
  if (index === void 0 || overrideOf(s, scope, key) === void 0) return { [key]: null };
  return { [key]: writeFor(s, scope, key, valueWithSlot(s, scope, key, index, baseSlot(s, scope, key, index))) };
}
function planResetAll(s, scope, items) {
  const overrides = { ...s.overrides[scope] };
  const view = { ...s, overrides: { ...s.overrides, [scope]: overrides } };
  const writes = {};
  for (const { key, index } of items) {
    const value = planReset(view, scope, key, index)[key];
    writes[key] = value;
    if (value === null) delete overrides[key];
    else overrides[key] = value;
  }
  return writes;
}
function effectiveWrites(s, scope, writes) {
  const out = {};
  for (const [key, value] of Object.entries(writes)) {
    const before = overrideOf(s, scope, key) ?? null;
    if (before !== value) out[key] = value;
  }
  return out;
}
function inheritedSlot(s, from, index = 0) {
  return currentSlot(s, from.scope, from.key, index);
}

// host/src/settings/layout.ts
var withOmit = /* @__PURE__ */ new WeakMap();
function layoutCatalogue(catalogue, omit = []) {
  const id = [...new Set(omit)].sort().join(",");
  let byOmit = withOmit.get(catalogue);
  if (!byOmit) withOmit.set(catalogue, byOmit = /* @__PURE__ */ new Map());
  let found = byOmit.get(id);
  if (!found) byOmit.set(id, found = { ...catalogue, omit: new Set(id ? id.split(",") : []) });
  return found;
}
function isShown(catalogue, key, def = settingDef(catalogue, key)) {
  return def !== void 0 && !catalogue.omit.has(key);
}
var plainSlots = (_key, _def, layoutIndex, extruder) => {
  const index = layoutIndex === "extruder" ? extruder : layoutIndex;
  return { index, ruleIndex: index };
};
function lineShownInMode(catalogue, page, line, mode) {
  if (page.other) return mode === "expert";
  return shownInMode(lineMode(catalogue, line), mode);
}
function pageActive(page, env) {
  return !page.when || page.when.oneOf.includes(env.value(page.when.key) ?? "");
}
function tabPages(catalogue, tab, env) {
  const pages = [];
  for (const page of tab.pages) {
    if (page.other && env.mode !== "expert") continue;
    if (!pageActive(page, env)) continue;
    const anyLine = page.groups.some(
      (g) => g.lines.some((l) => l.options.some((o) => isShown(catalogue, o.key)) && lineShownInMode(catalogue, page, l, env.mode))
    );
    if (!anyLine) continue;
    if (page.repeat === "extruder") {
      const count = Math.max(1, env.extruderCount);
      for (let i = 0; i < count; i++) {
        pages.push({ tab, page, id: `${page.id}#${i}`, title: count > 1 ? `${page.title} ${i + 1}` : page.title, extruder: i });
      }
    } else {
      pages.push({ tab, page, id: page.id, title: page.title });
    }
  }
  return pages;
}
function lineOptions(catalogue, line, extruder = 0, slots = plainSlots) {
  const out = [];
  for (const layout of line.options) {
    const def = settingDef(catalogue, layout.key);
    if (!isShown(catalogue, layout.key, def)) continue;
    const { index, ruleIndex } = slots(layout.key, def, layout.index, extruder, line);
    out.push({ key: layout.key, def, layout, index, ruleIndex, label: readableLabel(layout.key, layout.label ?? def.label) });
  }
  return out;
}
function lineHidden(options, rules) {
  return !!rules && options.some((o) => isHidden(rules, o.key, o.ruleIndex));
}
function isVariantLine(catalogue, line) {
  return line.options.some((o) => o.index !== "extruder" && settingDef(catalogue, o.key)?.slots === "variant");
}
function pageHasVariantRows(catalogue, page) {
  return page.repeat !== "extruder" && page.groups.some((g) => g.lines.some((l) => isVariantLine(catalogue, l)));
}
function rowLabel(catalogue, line, options, rules) {
  if (options.length === 1 && line.label === void 0) {
    const renamed = rules?.labels.get(options[0].key);
    if (renamed) return renamed;
  }
  return readableLabel(line.options[0].key, lineLabel(catalogue, line));
}
function readableLabel(key, label) {
  if (label !== key || !/_/.test(key)) return label;
  const words = key.replace(/_+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function lineRef(catalogue, group, line, index, extruder, rules, slots) {
  const options = lineOptions(catalogue, line, extruder ?? 0, slots);
  if (options.length === 0) return null;
  return {
    id: `${group.id}/${index}`,
    line,
    group,
    label: rowLabel(catalogue, line, options, rules),
    options,
    hiddenByRules: lineHidden(options, rules)
  };
}
function pageGroups(catalogue, page, mode, rules, slots, extruder = 0, hidden) {
  const groups = [];
  for (const group of page.page.groups) {
    const lines = [];
    group.lines.forEach((line, i) => {
      if (!lineShownInMode(catalogue, page.page, line, mode)) return;
      const ref = lineRef(catalogue, group, line, i, page.extruder ?? extruder, rules, slots);
      if (!ref) return;
      if (!ref.hiddenByRules) lines.push(ref);
      else hidden?.push(ref);
    });
    if (lines.length > 0) groups.push({ group, lines });
  }
  return groups;
}
var places = /* @__PURE__ */ new WeakMap();
function keyPlace(catalogue, key) {
  let index = places.get(catalogue);
  if (!index) {
    index = /* @__PURE__ */ new Map();
    for (const tab of catalogue.tabs) {
      for (const page of tab.pages) {
        for (const group of page.groups) {
          group.lines.forEach((line, lineIndex) => {
            for (const option of line.options) {
              if (!index.has(option.key)) index.set(option.key, { scope: tab.id, tab, page, group, line, lineIndex });
            }
          });
        }
      }
    }
    places.set(catalogue, index);
  }
  return index.get(key);
}

// host/src/settings/object.ts
var EPSILON3 = 1e-4;
var OBJECT_SETTING_CATEGORIES = ["Quality", "Strength", "Speed", "Support", "Others", "Advanced", "Layers and Perimeters"];
var MULTI_FILAMENT_CATEGORIES = ["Extruders", "Flush options"];
var FILAMENT_CHOICES = /* @__PURE__ */ new Set(["support_filament", "support_interface_filament"]);
var FREQUENT_OBJECT_SETTINGS = [
  "layer_height",
  "wall_loops",
  "top_shell_layers",
  "bottom_shell_layers",
  "sparse_infill_density",
  "sparse_infill_pattern",
  "enable_support",
  "support_type",
  "support_threshold_angle",
  "support_threshold_overlap",
  "support_base_pattern",
  "support_on_build_plate_only",
  "support_critical_regions_only",
  "support_remove_small_overhang",
  "support_base_pattern_spacing",
  "support_expansion"
];
var FREQUENT_FLUSH = ["flush_into_infill", "flush_into_objects", "flush_into_support"];
var objectKeys = /* @__PURE__ */ new WeakMap();
function objectSettingKeys(catalogue, filamentCount = 1) {
  const several = filamentCount > 1;
  let byCount = objectKeys.get(catalogue);
  if (!byCount) objectKeys.set(catalogue, byCount = /* @__PURE__ */ new Map());
  let found = byCount.get(several);
  if (!found) {
    const titles = [...OBJECT_SETTING_CATEGORIES, ...several ? MULTI_FILAMENT_CATEGORIES : []];
    const byCategory = new Map(titles.map((t) => [t, []]));
    for (const key of Object.keys(catalogue.options).sort()) {
      const def = catalogue.options[key];
      if (!def.perObject || !def.category || def.scopes?.includes("filament")) continue;
      if (!several && FILAMENT_CHOICES.has(key)) continue;
      byCategory.get(def.category)?.push(key);
    }
    const categories = titles.map((title) => ({ title, keys: byCategory.get(title) })).filter((c) => c.keys.length > 0);
    found = {
      categories,
      keys: new Set(categories.flatMap((c) => c.keys)),
      frequent: several ? [...FREQUENT_OBJECT_SETTINGS, ...FREQUENT_FLUSH] : FREQUENT_OBJECT_SETTINGS
    };
    byCount.set(several, found);
  }
  return found;
}
var KEY_NOUNS = [
  [/(^|_)speed$/, "speed"],
  [/_acceleration$/, "acceleration"],
  [/_jerk$/, "jerk"],
  [/(^|_)line_width$/, "line width"]
];
var KEY_FEATURES = [
  ["tree_support_", "Tree support", "support"],
  ["support_", "Support", "support"],
  ["raft_", "Raft", "raft"],
  ["lightning_", "Lightning", "lightning"],
  ["fuzzy_skin_", "Fuzzy skin", "fuzzy"],
  ["scarf_", "Scarf", "scarf"],
  ["zaa_", "Z contouring", "contouring"]
];
var lowerWords = (text) => text.replace(/\b[A-Z][a-z'’]+\b/g, (w) => w.toLowerCase());
function composeObjectLabel(key, label, type, line) {
  let text = readableLabel(key, label);
  if (line && line !== text) text = /^\d/.test(text) ? `${line} ${text}` : `${text} ${lowerWords(line)}`;
  const noun = type === "bool" || type === "bools" ? void 0 : KEY_NOUNS.find(([re]) => re.test(key))?.[1];
  if (noun && !text.toLowerCase().includes(noun)) text = `${text} ${noun}`;
  const feature = KEY_FEATURES.find(([prefix]) => key.startsWith(prefix));
  if (feature && !text.toLowerCase().includes(feature[2])) text = `${feature[1]} ${lowerWords(text)}`;
  if (key.endsWith("_organic")) text = `${text} (organic)`;
  return text;
}
var labels = /* @__PURE__ */ new WeakMap();
function objectSettingLabel(catalogue, key) {
  let cache = labels.get(catalogue);
  if (!cache) labels.set(catalogue, cache = /* @__PURE__ */ new Map());
  let label = cache.get(key);
  if (label === void 0) {
    const def = settingDef(catalogue, key);
    label = def ? composeObjectLabel(key, def.fullLabel ?? def.label, def.type, keyPlace(catalogue, key)?.line.label) : key;
    cache.set(key, label);
  }
  return label;
}
function isSupportSetting(key) {
  return (key.startsWith("support_") || key.startsWith("tree_support_")) && key !== "enable_support";
}
var layoutOrders = /* @__PURE__ */ new WeakMap();
function layoutOrder(catalogue) {
  let order = layoutOrders.get(catalogue);
  if (!order) {
    order = /* @__PURE__ */ new Map();
    for (const tab of catalogue.tabs) {
      for (const page of tab.pages) {
        for (const group of page.groups) {
          for (const line of group.lines) for (const option of line.options) if (!order.has(option.key)) order.set(option.key, order.size);
        }
      }
    }
    layoutOrders.set(catalogue, order);
  }
  return order;
}
function inPanelOrder(keys, catalogue) {
  const order = layoutOrder(catalogue);
  const at = (key) => order.get(key) ?? Number.MAX_SAFE_INTEGER;
  return [...keys].sort((a, b) => at(a) - at(b) || a.localeCompare(b));
}
function objectSettingRows(settings, catalogue, filamentCount = 1) {
  const own = new Set(Object.keys(settings ?? {}));
  const { categories, keys: known } = objectSettingKeys(catalogue, filamentCount);
  const groups = [];
  for (const category of categories) {
    const keys = category.keys.filter((k) => own.has(k));
    if (keys.length > 0) groups.push({ title: category.title, keys: inPanelOrder(keys, catalogue) });
  }
  const other = [...own].filter((k) => !known.has(k));
  if (other.length > 0) groups.push({ title: "Other", keys: other });
  return groups;
}
function inheritedValue(state, key) {
  const plate = state.plateSettings;
  return plate && Object.hasOwn(plate, key) ? plate[key] : currentOf(state, "process", key);
}
function plateConfigView(state) {
  const c = state.configs;
  return layeredConfig(state.plateSettings, state.overrides.process, state.overrides.filament, state.overrides.machine, c.process, c.filament, c.machine);
}
function objectConfigView(state, settings) {
  const plate = plateConfigView(state);
  return { get: (key) => settings && Object.hasOwn(settings, key) ? settings[key] : plate.get(key) };
}
function objectRulesEnv(state, settings) {
  const edited = editedKeys(state);
  for (const key of Object.keys(state.plateSettings ?? {})) edited.add(key);
  for (const key of Object.keys(settings ?? {})) edited.add(key);
  return {
    config: objectConfigView(state, settings),
    context: "object",
    ...envOptions(state),
    extruderCount: extruderCount(state),
    mode: state.mode ?? "advanced",
    edited,
    globalConfig: plateConfigView(state)
  };
}
var issueId = (i) => `${i.id}
${i.key}
${i.message}`;
function evaluateObject(state, settings) {
  const env = objectRulesEnv(state, settings);
  const result = evaluateRules(env);
  const own = Object.keys(settings ?? {});
  if (own.length === 0) return { env, result, issues: [] };
  const baseline = new Set(evaluateRules(objectRulesEnv(state, void 0)).issues.map(issueId));
  const issues = result.issues.filter(
    (i) => i.scope === "process" && i.severity !== "info" && (own.includes(i.key) || i.keys.some((k) => own.includes(k)) && !baseline.has(issueId(i)))
  );
  return { env, result, issues };
}
function layerHeightLimits(state) {
  const numbers = (key) => slotsOf(key, currentOf(state, "machine", key)).map((s) => readNumber(s)?.n).filter((n) => n !== void 0 && n > EPSILON3);
  const mins = numbers("min_layer_height");
  const maxes = numbers("max_layer_height");
  const nozzles = numbers("nozzle_diameter");
  const limits = {};
  if (mins.length > 0) limits.min = Math.min(...mins);
  if (maxes.length > 0) limits.max = Math.max(...maxes);
  else if (nozzles.length > 0) limits.max = Math.min(...nozzles);
  return limits;
}
function objectLayerHeight(state, text) {
  const n = readNumber(text)?.n;
  if (n === void 0 || n >= EPSILON3) return { text };
  const { min } = layerHeightLimits(state);
  if (min !== void 0) {
    const minimum = orcaNumber(min);
    return { text: minimum, notice: `Layer height is too small. It has been set to the minimum (${minimum} mm).` };
  }
  return { text: "0.2", notice: "Layer height is too small. It has been reset to 0.2 mm." };
}
function effectiveObjectWrites(settings, writes) {
  const out = {};
  for (const [key, value] of Object.entries(writes)) {
    const before = settings && Object.hasOwn(settings, key) ? settings[key] : null;
    if (before !== value) out[key] = value;
  }
  return out;
}
function planObjectAdd(state, settings, key, known) {
  if (!known.has(key) || settings && Object.hasOwn(settings, key)) return {};
  return { [key]: inheritedValue(state, key) };
}
function planObjectEdit(state, settings, key, text, env, known) {
  const effects = editEffects("process", key, text, env);
  const writes = {};
  for (const [k, value] of Object.entries(effects.patch)) {
    if (k === key || !known.has(k)) continue;
    const own = settings !== void 0 && Object.hasOwn(settings, k);
    if (own || !sameText(k, value, inheritedValue(state, k))) writes[k] = value;
  }
  writes[key] = Object.hasOwn(effects.patch, key) ? effects.patch[key] : text;
  return { writes: effectiveObjectWrites(settings, writes), prompts: effects.prompts };
}
function planObjectValues(settings, values, known) {
  const writes = {};
  for (const [key, text] of Object.entries(values)) {
    if (!known.has(key)) return null;
    writes[key] = text;
  }
  return effectiveObjectWrites(settings, writes);
}
function addGroups(catalogue, mode, frequent, filamentCount = 1) {
  const offered = (key) => {
    const def = settingDef(catalogue, key);
    return !!def && (def.mode !== "develop" || mode === "expert");
  };
  const out = [];
  const first = frequent.filter(offered);
  if (first.length > 0) out.push({ title: "Frequent", keys: first });
  for (const category of objectSettingKeys(catalogue, filamentCount).categories) {
    const keys = inPanelOrder(category.keys, catalogue).filter(offered);
    if (keys.length > 0) out.push({ title: category.title, keys });
  }
  return out;
}

// host/src/settings/plate.ts
function spiralQuestion(i3) {
  let text = "Spiral mode only works when wall loops is 1, support is disabled, clumping detection by probing is disabled, top shell layers is 0, sparse infill density is 0 and timelapse type is traditional.";
  if (i3) text += " But machines with I3 structure will not generate timelapse videos.";
  return `${text} Change these settings automatically?`;
}
var SPIRAL_YES = "Change these settings and turn on spiral vase";
var SPIRAL_NO = "Cancel turning on spiral mode";
var SPIRAL_NEEDS_BY_OBJECT = 'Please select "By object" print sequence to print multiple objects in spiral vase mode.';
function spiralNeedsByObject(spiral, printSequence, objectCount) {
  return spiral && objectCount > 1 && printSequence !== "by object";
}
var VASE_OBJECT_SETTINGS = {
  wall_loops: "1",
  top_shell_layers: "0",
  sparse_infill_density: "0%",
  enable_support: "0",
  enforce_support_layers: "0",
  detect_thin_wall: "0",
  timelapse_type: "0",
  overhang_reverse: "0"
};
var same = (a, b) => a !== void 0 && (a === b || Number.parseFloat(a) === Number.parseFloat(b));
function vaseObjectWrites(objects, global, objectKeys2) {
  const out = [];
  for (const o of objects) {
    for (const [key, value] of Object.entries(VASE_OBJECT_SETTINGS)) {
      if (!objectKeys2.has(key)) continue;
      const own = o.settings?.[key];
      if (own !== void 0 ? !same(own, value) : !same(global(key), value)) out.push({ id: o.id, key, value });
    }
  }
  return out;
}
function plateRulesEnv(state, plateSettings, objectCount) {
  const { overrides, configs } = state;
  const view = (c) => c;
  return {
    config: layeredConfig(plateSettings, overrides.process, overrides.filament, overrides.machine, view(configs.process), view(configs.filament), view(configs.machine)),
    context: "plate",
    isBbl: state.vendor === "BBL",
    hasObjects: objectCount > 0,
    edited: new Set(Object.keys(plateSettings)),
    globalConfig: layeredConfig(overrides.process, overrides.filament, overrides.machine, view(configs.process), view(configs.filament), view(configs.machine))
  };
}
function plateEditPrompts(key, value, env) {
  return editEffects("process", key, value, env).prompts;
}

// host/src/settings/edit.ts
var SettingsRequestError = class extends Error {
  code;
  detail;
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    if (detail !== void 0) this.detail = detail;
  }
};
var BAD_REQUEST = 5;
var toPrompt = (p) => ({
  id: p.id,
  scope: p.scope,
  key: p.key,
  message: p.message,
  choices: p.choices.map((c) => ({ label: c.label, values: { ...c.values } }))
});
function planSettingsEdit(scope, edit, input) {
  if (scope === "object") return objectEdit(edit, input);
  if (scope === "plate") return plateEdit(edit, input);
  return presetEdit(scope, edit, input.state);
}
function presetEdit(scope, edit, state) {
  if ("set" in edit) {
    const plan = planEdit(state, scope, edit.set, edit.index, edit.value, rulesEnv(state));
    return { writes: effectiveWrites(state, scope, plan.writes), prompts: plan.prompts.map(toPrompt), notices: plan.notice ? [plan.notice] : [] };
  }
  if ("apply" in edit) return { writes: effectiveWrites(state, scope, planValues(state, scope, edit.apply)), prompts: [], notices: [] };
  if ("reset" in edit) return { writes: effectiveWrites(state, scope, planResetAll(state, scope, edit.reset)), prompts: [], notices: [] };
  throw new SettingsRequestError(BAD_REQUEST, `"add" is an edit of an object's settings, not of the ${scope} settings.`);
}
function objectEdit(edit, { state, object: settings }) {
  const known = objectSettingKeys(state.catalogue, state.filamentCount ?? 1).keys;
  if ("set" in edit) {
    const key = edit.set;
    if (!known.has(key)) throw new SettingsRequestError(BAD_REQUEST, `"${key}" cannot be set per object.`);
    let value = edit.value;
    if (edit.index !== void 0) {
      const current = settings && Object.hasOwn(settings, key) ? settings[key] : inheritedValue(state, key);
      value = withSlot(key, current, edit.index, value);
    }
    const checked = key === "layer_height" ? objectLayerHeight(state, value) : { text: value };
    const plan = planObjectEdit(state, settings, key, checked.text, objectRulesEnv(state, settings), known);
    return { writes: plan.writes, prompts: plan.prompts.map(toPrompt), notices: checked.notice ? [checked.notice] : [] };
  }
  if ("apply" in edit) {
    const writes = planObjectValues(settings, edit.apply, known);
    if (!writes) throw new SettingsRequestError(BAD_REQUEST, "These values include settings an object cannot have: apply them to the global settings.");
    return { writes, prompts: [], notices: [] };
  }
  if ("reset" in edit) {
    const writes = {};
    for (const { key } of edit.reset) writes[key] = null;
    return { writes: effectiveObjectWrites(settings, writes), prompts: [], notices: [] };
  }
  if (!known.has(edit.add)) throw new SettingsRequestError(BAD_REQUEST, `"${edit.add}" cannot be set per object.`);
  return { writes: planObjectAdd(state, settings, edit.add, known), prompts: [], notices: [] };
}
var withoutNoops = (own, writes) => Object.fromEntries(Object.entries(writes).filter(([k, v2]) => (Object.hasOwn(own, k) ? own[k] : null) !== v2));
function plateEdit(edit, { state, objects = [] }) {
  const own = state.plateSettings ?? {};
  const objectCount = objects.length;
  if ("set" in edit) {
    const { set: key, value } = edit;
    if (key === "spiral_mode" && isOn(value)) {
      const spiral = own.spiral_mode !== void 0 ? isOn(own.spiral_mode) : isOn(currentOf(state, "process", "spiral_mode"));
      if (!spiral) {
        const known = objectSettingKeys(state.catalogue, state.filamentCount ?? 1).keys;
        const writes = vaseObjectWrites(objects, (k) => currentOf(state, "process", k), known);
        const byObject = /* @__PURE__ */ new Map();
        for (const w of writes) byObject.set(w.id, { ...byObject.get(w.id), [w.key]: w.value });
        const i3 = currentOf(state, "machine", "printer_structure") === "i3";
        return {
          writes: {},
          prompts: [
            {
              id: "spiral-vase-plate",
              scope: "process",
              key,
              message: spiralQuestion(i3),
              blocking: true,
              choices: [
                { label: SPIRAL_YES, values: { spiral_mode: "1" }, ...byObject.size ? { objects: [...byObject].map(([id, values]) => ({ id, values })) } : {} },
                { label: SPIRAL_NO, values: {} }
              ]
            }
          ],
          notices: []
        };
      }
    }
    const prompts = plateEditPrompts(key, value, plateRulesEnv(state, own, objectCount)).map(toPrompt);
    return { writes: withoutNoops(own, { [key]: value }), prompts, notices: [] };
  }
  if ("apply" in edit) {
    const result = { writes: withoutNoops(own, { ...edit.apply }), prompts: [], notices: [] };
    if (edit.objects?.length) {
      result.objects = edit.objects.map(({ id, values }) => {
        const settings = objects.find((o) => o.id === id)?.settings ?? {};
        return { id, writes: withoutNoops(settings, { ...values }) };
      });
    }
    return result;
  }
  if ("reset" in edit) return { writes: withoutNoops(own, Object.fromEntries(edit.reset.map(({ key }) => [key, null]))), prompts: [], notices: [] };
  throw new SettingsRequestError(BAD_REQUEST, `"add" is an edit of an object's settings, not of a plate's.`);
}

// host/src/settings/form.ts
function shortHash(text) {
  let a = 2166136261;
  let b = 3421674724;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 16777619) ^ b >>> 15;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function formOption(key, def, label) {
  const option = {
    key,
    type: def.type,
    control: controlKind(def),
    label: label ?? readableLabel(key, def.label),
    mode: def.mode
  };
  if (def.fullLabel !== void 0 && def.fullLabel !== option.label) option.fullLabel = def.fullLabel;
  if (def.tooltip) option.tooltip = def.tooltip;
  if (def.unit) option.unit = def.unit;
  if (def.category) option.category = def.category;
  if (def.min !== void 0) option.min = def.min;
  if (def.max !== void 0) option.max = def.max;
  if (def.maxLiteral !== void 0) option.maxLiteral = def.maxLiteral;
  if (def.ratioOver) option.ratioOver = def.ratioOver;
  if (def.enumValues) option.enum = def.enumValues.map((value, i) => ({ value, label: def.enumLabels?.[i] || value }));
  if (def.openEnum) option.openEnum = true;
  if (def.multiline) option.multiline = true;
  if (def.code) option.code = true;
  if (def.serialized) option.serialized = true;
  if (def.nullable) option.nullable = true;
  if (def.slots) option.slots = def.slots;
  if (def.orcaReadOnly) option.readOnly = true;
  if (def.default !== void 0) option.default = def.default;
  return option;
}
function formLine(catalogue, line, id, options) {
  const shown = line.options.filter((o) => isShown(catalogue, o.key));
  if (shown.length === 0) return null;
  const out = {
    id,
    label: readableLabel(line.options[0].key, lineLabel(catalogue, line)),
    mode: lineMode(catalogue, line),
    options: shown.map((o) => {
      const def = settingDef(catalogue, o.key);
      options[o.key] ??= formOption(o.key, def);
      return {
        key: o.key,
        label: readableLabel(o.key, o.label ?? def.label),
        ...o.index !== void 0 ? { index: o.index } : {},
        ...o.tooltip ? { tooltip: o.tooltip } : {}
      };
    })
  };
  const tooltip = line.tooltip ?? line.options[0].tooltip;
  if (tooltip) out.tooltip = tooltip;
  if (line.widget) out.widget = line.widget;
  if (line.overrideOf) out.overrideOf = line.overrideOf;
  if (line.modeColumns) out.modeColumns = true;
  return out;
}
function buildId(catalogue) {
  return `${catalogue.orca.commit}|${catalogue.format}|${HOST_BUILD}`;
}
var HOST_BUILD = "dev";
function setHostBuild(id) {
  HOST_BUILD = id;
  forms.clear();
}
var forms = /* @__PURE__ */ new Map();
function settingsForm(catalogue, scope, filamentCount = 1) {
  const omit = [...catalogue.omit].sort();
  const several = scope === "object" && filamentCount > 1;
  const key = `${buildId(catalogue)}|${scope}|${several ? "n" : "1"}|${omit.join(",")}`;
  let form = forms.get(key);
  if (form) return form;
  const options = {};
  form = { format: 1, id: `${scope}:${shortHash(key)}`, scope, omit, options };
  if (scope === "object") {
    const { categories } = objectSettingKeys(catalogue, filamentCount);
    form.categories = categories.map((c) => ({ title: c.title, keys: inPanelOrder(c.keys, catalogue).filter((k) => isShown(catalogue, k)) })).filter((c) => c.keys.length > 0);
    for (const c of form.categories) for (const k of c.keys) options[k] = formOption(k, settingDef(catalogue, k), objectSettingLabel(catalogue, k));
    form.frequent = objectSettingKeys(catalogue, filamentCount).frequent.filter((k) => isShown(catalogue, k));
  } else if (scope === "plate") {
    form.lines = catalogue.plate.map((line, i) => formLine(catalogue, line, `plate/${i}`, options)).filter((l) => l !== null);
  } else {
    const tab = catalogue.tabs.find((t) => t.id === scope);
    const pages = [];
    for (const page of tab.pages) {
      const groups = page.groups.map((group) => ({
        id: group.id,
        title: group.title,
        lines: group.lines.map((line, i) => formLine(catalogue, line, `${page.id}/${group.id}/${i}`, options)).filter((l) => l !== null)
      })).filter((g) => g.lines.length > 0);
      if (groups.length === 0) continue;
      const out = { id: page.id, title: page.title, groups };
      if (page.repeat) out.repeat = page.repeat;
      if (page.when) out.when = page.when;
      if (page.other) out.other = true;
      pages.push(out);
    }
    form.pages = pages;
  }
  forms.set(key, form);
  return form;
}

// host/src/settings/view.ts
var toIssue = (issue) => {
  const out = { id: issue.id, scope: issue.scope, key: issue.key, keys: [...issue.keys], severity: issue.severity, message: issue.message };
  if (issue.fix) out.fix = { ...issue.fix };
  if (issue.fixLabel) out.fixLabel = issue.fixLabel;
  if (issue.alternative) out.alternative = { label: issue.alternative.label, values: { ...issue.alternative.values } };
  if (issue.triggers) out.triggers = [...issue.triggers];
  if (issue.checkedOn) out.checkedOn = [...issue.checkedOn];
  return out;
};
function pageEnv(state, config2) {
  return {
    mode: state.mode ?? "advanced",
    extruderCount: extruderCount(state),
    value: (key) => {
      const v2 = config2.get(key) ?? settingDef(state.catalogue, key)?.default;
      return v2 === void 0 ? void 0 : valueText(key, v2);
    }
  };
}
function lineView(state, scope, pageId, line, rules, values) {
  const layout = line.line;
  const silent = layout.modeColumns === true && isOn(currentSlot(state, "machine", "silent_mode"));
  const cells = silent ? line.options.flatMap((o) => [
    { ...o, index: o.index ?? 0, ruleIndex: 0, column: "Normal" },
    { ...o, index: (o.index ?? 0) + 1, ruleIndex: 1, column: "Silent" }
  ]) : line.options;
  const overrideFrom = layout.overrideOf;
  const out = {
    id: `${pageId}/${line.id}`,
    cells: cells.map((c) => {
      const cell = { key: c.key };
      if (c.index !== void 0) cell.index = c.index;
      if (c.column) cell.label = c.column;
      if (isDisabled(rules, c.key, c.ruleIndex)) cell.disabled = true;
      const choices = rules.enumFilters.get(c.key);
      if (choices) cell.choices = [...choices];
      if (values) {
        cell.value = currentSlot(state, scope, c.key, c.index);
        if (overrideFrom) cell.inherited = inheritedSlot(state, overrideFrom, c.index ?? 0);
      }
      return cell;
    })
  };
  if (line.options.length === 1 && layout.label === void 0 && rules.labels.get(line.options[0].key)) out.label = line.label;
  if (overrideFrom && rules.lockedOverrides.has(line.options[0].key)) out.locked = true;
  return out;
}
function tabView(state, scope, env, values) {
  const { env: rulesEnv2, result } = evaluate(state);
  const rules = result[scope];
  const mode = state.mode ?? "advanced";
  const catalogue = state.catalogue;
  const tab = catalogue.tabs.find((t) => t.id === scope);
  const penv = pageEnv(state, rulesEnv2.config);
  const nozzles = extruderCount(state);
  const extruder = Math.max(0, Math.min(Math.floor(env.extruder ?? 0), nozzles - 1));
  const slots = slotResolver(state, scope);
  const issues = result.issues.filter((i) => i.scope === scope);
  const form = settingsForm(catalogue, scope);
  const formPages = new Set(form.pages.map((p) => p.id));
  const pages = [];
  for (const ref of tabPages(catalogue, tab, penv)) {
    const hidden = [];
    const groups = pageGroups(catalogue, ref, mode, rules, slots, extruder, hidden);
    const keys = new Set(groups.flatMap((g) => g.lines.flatMap((l) => l.options.map((o) => o.key))));
    const page = {
      id: ref.id,
      page: ref.page.id,
      title: ref.title,
      groups: groups.map((g) => ({ id: g.group.id, lines: g.lines.map((l) => lineView(state, scope, ref.page.id, l, rules, values)) }))
    };
    if (ref.extruder !== void 0) page.extruder = ref.extruder;
    if (nozzles > 1 && pageHasVariantRows(catalogue, ref.page)) page.nozzlePicker = true;
    const count = issues.filter((i) => keys.has(i.key) && i.severity !== "info").length;
    if (count > 0) page.issues = count;
    if (hidden.length > 0) page.hiddenLines = hidden.map((l) => `${ref.page.id}/${l.id}`);
    pages.push(page);
  }
  const inactivePages = tab.pages.filter((p) => formPages.has(p.id) && !pageActive(p, penv)).map((p) => p.id);
  return { tab: { pages, inactivePages, extruders: nozzles, extruder }, issues: issues.map(toIssue) };
}
function objectView(state, settings, env, values) {
  const catalogue = state.catalogue;
  const filamentCount = state.filamentCount ?? 1;
  const known = objectSettingKeys(catalogue, filamentCount).keys;
  const rules = evaluateObject(state, settings);
  const tab = rules.result.process;
  const supportOn = isOn(String(rules.env.config.get("enable_support") ?? "0"));
  const groups = objectSettingRows(settings, catalogue, filamentCount).map((group) => ({
    title: group.title,
    rows: group.keys.map((key) => {
      const row = { key };
      if (!known.has(key) || !settingDef(catalogue, key)) {
        row.unknown = true;
      } else {
        const disabled = isHidden(tab, key) || isDisabled(tab, key);
        if (disabled) row.disabled = isSupportSetting(key) && !supportOn ? "support" : "rules";
        const renamed = tab.labels.get(key);
        if (renamed) row.label = renamed;
        const choices = tab.enumFilters.get(key);
        if (choices) row.choices = [...choices];
      }
      if (values) {
        row.value = settings[key];
        if (!row.unknown) row.inherited = inheritedValue(state, key);
      }
      return row;
    })
  }));
  const form = settingsForm(catalogue, "object", filamentCount);
  const issues = rules.issues.map((i) => {
    const issue = toIssue(i);
    if (i.fix) issue.fixable = planObjectValues(settings, i.fix, known) !== null;
    return issue;
  });
  return {
    object: {
      groups,
      add: addGroups(catalogue, state.mode ?? "advanced", env.frequent ?? form.frequent ?? [], filamentCount),
      limits: { layerHeight: layerHeightLimits(state) }
    },
    issues
  };
}
function plateView(state, settings, objectCount) {
  const form = settingsForm(state.catalogue, "plate");
  const env = plateRulesEnv(state, settings, objectCount);
  const rules = evaluateRules(env).process;
  const rows = form.lines.map((line) => {
    const key = line.options[0].key;
    const row = { key, global: currentOf(state, "process", key) };
    if (Object.hasOwn(settings, key)) row.value = settings[key];
    const choices = rules.enumFilters.get(key);
    if (choices) row.choices = [...choices];
    return row;
  });
  const issues = [];
  const sequence = settings.print_sequence ?? (currentOf(state, "process", "print_sequence") || "by layer");
  const spiral = settings.spiral_mode !== void 0 ? isOn(settings.spiral_mode) : isOn(currentOf(state, "process", "spiral_mode"));
  if (spiralNeedsByObject(spiral, sequence, objectCount)) {
    issues.push({
      id: "spiral-vase-by-object",
      scope: "process",
      key: "print_sequence",
      keys: ["print_sequence", "spiral_mode"],
      severity: "error",
      message: SPIRAL_NEEDS_BY_OBJECT,
      fix: { print_sequence: "by object" }
    });
  }
  return { plate: { rows }, issues };
}

// host/src/settings/service.ts
var BAD_REQUEST2 = 5;
var NOT_CACHED = 8;
var CONFIG_CACHE_SIZE = 32;
var SCOPES2 = ["process", "filament", "machine", "object", "plate"];
var PRESETS = ["machine", "process", "filament"];
var MODES = ["simple", "advanced", "expert"];
var bad = (message, detail) => new SettingsRequestError(BAD_REQUEST2, message, detail);
var isObject = (v2) => v2 !== null && typeof v2 === "object" && !Array.isArray(v2);
function patch(value, what) {
  if (value === void 0) return void 0;
  if (!isObject(value)) throw bad(`${what} must be a map of setting keys to text.`);
  for (const [k, v2] of Object.entries(value)) if (typeof v2 !== "string") throw bad(`${what}: the value of "${k}" must be text.`);
  return value;
}
function config(value, what) {
  if (!isObject(value)) throw bad(`${what} must be a preset: a map of setting keys to text or lists of text.`);
  for (const [k, v2] of Object.entries(value)) {
    if (typeof v2 !== "string" && !(Array.isArray(v2) && v2.every((s) => typeof s === "string"))) throw bad(`${what}: the value of "${k}" must be text or a list of text.`);
  }
  return value;
}
var SettingsService = class {
  configs = /* @__PURE__ */ new Map();
  catalogue;
  constructor(options = {}) {
    this.catalogue = options.catalogue ?? CATALOGUE;
    if (options.build) setHostBuild(options.build);
  }
  /** settings.catalogue: the catalogue, format 2 (locales other than English are not available yet). */
  catalogueDocument() {
    return this.catalogue;
  }
  view(params) {
    const scope = this.scope(params);
    const input = this.input(params, params);
    return this.document(scope, input, params, params.version);
  }
  edit(params) {
    const scope = this.scope(params);
    const viewOptions = params.view === true ? {} : isObject(params.view) ? params.view : void 0;
    const input = this.input(params, viewOptions ?? {});
    const edit = this.editOf(params.edit);
    const planned = planSettingsEdit(scope, edit, { state: input.state, object: input.object, objects: input.objects });
    const result = { version: params.version ?? null, ...planned };
    if (viewOptions) result.view = this.document(scope, applied(scope, input, planned), viewOptions, params.version);
    return result;
  }
  // ---- Decoding --------------------------------------------------------------------------------------------
  scope(params) {
    if (!SCOPES2.includes(params.scope)) throw bad(`"scope" must be one of ${SCOPES2.join(", ")}.`);
    return params.scope;
  }
  editOf(edit) {
    if (!isObject(edit)) throw bad('"edit" must be one of { set, value, index? }, { apply }, { reset }, { add }.');
    if (typeof edit.set === "string") {
      if (typeof edit.value !== "string") throw bad('"edit.value" must be text.');
      if (edit.index !== void 0 && !(Number.isInteger(edit.index) && edit.index >= 0)) throw bad('"edit.index" must be a slot number.');
      return edit;
    }
    if (edit.apply !== void 0) {
      patch(edit.apply, '"edit.apply"');
      if (edit.objects !== void 0) {
        if (!Array.isArray(edit.objects)) throw bad('"edit.objects" must be a list.');
        for (const o of edit.objects) {
          if (!isObject(o) || typeof o.id !== "string") throw bad('each of "edit.objects" needs an "id".');
          patch(o.values, `"edit.objects" ${o.id}`);
        }
      }
      return edit;
    }
    if (Array.isArray(edit.reset)) {
      for (const r of edit.reset) if (!isObject(r) || typeof r.key !== "string") throw bad('each of "edit.reset" needs a "key".');
      return edit;
    }
    if (typeof edit.add === "string") return edit;
    throw bad('"edit" must be one of { set, value, index? }, { apply }, { reset }, { add }.');
  }
  preset(ref, which) {
    if (!isObject(ref) || typeof ref.hash !== "string" || ref.hash === "") throw bad(`"presets.${which}" must be { hash, config? }.`);
    const { hash } = ref;
    if (ref.config !== void 0) {
      const value = config(ref.config, `"presets.${which}.config"`);
      this.configs.delete(hash);
      this.configs.set(hash, value);
      while (this.configs.size > CONFIG_CACHE_SIZE) this.configs.delete(this.configs.keys().next().value);
      return value;
    }
    const cached = this.configs.get(hash);
    if (!cached) throw new SettingsRequestError(NOT_CACHED, `The ${which} preset ${hash} is not cached here: send it with its config.`, hash);
    this.configs.delete(hash);
    this.configs.set(hash, cached);
    return cached;
  }
  input(params, view) {
    if (!isObject(params.presets)) throw bad('"presets" must name the machine, process and filament presets.');
    const presets = Object.fromEntries(PRESETS.map((p) => [p, this.preset(params.presets[p], p)]));
    const overrides = isObject(params.overrides) ? params.overrides : params.overrides === void 0 ? {} : null;
    if (!overrides) throw bad('"overrides" must be a map of presets to overrides.');
    if (params.env !== void 0 && !isObject(params.env)) throw bad('"env" must be an object.');
    const env = params.env ?? {};
    if (env.mode !== void 0 && !MODES.includes(env.mode)) throw bad(`"env.mode" must be one of ${MODES.join(", ")}.`);
    if (view.omit !== void 0 && !(Array.isArray(view.omit) && view.omit.every((k) => typeof k === "string"))) throw bad('"omit" must be a list of setting keys.');
    const objects = params.objects;
    if (objects !== void 0 && !(Array.isArray(objects) && objects.every((o) => isObject(o) && typeof o.id === "string"))) {
      throw bad('"objects" must be a list of { id, settings? }.');
    }
    const state = {
      catalogue: layoutCatalogue(this.catalogue, view.omit),
      configs: presets,
      overrides: {
        process: patch(overrides.process, '"overrides.process"') ?? {},
        filament: patch(overrides.filament, '"overrides.filament"') ?? {},
        machine: patch(overrides.machine, '"overrides.machine"') ?? {}
      },
      mode: env.mode ?? "advanced"
    };
    const plate = patch(params.plate, '"plate"');
    if (plate) state.plateSettings = plate;
    if (typeof env.vendor === "string") state.vendor = env.vendor;
    if (isObject(env.bedType)) state.bedType = { defaultType: String(env.bedType.default), selectable: env.bedType.selectable === true };
    if (typeof env.filamentCount === "number") state.filamentCount = env.filamentCount;
    if (typeof env.supportsWrappingDetection === "boolean") state.supportsWrappingDetection = env.supportsWrappingDetection;
    return {
      state,
      env,
      object: patch(params.object, '"object"'),
      objects: objects?.map((o) => ({ id: o.id, ...o.settings ? { settings: patch(o.settings, `object ${o.id}`) } : {} }))
    };
  }
  // ---- The document ------------------------------------------------------------------------------------------
  document(scope, input, options, version) {
    const { state, env } = input;
    const form = settingsForm(state.catalogue, scope, state.filamentCount ?? 1);
    const values = options.values === true;
    const doc = { format: 1, scope, version: version ?? null, formId: form.id, issues: [] };
    if (options.form !== form.id) doc.form = form;
    if (scope === "object") {
      const { object, issues } = objectView(state, input.object, env, values);
      doc.object = object;
      doc.issues = issues;
    } else if (scope === "plate") {
      const objectCount = env.objectCount ?? input.objects?.length ?? 0;
      const { plate, issues } = plateView(state, state.plateSettings ?? {}, objectCount);
      doc.plate = plate;
      doc.issues = issues;
    } else {
      const { tab, issues } = tabView(state, scope, env, values);
      doc.tab = tab;
      doc.issues = issues;
    }
    return doc;
  }
};
var withWrites = (own, writes) => {
  const out = { ...own };
  for (const [k, v2] of Object.entries(writes)) {
    if (v2 === null) delete out[k];
    else out[k] = v2;
  }
  return out;
};
function applied(scope, input, result) {
  const state = { ...input.state };
  if (scope === "object") return { ...input, object: withWrites(input.object, result.writes) };
  if (scope === "plate") {
    state.plateSettings = withWrites(state.plateSettings, result.writes);
    const objects = input.objects?.map((o) => {
      const w = result.objects?.find((x) => x.id === o.id);
      return w ? { ...o, settings: withWrites(o.settings, w.writes) } : o;
    });
    return { ...input, state, objects };
  }
  state.overrides = { ...state.overrides, [scope]: withWrites(state.overrides[scope], result.writes) };
  return { ...input, state };
}
export {
  CONFIG_CACHE_SIZE,
  SettingsRequestError,
  SettingsService
};
